"""
Stage 2 — Stress test enrichment.
Two largest-source shock scenarios (25% and 50%) per the ratified contract.
Vectorized where possible for performance on 67K+ rows.
"""

import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)

# Fixed tie-break order per contract
REVENUE_SOURCES = [
    ("contributions", "contributions_grants"),
    ("program_revenue", "program_service_revenue"),
    ("investment_income", "investment_income"),
    ("other_revenue", "other_revenue"),
]

SCENARIOS = [("25pct", 0.25), ("50pct", 0.50)]


def enrich_stress_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Add stress test fields to the enriched dataframe. Vectorized."""
    out = df.copy()

    # --- Largest revenue source (deterministic tie-break) ---
    # Per merge decision: null-fill source columns with 0 (soft gate),
    # consistent with Stage 1's HHI null-fill precedent.
    source_amounts = pd.DataFrame(index=out.index)
    for source_name, col_name in REVENUE_SOURCES:
        source_amounts[source_name] = pd.to_numeric(out.get(col_name), errors="coerce").fillna(0)

    total_rev = pd.to_numeric(out["total_revenue"], errors="coerce")
    total_exp = pd.to_numeric(out["total_expenses"], errors="coerce")
    net_assets = pd.to_numeric(out["net_assets_eoy"], errors="coerce")
    cash = pd.to_numeric(out.get("cash_non_interest_bearing", pd.Series(dtype="float64")), errors="coerce")
    savings = pd.to_numeric(out.get("savings_temporary_investments", pd.Series(dtype="float64")), errors="coerce")
    liquid_reserves = cash + savings

    # Find largest source with tie-break: highest amount wins,
    # ties broken by position order (contributions first)
    # Add tiny epsilon offsets to break ties deterministically
    tie_break_amounts = source_amounts.copy()
    for i, (source_name, _) in enumerate(REVENUE_SOURCES):
        # Subtract tiny epsilon × position so earlier source wins ties
        tie_break_amounts[source_name] = tie_break_amounts[source_name] - i * 1e-12

    largest_idx = tie_break_amounts.idxmax(axis=1)  # column name of largest
    # .lookup() deprecated; use numpy advanced indexing
    col_positions = pd.Series(
        {name: i for i, name in enumerate(source_amounts.columns)}
    )
    col_indices = largest_idx.map(col_positions).values.astype(int)
    largest_amount = source_amounts.values[np.arange(len(source_amounts)), col_indices]
    largest_pct = largest_amount / total_rev.where(total_rev > 0)

    # Computability mask: hard gate on core fields only
    # Source columns null-filled with 0 (per merge decision, Stage 1 HHI precedent).
    # Cash/savings null-filled with 0 (null = org reports no liquid reserves).
    can_compute = (
        total_rev.notna() & (total_rev > 0)
        & total_exp.notna()
        & net_assets.notna()
        & cash.notna()
        & savings.notna()
    )

    out["largest_revenue_source"] = np.where(can_compute, largest_idx, None)
    out["largest_revenue_source_pct"] = np.where(can_compute, largest_pct, np.nan)

    # --- Government dependency (metadata) ---
    if "government_grants" in out.columns:
        gov = pd.to_numeric(out["government_grants"], errors="coerce")
        out["gov_dependency_pct"] = np.where(
            gov.notna() & total_rev.notna() & (total_rev > 0),
            gov / total_rev,
            np.nan,
        )
    else:
        out["gov_dependency_pct"] = np.nan

    # --- Shock scenarios ---
    largest_source_amount = np.where(can_compute, largest_pct * total_rev, np.nan)

    for suffix, magnitude in SCENARIOS:
        post_shock = total_rev - (largest_source_amount * magnitude)

        # Burn months: only when post_shock < total_expenses
        deficit = total_exp - post_shock
        monthly_deficit = deficit / 12.0
        burn_raw = np.where(
            monthly_deficit > 0,
            liquid_reserves / monthly_deficit,
            np.nan,
        )
        # Replace inf/-inf with null per contract
        burn_raw = np.where(np.isinf(burn_raw), np.nan, burn_raw)

        # Severity
        severity = pd.Series("none", index=out.index, dtype="object")
        # Order matters: start broad, override with more specific
        severity = np.where(can_compute & (post_shock >= total_exp), "none", severity)
        severity = np.where(can_compute & (post_shock < total_exp) & (np.isnan(burn_raw) | (burn_raw > 24)), "mild", severity)
        severity = np.where(can_compute & (post_shock < total_exp) & ~np.isnan(burn_raw) & (burn_raw > 6) & (burn_raw <= 24), "moderate", severity)
        severity = np.where(can_compute & (post_shock < total_exp) & ~np.isnan(burn_raw) & (burn_raw >= 1) & (burn_raw <= 6), "severe", severity)
        severity = np.where(can_compute & (post_shock < total_exp) & ~np.isnan(burn_raw) & (burn_raw < 1), "critical", severity)
        severity = np.where(can_compute & (post_shock < 0), "critical", severity)
        severity = np.where(can_compute & (net_assets < 0), "critical", severity)
        severity = np.where(~can_compute, None, severity)

        # Null burn_months when post_shock >= total_expenses
        burn_final = np.where(can_compute & (post_shock < total_exp), burn_raw, np.nan)

        out[f"stress_{suffix}_post_shock_revenue"] = np.where(can_compute, post_shock, np.nan)
        out[f"stress_{suffix}_burn_months"] = burn_final
        out[f"stress_{suffix}_severity"] = severity

    # --- Status ---
    out["stress_test_status"] = np.where(can_compute, "computed", "not_applicable")

    computed_count = can_compute.sum()
    logger.info(
        f"Stress test: {computed_count:,} computed, "
        f"{len(out) - computed_count:,} not_applicable"
    )

    return out
