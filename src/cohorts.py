"""
Stage 1 – cohort assignment and resilient-benchmark construction.

Cohort fallback hierarchy (from contract):
  L1: ntee_major_category + size_bucket + state         (tightest)
  L2: size_bucket + state + return_type
  L3: size_bucket + state                               (broadest)

Benchmark fallback (within assigned cohort):
  Step 1: org qualifies in 3-of-3 metrics for 5-of-7 years
  Step 2: org qualifies in 2-of-3 metrics for 5-of-7 years
  Step 3: org qualifies in 3-of-3 metrics for 4-of-7 years
  Step 4: none of the above → benchmark_status = 'insufficient_resilient_refs'

"Qualifies in a year" means org value >= cohort Q75 threshold for that metric-year.
Benchmark values = Q75 of resilient peers' metrics in the scoring year.
"""
from __future__ import annotations

from typing import Optional

import pandas as pd

from src.features import BENCHMARK_METRICS

# Level label → list of grouping columns
COHORT_LEVEL_COLS: dict[str, list[str]] = {
    "L1": ["ntee_major_category", "size_bucket", "state"],
    "L2": ["size_bucket", "state", "return_type"],
    "L3": ["size_bucket", "state"],
}

# Integer step → contract label (for benchmark_rule field)
STEP_LABEL: dict[int, str] = {
    1: "3-of-3_5-of-7",
    2: "2-of-3_5-of-7",
    3: "3-of-3_4-of-7",
    4: "cohort_broadened",
}

_BENCHMARK_KEY: dict[str, str] = {
    "operating_margin": "benchmark_operating_margin_q75",
    "operating_runway_proxy_months": "benchmark_operating_runway_q75",
    "revenue_diversification_index": "benchmark_revenue_diversification_q75",
}

_BENCHMARK_COLS = list(_BENCHMARK_KEY.values())
_ALL_BM_COLS = _BENCHMARK_COLS + [
    "reference_org_count",
    "benchmark_fallback_step",
    "benchmark_rule",
    "benchmark_status",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def assign_size_bucket_series(revenue: pd.Series, buckets: list[dict]) -> pd.Series:
    """Vectorised size-bucket assignment from contract bucket specs."""
    result = pd.Series([None] * len(revenue), index=revenue.index, dtype=object)
    for bucket in buckets:
        lo = bucket["min"]
        hi = bucket["max"]
        if lo is None:
            mask = revenue.notna() & (revenue < hi)
        elif hi is None:
            mask = revenue.notna() & (revenue >= lo)
        else:
            mask = revenue.notna() & (revenue >= lo) & (revenue < hi)
        result = result.where(~mask, bucket["label"])
    return result


def _make_key(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    """Pipe-separated cohort key from multiple columns."""
    return df[cols].fillna("").astype(str).agg("|".join, axis=1)


# ---------------------------------------------------------------------------
# Cohort assignment
# ---------------------------------------------------------------------------

def assign_cohorts(
    scoring_slice: pd.DataFrame,
    full_panel: pd.DataFrame,
    contract: dict,
) -> pd.DataFrame:
    """
    Assign cohort_level, cohort_key, cohort_size to each row in *scoring_slice*.

    Cohort sizes are computed from the latest-per-EIN view of *full_panel*
    (stable across scoring years).
    """
    min_cohort = contract["min_cohort_size"]

    result = scoring_slice.copy()
    result["cohort_level"] = None
    result["cohort_key"] = None
    result["cohort_size"] = pd.NA

    # Latest per EIN from the full panel for stable cohort-size counting
    latest = (
        full_panel.sort_values(["ein", "fiscal_year"], ascending=[True, False])
        .drop_duplicates(subset=["ein"], keep="first")
    )

    fallback_order = contract["cohort_fallback_order"]
    level_labels = {tuple(v): k for k, v in COHORT_LEVEL_COLS.items()}

    for cols in fallback_order:
        if not all(c in result.columns for c in cols) or not all(
            c in latest.columns for c in cols
        ):
            continue

        unassigned = result["cohort_level"].isna()
        if not unassigned.any():
            break

        scoring_keys = _make_key(result, cols)
        panel_counts = _make_key(latest, cols).value_counts()
        sizes = scoring_keys.map(panel_counts).fillna(0).astype(int)

        can_assign = unassigned & (sizes >= min_cohort)
        level = level_labels.get(tuple(cols), f"L{fallback_order.index(cols)+1}")
        result.loc[can_assign, "cohort_level"] = level
        result.loc[can_assign, "cohort_key"] = scoring_keys[can_assign]
        result.loc[can_assign, "cohort_size"] = sizes[can_assign]

    result["cohort_size"] = pd.to_numeric(result["cohort_size"], errors="coerce").astype(
        "Int64"
    )
    return result


# ---------------------------------------------------------------------------
# Resilient-benchmark construction
# ---------------------------------------------------------------------------

def _empty_benchmark(status: str, fallback_step: Optional[int] = None) -> dict:
    return {
        "benchmark_operating_margin_q75": None,
        "benchmark_operating_runway_q75": None,
        "benchmark_revenue_diversification_q75": None,
        "cohort_iqr_operating_margin": None,
        "cohort_iqr_operating_runway_proxy_months": None,
        "cohort_iqr_revenue_diversification_index": None,
        "reference_org_count": 0,
        "benchmark_fallback_step": fallback_step,
        "benchmark_rule": STEP_LABEL.get(fallback_step) if fallback_step else None,
        "benchmark_status": status,
    }


def build_resilient_benchmark(
    cohort_window: pd.DataFrame,
    scoring_year: int,
    contract: dict,
) -> dict:
    """
    Find resilient peers and return benchmark Q75 values for *scoring_year*.

    Parameters
    ----------
    cohort_window : rows for ONE cohort across the 7-year window
    scoring_year  : the year being scored (Y)
    """
    min_ref = contract["min_reference_orgs"]
    fallback_order = contract["benchmark_fallback_order"]
    window = contract["benchmark_window"]["window_years"]
    year_min = scoring_year - window + 1

    metrics = BENCHMARK_METRICS

    # EINs that have a row in the scoring year (only these can be scored)
    scoring_eins = set(
        cohort_window.loc[cohort_window["fiscal_year"] == scoring_year, "ein"]
    )
    if not scoring_eins:
        return _empty_benchmark("no_scoring_year_data")

    # Restrict window
    w = cohort_window[
        (cohort_window["fiscal_year"] >= year_min)
        & (cohort_window["fiscal_year"] <= scoring_year)
    ].copy()

    if w.empty:
        return _empty_benchmark("no_window_data")

    # Per-year Q75 thresholds across FULL cohort (all EINs in window, not just scored ones)
    q75_per_year = (
        w.groupby("fiscal_year")[metrics]
        .quantile(0.75)
        .rename(columns={m: f"{m}_q75" for m in metrics})
    )

    # Merge thresholds into window data
    w = w.merge(q75_per_year, on="fiscal_year", how="left")

    # Is each row above Q75 for each metric?
    for m in metrics:
        w[f"{m}_above"] = w[m].notna() & (w[m] >= w[f"{m}_q75"])

    above_cols = [f"{m}_above" for m in metrics]
    w["n_metrics_above"] = w[above_cols].sum(axis=1)

    # Only consider EINs appearing in scoring year
    w_scored = w[w["ein"].isin(scoring_eins)].copy()

    # Cohort IQR in scoring year (for gap normalisation, used in scoring.py)
    sy_data = w[w["fiscal_year"] == scoring_year]
    cohort_iqrs: dict[str, Optional[float]] = {}
    for m in metrics:
        vals = sy_data[m].dropna()
        if len(vals) >= 4:
            iqr = float(vals.quantile(0.75) - vals.quantile(0.25))
            cohort_iqrs[f"cohort_iqr_{m}"] = max(iqr, 1e-6)
        else:
            cohort_iqrs[f"cohort_iqr_{m}"] = None

    # Try each benchmark fallback rule
    for step_idx, rule in enumerate(fallback_order):
        min_metrics = rule["min_metrics"]
        min_years_req = rule["min_years"]

        qualifies = (w_scored["n_metrics_above"] >= min_metrics).rename("q")
        year_counts = w_scored.assign(q=qualifies).groupby("ein")["q"].sum()
        resilient_eins = year_counts[year_counts >= min_years_req].index.tolist()

        if len(resilient_eins) >= min_ref:
            res_sy = cohort_window[
                cohort_window["ein"].isin(resilient_eins)
                & (cohort_window["fiscal_year"] == scoring_year)
            ]
            bm: dict = {}
            for m in metrics:
                vals = res_sy[m].dropna()
                bm[_BENCHMARK_KEY[m]] = float(vals.quantile(0.75)) if len(vals) > 0 else None

            step = step_idx + 1
            bm["reference_org_count"] = len(resilient_eins)
            bm["benchmark_fallback_step"] = step
            bm["benchmark_rule"] = STEP_LABEL[step]
            bm["benchmark_status"] = "ok"
            bm.update(cohort_iqrs)
            return bm

    return {**_empty_benchmark("insufficient_resilient_refs", fallback_step=4), **cohort_iqrs}


# ---------------------------------------------------------------------------
# Main per-scoring-year function
# ---------------------------------------------------------------------------

def score_year(
    panel: pd.DataFrame,
    scoring_year: int,
    contract: dict,
) -> pd.DataFrame:
    """
    Score all EINs that have a row in *scoring_year*.

    Parameters
    ----------
    panel        : full deduped CA+WA panel with metrics and size_bucket columns
    scoring_year : fiscal year to score (2023 or 2024)
    contract     : parsed checkpoint1_contract.json

    Returns
    -------
    DataFrame with one row per EIN in *scoring_year*, all cohort + benchmark
    columns filled.
    """
    scoring_slice = panel[panel["fiscal_year"] == scoring_year].copy()
    if scoring_slice.empty:
        return scoring_slice

    # Assign cohorts (uses full panel for stable cohort-size counting)
    scored = assign_cohorts(scoring_slice, panel, contract)

    # Build window panel (7 years ending at scoring_year)
    window_years = contract["benchmark_window"]["window_years"]
    year_min = scoring_year - window_years + 1
    panel_window = panel[
        (panel["fiscal_year"] >= year_min) & (panel["fiscal_year"] <= scoring_year)
    ].copy()

    # Compute years_in_window and pct_missing_key_fields per EIN (for confidence tiers)
    key_fields = contract["key_fields"]
    yiw = (
        panel_window.groupby("ein")["fiscal_year"]
        .nunique()
        .reset_index(name="years_in_window")
    )
    pmk = (
        panel_window.groupby("ein")[key_fields]
        .apply(lambda df: float(df.isna().values.mean()))
        .reset_index(name="pct_missing_key_fields")
    )
    scored = scored.merge(yiw, on="ein", how="left")
    scored = scored.merge(pmk, on="ein", how="left")

    # Build benchmark cache keyed by (cohort_level, cohort_key)
    unique_cohorts = (
        scored[scored["cohort_key"].notna()][["cohort_level", "cohort_key"]]
        .drop_duplicates()
    )

    bm_records: list[dict] = []
    for _, crow in unique_cohorts.iterrows():
        level: str = crow["cohort_level"]
        key: str = crow["cohort_key"]

        level_cols = COHORT_LEVEL_COLS.get(level, ["size_bucket", "state"])
        key_parts = key.split("|")
        key_vals = dict(zip(level_cols, key_parts))

        # Filter panel_window to this cohort
        mask = pd.Series(True, index=panel_window.index)
        for col, val in key_vals.items():
            if col in panel_window.columns:
                mask &= panel_window[col].fillna("").astype(str).eq(val)

        cohort_window = panel_window[mask]
        bm = build_resilient_benchmark(cohort_window, scoring_year, contract)
        bm["cohort_level"] = level
        bm["cohort_key"] = key
        bm_records.append(bm)

    if bm_records:
        bm_df = pd.DataFrame(bm_records)
        scored = scored.merge(bm_df, on=["cohort_level", "cohort_key"], how="left")
    else:
        for col in _ALL_BM_COLS:
            scored[col] = None

    # Fill no-cohort rows
    no_cohort = scored["cohort_key"].isna()
    scored.loc[no_cohort, "benchmark_status"] = "no_cohort"
    scored.loc[no_cohort, "reference_org_count"] = 0
    scored.loc[no_cohort, "benchmark_fallback_step"] = pd.NA

    return scored
