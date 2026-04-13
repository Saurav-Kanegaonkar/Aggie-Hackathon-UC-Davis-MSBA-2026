"""
Deliverable 3 — Resilient benchmark construction.
For each scored row: compute metrics, build rolling window, find resilient peers,
compute per-year-then-median Q75 benchmarks.
"""

import pandas as pd
import numpy as np
import json
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


def compute_metrics(df):
    """
    Compute the three benchmark metrics + shadow metric + shock absorption
    on every row in the panel. Modifies df in-place.
    """
    # Operating margin
    df["operating_margin"] = np.where(
        df["total_revenue"].notna() & (df["total_revenue"] != 0),
        (df["total_revenue"] - df["total_expenses"]) / df["total_revenue"],
        np.nan,
    )

    # Operating runway proxy months
    monthly_expenses = df["total_expenses"] / 12
    df["operating_runway_proxy_months"] = np.where(
        df["total_expenses"].notna() & (df["total_expenses"] != 0),
        df["net_assets_eoy"] / monthly_expenses,
        np.nan,
    )

    # Revenue diversification index (zero-fill nulls, all-null → null)
    pct_cols = [
        "pct_contributions",
        "pct_program_revenue",
        "pct_investment_income",
        "pct_other_revenue",
    ]
    all_null = df[pct_cols].isna().all(axis=1)

    pct_filled = df[pct_cols].fillna(0)
    hhi = (pct_filled ** 2).sum(axis=1)
    df["revenue_diversification_index"] = np.where(all_null, np.nan, 1 - hhi)

    # Shadow metric: renormalized (drop nulls, rescale to sum=1, apply HHI)
    pct_raw = df[pct_cols].copy()
    row_sums = pct_raw.sum(axis=1, skipna=True)
    # Count non-null columns per row
    non_null_count = pct_raw.notna().sum(axis=1)

    renorm_index = pd.Series(np.nan, index=df.index)
    for idx in df.index:
        vals = pct_raw.loc[idx].dropna()
        if len(vals) == 0:
            continue
        s = vals.sum()
        if s == 0:
            renorm_index[idx] = 0.0
        else:
            rescaled = vals / s
            renorm_index[idx] = 1 - (rescaled ** 2).sum()

    df["revenue_diversification_index_renormalized"] = renorm_index

    # Shock absorption months (reference only)
    cash = df["cash_non_interest_bearing"].fillna(0)
    savings = df["savings_temporary_investments"].fillna(0)
    df["shock_absorption_months"] = np.where(
        df["total_expenses"].notna() & (df["total_expenses"] != 0),
        (cash + savings) / monthly_expenses,
        np.nan,
    )

    logger.info(
        f"Metrics computed. Non-null counts: "
        f"margin={df['operating_margin'].notna().sum():,}, "
        f"runway={df['operating_runway_proxy_months'].notna().sum():,}, "
        f"diversification={df['revenue_diversification_index'].notna().sum():,}, "
        f"shock_abs={df['shock_absorption_months'].notna().sum():,}"
    )


def _compute_benchmark_q75_per_year_then_median(cohort_window_rows, metric_col):
    """
    Per-year Q75, then median across years.
    Robust to single anomalous years (e.g. COVID PPP inflation).
    """
    yearly_q75s = []
    for fy, grp in cohort_window_rows.groupby("fiscal_year"):
        vals = grp[metric_col].dropna()
        if len(vals) > 0:
            yearly_q75s.append(np.percentile(vals, 75))
    if len(yearly_q75s) == 0:
        return np.nan
    return np.median(yearly_q75s)


def _find_resilient_peers(
    cohort_window_rows, benchmark_fallback_order, min_reference_orgs
):
    """
    Apply the persistence fallback ladder to identify resilient peers.
    Returns (set of resilient EINs, fallback_step, benchmark_rule_label).
    """
    metrics = [
        "operating_margin",
        "operating_runway_proxy_months",
        "revenue_diversification_index",
    ]

    # Pre-compute per-year Q75 thresholds for each metric
    per_year_q75 = {}
    for fy, grp in cohort_window_rows.groupby("fiscal_year"):
        per_year_q75[fy] = {}
        for m in metrics:
            vals = grp[m].dropna()
            if len(vals) > 0:
                per_year_q75[fy][m] = np.percentile(vals, 75)
            else:
                per_year_q75[fy][m] = np.nan

    # For each EIN, determine which years it's top quartile on each metric
    ein_year_metrics = defaultdict(lambda: defaultdict(dict))
    for _, row in cohort_window_rows.iterrows():
        ein = row["ein"]
        fy = row["fiscal_year"]
        for m in metrics:
            val = row[m]
            threshold = per_year_q75.get(fy, {}).get(m, np.nan)
            if pd.notna(val) and pd.notna(threshold):
                ein_year_metrics[ein][fy][m] = val >= threshold
            else:
                ein_year_metrics[ein][fy][m] = None  # null, non-qualifying

    for step_idx, step in enumerate(benchmark_fallback_order):
        min_metrics = step["min_metrics"]
        min_years = step["min_years"]
        label = step["label"]

        qualifying_eins = set()
        for ein, year_data in ein_year_metrics.items():
            qualifying_years = 0
            for fy, metric_results in year_data.items():
                non_null = {
                    m: v for m, v in metric_results.items() if v is not None
                }
                if len(non_null) < min_metrics:
                    # Not enough non-null metrics to evaluate this year
                    continue
                top_q_count = sum(1 for v in non_null.values() if v)

                if min_metrics == 3:
                    # "all 3": need all 3 non-null AND all 3 top quartile
                    if len(non_null) == 3 and top_q_count == 3:
                        qualifying_years += 1
                else:
                    # "2 of 3": need at least 2 non-null AND at least 2 top quartile
                    if top_q_count >= min_metrics:
                        qualifying_years += 1

            if qualifying_years >= min_years:
                qualifying_eins.add(ein)

        if len(qualifying_eins) >= min_reference_orgs:
            return qualifying_eins, step_idx + 1, label

    # No step produced enough — return whatever step 3 gave (or empty)
    return qualifying_eins, 3, benchmark_fallback_order[-1]["label"]


def build_benchmarks(scored_df, full_panel, contract):
    """
    For each scored row, compute resilient peer set and benchmark Q75s.

    Args:
        scored_df: Scored rows with cohort assignments.
        full_panel: Full CA+WA panel with metrics computed.
        contract: Parsed contract JSON.

    Returns:
        scored_df with benchmark columns added.
    """
    benchmark_fallback_order = contract["benchmark_fallback_order"]
    cohort_fallback_order = contract["cohort_fallback_order"]
    min_reference_orgs = contract["min_reference_orgs"]
    window_size = contract["benchmark_window"]["window_years"]

    metrics = [
        "operating_margin",
        "operating_runway_proxy_months",
        "revenue_diversification_index",
    ]

    # Assign cohort keys to the full panel (in-place) so downstream modules
    # (e.g. stage1_gap) can also use _cohort_key for window lookups.
    if "_cohort_key" not in full_panel.columns:
        logger.info("Assigning cohort keys to full eligible panel for window construction...")
        # Only assign to eligible rows; ineligible rows get a sentinel
        eligible_mask = full_panel["scoring_eligible"]
        eligible_panel = full_panel[eligible_mask].copy()
        _assign_cohort_keys_to_panel(eligible_panel, contract)
        full_panel["_cohort_key"] = None
        full_panel.loc[eligible_mask, "_cohort_key"] = eligible_panel["_cohort_key"].values

    eligible_panel = full_panel[full_panel["scoring_eligible"]].copy()

    scored_df = scored_df.copy()
    for col in [
        "benchmark_operating_margin_q75",
        "benchmark_operating_runway_q75",
        "benchmark_revenue_diversification_q75",
        "benchmark_fallback_step",
        "reference_org_count",
    ]:
        scored_df[col] = np.nan
    for col in ["benchmark_rule", "benchmark_status"]:
        scored_df[col] = pd.Series([None] * len(scored_df), dtype="object")

    # Group scored rows by (cohort_key, fiscal_year) — same cohort + same
    # scoring year share the same window
    groups = scored_df.groupby(["cohort_key", "fiscal_year"])
    total_groups = len(groups)
    logger.info(f"Processing {total_groups:,} (cohort_key, fiscal_year) groups...")

    processed = 0
    for (ck, fy), group_indices in groups.groups.items():
        # Define rolling window [Y-6 ... Y]
        window_start = fy - (window_size - 1)
        window_end = fy

        # Get cohort-window rows from the eligible panel
        cohort_rows = eligible_panel[eligible_panel["_cohort_key"] == ck]
        window_rows = cohort_rows[
            (cohort_rows["fiscal_year"] >= window_start)
            & (cohort_rows["fiscal_year"] <= window_end)
        ]

        if len(window_rows) == 0:
            continue

        # Benchmark Q75: per-year then median
        bm_margin_q75 = _compute_benchmark_q75_per_year_then_median(
            window_rows, "operating_margin"
        )
        bm_runway_q75 = _compute_benchmark_q75_per_year_then_median(
            window_rows, "operating_runway_proxy_months"
        )
        bm_div_q75 = _compute_benchmark_q75_per_year_then_median(
            window_rows, "revenue_diversification_index"
        )

        # Resilient peer set
        resilient_eins, fallback_step, rule_label = _find_resilient_peers(
            window_rows, benchmark_fallback_order, min_reference_orgs
        )

        # If fallback_step exhausted without enough peers, try broadening cohort
        if len(resilient_eins) < min_reference_orgs:
            # Attempt cohort broadening (step 4)
            broader_ck = _broaden_cohort_key(ck, scored_df, group_indices, contract)
            if broader_ck and broader_ck != ck:
                broader_rows = eligible_panel[eligible_panel["_cohort_key"] == broader_ck]
                broader_window = broader_rows[
                    (broader_rows["fiscal_year"] >= window_start)
                    & (broader_rows["fiscal_year"] <= window_end)
                ]
                if len(broader_window) > 0:
                    resilient_eins_b, fs_b, rl_b = _find_resilient_peers(
                        broader_window, benchmark_fallback_order, min_reference_orgs
                    )
                    if len(resilient_eins_b) >= min_reference_orgs:
                        resilient_eins = resilient_eins_b
                        fallback_step = 4
                        rule_label = rl_b
                        # Also update benchmarks from broader window
                        bm_margin_q75 = _compute_benchmark_q75_per_year_then_median(
                            broader_window, "operating_margin"
                        )
                        bm_runway_q75 = _compute_benchmark_q75_per_year_then_median(
                            broader_window, "operating_runway_proxy_months"
                        )
                        bm_div_q75 = _compute_benchmark_q75_per_year_then_median(
                            broader_window, "revenue_diversification_index"
                        )
                    else:
                        fallback_step = 4

        ref_count = len(resilient_eins)
        if ref_count >= min_reference_orgs:
            bm_status = "resolved"
        elif ref_count > 0:
            bm_status = "degraded"
        else:
            bm_status = "failed"

        # Assign to all scored rows in this group
        scored_df.loc[group_indices, "benchmark_operating_margin_q75"] = bm_margin_q75
        scored_df.loc[group_indices, "benchmark_operating_runway_q75"] = bm_runway_q75
        scored_df.loc[
            group_indices, "benchmark_revenue_diversification_q75"
        ] = bm_div_q75
        scored_df.loc[group_indices, "benchmark_fallback_step"] = fallback_step
        scored_df.loc[group_indices, "benchmark_rule"] = rule_label
        scored_df.loc[group_indices, "reference_org_count"] = ref_count
        scored_df.loc[group_indices, "benchmark_status"] = bm_status

        processed += 1
        if processed % 50 == 0:
            logger.info(f"  Processed {processed}/{total_groups} groups...")

    logger.info(f"Benchmark construction complete. {processed} groups processed.")
    logger.info(
        f"  benchmark_status distribution:\n"
        f"{scored_df['benchmark_status'].value_counts().to_string()}"
    )

    return scored_df


def _assign_cohort_keys_to_panel(panel, contract):
    """
    Assign a _cohort_key to every row in the eligible panel,
    using the same fallback logic as Deliverable 2.
    This is needed so we can look up which panel rows belong to a cohort.
    """
    fallback_order = contract["cohort_fallback_order"]
    min_cohort_size = contract["min_cohort_size"]

    level_names = [
        "ntee+size_bucket+state",
        "size_bucket+state+return_type",
        "size_bucket+state",
    ]

    # Pre-compute cohort sizes for each level
    cohort_ein_counts = {}
    for level_idx, level_cols in enumerate(fallback_order):
        grouped = panel.groupby(list(level_cols))["ein"].nunique()
        cohort_ein_counts[level_idx] = grouped.to_dict()

    # Vectorized approach: try primary first, fallback if needed
    # Build cohort keys for each level
    def _key_for_row(row):
        for level_idx, level_cols in enumerate(fallback_order):
            if level_idx == 0 and pd.isna(row.get("ntee_major_category")):
                continue
            key_tuple = tuple(
                row[c] if pd.notna(row.get(c)) else None for c in level_cols
            )
            size = cohort_ein_counts[level_idx].get(key_tuple, 0)
            if size >= min_cohort_size:
                parts = []
                for c in level_cols:
                    v = row.get(c)
                    parts.append("unclassified" if pd.isna(v) else str(v))
                return "_".join(parts)

        # Broadest fallback
        last_cols = fallback_order[-1]
        parts = []
        for c in last_cols:
            v = row.get(c)
            parts.append("unclassified" if pd.isna(v) else str(v))
        return "_".join(parts)

    panel["_cohort_key"] = panel.apply(_key_for_row, axis=1)


def _broaden_cohort_key(current_key, scored_df, group_indices, contract):
    """
    Given a cohort key, find the next broader cohort key by moving down
    the fallback hierarchy.
    """
    fallback_order = contract["cohort_fallback_order"]
    level_names = [
        "ntee+size_bucket+state",
        "size_bucket+state+return_type",
        "size_bucket+state",
    ]

    # Determine current level from the scored row's cohort_level
    sample_idx = group_indices[0] if hasattr(group_indices, '__iter__') else group_indices
    current_level = scored_df.loc[sample_idx, "cohort_level"]

    try:
        current_level_idx = level_names.index(current_level)
    except ValueError:
        return None

    if current_level_idx >= len(level_names) - 1:
        return None  # Already at broadest

    # Build the broader key from the scored row
    next_level_cols = fallback_order[current_level_idx + 1]
    row = scored_df.loc[sample_idx]
    parts = []
    for c in next_level_cols:
        v = row.get(c)
        parts.append("unclassified" if pd.isna(v) else str(v))
    return "_".join(parts)
