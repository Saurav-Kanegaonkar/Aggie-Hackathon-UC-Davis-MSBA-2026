"""
Stage 1 – resilience gaps, confidence tiers, and shared-sample flag.

Gap convention (matches schema description "org minus cohort benchmark"):
  positive gap  → org is ABOVE the benchmark  (good / resilient)
  negative gap  → org is BELOW the benchmark  (needs improvement)

resilience_gap = average of the three per-metric normalised gaps.
"""
from __future__ import annotations

import pandas as pd

from src.features import BENCHMARK_METRICS

_METRIC_BM_KEY = {
    "operating_margin": "benchmark_operating_margin_q75",
    "operating_runway_proxy_months": "benchmark_operating_runway_q75",
    "revenue_diversification_index": "benchmark_revenue_diversification_q75",
}
_METRIC_GAP_COL = {
    "operating_margin": "operating_margin_gap",
    "operating_runway_proxy_months": "operating_runway_gap",
    "revenue_diversification_index": "revenue_diversification_gap",
}
_METRIC_IQR_COL = {
    "operating_margin": "cohort_iqr_operating_margin",
    "operating_runway_proxy_months": "cohort_iqr_operating_runway_proxy_months",
    "revenue_diversification_index": "cohort_iqr_revenue_diversification_index",
}


# ---------------------------------------------------------------------------
# Gaps
# ---------------------------------------------------------------------------

def compute_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add per-metric and combined resilience-gap columns to a copy of *df*.

    Per-metric gap = (org_metric - benchmark_q75) / cohort_IQR
    resilience_gap = mean of available per-metric normalised gaps
    """
    out = df.copy()

    gap_cols: list[str] = []
    for m in BENCHMARK_METRICS:
        bm_col = _METRIC_BM_KEY[m]
        iqr_col = _METRIC_IQR_COL[m]
        gap_col = _METRIC_GAP_COL[m]

        org_val = pd.to_numeric(out[m], errors="coerce") if m in out.columns else None
        bm_val = pd.to_numeric(out[bm_col], errors="coerce") if bm_col in out.columns else None
        iqr_val = pd.to_numeric(out[iqr_col], errors="coerce") if iqr_col in out.columns else None

        if org_val is None or bm_val is None:
            out[gap_col] = None
        else:
            raw = org_val - bm_val
            # Normalise by cohort IQR; fall back to 1.0 if IQR is missing/zero
            scale = iqr_val.where(iqr_val.notna() & iqr_val.gt(1e-9), other=1.0)
            out[gap_col] = raw / scale

        gap_cols.append(gap_col)

    # Combined resilience_gap = mean of available per-metric gaps
    available = out[gap_cols].apply(pd.to_numeric, errors="coerce")
    out["resilience_gap"] = available.mean(axis=1, skipna=True).where(
        available.notna().any(axis=1)
    )

    return out


# ---------------------------------------------------------------------------
# Confidence tiers
# ---------------------------------------------------------------------------

def _data_tier(row: "pd.Series") -> tuple[str, str]:
    _years = row.get("years_in_window")
    years = int(_years) if pd.notna(_years) else 0
    _miss = row.get("pct_missing_key_fields")
    miss = 1.0 if (pd.isna(_miss) or _miss is None) else float(_miss)
    status = str(row.get("benchmark_status") or "no_cohort")
    step = row.get("benchmark_fallback_step")
    step = int(step) if pd.notna(step) else None

    low_reasons: list[str] = []

    # not_scoreable short-circuits everything
    if status == "not_scoreable":
        return "Low", "not scoreable: null or non-positive revenue / missing expenses"

    if years <= 3:
        low_reasons.append(f"{years} years in window")
    if miss >= 0.20:
        low_reasons.append(f"{miss:.0%} missing key fields")
    if status in ("insufficient_resilient_refs", "no_scoring_year_data"):
        low_reasons.append(status.replace("_", " "))

    if low_reasons:
        return "Low", "; ".join(low_reasons)

    if years >= 6 and miss < 0.20:
        suffix = ""
        if step and step >= 2:
            suffix = f"; benchmark fallback step {step}"
        return "High", f"{years} years in window{suffix}"

    # Medium: 4-5 years, or relaxed benchmark rule
    reasons: list[str] = []
    if 4 <= years <= 5:
        reasons.append(f"{years} years in window")
    if step and step >= 2:
        reasons.append(f"benchmark fallback step {step}")
    return "Medium", "; ".join(reasons) if reasons else f"{years} years in window"


def _cohort_tier(row: "pd.Series") -> tuple[str, str]:
    level = row.get("cohort_level")
    if pd.isna(level) or level is None:
        return "Low", "no cohort assigned"
    level = str(level)
    if level == "L1":
        return "High", "primary cohort (ntee+size+state)"
    if level == "L2":
        return "Medium", "secondary cohort (size+state+return_type)"
    if level == "L3":
        return "Low", "broadest fallback cohort (size+state)"
    return "Low", f"unknown cohort level {level}"


def _checkpoint_tier(data_t: str, cohort_t: str) -> str:
    if data_t == "High" and cohort_t == "High":
        return "High"
    if data_t == "Low" or cohort_t == "Low":
        return "Low"
    return "Medium"


def compute_confidence_tiers(df: pd.DataFrame) -> pd.DataFrame:
    """Add data_confidence_tier, cohort_confidence_tier, checkpoint1_confidence_tier, confidence_reason."""
    out = df.copy()

    data_tiers, data_reasons = zip(*out.apply(_data_tier, axis=1))
    cohort_tiers, cohort_reasons = zip(*out.apply(_cohort_tier, axis=1))

    out["data_confidence_tier"] = list(data_tiers)
    out["cohort_confidence_tier"] = list(cohort_tiers)
    out["checkpoint1_confidence_tier"] = [
        _checkpoint_tier(d, c) for d, c in zip(data_tiers, cohort_tiers)
    ]

    # confidence_reason combines both explanations when they differ
    reasons: list[str] = []
    for dr, cr, dt, ct in zip(data_reasons, cohort_reasons, data_tiers, cohort_tiers):
        if dt == ct:
            reasons.append(dr)
        elif dr == cr:
            reasons.append(dr)
        else:
            reasons.append(f"data: {dr}; cohort: {cr}")
    out["confidence_reason"] = reasons

    return out


# ---------------------------------------------------------------------------
# Shared-sample flag
# ---------------------------------------------------------------------------

def mark_shared_samples(df: pd.DataFrame, contract: dict) -> pd.DataFrame:
    """Set is_shared_sample = True for EINs in the curated shared-sample set."""
    shared_eins = set(contract["shared_sample_selection"]["eins"])
    out = df.copy()
    out["is_shared_sample"] = out["ein"].isin(shared_eins)
    return out
