"""
Stage 1 – cohort assignment and resilient-benchmark construction.

Cohort fallback hierarchy (from contract):
  L1: ntee_major_category + size_bucket + state         (tightest)
  L2: size_bucket + state + return_type
  L3: size_bucket + state                               (broadest)

Cohort key format (contract-pinned):
  Pipe-delimited key=value pairs, e.g.:
    ntee_major_category=B|size_bucket=500K-2M|state=CA   (L1)
    size_bucket=500K-2M|state=CA|return_type=990          (L2)
    size_bucket=500K-2M|state=CA                          (L3)
  Empty/null ntee_major_category means the org is UNCLASSIFIED —
  it cannot be assigned to an L1 cohort and falls directly to L2.

Benchmark fallback (within assigned cohort, then with cohort broadening):
  Step 1: strict  — org qualifies on 3-of-3 metrics for 5-of-7 years
  Step 2: relaxed — org qualifies on 2-of-3 metrics for 5-of-7 years
  Step 3: cohort broadened — steps 1/2 retried in the next broader cohort level
  (3-of-3 x 4-of-7 removed — dominated by step 2, never fired in any build)

benchmark_status vocabulary:
  ok                          — resolved with >= min_reference_orgs resilient peers
  insufficient_resilient_refs — attempted, failed all steps including broadening
  not_scoreable               — row ineligible (null/zero revenue, missing expenses)
"""
from __future__ import annotations

from typing import Optional

import pandas as pd

from src.features import BENCHMARK_METRICS

# Level label -> list of grouping columns
COHORT_LEVEL_COLS: dict[str, list[str]] = {
    "L1": ["ntee_major_category", "size_bucket", "state"],
    "L2": ["size_bucket", "state", "return_type"],
    "L3": ["size_bucket", "state"],
}

# Next broader level when broadening for benchmark purposes
COHORT_LEVEL_BROADER: dict[str, str] = {
    "L1": "L2",
    "L2": "L3",
}

# benchmark_fallback_step integer -> human-readable label
STEP_LABEL: dict[int, str] = {
    1: "3-of-3_5-of-7",
    2: "2-of-3_5-of-7",
    3: "cohort_broadened",
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
    "cohort_iqr_operating_margin",
    "cohort_iqr_operating_runway_proxy_months",
    "cohort_iqr_revenue_diversification_index",
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


def _make_cohort_key(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    """
    Build canonical cohort key: pipe-delimited key=value pairs.
    Example: ntee_major_category=B|size_bucket=500K-2M|state=CA
    """
    parts = [df[c].fillna("").astype(str).apply(lambda v, c=c: f"{c}={v}") for c in cols]
    return pd.concat(parts, axis=1).agg("|".join, axis=1)


def _parse_cohort_key(key: str) -> dict[str, str]:
    """Parse 'col=val|col=val' back into a dict."""
    return dict(part.split("=", 1) for part in key.split("|"))


def _is_ntee_empty(df: pd.DataFrame) -> pd.Series:
    """True where ntee_major_category is null or empty string."""
    if "ntee_major_category" not in df.columns:
        return pd.Series(True, index=df.index)
    return df["ntee_major_category"].fillna("").astype(str).str.strip().eq("")


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

    Phantom-NTEE fix: rows with empty/null ntee_major_category are ineligible for
    L1 (ntee+size+state) and fall directly to L2 on first attempt.

    Cohort sizes are counted from the latest-per-EIN view of *full_panel* for
    stability across scoring years.
    """
    min_cohort = contract["min_cohort_size"]

    result = scoring_slice.copy()
    result["cohort_level"] = None
    result["cohort_key"] = None
    result["cohort_size"] = pd.NA

    # Latest per EIN from full panel for stable cohort-size counting
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

        # Phantom-NTEE fix: L1 uses ntee_major_category — skip orgs with empty NTEE
        # so they fall through to L2 instead of forming phantom cohorts.
        if "ntee_major_category" in cols:
            ntee_empty = _is_ntee_empty(result)
            unassigned = unassigned & ~ntee_empty

        if not unassigned.any():
            continue

        scoring_keys = _make_cohort_key(result, cols)
        panel_counts = _make_cohort_key(latest, cols).value_counts()
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
    broadened: bool = False,
) -> dict:
    """
    Find resilient peers within *cohort_window* and return benchmark Q75 values.

    Parameters
    ----------
    cohort_window : rows for ONE cohort, years [Y-6 ... Y] (pre-filtered)
    scoring_year  : the fiscal year being scored
    broadened     : True when this call is a cohort-broadening retry (step 3)
    """
    min_ref = contract["min_reference_orgs"]
    fallback_order = contract["benchmark_fallback_order"]  # 2 steps only
    window = contract["benchmark_window"]["window_years"]
    year_min = scoring_year - window + 1

    metrics = BENCHMARK_METRICS

    scoring_eins = set(
        cohort_window.loc[cohort_window["fiscal_year"] == scoring_year, "ein"]
    )
    if not scoring_eins:
        return _empty_benchmark("no_scoring_year_data")

    w = cohort_window[
        (cohort_window["fiscal_year"] >= year_min)
        & (cohort_window["fiscal_year"] <= scoring_year)
    ].copy()

    if w.empty:
        return _empty_benchmark("no_window_data")

    # Per-year Q75 thresholds across full cohort window
    q75_per_year = (
        w.groupby("fiscal_year")[metrics]
        .quantile(0.75)
        .rename(columns={m: f"{m}_q75" for m in metrics})
    )

    w = w.merge(q75_per_year, on="fiscal_year", how="left")
    for m in metrics:
        w[f"{m}_above"] = w[m].notna() & (w[m] >= w[f"{m}_q75"])

    w["n_metrics_above"] = w[[f"{m}_above" for m in metrics]].sum(axis=1)

    # Cohort IQR in scoring year for gap normalisation
    sy_data = w[w["fiscal_year"] == scoring_year]
    cohort_iqrs: dict[str, Optional[float]] = {}
    for m in metrics:
        vals = sy_data[m].dropna()
        if len(vals) >= 4:
            iqr = float(vals.quantile(0.75) - vals.quantile(0.25))
            cohort_iqrs[f"cohort_iqr_{m}"] = max(iqr, 1e-6)
        else:
            cohort_iqrs[f"cohort_iqr_{m}"] = None

    w_scored = w[w["ein"].isin(scoring_eins)].copy()

    for step_idx, rule in enumerate(fallback_order):
        counts = (
            w_scored.assign(q=w_scored["n_metrics_above"] >= rule["min_metrics"])
            .groupby("ein")["q"]
            .sum()
        )
        resilient_eins = counts[counts >= rule["min_years"]].index.tolist()

        if len(resilient_eins) >= min_ref:
            res_sy = cohort_window[
                cohort_window["ein"].isin(resilient_eins)
                & (cohort_window["fiscal_year"] == scoring_year)
            ]
            bm: dict = {}
            for m in metrics:
                vals = res_sy[m].dropna()
                bm[_BENCHMARK_KEY[m]] = float(vals.quantile(0.75)) if len(vals) > 0 else None

            step = 3 if broadened else (step_idx + 1)
            bm["reference_org_count"] = len(resilient_eins)
            bm["benchmark_fallback_step"] = step
            bm["benchmark_rule"] = STEP_LABEL[step]
            bm["benchmark_status"] = "ok"
            bm.update(cohort_iqrs)
            return bm

    return {**_empty_benchmark("insufficient_resilient_refs"), **cohort_iqrs}


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

    Pass 1 — compute benchmark within each org's assigned cohort.
    Pass 2 — for rows still insufficient_resilient_refs, broaden the cohort
              by one level and retry (benchmark_fallback_step = 3 if resolved).

    not_scoreable rows (null/zero revenue, missing expenses/net_assets) are
    included in output with null benchmark fields per contract spec.
    """
    scoring_slice = panel[panel["fiscal_year"] == scoring_year].copy()
    if scoring_slice.empty:
        return scoring_slice

    # Identify not_scoreable EINs (eligibility check)
    not_scoreable_mask = (
        scoring_slice["total_revenue"].isna()
        | scoring_slice["total_revenue"].le(0)
        | scoring_slice["total_expenses"].isna()
        | scoring_slice["net_assets_eoy"].isna()
    )
    not_scoreable_eins = set(scoring_slice.loc[not_scoreable_mask, "ein"])

    # Assign cohorts (uses full panel for stable sizing)
    scored = assign_cohorts(scoring_slice, panel, contract)

    # Window panel for benchmark computation
    window_years = contract["benchmark_window"]["window_years"]
    year_min = scoring_year - window_years + 1
    panel_window = panel[
        (panel["fiscal_year"] >= year_min) & (panel["fiscal_year"] <= scoring_year)
    ].copy()

    # Years-in-window and pct_missing_key_fields per EIN
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

    # ----------------------------------------------------------------
    # Pass 1 — benchmark within each org's assigned cohort
    # ----------------------------------------------------------------
    bm_cache: dict[tuple, dict] = {}
    unique_cohorts = (
        scored[scored["cohort_key"].notna()][["cohort_level", "cohort_key"]]
        .drop_duplicates()
    )

    for _, crow in unique_cohorts.iterrows():
        level: str = str(crow["cohort_level"])
        key: str = str(crow["cohort_key"])
        cache_key = (level, key, scoring_year)
        if cache_key in bm_cache:
            continue

        key_vals = _parse_cohort_key(key)
        mask = pd.Series(True, index=panel_window.index)
        for col, val in key_vals.items():
            if col in panel_window.columns:
                mask &= panel_window[col].fillna("").astype(str).eq(val)

        bm = build_resilient_benchmark(panel_window[mask], scoring_year, contract)
        bm_cache[cache_key] = {**bm, "cohort_level": level, "cohort_key": key}

    # Merge pass-1 benchmarks
    if bm_cache:
        bm_records = [
            {k: v for k, v in b.items()} for b in bm_cache.values()
        ]
        bm_df = pd.DataFrame(bm_records)
        scored = scored.merge(bm_df, on=["cohort_level", "cohort_key"], how="left")
    else:
        for col in _ALL_BM_COLS:
            scored[col] = None

    # ----------------------------------------------------------------
    # Pass 2 — cohort broadening for still-insufficient rows
    # ----------------------------------------------------------------
    insuff_mask = scored["benchmark_status"].eq("insufficient_resilient_refs")

    if insuff_mask.any():
        for level, broader_level in COHORT_LEVEL_BROADER.items():
            targets = scored[insuff_mask & scored["cohort_level"].eq(level)]
            if targets.empty:
                continue

            broader_cols = COHORT_LEVEL_COLS[broader_level]
            broader_keys = _make_cohort_key(targets, broader_cols)

            for bkey in broader_keys.unique():
                cache_key = (broader_level, bkey, scoring_year)
                if cache_key not in bm_cache:
                    key_vals = _parse_cohort_key(bkey)
                    mask = pd.Series(True, index=panel_window.index)
                    for col, val in key_vals.items():
                        if col in panel_window.columns:
                            mask &= panel_window[col].fillna("").astype(str).eq(val)
                    bm = build_resilient_benchmark(
                        panel_window[mask], scoring_year, contract, broadened=True
                    )
                    bm_cache[cache_key] = {**bm, "cohort_level": broader_level, "cohort_key": bkey}

            # Assign broader benchmark onto the target rows.
            # Always mark step=3 (cohort_broadened) regardless of which
            # persistence rule fired inside the broader cohort.
            for idx in targets.index:
                bkey = broader_keys[idx]
                cache_key = (broader_level, bkey, scoring_year)
                bm = bm_cache.get(cache_key, {})
                if bm.get("benchmark_status") == "ok":
                    for col in _ALL_BM_COLS:
                        if col in bm:
                            scored.at[idx, col] = bm[col]
                    scored.at[idx, "benchmark_fallback_step"] = 3
                    scored.at[idx, "benchmark_rule"] = STEP_LABEL[3]

    # ----------------------------------------------------------------
    # Mark not_scoreable rows (override any cohort benchmark we may have set)
    # ----------------------------------------------------------------
    ns_mask = scored["ein"].isin(not_scoreable_eins)
    scored.loc[ns_mask, "benchmark_status"] = "not_scoreable"
    scored.loc[ns_mask, "reference_org_count"] = 0
    scored.loc[ns_mask, "benchmark_fallback_step"] = pd.NA
    for col in _BENCHMARK_COLS + [
        "cohort_iqr_operating_margin",
        "cohort_iqr_operating_runway_proxy_months",
        "cohort_iqr_revenue_diversification_index",
    ]:
        if col in scored.columns:
            scored.loc[ns_mask, col] = None

    # Fill remaining null benchmark_status (no-cohort rows)
    no_cohort = scored["cohort_key"].isna() & ~ns_mask
    scored.loc[no_cohort, "benchmark_status"] = "insufficient_resilient_refs"
    scored.loc[no_cohort, "reference_org_count"] = 0
    scored.loc[no_cohort, "benchmark_fallback_step"] = pd.NA

    scored["benchmark_status"] = scored["benchmark_status"].fillna(
        "insufficient_resilient_refs"
    )

    return scored
