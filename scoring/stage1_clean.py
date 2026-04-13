"""
Deliverable 1 — Cleaned working panel.
Load v4 parquet, apply CA+WA filter, resolve (ein, fiscal_year) duplicates,
clamp/cap outlier fields, compute size_bucket and scoring_eligible.
"""

import pandas as pd
import numpy as np
import json
import logging

logger = logging.getLogger(__name__)

CONTRACT_PATH = "config/checkpoint1_contract.json"
PANEL_PATH = "data/processed/panel_990_extended_v4.parquet"


def load_contract():
    with open(CONTRACT_PATH) as f:
        return json.load(f)


def assign_size_bucket(revenue):
    """Assign size bucket from total_revenue per contract thresholds."""
    if pd.isna(revenue) or revenue <= 0:
        return None
    if revenue < 500_000:
        return "<500K"
    if revenue < 2_000_000:
        return "500K-2M"
    if revenue < 10_000_000:
        return "2M-10M"
    return ">10M"


def clean_panel():
    """Load and clean the panel. Returns the full CA+WA panel with derived columns."""
    contract = load_contract()

    # Step 0: Load
    df = pd.read_parquet(PANEL_PATH)
    logger.info(f"Step 0 — Loaded: {len(df):,} rows, {df['ein'].nunique():,} EINs")

    # Step 1: State filter
    states = contract["states"]
    df = df[df["state"].isin(states)].copy()
    logger.info(f"Step 1 — CA+WA filter: {len(df):,} rows, {df['ein'].nunique():,} EINs")

    # Step 2a: Resolve (ein, fiscal_year) duplicates — keep latest tax_period_end
    pre_dedupe = len(df)
    dupe_count = df.duplicated(subset=["ein", "fiscal_year"], keep=False).sum()
    dupe_pairs = df.groupby(["ein", "fiscal_year"]).size()
    dupe_pair_count = (dupe_pairs > 1).sum()
    logger.info(
        f"Step 2a — Duplicate (ein, fiscal_year) pairs: {dupe_pair_count:,} "
        f"({dupe_count:,} total rows involved)"
    )

    if dupe_pair_count > 0:
        # Sort so latest tax_period_end is first, then drop duplicates
        df = df.sort_values("tax_period_end", ascending=False, na_position="last")
        df = df.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")
        logger.info(
            f"  Resolved: {pre_dedupe:,} → {len(df):,} rows "
            f"(dropped {pre_dedupe - len(df):,})"
        )

    # Step 3: Clamp formation_year
    bad_fy = (
        df["formation_year"].notna()
        & ((df["formation_year"] < 1700) | (df["formation_year"] > 2026))
    )
    logger.info(f"Step 3 — formation_year outside 1700–2026: {bad_fy.sum():,} → null")
    df.loc[bad_fy, "formation_year"] = None

    # Step 4: Cap num_employees at 200,000
    emp_cap = df["num_employees"].notna() & (df["num_employees"] > 200_000)
    logger.info(f"Step 4 — num_employees capped at 200K: {emp_cap.sum():,} rows")
    df.loc[emp_cap, "num_employees"] = 200_000

    # Step 5: Cap num_voting_board_members at 500
    board_cap = df["num_voting_board_members"].notna() & (
        df["num_voting_board_members"] > 500
    )
    logger.info(f"Step 5 — num_voting_board_members capped at 500: {board_cap.sum():,} rows")
    df.loc[board_cap, "num_voting_board_members"] = 500

    # Step 6: Compute size_bucket
    df["size_bucket"] = df["total_revenue"].apply(assign_size_bucket)
    sb_null = df["size_bucket"].isna().sum()
    logger.info(f"Step 6 — size_bucket null (revenue null/non-positive): {sb_null:,}")
    logger.info(f"  Distribution:\n{df['size_bucket'].value_counts().to_string()}")

    # Step 7: Compute scoring_eligible
    df["scoring_eligible"] = (
        df["total_revenue"].notna()
        & (df["total_revenue"] > 0)
        & df["total_expenses"].notna()
        & df["net_assets_eoy"].notna()
        & df["size_bucket"].notna()
    )
    logger.info(
        f"Step 7 — scoring_eligible: "
        f"{df['scoring_eligible'].sum():,} eligible, "
        f"{(~df['scoring_eligible']).sum():,} ineligible"
    )

    # Step 8: Tag scoring years
    scoring_years = contract["benchmark_window"]["scoring_years"]
    df["is_scoring_year"] = df["fiscal_year"].isin(scoring_years)

    scorable = df["scoring_eligible"] & df["is_scoring_year"]
    logger.info(
        f"Step 8 — Scorable rows (eligible + scoring year): {scorable.sum():,}"
    )
    for y in scoring_years:
        n = (scorable & (df["fiscal_year"] == y)).sum()
        logger.info(f"  FY{y}: {n:,}")

    logger.info(f"Final panel: {len(df):,} rows, {df['ein'].nunique():,} EINs")
    return df
