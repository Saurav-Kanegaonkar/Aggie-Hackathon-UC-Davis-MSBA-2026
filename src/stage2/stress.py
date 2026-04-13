"""
Stage 2 stress-test module.

Computes 10 fields per row:
  largest_revenue_source, largest_revenue_source_pct,
  gov_dependency_pct,
  stress_25pct_post_shock_revenue, stress_25pct_burn_months, stress_25pct_severity,
  stress_50pct_post_shock_revenue, stress_50pct_burn_months, stress_50pct_severity,
  stress_test_status
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Largest-revenue-source candidates in fixed tie-break order
SOURCE_COLS = [
    ("contributions", "contributions_grants"),
    ("program_revenue", "program_service_revenue"),
    ("investment_income", "investment_income"),
    ("other_revenue", "other_revenue"),
]

SEVERITY_THRESHOLDS = [
    # (label, burn_months_lower_bound, burn_months_upper_bound_exclusive)
    # Applied in order; first match wins
    ("critical", None, 1.0),   # burn_months < 1 (or net_assets < 0, or post_shock < 0)
    ("severe", 1.0, 6.0),      # 1 <= burn_months <= 6
    ("moderate", 6.0, 24.0),   # 6 < burn_months <= 24
    ("low", 24.0, None),       # burn_months > 24
]


def _largest_source(row: pd.Series):
    """
    Returns (source_label, source_amount, source_pct) for the largest revenue bucket.
    Uses fixed tie-break: contributions > program_revenue > investment_income > other_revenue.
    Returns (None, NaN, NaN) when total_revenue is null/non-positive.
    """
    rev = row.get("total_revenue")
    if pd.isna(rev) or rev <= 0:
        return None, np.nan, np.nan

    best_label = None
    best_amount = -np.inf

    for label, col in SOURCE_COLS:
        val = row.get(col)
        if pd.isna(val):
            val = 0.0
        if val > best_amount:
            best_amount = val
            best_label = label

    if best_label is None or best_amount < 0:
        return None, np.nan, np.nan

    pct = best_amount / rev
    return best_label, best_amount, pct


def _severity(burn_months, net_assets_eoy, post_shock_revenue) -> str:
    """Map computed burn_months to a severity label."""
    if post_shock_revenue is not None and not pd.isna(post_shock_revenue) and post_shock_revenue < 0:
        return "critical"
    if net_assets_eoy is not None and not pd.isna(net_assets_eoy) and net_assets_eoy < 0:
        return "critical"
    if pd.isna(burn_months):
        return "none"
    if burn_months < 1.0:
        return "critical"
    if burn_months <= 6.0:
        return "severe"
    if burn_months <= 24.0:
        return "moderate"
    return "low"


def _compute_shock(total_revenue, largest_source_amount, liquid_reserves, total_expenses,
                   net_assets_eoy, shock_fraction: float):
    """
    Compute (post_shock_revenue, burn_months) for a given shock fraction.
    Returns (NaN, NaN) if inputs are insufficient.
    """
    if any(pd.isna(v) for v in [total_revenue, largest_source_amount, liquid_reserves, total_expenses]):
        return np.nan, np.nan

    post_shock = total_revenue - largest_source_amount * shock_fraction
    post_shock = float(post_shock)

    if total_expenses <= 0:
        return post_shock, np.nan

    if post_shock >= total_expenses:
        return post_shock, np.nan  # burn_months = null, severity = "none"

    deficit_per_month = (total_expenses - post_shock) / 12.0
    if deficit_per_month <= 0:
        return post_shock, np.nan

    burn = liquid_reserves / deficit_per_month
    return post_shock, float(burn)


def compute_stress(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add all 10 stress-test fields to df in place (returns a copy).
    """
    out = df.copy()

    # Pre-convert columns to numeric for vectorized ops
    rev = pd.to_numeric(out["total_revenue"], errors="coerce")
    exp = pd.to_numeric(out["total_expenses"], errors="coerce")
    liquid = (
        pd.to_numeric(out.get("cash_non_interest_bearing", pd.Series(dtype=float)), errors="coerce").fillna(0.0)
        + pd.to_numeric(out.get("savings_temporary_investments", pd.Series(dtype=float)), errors="coerce").fillna(0.0)
    )
    net_assets = pd.to_numeric(out.get("net_assets_eoy", pd.Series(dtype=float)), errors="coerce")
    gov_grants = pd.to_numeric(out.get("government_grants", pd.Series(dtype=float)), errors="coerce")

    # Source amount columns
    contributions = pd.to_numeric(out.get("contributions_grants", pd.Series(dtype=float)), errors="coerce").fillna(0.0)
    program_rev = pd.to_numeric(out.get("program_service_revenue", pd.Series(dtype=float)), errors="coerce").fillna(0.0)
    invest_inc = pd.to_numeric(out.get("investment_income", pd.Series(dtype=float)), errors="coerce").fillna(0.0)
    other_rev = pd.to_numeric(out.get("other_revenue", pd.Series(dtype=float)), errors="coerce").fillna(0.0)

    # Largest revenue source (vectorized via argmax with tie-break)
    sources_df = pd.DataFrame({
        "contributions": contributions,
        "program_revenue": program_rev,
        "investment_income": invest_inc,
        "other_revenue": other_rev,
    })
    # argmax returns first column index in case of tie (matches tie-break order since columns are ordered)
    largest_label = sources_df.idxmax(axis=1)
    largest_amount = sources_df.max(axis=1)

    # Mask rows with invalid total_revenue
    valid_rev = rev.notna() & (rev > 0)
    largest_label = largest_label.where(valid_rev, other=None)
    largest_amount = largest_amount.where(valid_rev, other=np.nan)
    largest_pct = (largest_amount / rev).where(valid_rev, other=np.nan)

    # stress_test_status: requires total_revenue, total_expenses, contributions/program/invest/other
    raw_ok = valid_rev & exp.notna()
    out["stress_test_status"] = raw_ok.map({True: "computed", False: "not_applicable"})

    out["largest_revenue_source"] = largest_label
    out["largest_revenue_source_pct"] = largest_pct

    # gov_dependency_pct
    gov_pct = (gov_grants / rev).where(valid_rev & gov_grants.notna(), other=np.nan)
    out["gov_dependency_pct"] = gov_pct

    # Shock computations — vectorized where possible
    largest_source_amount = largest_amount

    def _shock_series(shock_fraction: float):
        post_shock = rev - largest_source_amount * shock_fraction
        # Only valid where raw_ok
        post_shock = post_shock.where(raw_ok, other=np.nan)

        # burn_months: only when deficit exists
        deficit_monthly = (exp - post_shock) / 12.0
        has_deficit = post_shock < exp
        burn = (liquid / deficit_monthly).where(raw_ok & has_deficit & (deficit_monthly > 0), other=np.nan)

        return post_shock, burn

    post_shock_25, burn_25 = _shock_series(0.25)
    post_shock_50, burn_50 = _shock_series(0.50)

    out["stress_25pct_post_shock_revenue"] = post_shock_25
    out["stress_25pct_burn_months"] = burn_25
    out["stress_50pct_post_shock_revenue"] = post_shock_50
    out["stress_50pct_burn_months"] = burn_50

    # Severity (row-wise — needs net_assets and post_shock context)
    def _row_severity(burn, post_shock, net_a):
        if pd.isna(burn) and (pd.isna(post_shock) or not raw_ok.iloc[0]):
            return "none"  # not_applicable rows
        if not pd.isna(post_shock) and post_shock < 0:
            return "critical"
        if not pd.isna(net_a) and net_a < 0:
            return "critical"
        if pd.isna(burn):
            return "none"
        if burn < 1.0:
            return "critical"
        if burn <= 6.0:
            return "severe"
        if burn <= 24.0:
            return "moderate"
        return "low"

    severities_25 = []
    severities_50 = []
    for i in range(len(out)):
        status = out["stress_test_status"].iat[i]
        if status == "not_applicable":
            severities_25.append("none")
            severities_50.append("none")
            continue

        b25 = burn_25.iat[i]
        b50 = burn_50.iat[i]
        ps25 = post_shock_25.iat[i]
        ps50 = post_shock_50.iat[i]
        na = net_assets.iat[i] if i < len(net_assets) else np.nan

        # If no deficit, severity = none
        ps25_val = ps25 if not pd.isna(ps25) else np.nan
        ps50_val = ps50 if not pd.isna(ps50) else np.nan
        exp_val = exp.iat[i]

        if not pd.isna(ps25_val) and not pd.isna(exp_val) and ps25_val >= exp_val:
            sev25 = "none"
        else:
            sev25 = _row_severity(b25, ps25_val, na)

        if not pd.isna(ps50_val) and not pd.isna(exp_val) and ps50_val >= exp_val:
            sev50 = "none"
        else:
            sev50 = _row_severity(b50, ps50_val, na)

        severities_25.append(sev25)
        severities_50.append(sev50)

    out["stress_25pct_severity"] = severities_25
    out["stress_50pct_severity"] = severities_50

    return out
