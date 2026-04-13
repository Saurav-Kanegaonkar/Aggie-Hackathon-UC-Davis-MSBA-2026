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


def _is_present(value: object) -> bool:
    return not pd.isna(value)


def _largest_revenue_source(row: pd.Series) -> tuple[str | None, float | None]:
    candidates: list[tuple[str, float]] = []
    for source_name, column in LARGEST_SOURCE_COLUMNS:
        value = row.get(column)
        if pd.isna(value):
            return None, None
        candidates.append((source_name, float(value)))

    if not candidates:
        return None, None

    winner_name, winner_value = max(candidates, key=lambda item: (item[1], -_source_tie_break_rank(item[0])))
    total_revenue = row.get("total_revenue")
    if pd.isna(total_revenue) or float(total_revenue) <= 0:
        return None, None
    return winner_name, winner_value / float(total_revenue)


def _source_tie_break_rank(source_name: str) -> int:
    for index, (name, _) in enumerate(LARGEST_SOURCE_COLUMNS):
        if name == source_name:
            return index
    return len(LARGEST_SOURCE_COLUMNS)


def _severity_for_shock(row: pd.Series, post_shock_revenue: float, burn_months: float | None) -> str:
    if post_shock_revenue < 0 or float(row["net_assets_eoy"]) < 0:
        return "critical"
    if post_shock_revenue >= float(row["total_expenses"]):
        return "none"
    if burn_months is None:
        return "critical"
    if burn_months < 1:
        return "critical"
    if burn_months <= 6:
        return "severe"
    if burn_months <= 24:
        return "moderate"
    return "mild"


def _compute_stress_scenario(row: pd.Series, shock_magnitude: float) -> tuple[float | None, float | None, str | None]:
    total_revenue = float(row["total_revenue"])
    total_expenses = float(row["total_expenses"])
    largest_source_amount = float(row["_largest_source_amount"])
    post_shock_revenue = total_revenue - (largest_source_amount * shock_magnitude)

    if post_shock_revenue >= total_expenses:
        return post_shock_revenue, None, "none"

    liquid_reserves = float(row["cash_non_interest_bearing"]) + float(row["savings_temporary_investments"])
    monthly_burn = (total_expenses - post_shock_revenue) / 12.0
    if monthly_burn <= 0:
        burn_months = None
    else:
        burn_months = liquid_reserves / monthly_burn
        if pd.isna(burn_months) or burn_months == float("inf") or burn_months == float("-inf"):
            burn_months = None

    severity = _severity_for_shock(row, post_shock_revenue, burn_months)
    return post_shock_revenue, burn_months, severity


def _empty_stress_values(gov_dependency_pct: float | None) -> dict[str, object]:
    values: dict[str, object] = {
        "largest_revenue_source": None,
        "largest_revenue_source_pct": None,
        "gov_dependency_pct": gov_dependency_pct,
        "stress_25pct_post_shock_revenue": None,
        "stress_25pct_burn_months": None,
        "stress_25pct_severity": None,
        "stress_50pct_post_shock_revenue": None,
        "stress_50pct_burn_months": None,
        "stress_50pct_severity": None,
        "stress_test_status": "not_applicable",
    }
    return values


def _can_compute(row: pd.Series) -> bool:
    if row.get("benchmark_status") == "not_scoreable":
        return False
    total_revenue = row.get("total_revenue")
    if pd.isna(total_revenue) or float(total_revenue) <= 0:
        return False
    return all(_is_present(row.get(column)) for column in REQUIRED_COLUMNS[1:])


def _gov_dependency_pct(row: pd.Series) -> float | None:
    government_grants = row.get("government_grants")
    total_revenue = row.get("total_revenue")
    if pd.isna(government_grants) or pd.isna(total_revenue) or float(total_revenue) <= 0:
        return None
    return float(government_grants) / float(total_revenue)


def enrich_stress_fields(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for index, row in out.iterrows():
        gov_dependency_pct = _gov_dependency_pct(row)
        if not _can_compute(row):
            values = _empty_stress_values(gov_dependency_pct)
        else:
            source_name, source_pct = _largest_revenue_source(row)
            if source_name is None or source_pct is None:
                values = _empty_stress_values(gov_dependency_pct)
            else:
                row = row.copy()
                row["_largest_source_amount"] = source_pct * float(row["total_revenue"])
                values = {
                    "largest_revenue_source": source_name,
                    "largest_revenue_source_pct": source_pct,
                    "gov_dependency_pct": gov_dependency_pct,
                }
                for suffix, shock_magnitude in STRESS_SCENARIOS:
                    post_shock_revenue, burn_months, severity = _compute_stress_scenario(row, shock_magnitude)
                    values[f"stress_{suffix}_post_shock_revenue"] = post_shock_revenue
                    values[f"stress_{suffix}_burn_months"] = burn_months
                    values[f"stress_{suffix}_severity"] = severity
                values["stress_test_status"] = "computed"

        for column, value in values.items():
            out.at[index, column] = value
    return out
