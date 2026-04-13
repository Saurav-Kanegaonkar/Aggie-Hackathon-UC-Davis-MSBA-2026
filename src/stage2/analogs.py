"""
Stage 2 recovery analog module.

Adds 5 fields per row:
  recovery_analog_eins       - comma-separated EIN strings (up to 3)
  recovery_analog_count      - int (0-3)
  recovery_analog_evidence   - JSON string of list of structs
  recovery_analog_constraint - constraint label (str or null)
  recovery_analog_status     - "found" | "none_in_cohort" | "not_applicable"

Recovery analog definition:
  An EIN that has:
    - At least 1 pre-window year in [2014-2019] where it is bottom quartile on the
      matched constraint metric within its cohort nationally.
    - At least 1 post-window year in [2020-2024] where it is top quartile on that metric.
    - At least 5 total years of panel data.

Source pool: full national panel (not CA+WA limited).
Cohort: strict = (ntee_major_category, size_bucket); fallback = (size_bucket,).
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd

PRE_WINDOW = set(range(2014, 2020))    # 2014-2019
POST_WINDOW = set(range(2020, 2025))   # 2020-2024

CONSTRAINT_METRIC_MAP = {
    "operating_margin_gap": "operating_margin",
    "operating_runway_gap": "operating_runway_proxy_months",
    "revenue_diversification_gap": "revenue_diversification_index",
}

CONSTRAINT_LABEL_MAP = {
    "operating_margin_gap": "low_margin",
    "operating_runway_gap": "low_runway",
    "revenue_diversification_gap": "high_concentration_in_volatile_source",
}


def _assign_size_buckets(revenue: pd.Series) -> pd.Series:
    rev = pd.to_numeric(revenue, errors="coerce")
    buckets = pd.cut(
        rev,
        bins=[-np.inf, 500_000, 2_000_000, 10_000_000, np.inf],
        labels=["<500K", "500K-2M", "2M-10M", ">10M"],
        right=False,
    ).astype(object)
    buckets = buckets.where(rev.notna(), other=None)
    return buckets


def _compute_analog_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Add operating_margin, operating_runway_proxy_months, revenue_diversification_index."""
    rev = pd.to_numeric(df["total_revenue"], errors="coerce")
    exp = pd.to_numeric(df["total_expenses"], errors="coerce")
    net = pd.to_numeric(df["net_assets_eoy"], errors="coerce")
    monthly_exp = exp / 12.0

    df = df.copy()
    df["_om"] = (rev - exp) / rev.where(rev.notna() & rev.ne(0))
    df["_or"] = net / monthly_exp.where(monthly_exp.notna() & monthly_exp.ne(0))

    pct_cols = ["pct_contributions", "pct_program_revenue", "pct_investment_income", "pct_other_revenue"]
    if all(c in df.columns for c in pct_cols):
        pct_df = df[pct_cols].apply(pd.to_numeric, errors="coerce")
        all_null = pct_df.isna().all(axis=1)
        hhi = (pct_df.fillna(0.0) ** 2).sum(axis=1)
        df["_rdi"] = (1.0 - hhi).where(~all_null)
    else:
        df["_rdi"] = np.nan

    df = df.rename(columns={
        "_om": "operating_margin",
        "_or": "operating_runway_proxy_months",
        "_rdi": "revenue_diversification_index",
    })
    return df


def build_analog_pool(panel: pd.DataFrame) -> dict:
    """
    Build the analog candidate pool from the full national panel.

    Returns a dict:
      strict_lookup:   (metric, ntee, size_bucket) -> list of candidate dicts
      fallback_lookup: (metric, size_bucket)       -> list of candidate dicts
      panel_summary:   {ein -> {state, total_revenue, org_name}}
    """
    METRICS = [
        ("operating_margin", "operating_margin"),
        ("operating_runway_proxy_months", "operating_runway_proxy_months"),
        ("revenue_diversification_index", "revenue_diversification_index"),
    ]
    METRIC_NAMES = [m[0] for m in METRICS]

    # --- Panel summary (latest filing per EIN) for metadata ---
    panel_latest = (
        panel.sort_values(["ein", "fiscal_year", "tax_period_end"], ascending=[True, False, False])
        .drop_duplicates(subset=["ein"], keep="first")
    )
    panel_summary: dict[str, dict] = {}
    for _, r in panel_latest[["ein", "total_revenue", "state", "org_name"]].iterrows():
        panel_summary[str(r["ein"])] = {
            "state": str(r.get("state", "")),
            "total_revenue": float(r["total_revenue"]) if pd.notna(r["total_revenue"]) else np.nan,
            "org_name": str(r.get("org_name", "") or ""),
        }

    # --- Qualifying EINs (>= 5 years of data) ---
    years_per_ein = panel.groupby("ein")["fiscal_year"].nunique()
    min5_eins = set(years_per_ein[years_per_ein >= 5].index.astype(str))

    # --- Restrict to window years ---
    window_years = PRE_WINDOW | POST_WINDOW
    relevant_mask = panel["fiscal_year"].isin(window_years)
    relevant = panel[relevant_mask].copy()

    needed_cols = [
        "ein", "fiscal_year", "ntee_major_category", "total_revenue", "total_expenses",
        "net_assets_eoy",
    ]
    pct_cols = ["pct_contributions", "pct_program_revenue", "pct_investment_income", "pct_other_revenue"]
    for pc in pct_cols:
        if pc in relevant.columns:
            needed_cols.append(pc)

    relevant = relevant[needed_cols].copy()
    relevant = _compute_analog_metrics(relevant)
    relevant["size_bucket"] = _assign_size_buckets(relevant["total_revenue"])
    relevant["ein"] = relevant["ein"].astype(str)
    relevant["ntee_major_category"] = relevant["ntee_major_category"].fillna("").astype(str).str.strip()

    # Drop rows missing size_bucket
    relevant = relevant.dropna(subset=["size_bucket"])

    # --- Compute per-(cohort, fiscal_year) Q25 and Q75 thresholds ---
    # Use agg for efficiency
    def _make_thresholds_strict(metric_col: str) -> dict:
        """Returns {(ntee, size_bucket, fiscal_year): (q25, q75)}"""
        mask = relevant["ntee_major_category"] != ""
        sub = relevant[mask][["ntee_major_category", "size_bucket", "fiscal_year", metric_col]].dropna(
            subset=[metric_col]
        )
        if sub.empty:
            return {}
        grp = sub.groupby(["ntee_major_category", "size_bucket", "fiscal_year"])[metric_col].agg(
            q25=lambda x: x.quantile(0.25),
            q75=lambda x: x.quantile(0.75),
        )
        return {k: (v["q25"], v["q75"]) for k, v in grp.iterrows()}

    def _make_thresholds_fallback(metric_col: str) -> dict:
        """Returns {(size_bucket, fiscal_year): (q25, q75)}"""
        sub = relevant[["size_bucket", "fiscal_year", metric_col]].dropna(subset=[metric_col])
        if sub.empty:
            return {}
        grp = sub.groupby(["size_bucket", "fiscal_year"])[metric_col].agg(
            q25=lambda x: x.quantile(0.25),
            q75=lambda x: x.quantile(0.75),
        )
        return {k: (v["q25"], v["q75"]) for k, v in grp.iterrows()}

    print("[analogs] Computing quartile thresholds per cohort+year...")
    strict_thresholds = {m: _make_thresholds_strict(m) for m in METRIC_NAMES}
    fallback_thresholds = {m: _make_thresholds_fallback(m) for m in METRIC_NAMES}

    # --- Find recovery candidates ---
    # For each (ein, metric, ntee, size_bucket), check pre-window bottom + post-window top
    # Strategy: iterate once over relevant rows, building per-(ein, metric, ntee, sb) records

    # Structure: candidates[metric][(ntee, size_bucket)][ein] = {"pre": [(year, val)], "post": [(year, val)]}
    # Then for each EIN that has both pre and post, it's a candidate

    print("[analogs] Building pre/post quartile membership per EIN...")
    # Use vectorized operations for each metric

    strict_lookup: dict = defaultdict(list)    # (metric, ntee, sb) -> list of candidate dicts
    fallback_lookup: dict = defaultdict(list)  # (metric, sb) -> list of candidate dicts

    for metric in METRIC_NAMES:
        st_thresh = strict_thresholds[metric]
        fb_thresh = fallback_thresholds[metric]

        # Work with a copy that has valid metric values
        m_df = relevant[["ein", "fiscal_year", "ntee_major_category", "size_bucket", metric]].dropna(
            subset=[metric]
        ).copy()

        # --- Strict cohort ---
        s_df = m_df[m_df["ntee_major_category"] != ""].copy()
        if len(s_df) > 0:
            # Map threshold keys
            s_df["_key"] = list(zip(s_df["ntee_major_category"], s_df["size_bucket"], s_df["fiscal_year"]))
            s_df["_q25"] = s_df["_key"].map(lambda k: st_thresh.get(k, (np.nan, np.nan))[0])
            s_df["_q75"] = s_df["_key"].map(lambda k: st_thresh.get(k, (np.nan, np.nan))[1])

            pre_strict = s_df[
                s_df["fiscal_year"].isin(PRE_WINDOW) & (s_df[metric] < s_df["_q25"])
            ][["ein", "ntee_major_category", "size_bucket", "fiscal_year", metric]].rename(
                columns={"fiscal_year": "pre_year", metric: "pre_val"}
            )
            post_strict = s_df[
                s_df["fiscal_year"].isin(POST_WINDOW) & (s_df[metric] > s_df["_q75"])
            ][["ein", "ntee_major_category", "size_bucket", "fiscal_year", metric]].rename(
                columns={"fiscal_year": "post_year", metric: "post_val"}
            )

            if len(pre_strict) > 0 and len(post_strict) > 0:
                combined = pre_strict.merge(
                    post_strict, on=["ein", "ntee_major_category", "size_bucket"], how="inner"
                )
                combined = combined[combined["ein"].isin(min5_eins)]
                # Keep best: latest post_year per (ein, ntee, sb)
                combined = combined.sort_values(
                    ["post_year", "pre_year", "ein"],
                    ascending=[False, True, True],
                ).drop_duplicates(subset=["ein", "ntee_major_category", "size_bucket"], keep="first")

                for _, row in combined.iterrows():
                    ein = str(row["ein"])
                    ntee = str(row["ntee_major_category"])
                    sb = str(row["size_bucket"])
                    meta = panel_summary.get(ein, {})
                    strict_lookup[(metric, ntee, sb)].append({
                        "ein": ein,
                        "state": meta.get("state", ""),
                        "total_revenue": meta.get("total_revenue", np.nan),
                        "org_name": meta.get("org_name", ""),
                        "pre_year": int(row["pre_year"]),
                        "post_year": int(row["post_year"]),
                        "pre_val": float(row["pre_val"]),
                        "post_val": float(row["post_val"]),
                    })

        # --- Fallback cohort ---
        f_df = m_df.copy()
        f_df["_key"] = list(zip(f_df["size_bucket"], f_df["fiscal_year"]))
        f_df["_q25"] = f_df["_key"].map(lambda k: fb_thresh.get(k, (np.nan, np.nan))[0])
        f_df["_q75"] = f_df["_key"].map(lambda k: fb_thresh.get(k, (np.nan, np.nan))[1])

        pre_fb = f_df[
            f_df["fiscal_year"].isin(PRE_WINDOW) & (f_df[metric] < f_df["_q25"])
        ][["ein", "size_bucket", "fiscal_year", metric]].rename(
            columns={"fiscal_year": "pre_year", metric: "pre_val"}
        )
        post_fb = f_df[
            f_df["fiscal_year"].isin(POST_WINDOW) & (f_df[metric] > f_df["_q75"])
        ][["ein", "size_bucket", "fiscal_year", metric]].rename(
            columns={"fiscal_year": "post_year", metric: "post_val"}
        )

        if len(pre_fb) > 0 and len(post_fb) > 0:
            combined_fb = pre_fb.merge(post_fb, on=["ein", "size_bucket"], how="inner")
            combined_fb = combined_fb[combined_fb["ein"].isin(min5_eins)]
            combined_fb = combined_fb.sort_values(
                ["post_year", "pre_year", "ein"],
                ascending=[False, True, True],
            ).drop_duplicates(subset=["ein", "size_bucket"], keep="first")

            for _, row in combined_fb.iterrows():
                ein = str(row["ein"])
                sb = str(row["size_bucket"])
                meta = panel_summary.get(ein, {})
                fallback_lookup[(metric, sb)].append({
                    "ein": ein,
                    "state": meta.get("state", ""),
                    "total_revenue": meta.get("total_revenue", np.nan),
                    "org_name": meta.get("org_name", ""),
                    "pre_year": int(row["pre_year"]),
                    "post_year": int(row["post_year"]),
                    "pre_val": float(row["pre_val"]),
                    "post_val": float(row["post_val"]),
                })

    print(f"[analogs] Strict lookup keys: {len(strict_lookup)}, fallback keys: {len(fallback_lookup)}")
    return {
        "strict_lookup": dict(strict_lookup),
        "fallback_lookup": dict(fallback_lookup),
        "panel_summary": panel_summary,
    }


def _primary_constraint(row) -> str | None:
    """
    Identify the primary constraint from per-metric gaps.
    Returns the gap column name with the most negative non-null value.
    Tie-break: operating_margin_gap > operating_runway_gap > revenue_diversification_gap.
    """
    gap_cols = ["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]
    best_col = None
    best_val = float("inf")
    for col in gap_cols:
        val = row.get(col) if hasattr(row, "get") else getattr(row, col, None)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            continue
        val = float(val)
        if val < best_val:
            best_val = val
            best_col = col
    return best_col


def _select_from_pool(
    pool: list[dict],
    target_ein: str,
    target_state: str,
    target_revenue: float,
    max_analogs: int,
) -> list[dict]:
    """Sort and filter a candidate pool for one target org."""
    filtered = [c for c in pool if c["ein"] != target_ein]
    if not filtered:
        return []

    def _sort_key(c):
        same_state = 0 if c["state"] == target_state else 1
        rev = c.get("total_revenue", np.nan)
        if pd.notna(target_revenue) and target_revenue > 0 and pd.notna(rev) and rev > 0:
            rev_ratio = abs(rev / target_revenue - 1.0)
        else:
            rev_ratio = 9999.0
        return (same_state, rev_ratio, -c["post_year"], c["ein"])

    filtered.sort(key=_sort_key)
    return filtered[:max_analogs]


def compute_analogs(df: pd.DataFrame, analog_pool: dict) -> pd.DataFrame:
    """
    Add the 5 recovery-analog fields to df.

    Eligible rows: benchmark_status = "ok"
    Not-applicable: not_scoreable or insufficient_resilient_refs
    """
    strict_lookup = analog_pool["strict_lookup"]
    fallback_lookup = analog_pool["fallback_lookup"]

    out = df.copy()

    eins_out = []
    counts_out = []
    evidences_out = []
    constraints_out = []
    statuses_out = []

    # Vectorized pre-fetch of needed columns
    benchmark_status = out["benchmark_status"].fillna("not_scoreable").tolist()
    ein_list = out["ein"].astype(str).tolist()
    ntee_list = out.get("ntee_major_category", pd.Series([""] * len(out))).fillna("").astype(str).str.strip().tolist()
    size_bucket_list = out["size_bucket"].tolist()
    state_list = out["state"].astype(str).tolist()
    revenue_list = pd.to_numeric(out.get("total_revenue", pd.Series([np.nan] * len(out))), errors="coerce").tolist()
    om_gap_list = pd.to_numeric(out.get("operating_margin_gap", pd.Series([np.nan] * len(out))), errors="coerce").tolist()
    or_gap_list = pd.to_numeric(out.get("operating_runway_gap", pd.Series([np.nan] * len(out))), errors="coerce").tolist()
    rdi_gap_list = pd.to_numeric(out.get("revenue_diversification_gap", pd.Series([np.nan] * len(out))), errors="coerce").tolist()

    for i in range(len(out)):
        bstatus = str(benchmark_status[i])

        if bstatus in ("not_scoreable", "insufficient_resilient_refs"):
            eins_out.append("")
            counts_out.append(0)
            evidences_out.append("[]")
            constraints_out.append(None)
            statuses_out.append("not_applicable")
            continue

        # Determine primary constraint
        gaps = {
            "operating_margin_gap": om_gap_list[i],
            "operating_runway_gap": or_gap_list[i],
            "revenue_diversification_gap": rdi_gap_list[i],
        }
        constraint_col = None
        best_val = float("inf")
        for col in ["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]:
            v = gaps[col]
            if v is None or np.isnan(v):
                continue
            if float(v) < best_val:
                best_val = float(v)
                constraint_col = col

        if constraint_col is None:
            eins_out.append("")
            counts_out.append(0)
            evidences_out.append("[]")
            constraints_out.append(None)
            statuses_out.append("not_applicable")
            continue

        metric = CONSTRAINT_METRIC_MAP[constraint_col]
        constraint_label = CONSTRAINT_LABEL_MAP[constraint_col]
        ein = ein_list[i]
        ntee = ntee_list[i]
        sb = size_bucket_list[i]
        state = state_list[i]
        rev = revenue_list[i]

        analogs = []
        if sb is not None and not (isinstance(sb, float) and np.isnan(float(sb) if isinstance(sb, float) else 0)):
            sb_str = str(sb)

            # Strict cohort
            strict_pool = strict_lookup.get((metric, ntee, sb_str), [])
            analogs = _select_from_pool(strict_pool, ein, state, rev, max_analogs=3)

            # Fallback cohort if needed
            if len(analogs) == 0:
                fallback_pool = fallback_lookup.get((metric, sb_str), [])
                analogs = _select_from_pool(fallback_pool, ein, state, rev, max_analogs=3)

        if analogs:
            ein_csv = ",".join(a["ein"] for a in analogs)
            evidence = [
                {
                    "ein": a["ein"],
                    "org_name": a["org_name"],
                    "state": a["state"],
                    "pre_window_year": a["pre_year"],
                    "post_recovery_year": a["post_year"],
                    "matched_metric_name": metric,
                    "matched_metric_pre_value": a["pre_val"] if not np.isnan(a["pre_val"]) else None,
                    "matched_metric_post_value": a["post_val"] if not np.isnan(a["post_val"]) else None,
                }
                for a in analogs
            ]
            eins_out.append(ein_csv)
            counts_out.append(len(analogs))
            evidences_out.append(json.dumps(evidence))
            constraints_out.append(constraint_label)
            statuses_out.append("found")
        else:
            eins_out.append("")
            counts_out.append(0)
            evidences_out.append("[]")
            constraints_out.append(constraint_label)
            statuses_out.append("none_in_cohort")

    out["recovery_analog_eins"] = eins_out
    out["recovery_analog_count"] = counts_out
    out["recovery_analog_evidence"] = evidences_out
    out["recovery_analog_constraint"] = constraints_out
    out["recovery_analog_status"] = statuses_out

    return out
