#!/usr/bin/env python3
"""Build analysis-ready panel from GivingTuesday data marts.

Usage:
    python parsing/build_panel.py

Reads:
    data/raw/gt_basic120.csv   (GivingTuesday Basic 120 Fields mart)
    data/raw/gt_missions.csv   (GivingTuesday Missions mart)

Writes:
    data/processed/panel_990.parquet
"""

import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"


# ---------------------------------------------------------------------------
# Column config
# ---------------------------------------------------------------------------

BASIC_USECOLS = [
    "FILEREIN", "FILERNAME1", "FILERNAME2",
    "FILERUSSTATE", "FILERUSCITY",
    "TAXPEREND", "TAXYEAR", "RETURNTYPE",
    "TOTREVCURYEA", "TOTEXPCURYEA",
    "TOASEOOYY", "TOLIEOOYY", "NAFBEOY",
    "TOTACASHCONT", "GOVERNGRANTS",
    "TOTPROSERREV", "ININTORECOOL",
]

BASIC_DTYPES = {
    "FILEREIN": str,
    "FILERNAME1": str,
    "FILERNAME2": str,
    "FILERUSSTATE": str,
    "FILERUSCITY": str,
    "TAXPEREND": str,
    "TAXYEAR": str,
    "RETURNTYPE": str,
    "TOTREVCURYEA": str,
    "TOTEXPCURYEA": str,
    "TOASEOOYY": str,
    "TOLIEOOYY": str,
    "NAFBEOY": str,
    "TOTACASHCONT": str,
    "GOVERNGRANTS": str,
    "TOTPROSERREV": str,
    "ININTORECOOL": str,
}

RENAME = {
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
}

NUMERIC_COLS = [
    "total_revenue", "total_expenses",
    "total_assets_eoy", "total_liabilities_eoy", "net_assets_eoy",
    "contributions_grants", "government_grants",
    "program_service_revenue", "investment_income",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_float(series):
    """Convert string series to float, treating empty strings as NaN."""
    return pd.to_numeric(series, errors="coerce")


def fix_city_duplication(df):
    """Fix the WASHINGTONWASHINGTON-style city bug.

    If city ends with a repeated state abbreviation or the city name itself
    is doubled, strip the trailing duplicate.
    """
    def _fix(row):
        city = row["city"]
        state = row["state"]
        if pd.isna(city) or not isinstance(city, str):
            return city
        city = city.strip()
        # Strip trailing repeated state: "WASHINGTONDC" when state is "DC"
        # Actually the bug is "WASHINGTONWASHINGTON" — city doubled
        if len(city) > 3 and city == city[:len(city)//2] * 2:
            return city[:len(city)//2]
        # Also strip if city ends with state code repeated
        if state and isinstance(state, str) and city.endswith(state * 2):
            return city[:-(len(state))]
        return city

    df["city"] = df.apply(_fix, axis=1)
    return df


def build_org_name(df):
    """Concatenate FILERNAME1 and FILERNAME2."""
    name1 = df["FILERNAME1"].fillna("")
    name2 = df["FILERNAME2"].fillna("")
    combined = (name1 + " " + name2).str.strip()
    return combined.replace("", pd.NA)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()

    # --- Load Basic 120 ---
    print("Loading Basic 120 mart...", file=sys.stderr)
    basic = pd.read_csv(
        RAW / "gt_basic120.csv",
        usecols=BASIC_USECOLS,
        dtype=BASIC_DTYPES,
        low_memory=False,
    )
    print(f"  Loaded {len(basic):,} rows, {len(basic.columns)} cols", file=sys.stderr)

    # Build org_name before dropping raw name columns
    basic["org_name"] = build_org_name(basic)
    basic.drop(columns=["FILERNAME1", "FILERNAME2"], inplace=True)

    # Rename
    basic.rename(columns=RENAME, inplace=True)

    # Filter to full 990 only
    pre_filter = len(basic)
    basic = basic[basic["return_type"] == "990"].copy()
    print(f"  Filtered to 990 only: {len(basic):,} rows (dropped {pre_filter - len(basic):,} non-990)", file=sys.stderr)

    # Coerce numeric columns
    for col in NUMERIC_COLS:
        basic[col] = safe_float(basic[col])

    # Coerce fiscal_year to int (nullable)
    basic["fiscal_year"] = pd.to_numeric(basic["fiscal_year"], errors="coerce").astype("Int64")

    # Drop rows with null EIN or fiscal_year
    pre_drop = len(basic)
    basic.dropna(subset=["ein", "fiscal_year"], inplace=True)
    if pre_drop - len(basic) > 0:
        print(f"  Dropped {pre_drop - len(basic):,} rows with null EIN or fiscal_year", file=sys.stderr)

    # Fix city duplication bug
    basic = fix_city_duplication(basic)

    # --- Load Missions ---
    print("Loading Missions mart...", file=sys.stderr)
    missions = pd.read_csv(
        RAW / "gt_missions.csv",
        usecols=["FILEREIN", "TAXPEREND", "MISSION"],
        dtype={"FILEREIN": str, "TAXPEREND": str, "MISSION": str},
    )
    missions.rename(columns={"FILEREIN": "ein", "TAXPEREND": "tax_period_end", "MISSION": "mission_desc"}, inplace=True)

    # Normalize mission text: strip whitespace, truncate to 500 chars
    missions["mission_desc"] = (
        missions["mission_desc"]
        .fillna("")
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
        .str[:500]
        .replace("", pd.NA)
    )

    # Deduplicate missions (some EIN+tax_period may appear multiple times)
    missions.drop_duplicates(subset=["ein", "tax_period_end"], keep="first", inplace=True)
    print(f"  Loaded {len(missions):,} mission descriptions", file=sys.stderr)

    # --- Join ---
    print("Joining missions...", file=sys.stderr)
    df = basic.merge(missions, on=["ein", "tax_period_end"], how="left")

    # --- Derived fields ---
    print("Computing derived fields...", file=sys.stderr)

    # other_revenue = total - (contributions + program + investment)
    df["other_revenue"] = (
        df["total_revenue"]
        - df["contributions_grants"].fillna(0)
        - df["program_service_revenue"].fillna(0)
        - df["investment_income"].fillna(0)
    )
    # If total_revenue is null, other_revenue should be null too
    df.loc[df["total_revenue"].isna(), "other_revenue"] = pd.NA

    # net_assets_boy via self-join on prior year
    # Sort by ein + fiscal_year, then shift within group
    df.sort_values(["ein", "fiscal_year"], inplace=True)
    df["net_assets_boy"] = df.groupby("ein")["net_assets_eoy"].shift(1)

    # years_of_data per EIN
    df["years_of_data"] = df.groupby("ein")["fiscal_year"].transform("count")

    # Revenue mix percentages
    for col, pct_col in [
        ("contributions_grants", "pct_contributions"),
        ("program_service_revenue", "pct_program_revenue"),
        ("investment_income", "pct_investment_income"),
        ("other_revenue", "pct_other_revenue"),
    ]:
        df[pct_col] = (df[col] / df["total_revenue"]).where(df["total_revenue"] != 0)

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
        "mission_desc",
        "years_of_data",
    ]
    df = df[col_order]

    # --- Save ---
    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / "panel_990.parquet"
    df.to_parquet(out_path, index=False, engine="pyarrow")
    file_size = out_path.stat().st_size / (1024 * 1024)

    elapsed = time.time() - t0

    # --- Report ---
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Built panel in {elapsed:.1f}s", file=sys.stderr)
    print(f"Output: {out_path} ({file_size:.1f} MB)", file=sys.stderr)
    print(f"Shape: {df.shape[0]:,} rows x {df.shape[1]} cols", file=sys.stderr)
    print(f"Unique EINs: {df['ein'].nunique():,}", file=sys.stderr)
    print(f"Fiscal year range: {df['fiscal_year'].min()} - {df['fiscal_year'].max()}", file=sys.stderr)

    # Years per EIN distribution
    ypd = df.groupby("ein")["fiscal_year"].count()
    print(f"\nYears of data per EIN:", file=sys.stderr)
    print(f"  Mean: {ypd.mean():.1f}, Median: {ypd.median():.0f}, Min: {ypd.min()}, Max: {ypd.max()}", file=sys.stderr)
    print(f"  Distribution:", file=sys.stderr)
    for n in sorted(ypd.unique()):
        count = (ypd == n).sum()
        print(f"    {n} year(s): {count:,} EINs", file=sys.stderr)

    # CA + WA count
    ca_wa = df[df["state"].isin(["CA", "WA"])]["ein"].nunique()
    print(f"\nCA + WA unique EINs: {ca_wa:,}", file=sys.stderr)

    # Null counts
    print(f"\nNull counts per column:", file=sys.stderr)
    nulls = df.isnull().sum()
    for col in df.columns:
        n = nulls[col]
        if n > 0:
            print(f"  {col}: {n:,}/{len(df):,} ({100*n/len(df):.1f}%)", file=sys.stderr)

    # Head
    print(f"\nFirst 5 rows:", file=sys.stderr)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.width", 200)
    print(df.head().to_string(), file=sys.stderr)


if __name__ == "__main__":
    main()
