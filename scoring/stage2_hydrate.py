from __future__ import annotations

from pathlib import Path

import pandas as pd


STAGE2_DERIVED_COLUMNS = {
    "largest_revenue_source",
    "largest_revenue_source_pct",
    "gov_dependency_pct",
    "stress_25pct_post_shock_revenue",
    "stress_25pct_burn_months",
    "stress_25pct_severity",
    "stress_50pct_post_shock_revenue",
    "stress_50pct_burn_months",
    "stress_50pct_severity",
    "stress_test_status",
    "recovery_analog_eins",
    "recovery_analog_count",
    "recovery_analog_evidence",
    "recovery_analog_constraint",
    "recovery_analog_status",
    "urgency_flag",
    "urgency_severity",
    "urgency_reason",
}

REVENUE_SOURCE_MAP = [
    ("contributions", "contributions_grants"),
    ("program_revenue", "program_service_revenue"),
    ("investment_income", "investment_income"),
    ("other_revenue", "other_revenue"),
]


def _as_frame(value: pd.DataFrame | str | Path) -> pd.DataFrame:
    if isinstance(value, pd.DataFrame):
        return value.copy()
    return pd.read_parquet(Path(value))


def _normalize_stage1_frame(df: pd.DataFrame) -> pd.DataFrame:
    frame = df.copy()
    frame["ein"] = frame["ein"].astype(str)
    frame["fiscal_year"] = pd.to_numeric(frame["fiscal_year"], errors="coerce").astype("Int64")
    if "state" in frame.columns:
        frame["state"] = frame["state"].astype(str).str.upper()
    return frame


def canonicalize_stage2_panel(panel: pd.DataFrame | str | Path) -> pd.DataFrame:
    frame = _as_frame(panel)
    if "ein" not in frame.columns:
        frame["ein"] = pd.Series(dtype="object")
    if "fiscal_year" not in frame.columns:
        frame["fiscal_year"] = pd.Series(dtype="Int64")
    frame["ein"] = frame["ein"].astype(str)
    frame["fiscal_year"] = pd.to_numeric(frame["fiscal_year"], errors="coerce").astype("Int64")
    total_revenue = pd.to_numeric(frame["total_revenue"], errors="coerce") if "total_revenue" in frame.columns else pd.Series(pd.NA, index=frame.index, dtype="Float64")
    derived_size_bucket = pd.Series(pd.NA, index=frame.index, dtype="object")
    positive_revenue = total_revenue > 0
    derived_size_bucket.loc[positive_revenue & (total_revenue < 500_000)] = "<500K"
    derived_size_bucket.loc[positive_revenue & (total_revenue >= 500_000) & (total_revenue < 2_000_000)] = "500K-2M"
    derived_size_bucket.loc[positive_revenue & (total_revenue >= 2_000_000) & (total_revenue < 10_000_000)] = "2M-10M"
    derived_size_bucket.loc[positive_revenue & (total_revenue >= 10_000_000)] = ">10M"
    if "size_bucket" in frame.columns:
        frame["size_bucket"] = frame["size_bucket"].where(frame["size_bucket"].notna(), derived_size_bucket)
    else:
        frame["size_bucket"] = derived_size_bucket
    if "tax_period_end" in frame.columns:
        frame["tax_period_end"] = frame["tax_period_end"].fillna("").astype(str)
    else:
        frame["tax_period_end"] = ""
    if "submitted_on" in frame.columns:
        frame["submitted_on"] = frame["submitted_on"].fillna("").astype(str)
    else:
        frame["submitted_on"] = ""

    frame = frame.sort_values(
        ["ein", "fiscal_year", "tax_period_end", "submitted_on"],
        ascending=[True, True, False, False],
        kind="mergesort",
    )
    frame = frame.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")
    return frame.reset_index(drop=True)


def hydrate_stage2_inputs(
    scored_rows: pd.DataFrame | str | Path,
    panel: pd.DataFrame | str | Path,
    *,
    canonicalized: bool = False,
) -> pd.DataFrame:
    scored = _normalize_stage1_frame(_as_frame(scored_rows))
    panel_frame = _as_frame(panel) if canonicalized else canonicalize_stage2_panel(panel)

    drop_columns = {
        column
        for column in panel_frame.columns
        if column in scored.columns or column in STAGE2_DERIVED_COLUMNS
    }
    panel_frame = panel_frame.drop(columns=[column for column in drop_columns if column not in {"ein", "fiscal_year"}], errors="ignore")

    staged = scored.copy()
    staged["_stage1_order"] = range(len(staged))
    merged = staged.merge(panel_frame, on=["ein", "fiscal_year"], how="left", validate="one_to_one")
    merged = merged.sort_values("_stage1_order", kind="mergesort").drop(columns=["_stage1_order"])

    if "government_grants" in merged.columns:
        total_revenue = pd.to_numeric(merged.get("total_revenue"), errors="coerce")
        government_grants = pd.to_numeric(merged.get("government_grants"), errors="coerce")
        merged["gov_dependency_pct"] = government_grants / total_revenue.where(total_revenue > 0)
    else:
        merged["gov_dependency_pct"] = pd.NA

    return merged.reset_index(drop=True)
