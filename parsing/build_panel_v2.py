#!/usr/bin/env python3
"""Build v2 panel with expanded column set from GT Basic 120 + IRS extension rows.

Usage:
    python parsing/build_panel_v2.py

Reads:
    data/raw/gt_basic120.csv
    data/raw/gt_missions.csv
    data/processed/panel_990_extended.parquet  (for IRS-sourced rows)

Writes:
    data/processed/panel_990_extended_v2.parquet
"""

import sys
import time
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

# ---------------------------------------------------------------------------
# Column config — original + new
# ---------------------------------------------------------------------------

BASIC_USECOLS = [
    # Original 16
    "FILEREIN", "FILERNAME1", "FILERNAME2",
    "FILERUSSTATE", "FILERUSCITY",
    "TAXPEREND", "TAXYEAR", "RETURNTYPE",
    "TOTREVCURYEA", "TOTEXPCURYEA",
    "TOASEOOYY", "TOLIEOOYY", "NAFBEOY",
    "TOTACASHCONT", "GOVERNGRANTS",
    "TOTPROSERREV", "ININTORECOOL",
    # New 14
    "PROGSERVEXPE", "MANAGENEEXPE", "FUNDRAEXPENS",
    "CNIBEOY", "STCIEOY",
    "TOTAEMPLCNTN",
    "UNNEASEOOYY", "TRNAEOY", "PRNAEOY",
    "TOTFUNEXPTOT", "GRAALLPAITOT", "COCUOFDITOOT",
    "NBREVOTIMEMB",
    "FORMATIONORM",
]

# All columns read as string to avoid type inference issues
BASIC_DTYPES = {col: str for col in BASIC_USECOLS}

RENAME = {
    # Original
    "FILEREIN": "ein",
    "FILERUSSTATE": "state",
    "FILERUSCITY": "city",
    "TAXPEREND": "tax_period_end",
    "TAXYEAR": "fiscal_year",
    "RETURNTYPE": "return_type",
    "TOTREVCURYEA": "total_revenue",
    "TOTEXPCURYEA": "total_expenses",
    "TOASEOOYY": "total_assets_eoy",
    "TOLIEOOYY": "total_liabilities_eoy",
    "NAFBEOY": "net_assets_eoy",
    "TOTACASHCONT": "contributions_grants",
    "GOVERNGRANTS": "government_grants",
    "TOTPROSERREV": "program_service_revenue",
    "ININTORECOOL": "investment_income",
    # New
    "PROGSERVEXPE": "program_expenses",
    "MANAGENEEXPE": "management_general_expenses",
    "FUNDRAEXPENS": "fundraising_expenses",
    "CNIBEOY": "cash_non_interest_bearing",
    "STCIEOY": "savings_temporary_investments",
    "TOTAEMPLCNTN": "num_employees",
    "UNNEASEOOYY": "unrestricted_net_assets",
    "TRNAEOY": "temp_restricted_net_assets",
    "PRNAEOY": "perm_restricted_net_assets",
    "TOTFUNEXPTOT": "total_functional_expenses",
    "GRAALLPAITOT": "grants_paid",
    "COCUOFDITOOT": "compensation_top_officer",
    "NBREVOTIMEMB": "num_voting_board_members",
    "FORMATIONORM": "formation_year",
}

FLOAT64_COLS = [
    "total_revenue", "total_expenses",
    "total_assets_eoy", "total_liabilities_eoy", "net_assets_eoy",
    "contributions_grants", "government_grants",
    "program_service_revenue", "investment_income",
    # New monetary
    "program_expenses", "management_general_expenses", "fundraising_expenses",
    "cash_non_interest_bearing", "savings_temporary_investments",
    "unrestricted_net_assets", "temp_restricted_net_assets", "perm_restricted_net_assets",
    "total_functional_expenses", "grants_paid", "compensation_top_officer",
]

INT64_COLS = [
    "num_employees",
    "num_voting_board_members",
    "formation_year",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fix_city_duplication(df):
    def _fix(row):
        city = row["city"]
        state = row["state"]
        if pd.isna(city) or not isinstance(city, str):
            return city
        city = city.strip()
        if len(city) > 3 and city == city[:len(city)//2] * 2:
            return city[:len(city)//2]
        if state and isinstance(state, str) and city.endswith(state * 2):
            return city[:-(len(state))]
        return city
    df["city"] = df.apply(_fix, axis=1)
    return df


def build_org_name(df):
    name1 = df["FILERNAME1"].fillna("")
    name2 = df["FILERNAME2"].fillna("")
    combined = (name1 + " " + name2).str.strip()
    return combined.replace("", pd.NA).astype("string")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()

    # --- Load Basic 120 with expanded columns ---
    print("Loading Basic 120 mart (expanded columns)...", file=sys.stderr)
    basic = pd.read_csv(
        RAW / "gt_basic120.csv",
        usecols=BASIC_USECOLS,
        dtype=BASIC_DTYPES,
        low_memory=False,
    )
    print(f"  Loaded {len(basic):,} rows, {len(basic.columns)} cols", file=sys.stderr)

    # Build org_name
    basic["org_name"] = build_org_name(basic)
    basic.drop(columns=["FILERNAME1", "FILERNAME2"], inplace=True)

    # Rename
    basic.rename(columns=RENAME, inplace=True)

    # Filter to full 990 only
    pre_filter = len(basic)
    basic = basic[basic["return_type"] == "990"].copy()
    print(f"  Filtered to 990: {len(basic):,} (dropped {pre_filter - len(basic):,})", file=sys.stderr)

    # Coerce monetary fields to float64
    for col in FLOAT64_COLS:
        basic[col] = pd.to_numeric(basic[col], errors="coerce").astype("float64")

    # Coerce count fields to nullable Int64
    for col in INT64_COLS:
        basic[col] = pd.to_numeric(basic[col], errors="coerce").astype("Int64")

    # Coerce fiscal_year to nullable Int64
    basic["fiscal_year"] = pd.to_numeric(basic["fiscal_year"], errors="coerce").astype("Int64")

    # Coerce string fields
    for col in ["ein", "state", "city", "tax_period_end", "return_type", "formation_year"]:
        basic[col] = basic[col].astype("string")

    # Drop rows with null EIN or fiscal_year
    pre_drop = len(basic)
    basic.dropna(subset=["ein", "fiscal_year"], inplace=True)
    if pre_drop - len(basic) > 0:
        print(f"  Dropped {pre_drop - len(basic):,} rows with null EIN/fiscal_year", file=sys.stderr)

    # Fix city duplication
    basic = fix_city_duplication(basic)

    # --- Load Missions ---
    print("Loading Missions mart...", file=sys.stderr)
    missions = pd.read_csv(
        RAW / "gt_missions.csv",
        usecols=["FILEREIN", "TAXPEREND", "MISSION"],
        dtype={"FILEREIN": str, "TAXPEREND": str, "MISSION": str},
    )
    missions.rename(columns={"FILEREIN": "ein", "TAXPEREND": "tax_period_end", "MISSION": "mission_desc"}, inplace=True)
    missions["mission_desc"] = (
        missions["mission_desc"]
        .fillna("")
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
        .str[:500]
        .replace("", pd.NA)
        .astype("string")
    )
    missions["ein"] = missions["ein"].astype("string")
    missions["tax_period_end"] = missions["tax_period_end"].astype("string")
    missions.drop_duplicates(subset=["ein", "tax_period_end"], keep="first", inplace=True)
    print(f"  Loaded {len(missions):,} mission descriptions", file=sys.stderr)

    # --- Join missions ---
    print("Joining missions...", file=sys.stderr)
    gt = basic.merge(missions, on=["ein", "tax_period_end"], how="left")

    # --- Derived fields ---
    print("Computing derived fields...", file=sys.stderr)

    gt["other_revenue"] = (
        gt["total_revenue"]
        - gt["contributions_grants"].fillna(0)
        - gt["program_service_revenue"].fillna(0)
        - gt["investment_income"].fillna(0)
    ).astype("float64")
    gt.loc[gt["total_revenue"].isna(), "other_revenue"] = pd.NA

    gt.sort_values(["ein", "fiscal_year"], inplace=True)
    gt["net_assets_boy"] = gt.groupby("ein")["net_assets_eoy"].shift(1).astype("float64")
    gt["years_of_data"] = gt.groupby("ein")["fiscal_year"].transform("count").astype("Int64")

    for col, pct_col in [
        ("contributions_grants", "pct_contributions"),
        ("program_service_revenue", "pct_program_revenue"),
        ("investment_income", "pct_investment_income"),
        ("other_revenue", "pct_other_revenue"),
    ]:
        gt[pct_col] = (gt[col] / gt["total_revenue"]).where(gt["total_revenue"] != 0).astype("float64")

    # submitted_on is null for all GT rows
    gt["submitted_on"] = pd.array([pd.NA] * len(gt), dtype="string")

    print(f"  GT panel built: {len(gt):,} rows, {len(gt.columns)} cols", file=sys.stderr)

    # --- Merge with IRS-sourced rows ---
    print("Merging with IRS-sourced rows...", file=sys.stderr)
    v1 = pd.read_parquet(PROCESSED / "panel_990_extended.parquet")

    # IRS-sourced rows = those with submitted_on populated
    irs_rows = v1[v1["submitted_on"].notna()].copy()
    print(f"  IRS-sourced rows: {len(irs_rows):,}", file=sys.stderr)

    # Add new columns as null to IRS rows
    new_cols = [
        "program_expenses", "management_general_expenses", "fundraising_expenses",
        "cash_non_interest_bearing", "savings_temporary_investments",
        "num_employees",
        "unrestricted_net_assets", "temp_restricted_net_assets", "perm_restricted_net_assets",
        "total_functional_expenses", "grants_paid", "compensation_top_officer",
        "num_voting_board_members", "formation_year",
    ]
    for col in new_cols:
        irs_rows[col] = pd.NA

    # Dedupe: for overlapping (ein, tax_period_end), prefer IRS version
    gt_keys = set(zip(gt["ein"], gt["tax_period_end"]))
    irs_keys = set(zip(irs_rows["ein"], irs_rows["tax_period_end"]))
    overlap = gt_keys & irs_keys

    gt_only = gt[gt.apply(lambda r: (r["ein"], r["tax_period_end"]) not in irs_keys, axis=1)]
    print(f"  GT-only rows: {len(gt_only):,}", file=sys.stderr)
    print(f"  Overlap (IRS preferred): {len(overlap):,}", file=sys.stderr)

    # Align columns
    all_cols = list(gt.columns)
    for col in all_cols:
        if col not in irs_rows.columns:
            irs_rows[col] = pd.NA
    irs_rows = irs_rows[[c for c in all_cols if c in irs_rows.columns]]

    # Ensure IRS rows have all columns from GT
    for col in all_cols:
        if col not in irs_rows.columns:
            irs_rows[col] = pd.NA

    extended = pd.concat([gt_only, irs_rows], ignore_index=True)

    # Recompute row-level derived fields after merge
    extended.sort_values(["ein", "fiscal_year"], inplace=True)
    extended["net_assets_boy"] = extended.groupby("ein")["net_assets_eoy"].shift(1).astype("float64")
    extended["years_of_data"] = extended.groupby("ein")["fiscal_year"].transform("count").astype("Int64")

    for col, pct_col in [
        ("contributions_grants", "pct_contributions"),
        ("program_service_revenue", "pct_program_revenue"),
        ("investment_income", "pct_investment_income"),
        ("other_revenue", "pct_other_revenue"),
    ]:
        extended[pct_col] = (extended[col] / extended["total_revenue"]).where(extended["total_revenue"] != 0).astype("float64")

    # --- Enforce dtypes before write ---
    print("Enforcing final dtypes...", file=sys.stderr)
    for col in FLOAT64_COLS + ["other_revenue", "net_assets_boy",
                                "pct_contributions", "pct_program_revenue",
                                "pct_investment_income", "pct_other_revenue"]:
        if col in extended.columns:
            extended[col] = pd.to_numeric(extended[col], errors="coerce").astype("float64")

    for col in INT64_COLS + ["fiscal_year", "years_of_data"]:
        if col in extended.columns:
            extended[col] = extended[col].astype("Int64")

    for col in ["ein", "org_name", "state", "city", "tax_period_end",
                "return_type", "mission_desc", "submitted_on"]:
        if col in extended.columns:
            extended[col] = extended[col].astype("string")

    # --- Column ordering ---
    col_order = [
        "ein", "org_name", "state", "city",
        "tax_period_end", "fiscal_year", "return_type",
        "total_revenue", "total_expenses",
        "total_assets_eoy", "total_liabilities_eoy",
        "net_assets_eoy", "net_assets_boy",
        "contributions_grants", "government_grants",
        "program_service_revenue", "investment_income", "other_revenue",
        "pct_contributions", "pct_program_revenue",
        "pct_investment_income", "pct_other_revenue",
        # New fields
        "program_expenses", "management_general_expenses", "fundraising_expenses",
        "total_functional_expenses", "grants_paid", "compensation_top_officer",
        "cash_non_interest_bearing", "savings_temporary_investments",
        "unrestricted_net_assets", "temp_restricted_net_assets", "perm_restricted_net_assets",
        "num_employees", "num_voting_board_members",
        "formation_year",
        # Existing tail
        "mission_desc", "years_of_data", "submitted_on",
    ]
    extended = extended[col_order]

    # --- Write ---
    out_path = PROCESSED / "panel_990_extended_v2.parquet"
    extended.to_parquet(out_path, index=False, engine="pyarrow", compression="snappy")
    file_mb = out_path.stat().st_size / (1024 * 1024)

    elapsed = time.time() - t0
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"v2 panel written: {out_path}", file=sys.stderr)
    print(f"  Rows: {len(extended):,}", file=sys.stderr)
    print(f"  Columns: {len(extended.columns)}", file=sys.stderr)
    print(f"  File size: {file_mb:.1f} MB", file=sys.stderr)
    print(f"  Time: {elapsed:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
