"""
Stage 2 recovery analog module — rebuilt per analog addendum
(docs/2026-04-13-fairlight-stage2-analog-addendum.md).

Key pins from the addendum:
  1. Quartile thresholds are national per fiscal_year — NOT per cohort.
     Cohort filtering happens only at selection time.
  2. "Bottom quartile" = metric <= national Q25 for that year (at or below).
     "Top quartile"    = metric >= national Q75 for that year (at or above).
  3. Five-year rule: >= 5 unique fiscal years in panel (non-consecutive OK).
  4. Pool built once nationally; per-row selection queries pre-built pool.
  5. Output: recovery_analog_eins is a Python list of string EINs (not CSV).
             recovery_analog_evidence is a Python list of dicts (not JSON string).

Adds 5 fields per row:
  recovery_analog_eins       - list of str (up to 3 EINs)
  recovery_analog_count      - int
  recovery_analog_evidence   - list of dicts (JSON-serializable)
  recovery_analog_constraint - str or None
  recovery_analog_status     - "found" | "none_in_cohort" | "not_applicable"
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PRE_WINDOW = set(range(2014, 2020))    # FY2014–2019
POST_WINDOW = set(range(2020, 2025))   # FY2020–2024

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

METRICS = list(CONSTRAINT_METRIC_MAP.values())


def _assign_size_buckets(revenue: pd.Series) -> pd.Series:
    rev = pd.to_numeric(revenue, errors="coerce")
    buckets = pd.cut(
        rev,
        bins=[-np.inf, 500_000, 2_000_000, 10_000_000, np.inf],
        labels=["<500K", "500K-2M", "2M-10M", ">10M"],
        right=False,
    ).astype(object)
    return buckets.where(rev.notna(), other=None)


def _compute_analog_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Compute the three constraint metrics for all panel rows."""
    rev = pd.to_numeric(df["total_revenue"], errors="coerce")
    exp = pd.to_numeric(df["total_expenses"], errors="coerce")
    net = pd.to_numeric(df["net_assets_eoy"], errors="coerce")
    monthly_exp = exp / 12.0

    out = df.copy()
    out["operating_margin"] = (rev - exp) / rev.where(rev.notna() & rev.ne(0))
    out["operating_runway_proxy_months"] = net / monthly_exp.where(
        monthly_exp.notna() & monthly_exp.ne(0)
    )

    pct_cols = [
        "pct_contributions", "pct_program_revenue",
        "pct_investment_income", "pct_other_revenue",
    ]
    if all(c in out.columns for c in pct_cols):
        pct_df = out[pct_cols].apply(pd.to_numeric, errors="coerce")
        all_null = pct_df.isna().all(axis=1)
        hhi = (pct_df.fillna(0.0) ** 2).sum(axis=1)
        out["revenue_diversification_index"] = (1.0 - hhi).where(~all_null)
    else:
        out["revenue_diversification_index"] = np.nan

    return out


def build_analog_pool(panel: pd.DataFrame) -> dict:
    """
    Build the analog candidate pool once from the full national panel.

    Returns:
      strict_lookup:   {(metric, ntee, size_bucket) -> list of candidate dicts}
      fallback_lookup: {(metric, size_bucket)        -> list of candidate dicts}
      panel_summary:   {ein -> {state, total_revenue, org_name}}
    """
    # ── Panel summary (latest filing per EIN) — vectorized ───────────────────
    panel_latest = (
        panel.sort_values(
            ["ein", "fiscal_year", "tax_period_end"],
            ascending=[True, False, False],
        )
        .drop_duplicates(subset=["ein"], keep="first")
        [["ein", "total_revenue", "state", "org_name"]]
        .copy()
    )
    panel_latest["ein"] = panel_latest["ein"].astype(str)
    panel_latest["state"] = panel_latest["state"].fillna("").astype(str)
    panel_latest["org_name"] = panel_latest["org_name"].fillna("").astype(str)
    panel_latest["total_revenue"] = pd.to_numeric(panel_latest["total_revenue"], errors="coerce")
    panel_latest = panel_latest.set_index("ein")
    # Build lookup as dict of records for O(1) access
    panel_summary: dict[str, dict] = panel_latest.to_dict(orient="index")

    # ── EINs with >= 5 unique fiscal years ───────────────────────────────────
    years_per_ein = panel.groupby("ein")["fiscal_year"].nunique()
    min5_eins = set(years_per_ein[years_per_ein >= 5].index.astype(str))

    # ── Prepare window-year subset with computed metrics ─────────────────────
    window_years = PRE_WINDOW | POST_WINDOW
    needed_cols = [
        "ein", "fiscal_year", "ntee_major_category",
        "total_revenue", "total_expenses", "net_assets_eoy",
    ]
    pct_cols = [
        "pct_contributions", "pct_program_revenue",
        "pct_investment_income", "pct_other_revenue",
    ]
    for pc in pct_cols:
        if pc in panel.columns:
            needed_cols.append(pc)

    relevant = panel.loc[panel["fiscal_year"].isin(window_years), needed_cols].copy()
    relevant = _compute_analog_metrics(relevant)
    relevant["size_bucket"] = _assign_size_buckets(relevant["total_revenue"])
    relevant["ein"] = relevant["ein"].astype(str)
    relevant["ntee_major_category"] = (
        relevant["ntee_major_category"].fillna("").astype(str).str.strip()
    )
    relevant = relevant.dropna(subset=["size_bucket"])

    # ── ADDENDUM PIN 1: National per-year quartile thresholds ─────────────────
    # Thresholds are global per fiscal_year — NOT per cohort.
    print("[analogs] Computing national per-year quartile thresholds...")
    national_thresholds: dict[str, dict[int, tuple]] = {}
    for metric in METRICS:
        sub = relevant[["fiscal_year", metric]].dropna(subset=[metric])
        q25 = sub.groupby("fiscal_year")[metric].quantile(0.25)
        q75 = sub.groupby("fiscal_year")[metric].quantile(0.75)
        thresh = pd.concat([q25.rename("q25"), q75.rename("q75")], axis=1)
        national_thresholds[metric] = {
            int(yr): (row["q25"], row["q75"])
            for yr, row in thresh.iterrows()
        }

    # ── Find recovery candidates per metric ──────────────────────────────────
    print("[analogs] Finding recovery candidates (pre bottom->post top, national thresholds)...")

    # Pre-join thresholds onto relevant rows for each metric
    # Build: pre_rows with is_bottom flag, post_rows with is_top flag
    from collections import defaultdict

    strict_lookup: dict = defaultdict(list)
    fallback_lookup: dict = defaultdict(list)

    for metric in METRICS:
        thresh_map = national_thresholds[metric]
        # Build a small DataFrame of thresholds for fast merge (avoids Python-level map)
        thresh_df = pd.DataFrame(
            [(yr, q25, q75) for yr, (q25, q75) in thresh_map.items()],
            columns=["fiscal_year", "_q25", "_q75"],
        )

        m_df = relevant[
            ["ein", "fiscal_year", "ntee_major_category", "size_bucket", metric]
        ].dropna(subset=[metric]).copy()

        # Merge thresholds in one vectorised join instead of per-row map
        m_df = m_df.merge(thresh_df, on="fiscal_year", how="left")

        # ADDENDUM PIN 2: at-or-below Q25 for pre-window, at-or-above Q75 for post
        pre = m_df[
            m_df["fiscal_year"].isin(PRE_WINDOW) & (m_df[metric] <= m_df["_q25"])
        ][["ein", "ntee_major_category", "size_bucket", "fiscal_year", metric]].rename(
            columns={"fiscal_year": "pre_year", metric: "pre_val"}
        )

        post = m_df[
            m_df["fiscal_year"].isin(POST_WINDOW) & (m_df[metric] >= m_df["_q75"])
        ][["ein", "ntee_major_category", "size_bucket", "fiscal_year", metric]].rename(
            columns={"fiscal_year": "post_year", metric: "post_val"}
        )

        if pre.empty or post.empty:
            continue

        # Deduplicate before merging to avoid Cartesian product blow-up.
        # For each EIN+cohort keep: earliest pre_year (with its metric val),
        # latest post_year (with its metric val).
        pre_best = (
            pre.sort_values("pre_year")
            .drop_duplicates(subset=["ein", "ntee_major_category", "size_bucket"], keep="first")
        )
        post_best = (
            post.sort_values("post_year", ascending=False)
            .drop_duplicates(subset=["ein", "ntee_major_category", "size_bucket"], keep="first")
        )
        # Filter to qualified EINs before the join to reduce data size
        qualified_eins = (
            set(pre_best["ein"]) & set(post_best["ein"]) & min5_eins
        )
        pre_best = pre_best[pre_best["ein"].isin(qualified_eins)]
        post_best = post_best[post_best["ein"].isin(qualified_eins)]

        def _build_lookup_entries(pre_df, post_df, key_cols, lookup):
            if pre_df.empty or post_df.empty:
                return
            combined = pre_df.merge(post_df, on=key_cols, how="inner")
            if combined.empty:
                return
            for _, row in combined.iterrows():
                ein = str(row["ein"])
                sb = str(row["size_bucket"])
                ntee = str(row.get("ntee_major_category", ""))
                meta = panel_summary.get(ein, {})
                key = (metric, ntee, sb) if "ntee_major_category" in key_cols else (metric, sb)
                lookup[key].append({
                    "ein": ein,
                    "state": meta.get("state", ""),
                    "total_revenue": meta.get("total_revenue", np.nan),
                    "org_name": meta.get("org_name", ""),
                    "pre_year": int(row["pre_year"]),
                    "post_year": int(row["post_year"]),
                    "pre_val": float(row["pre_val"]),
                    "post_val": float(row["post_val"]),
                })

        # ── Strict cohort: ntee + size_bucket ────────────────────────────────
        strict_pre_b = pre_best[pre_best["ntee_major_category"] != ""]
        strict_post_b = post_best[post_best["ntee_major_category"] != ""]
        _build_lookup_entries(
            strict_pre_b, strict_post_b,
            ["ein", "ntee_major_category", "size_bucket"],
            strict_lookup,
        )

        # ── Fallback cohort: size_bucket only ────────────────────────────────
        # Re-dedupe on (ein, size_bucket) only since ntee not part of key
        pre_fb = (
            pre.sort_values("pre_year")
            .drop_duplicates(subset=["ein", "size_bucket"], keep="first")
        )
        post_fb = (
            post.sort_values("post_year", ascending=False)
            .drop_duplicates(subset=["ein", "size_bucket"], keep="first")
        )
        qualified_fb = set(pre_fb["ein"]) & set(post_fb["ein"]) & min5_eins
        _build_lookup_entries(
            pre_fb[pre_fb["ein"].isin(qualified_fb)],
            post_fb[post_fb["ein"].isin(qualified_fb)],
            ["ein", "size_bucket"],
            fallback_lookup,
        )

    print(
        f"[analogs] Pool: {len(strict_lookup)} strict keys, "
        f"{len(fallback_lookup)} fallback keys"
    )
    return {
        "strict_lookup": dict(strict_lookup),
        "fallback_lookup": dict(fallback_lookup),
        "panel_summary": panel_summary,
    }


def _select_from_pool(
    pool: list[dict],
    target_ein: str,
    target_state: str,
    target_revenue: float,
    max_analogs: int = 3,
) -> list[dict]:
    """
    Sort pool candidates by the contract selection order and return top N.

    Order: strict cohort > fallback (handled by caller),
           same-state preference, smallest revenue-ratio diff,
           most recent post_year, lowest EIN ascending.
    """
    candidates = [c for c in pool if c["ein"] != target_ein]
    if not candidates:
        return []

    def _key(c):
        same_state = 0 if c["state"] == target_state else 1
        rev = c.get("total_revenue", np.nan)
        if (
            pd.notna(target_revenue)
            and target_revenue > 0
            and pd.notna(rev)
            and rev > 0
        ):
            rev_ratio = abs(rev / target_revenue - 1.0)
        else:
            rev_ratio = 9999.0
        return (same_state, rev_ratio, -c["post_year"], c["ein"])

    candidates.sort(key=_key)
    return candidates[:max_analogs]


def _primary_constraint(
    om_gap: float, or_gap: float, rdi_gap: float
) -> str | None:
    """
    Return the gap column name with the most negative non-null value.
    Tie-break: operating_margin_gap > operating_runway_gap > revenue_diversification_gap.
    """
    gap_cols = [
        ("operating_margin_gap", om_gap),
        ("operating_runway_gap", or_gap),
        ("revenue_diversification_gap", rdi_gap),
    ]
    best_col = None
    best_val = float("inf")
    for col, val in gap_cols:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            continue
        fv = float(val)
        if fv < best_val:
            best_val = fv
            best_col = col
    return best_col


def compute_analogs(df: pd.DataFrame, analog_pool: dict) -> pd.DataFrame:
    """
    Add 5 recovery-analog fields to df.

    ADDENDUM PIN 5: recovery_analog_eins is a Python list of strings.
                    recovery_analog_evidence is a Python list of dicts.
                    Empty → [] (not None, not "[]").
    """
    strict_lookup = analog_pool["strict_lookup"]
    fallback_lookup = analog_pool["fallback_lookup"]

    out = df.copy()

    # Vectorised pre-fetch
    bstatus_col = out["benchmark_status"].fillna("not_scoreable").tolist()
    ein_col = out["ein"].astype(str).tolist()
    ntee_col = (
        out.get("ntee_major_category", pd.Series([""] * len(out)))
        .fillna("").astype(str).str.strip().tolist()
    )
    sb_col = out["size_bucket"].tolist()
    state_col = out["state"].astype(str).tolist()
    rev_col = pd.to_numeric(
        out.get("total_revenue", pd.Series([np.nan] * len(out))), errors="coerce"
    ).tolist()
    om_gap_col = pd.to_numeric(
        out.get("operating_margin_gap", pd.Series([np.nan] * len(out))), errors="coerce"
    ).tolist()
    or_gap_col = pd.to_numeric(
        out.get("operating_runway_gap", pd.Series([np.nan] * len(out))), errors="coerce"
    ).tolist()
    rdi_gap_col = pd.to_numeric(
        out.get("revenue_diversification_gap", pd.Series([np.nan] * len(out))), errors="coerce"
    ).tolist()

    eins_out = []
    counts_out = []
    evidences_out = []
    constraints_out = []
    statuses_out = []

    for i in range(len(out)):
        bstatus = str(bstatus_col[i])

        # Not eligible
        if bstatus in ("not_scoreable", "insufficient_resilient_refs"):
            eins_out.append([])
            counts_out.append(0)
            evidences_out.append([])
            constraints_out.append(None)
            statuses_out.append("not_applicable")
            continue

        constraint_col = _primary_constraint(om_gap_col[i], or_gap_col[i], rdi_gap_col[i])
        if constraint_col is None:
            eins_out.append([])
            counts_out.append(0)
            evidences_out.append([])
            constraints_out.append(None)
            statuses_out.append("not_applicable")
            continue

        metric = CONSTRAINT_METRIC_MAP[constraint_col]
        constraint_label = CONSTRAINT_LABEL_MAP[constraint_col]
        ein = ein_col[i]
        ntee = ntee_col[i]
        sb = sb_col[i]
        state = state_col[i]
        rev = rev_col[i]

        selected: list[dict] = []
        if sb is not None and not (isinstance(sb, float) and np.isnan(float(sb) if isinstance(sb, float) else 0)):
            sb_str = str(sb)
            # Strict cohort first
            strict_pool = strict_lookup.get((metric, ntee, sb_str), [])
            selected = _select_from_pool(strict_pool, ein, state, rev)
            # Fallback if strict yields nothing
            if not selected:
                fb_pool = fallback_lookup.get((metric, sb_str), [])
                selected = _select_from_pool(fb_pool, ein, state, rev)

        if selected:
            # ADDENDUM PIN 5: Python list of strings
            eins_out.append([a["ein"] for a in selected])
            counts_out.append(len(selected))
            # ADDENDUM PIN 5: Python list of dicts
            evidences_out.append([
                {
                    "ein": a["ein"],
                    "org_name": a["org_name"],
                    "state": a["state"],
                    "pre_window_year": a["pre_year"],
                    "post_recovery_year": a["post_year"],
                    "matched_metric_name": metric,
                    "matched_metric_pre_value": (
                        None if np.isnan(a["pre_val"]) else a["pre_val"]
                    ),
                    "matched_metric_post_value": (
                        None if np.isnan(a["post_val"]) else a["post_val"]
                    ),
                }
                for a in selected
            ])
            constraints_out.append(constraint_label)
            statuses_out.append("found")
        else:
            eins_out.append([])
            counts_out.append(0)
            evidences_out.append([])
            constraints_out.append(constraint_label)
            statuses_out.append("none_in_cohort")

    out["recovery_analog_eins"] = eins_out
    out["recovery_analog_count"] = counts_out
    out["recovery_analog_evidence"] = evidences_out
    out["recovery_analog_constraint"] = constraints_out
    out["recovery_analog_status"] = statuses_out

    return out
