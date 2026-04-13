"""
Stage 2 — Recovery analog retrieval.
National panel search for EINs that recovered from the same primary constraint.
Pre-computes analog pools per metric to avoid redundant per-row scanning.
"""

import json
import numpy as np
import pandas as pd
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

PRE_WINDOW = range(2014, 2020)   # FY2014–FY2019
POST_WINDOW = range(2020, 2025)  # FY2020–FY2024

GAP_TO_CONSTRAINT = {
    "operating_margin_gap": ("low_margin", "operating_margin"),
    "operating_runway_gap": ("low_runway", "operating_runway_proxy_months"),
    "revenue_diversification_gap": ("high_concentration_in_volatile_source", "revenue_diversification_index"),
}
GAP_ORDER = ["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]


def _compute_metrics_on_panel(panel: pd.DataFrame) -> pd.DataFrame:
    """Compute the three metrics on the national panel for analog matching."""
    df = panel.copy()
    rev = pd.to_numeric(df["total_revenue"], errors="coerce")
    exp = pd.to_numeric(df["total_expenses"], errors="coerce")
    nae = pd.to_numeric(df["net_assets_eoy"], errors="coerce")

    df["operating_margin"] = np.where(
        rev.notna() & (rev != 0), (rev - exp) / rev, np.nan
    )
    df["operating_runway_proxy_months"] = np.where(
        exp.notna() & (exp != 0), nae / (exp / 12), np.nan
    )

    pct_cols = ["pct_contributions", "pct_program_revenue", "pct_investment_income", "pct_other_revenue"]
    all_null = df[pct_cols].isna().all(axis=1) if all(c in df.columns for c in pct_cols) else pd.Series(True, index=df.index)
    pct_filled = df[pct_cols].fillna(0) if all(c in df.columns for c in pct_cols) else pd.DataFrame(0, index=df.index, columns=pct_cols)
    hhi = (pct_filled ** 2).sum(axis=1)
    df["revenue_diversification_index"] = np.where(all_null, np.nan, 1 - hhi)

    return df


def _assign_size_bucket(revenue):
    if pd.isna(revenue) or revenue <= 0:
        return None
    if revenue < 500_000:
        return "<500K"
    if revenue < 2_000_000:
        return "500K-2M"
    if revenue < 10_000_000:
        return "2M-10M"
    return ">10M"


def _build_analog_pool(panel: pd.DataFrame) -> dict:
    """
    Pre-compute recovery analog candidates for each metric.
    Returns dict[metric_name] -> DataFrame of candidate analogs with metadata.
    """
    logger.info(f"Building national analog pool from {len(panel):,} panel rows...")

    # Dedupe panel: keep latest tax_period_end per (ein, fiscal_year)
    df = panel.copy()
    df["ein"] = df["ein"].astype(str)
    df["fiscal_year"] = pd.to_numeric(df["fiscal_year"], errors="coerce").astype("Int64")
    if "tax_period_end" in df.columns:
        df = df.sort_values("tax_period_end", ascending=False)
    df = df.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")

    # Compute metrics
    df = _compute_metrics_on_panel(df)

    # Size bucket
    if "size_bucket" not in df.columns:
        df["size_bucket"] = df["total_revenue"].apply(_assign_size_bucket)

    # Filter to EINs with >= 5 years of data
    ein_year_counts = df.groupby("ein")["fiscal_year"].nunique()
    valid_eins = set(ein_year_counts[ein_year_counts >= 5].index)
    df = df[df["ein"].isin(valid_eins)].copy()
    logger.info(f"  EINs with 5+ years: {len(valid_eins):,}")

    # Split into pre-window and post-window
    pre = df[df["fiscal_year"].isin(PRE_WINDOW)].copy()
    post = df[df["fiscal_year"].isin(POST_WINDOW)].copy()

    metrics = ["operating_margin", "operating_runway_proxy_months", "revenue_diversification_index"]
    analog_pools = {}

    for metric in metrics:
        logger.info(f"  Computing Q25/Q75 thresholds for {metric}...")

        # Q25 thresholds per fiscal_year for pre-window
        pre_valid = pre[pre[metric].notna()].copy()
        pre_q25 = pre_valid.groupby("fiscal_year")[metric].quantile(0.25).to_dict()

        # Q75 thresholds per fiscal_year for post-window
        post_valid = post[post[metric].notna()].copy()
        post_q75 = post_valid.groupby("fiscal_year")[metric].quantile(0.75).to_dict()

        # Find EINs that were bottom-Q25 in a pre year and top-Q75 in a post year
        pre_valid["_q25"] = pre_valid["fiscal_year"].map(pre_q25)
        pre_bottom = pre_valid[pre_valid[metric] <= pre_valid["_q25"]].copy()

        post_valid["_q75"] = post_valid["fiscal_year"].map(post_q75)
        post_top = post_valid[post_valid[metric] >= post_valid["_q75"]].copy()

        # EINs that appear in both
        candidate_eins = set(pre_bottom["ein"]) & set(post_top["ein"])

        if not candidate_eins:
            analog_pools[metric] = pd.DataFrame()
            logger.info(f"    {metric}: 0 analog candidates")
            continue

        # For each candidate EIN, pick latest pre year and latest post year
        pre_candidates = pre_bottom[pre_bottom["ein"].isin(candidate_eins)]
        post_candidates = post_top[post_top["ein"].isin(candidate_eins)]

        # Latest pre year per EIN
        pre_latest = pre_candidates.sort_values("fiscal_year", ascending=False).drop_duplicates("ein", keep="first")
        # Latest post year per EIN
        post_latest = post_candidates.sort_values("fiscal_year", ascending=False).drop_duplicates("ein", keep="first")

        # Merge pre and post
        merged = pre_latest[["ein", "fiscal_year", metric]].rename(
            columns={"fiscal_year": "pre_window_year", metric: "pre_value"}
        ).merge(
            post_latest[["ein", "fiscal_year", metric, "state", "org_name",
                         "ntee_major_category", "size_bucket", "total_revenue"]].rename(
                columns={"fiscal_year": "post_recovery_year", metric: "post_value"}
            ),
            on="ein",
        )
        merged["matched_metric_name"] = metric

        analog_pools[metric] = merged
        logger.info(f"    {metric}: {len(merged):,} analog candidates")

    return analog_pools


def _determine_primary_constraint(row: pd.Series) -> tuple:
    """Return (constraint_label, metric_name, gap_col) or (None, None, None)."""
    best_gap = None
    best_info = (None, None, None)

    for gap_col in GAP_ORDER:
        val = row.get(gap_col)
        if pd.isna(val):
            continue
        val = float(val)
        if best_gap is None or val < best_gap:
            label, metric = GAP_TO_CONSTRAINT[gap_col]
            best_gap = val
            best_info = (label, metric, gap_col)

    return best_info


def enrich_recovery_analogs(df: pd.DataFrame, panel: pd.DataFrame) -> pd.DataFrame:
    """Add recovery analog fields to scored rows."""
    out = df.copy()

    # Pre-compute national analog pool
    analog_pools = _build_analog_pool(panel)

    # Initialize output columns — lists stored as Python objects per addendum
    out["recovery_analog_eins"] = [[] for _ in range(len(out))]
    out["recovery_analog_count"] = 0
    out["recovery_analog_evidence"] = [[] for _ in range(len(out))]
    out["recovery_analog_constraint"] = None
    out["recovery_analog_status"] = "not_applicable"

    # Only process rows with benchmark_status == "ok"
    eligible_mask = out["benchmark_status"] == "ok"
    eligible_indices = out[eligible_mask].index
    logger.info(f"Recovery analogs: {len(eligible_indices):,} eligible rows")

    # Group eligible rows by primary constraint to batch-process
    constraint_groups = defaultdict(list)
    for idx in eligible_indices:
        row = out.loc[idx]
        label, metric, gap_col = _determine_primary_constraint(row)
        if label is None:
            continue
        constraint_groups[(label, metric)].append(idx)

    for (constraint_label, metric_name), indices in constraint_groups.items():
        pool = analog_pools.get(metric_name, pd.DataFrame())
        if pool.empty:
            for idx in indices:
                out.at[idx, "recovery_analog_constraint"] = constraint_label
                out.at[idx, "recovery_analog_status"] = "none_in_cohort"
                out.at[idx, "recovery_analog_count"] = 0
                out.at[idx, "recovery_analog_eins"] = []
                out.at[idx, "recovery_analog_evidence"] = []
            continue

        for idx in indices:
            row = out.loc[idx]
            target_ntee = str(row.get("ntee_major_category", "")) if pd.notna(row.get("ntee_major_category")) else ""
            target_sb = str(row.get("size_bucket", "")) if pd.notna(row.get("size_bucket")) else ""
            target_state = str(row.get("state", "")).upper()
            target_ein = str(row["ein"])
            target_rev = row.get("total_revenue")
            target_rev = float(target_rev) if pd.notna(target_rev) and float(target_rev) > 0 else None

            # Exclude self
            candidates = pool[pool["ein"] != target_ein].copy()

            # Strict cohort: same ntee + size_bucket
            strict = candidates[
                (candidates["ntee_major_category"].fillna("") == target_ntee)
                & (candidates["size_bucket"].fillna("") == target_sb)
                & (target_ntee != "")  # must have NTEE for strict match
            ].copy()

            if len(strict) > 0:
                selected = _rank_and_select(strict, target_state, target_rev, "strict")
            else:
                # Fallback: size_bucket only
                fallback = candidates[
                    candidates["size_bucket"].fillna("") == target_sb
                ].copy()
                selected = _rank_and_select(fallback, target_state, target_rev, "fallback")

            if len(selected) == 0:
                out.at[idx, "recovery_analog_constraint"] = constraint_label
                out.at[idx, "recovery_analog_status"] = "none_in_cohort"
                out.at[idx, "recovery_analog_count"] = 0
                out.at[idx, "recovery_analog_eins"] = []
                out.at[idx, "recovery_analog_evidence"] = []
            else:
                eins = selected["ein"].tolist()
                evidence = []
                for _, c in selected.iterrows():
                    evidence.append({
                        "ein": c["ein"],
                        "org_name": str(c.get("org_name", "")),
                        "state": str(c.get("state", "")),
                        "pre_window_year": int(c["pre_window_year"]),
                        "post_recovery_year": int(c["post_recovery_year"]),
                        "matched_metric_name": str(c["matched_metric_name"]),
                        "matched_metric_pre_value": round(float(c["pre_value"]), 6),
                        "matched_metric_post_value": round(float(c["post_value"]), 6),
                    })
                out.at[idx, "recovery_analog_constraint"] = constraint_label
                out.at[idx, "recovery_analog_status"] = "found"
                out.at[idx, "recovery_analog_count"] = len(eins)
                out.at[idx, "recovery_analog_eins"] = eins
                out.at[idx, "recovery_analog_evidence"] = evidence

    # Count results
    status_dist = out["recovery_analog_status"].value_counts()
    logger.info(f"Recovery analog status:\n{status_dist.to_string()}")

    return out


def _rank_and_select(candidates: pd.DataFrame, target_state: str,
                     target_rev: float | None, kind: str) -> pd.DataFrame:
    """Rank candidates per contract selection order, return top 3."""
    if candidates.empty:
        return candidates

    c = candidates.copy()
    c["_same_state"] = c["state"].fillna("").str.upper() == target_state
    if target_rev is not None:
        c["_rev_ratio_diff"] = (pd.to_numeric(c["total_revenue"], errors="coerce") / target_rev - 1).abs()
        c["_rev_ratio_diff"] = c["_rev_ratio_diff"].fillna(float("inf"))
    else:
        c["_rev_ratio_diff"] = float("inf")

    c["_cohort_priority"] = 0 if kind == "strict" else 1
    c["_ein_int"] = pd.to_numeric(c["ein"], errors="coerce").fillna(float("inf"))

    c = c.sort_values(
        ["_cohort_priority", "_same_state", "_rev_ratio_diff", "post_recovery_year", "_ein_int"],
        ascending=[True, False, True, False, True],
    )

    return c.head(3)
