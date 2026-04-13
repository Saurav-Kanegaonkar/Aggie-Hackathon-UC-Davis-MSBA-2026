from __future__ import annotations

import pandas as pd


LARGEST_SOURCE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("contributions", "contributions_grants"),
    ("program_revenue", "program_service_revenue"),
    ("investment_income", "investment_income"),
    ("other_revenue", "other_revenue"),
)
REQUIRED_COLUMNS: tuple[str, ...] = (
    "total_revenue",
    "total_expenses",
    "cash_non_interest_bearing",
    "savings_temporary_investments",
    "net_assets_eoy",
    *(column for _, column in LARGEST_SOURCE_COLUMNS),
)
STRESS_SCENARIOS: tuple[tuple[str, float], ...] = (
    ("25pct", 0.25),
    ("50pct", 0.50),
)
SOURCE_LABELS = {column: label for label, column in LARGEST_SOURCE_COLUMNS}


def _numeric_series(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(pd.NA, index=frame.index, dtype="Float64")
    return pd.to_numeric(frame[column], errors="coerce").astype("Float64")


def _severity_for_scenario(
    compute_mask: pd.Series,
    post_shock_revenue: pd.Series,
    total_expenses: pd.Series,
    net_assets: pd.Series,
    burn_months: pd.Series,
) -> pd.Series:
    severity = pd.Series(pd.NA, index=compute_mask.index, dtype="object")
    deficit_mask = compute_mask & (post_shock_revenue < total_expenses)
    none_mask = compute_mask & (post_shock_revenue >= total_expenses)
    critical_mask = compute_mask & (
        (post_shock_revenue < 0)
        | (net_assets < 0)
        | (deficit_mask & burn_months.notna() & (burn_months < 1))
    )

    mild_mask = deficit_mask & burn_months.notna() & (burn_months > 24)
    moderate_mask = deficit_mask & burn_months.notna() & (burn_months > 6) & (burn_months <= 24)
    severe_mask = deficit_mask & burn_months.notna() & (burn_months >= 1) & (burn_months <= 6)

    severity.loc[mild_mask] = "mild"
    severity.loc[moderate_mask] = "moderate"
    severity.loc[severe_mask] = "severe"
    severity.loc[none_mask] = "none"
    severity.loc[critical_mask] = "critical"
    return severity


def enrich_stress_fields(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    total_revenue = _numeric_series(out, "total_revenue")
    total_expenses = _numeric_series(out, "total_expenses")
    cash = _numeric_series(out, "cash_non_interest_bearing")
    savings = _numeric_series(out, "savings_temporary_investments")
    net_assets = _numeric_series(out, "net_assets_eoy")
    liquid_reserves = cash + savings

    if "government_grants" in out.columns:
        government_grants = _numeric_series(out, "government_grants")
        gov_dependency_pct = (government_grants / total_revenue.where(total_revenue > 0)).astype("Float64")
    else:
        gov_dependency_pct = pd.Series(pd.NA, index=out.index, dtype="Float64")
    out["gov_dependency_pct"] = gov_dependency_pct

    source_values = pd.DataFrame(
        {column: _numeric_series(out, column) for _, column in LARGEST_SOURCE_COLUMNS},
        index=out.index,
    )
    complete_source_mask = source_values.notna().all(axis=1)
    winning_column = source_values.idxmax(axis=1)
    winning_amount = source_values.max(axis=1).astype("Float64")
    largest_revenue_source_pct = (winning_amount / total_revenue.where(total_revenue > 0)).astype("Float64")

    base_compute_mask = (
        out.get("benchmark_status") != "not_scoreable"
    ) & (total_revenue > 0)
    for column in ("total_expenses", "cash_non_interest_bearing", "savings_temporary_investments", "net_assets_eoy"):
        base_compute_mask &= _numeric_series(out, column).notna()
    compute_mask = base_compute_mask & complete_source_mask & largest_revenue_source_pct.notna()

    out["largest_revenue_source"] = pd.Series(pd.NA, index=out.index, dtype="object")
    out.loc[compute_mask, "largest_revenue_source"] = winning_column.loc[compute_mask].map(SOURCE_LABELS)
    out["largest_revenue_source_pct"] = pd.Series(pd.NA, index=out.index, dtype="Float64")
    out.loc[compute_mask, "largest_revenue_source_pct"] = largest_revenue_source_pct.loc[compute_mask]
    out["stress_test_status"] = "not_applicable"
    out.loc[compute_mask, "stress_test_status"] = "computed"

    for suffix, shock_magnitude in STRESS_SCENARIOS:
        post_shock_revenue = (total_revenue - (winning_amount * shock_magnitude)).astype("Float64")
        monthly_burn = ((total_expenses - post_shock_revenue) / 12.0).astype("Float64")
        burn_months = pd.Series(pd.NA, index=out.index, dtype="Float64")
        burn_mask = compute_mask & (post_shock_revenue < total_expenses) & (monthly_burn > 0)
        burn_months.loc[burn_mask] = (liquid_reserves.loc[burn_mask] / monthly_burn.loc[burn_mask]).astype("Float64")
        burn_months = burn_months.replace([float("inf"), float("-inf")], pd.NA)

        severity = _severity_for_scenario(
            compute_mask=compute_mask,
            post_shock_revenue=post_shock_revenue,
            total_expenses=total_expenses,
            net_assets=net_assets,
            burn_months=burn_months,
        )

        post_column = f"stress_{suffix}_post_shock_revenue"
        burn_column = f"stress_{suffix}_burn_months"
        severity_column = f"stress_{suffix}_severity"

        out[post_column] = pd.Series(pd.NA, index=out.index, dtype="Float64")
        out.loc[compute_mask, post_column] = post_shock_revenue.loc[compute_mask]
        out[burn_column] = burn_months
        out[severity_column] = severity

    return out
