"""
Hydration layer for Stage 2.

Loads the full national panel (no CA+WA filter — needed for analog pool),
dedupes per (ein, fiscal_year) keeping latest tax_period_end, and left-joins
Stage 1 scored rows with the raw financial inputs Stage 2 needs.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

PANEL_PATH = Path("clean_data/panel_990_extended_v4.parquet")

# Raw fields needed from the panel for Stage 2 computations
HYDRATION_COLS = [
    "ein",
    "fiscal_year",
    "tax_period_end",
    "state",
    "ntee_major_category",
    "total_revenue",
    "total_expenses",
    "contributions_grants",
    "program_service_revenue",
    "investment_income",
    "other_revenue",
    "cash_non_interest_bearing",
    "savings_temporary_investments",
    "net_assets_eoy",
    "government_grants",
    "org_name",
]


def load_national_panel(path: str | Path = PANEL_PATH) -> pd.DataFrame:
    """
    Load and dedupe the full national panel.

    Deduplication rule: (ein, fiscal_year) — keep the row with the latest
    tax_period_end, matching the Stage 1 scoring-layer dedupe rule.

    No state filter: all states retained so the national analog pool is available.
    """
    path = Path(path)
    df = pd.read_parquet(path, columns=HYDRATION_COLS)

    df["ein"] = df["ein"].astype(str).str.strip()
    df["fiscal_year"] = pd.to_numeric(df["fiscal_year"], errors="coerce").astype("Int64")
    df["tax_period_end"] = df["tax_period_end"].astype(str)
    df["ntee_major_category"] = (
        df["ntee_major_category"].fillna("").astype(str).str.strip()
    )

    for col in [
        "total_revenue",
        "total_expenses",
        "contributions_grants",
        "program_service_revenue",
        "investment_income",
        "other_revenue",
        "cash_non_interest_bearing",
        "savings_temporary_investments",
        "net_assets_eoy",
        "government_grants",
    ]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Dedupe: keep latest tax_period_end per (ein, fiscal_year)
    df = df.sort_values(
        ["ein", "fiscal_year", "tax_period_end"],
        ascending=[True, True, False],
        kind="mergesort",
    ).drop_duplicates(subset=["ein", "fiscal_year"], keep="first")

    return df.reset_index(drop=True)


def hydrate_stage2(stage1: pd.DataFrame, panel: pd.DataFrame) -> pd.DataFrame:
    """
    Left-join Stage 1 rows with raw panel inputs.

    Preserves exact Stage 1 row universe (no row added or dropped).
    Columns already present in Stage 1 are NOT overwritten.
    """
    stage1_ein = stage1["ein"].astype(str)
    stage1_fy = pd.to_numeric(stage1["fiscal_year"], errors="coerce").astype("Int64")

    left = stage1.copy()
    left["_ein_key"] = stage1_ein
    left["_fy_key"] = stage1_fy

    right = panel.copy()
    right["_ein_key"] = right["ein"].astype(str)
    right["_fy_key"] = right["fiscal_year"]

    # Only bring over columns not already in stage1
    new_cols = [c for c in HYDRATION_COLS if c not in left.columns and c not in ("ein", "fiscal_year")]
    right_slim = right[["_ein_key", "_fy_key"] + new_cols].copy()

    merged = left.merge(right_slim, on=["_ein_key", "_fy_key"], how="left")
    merged = merged.drop(columns=["_ein_key", "_fy_key"])

    assert len(merged) == len(stage1), (
        f"Hydration changed row count: {len(stage1)} -> {len(merged)}"
    )
    return merged.reset_index(drop=True)
