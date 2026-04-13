#!/usr/bin/env python3
"""Download missing 2025 IRS XML batches, parse, and merge into v4 panel.

Adds ~10 monthly batches from Jan-Oct 2025 containing the bulk of FY2024
returns filed during that period. Updates existing rows if newer XML data
exists (amendments). Extracts v2 extension fields directly from XML.

Usage:
    python parsing/expand_fy2024.py

Reads:
    data/processed/panel_990_extended_v3.parquet  (current panel)
    raw_data/bmf/eo*.csv                          (NTEE codes)

Writes:
    data/processed/panel_990_extended_v4.parquet
"""

import os
import sys
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path
from urllib.request import urlretrieve

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_990 import parse_one

ROOT = Path(__file__).resolve().parent.parent
RAW_EXT = ROOT / "raw_data" / "irs_extension"
PROCESSED = ROOT / "data" / "processed"
BMF_DIR = ROOT / "raw_data" / "bmf"

BASE_URL = "https://apps.irs.gov/pub/epostcard/990/xml"

# All IRS XML batches needed for comprehensive FY2024 coverage.
# 2024 batches: non-calendar FY2024 returns (filed during 2024).
# 2025 batches: calendar FY2024 returns (filed Jan-Oct 2025).
NEW_ZIPS = [
    # 2024 batches — non-calendar FY2024 returns
    "2024/2024_TEOS_XML_01A.zip",
    "2024/2024_TEOS_XML_02A.zip",
    "2024/2024_TEOS_XML_03A.zip",
    "2024/2024_TEOS_XML_04A.zip",
    "2024/2024_TEOS_XML_05A.zip",
    "2024/2024_TEOS_XML_06A.zip",
    "2024/2024_TEOS_XML_07A.zip",
    "2024/2024_TEOS_XML_08A.zip",
    "2024/2024_TEOS_XML_09A.zip",
    "2024/2024_TEOS_XML_10A.zip",
    "2024/2024_TEOS_XML_11A.zip",
    "2024/2024_TEOS_XML_12A.zip",
    # 2025 batches — calendar FY2024 returns
    "2025/2025_TEOS_XML_01A.zip",
    "2025/2025_TEOS_XML_02A.zip",
    "2025/2025_TEOS_XML_03A.zip",
    "2025/2025_TEOS_XML_04A.zip",
    "2025/2025_TEOS_XML_05A.zip",
    "2025/2025_TEOS_XML_06A.zip",
    "2025/2025_TEOS_XML_07A.zip",
    "2025/2025_TEOS_XML_08A.zip",
    "2025/2025_TEOS_XML_09A.zip",
    "2025/2025_TEOS_XML_10A.zip",
]


# ---------------------------------------------------------------------------
# NTEE lookup
# ---------------------------------------------------------------------------

NTEE_MAJOR_NAMES = {
    "A": "Arts, Culture & Humanities",
    "B": "Education",
    "C": "Environment",
    "D": "Animal-Related",
    "E": "Health Care",
    "F": "Mental Health & Crisis Intervention",
    "G": "Voluntary Health Associations & Medical Disciplines",
    "H": "Medical Research",
    "I": "Crime & Legal-Related",
    "J": "Employment",
    "K": "Food, Agriculture & Nutrition",
    "L": "Housing & Shelter",
    "M": "Public Safety, Disaster Preparedness & Relief",
    "N": "Recreation & Sports",
    "O": "Youth Development",
    "P": "Human Services",
    "Q": "International, Foreign Affairs & National Security",
    "R": "Civil Rights, Social Action & Advocacy",
    "S": "Community Improvement & Capacity Building",
    "T": "Philanthropy, Voluntarism & Grantmaking Foundations",
    "U": "Science & Technology",
    "V": "Social Science",
    "W": "Public & Societal Benefit",
    "X": "Religion-Related",
    "Y": "Mutual & Membership Benefit",
    "Z": "Unknown",
}


def load_ntee_lookup():
    """Load NTEE codes from BMF CSVs. Returns dict: EIN -> (ntee_code, major, name)."""
    print("Loading NTEE lookup from BMF...", file=sys.stderr)
    frames = []
    for csv_file in sorted(BMF_DIR.glob("eo*.csv")):
        df = pd.read_csv(csv_file, usecols=["EIN", "NTEE_CD"], dtype=str, low_memory=False)
        frames.append(df)
    bmf = pd.concat(frames, ignore_index=True)
    bmf = bmf.dropna(subset=["NTEE_CD"]).drop_duplicates(subset=["EIN"], keep="first")
    bmf["EIN"] = bmf["EIN"].str.strip()
    bmf["NTEE_CD"] = bmf["NTEE_CD"].str.strip()

    lookup = {}
    for _, row in bmf.iterrows():
        ein = row["EIN"]
        ntee = row["NTEE_CD"]
        major = ntee[0].upper() if ntee else None
        name = NTEE_MAJOR_NAMES.get(major) if major else None
        lookup[ein] = (ntee, major, name)

    print(f"  Loaded {len(lookup):,} EINs with NTEE codes", file=sys.stderr)
    return lookup


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_one(zip_rel):
    """Download a single ZIP. Returns (zip_rel, local_path, size, error)."""
    url = f"{BASE_URL}/{zip_rel}"
    fname = zip_rel.replace("/", "_")
    local = RAW_EXT / fname
    if local.exists() and local.stat().st_size > 1000:
        return (zip_rel, str(local), local.stat().st_size, None)
    for attempt in range(3):
        try:
            urlretrieve(url, str(local))
            return (zip_rel, str(local), local.stat().st_size, None)
        except Exception as e:
            if attempt == 2:
                return (zip_rel, str(local), 0, str(e))
    return (zip_rel, str(local), 0, "exhausted retries")


def download_all():
    t0 = time.time()
    print(f"Step 1: Downloading {len(NEW_ZIPS)} ZIPs (threaded)...", file=sys.stderr)
    RAW_EXT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(download_one, NEW_ZIPS))
    elapsed = time.time() - t0
    print(f"  Downloads finished in {elapsed:.1f}s", file=sys.stderr)
    errors = []
    for rel, path, size, err in results:
        mb = size / (1024 * 1024)
        status = f"{mb:.1f} MB" if not err else f"ERROR: {err}"
        print(f"  {rel}: {status}", file=sys.stderr)
        if err:
            errors.append(rel)
    if errors:
        print(f"WARNING: {len(errors)} download(s) failed, continuing with what we have.", file=sys.stderr)
    return [r for r in results if not r[3]], elapsed


# ---------------------------------------------------------------------------
# Unzip
# ---------------------------------------------------------------------------

def unzip_all(download_results):
    t0 = time.time()
    print(f"\nStep 2: Unzipping into per-batch subdirectories...", file=sys.stderr)
    batch_dirs = []
    for rel, path, _, _ in download_results:
        batch_name = Path(path).stem
        batch_dir = RAW_EXT / batch_name
        batch_dir.mkdir(exist_ok=True)
        existing_xmls = len(list(batch_dir.glob("*.xml")))
        if existing_xmls > 100:
            print(f"  {batch_name}/: already has {existing_xmls} XML files (skipping)", file=sys.stderr)
            batch_dirs.append(batch_dir)
            continue
        subprocess.run(["unzip", "-oq", path, "-d", str(batch_dir)])
        xml_count = len(list(batch_dir.rglob("*.xml")))
        print(f"  {batch_name}/: {xml_count} XML files", file=sys.stderr)
        batch_dirs.append(batch_dir)
    elapsed = time.time() - t0
    print(f"  Unzipping done in {elapsed:.1f}s", file=sys.stderr)
    return batch_dirs, elapsed


# ---------------------------------------------------------------------------
# Parse (multiprocessing)
# ---------------------------------------------------------------------------

def parse_file(filepath):
    """Wrapper for multiprocessing."""
    try:
        row = parse_one(Path(filepath))
        return (row, None)
    except Exception as e:
        return (None, f"{Path(filepath).name}: {e}")


def parse_all(batch_dirs):
    t0 = time.time()
    print(f"\nStep 3: Parsing XML files (multiprocessing)...", file=sys.stderr)
    all_xmls = []
    for bd in batch_dirs:
        all_xmls.extend(sorted(bd.rglob("*.xml")))
    all_xmls = [str(f) for f in all_xmls]
    print(f"  Found {len(all_xmls):,} XML files across {len(batch_dirs)} batches", file=sys.stderr)

    workers = min(os.cpu_count() or 4, 8)
    print(f"  Using {workers} workers", file=sys.stderr)

    rows = []
    errors = []
    with Pool(workers) as pool:
        for i, (row, err) in enumerate(pool.imap_unordered(parse_file, all_xmls, chunksize=200)):
            if err:
                errors.append(err)
            elif row:
                rows.append(row)
            if (i + 1) % 25000 == 0:
                print(f"  ... processed {i+1:,}/{len(all_xmls):,}", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"  Parsed {len(rows):,} rows, {len(errors):,} errors in {elapsed:.1f}s", file=sys.stderr)
    if errors:
        print(f"  First 5 errors:", file=sys.stderr)
        for e in errors[:5]:
            print(f"    {e}", file=sys.stderr)

    df = pd.DataFrame(rows)

    # Filter to full 990 only
    pre = len(df)
    non990 = df[df["return_type"] != "990"]["return_type"].value_counts()
    df = df[df["return_type"] == "990"].copy()
    print(f"  Filtered to 990 only: {len(df):,} rows (dropped {pre - len(df):,} non-990)", file=sys.stderr)
    if len(non990) > 0:
        for rt, cnt in non990.head().items():
            print(f"    Skipped {rt}: {cnt:,}", file=sys.stderr)

    # Fiscal year distribution
    if "fiscal_year" in df.columns:
        fy = df["fiscal_year"].value_counts().sort_index()
        print(f"\n  Fiscal year distribution (new XML):", file=sys.stderr)
        for yr, cnt in fy.items():
            print(f"    FY{yr}: {cnt:,}", file=sys.stderr)

    return df, errors, elapsed


# ---------------------------------------------------------------------------
# Merge into v3 panel
# ---------------------------------------------------------------------------

def merge_into_panel(new_df, ntee_lookup):
    t0 = time.time()
    print(f"\nStep 4: Merging into v3 panel...", file=sys.stderr)

    # Use v4 if it exists (from prior run), else fall back to v3
    v4_path = PROCESSED / "panel_990_extended_v4.parquet"
    v3_path = PROCESSED / "panel_990_extended_v3.parquet"
    base_path = v4_path if v4_path.exists() else v3_path
    v3 = pd.read_parquet(base_path)
    print(f"  Base panel ({base_path.name}): {len(v3):,} rows, {v3['ein'].nunique():,} EINs", file=sys.stderr)
    print(f"  Base FY2024 rows: {(v3['fiscal_year'] == 2024).sum():,}", file=sys.stderr)

    # --- Align new_df schema to match v3 ---
    new_df = new_df.copy()

    # Rename filing_date -> submitted_on
    if "filing_date" in new_df.columns:
        new_df.rename(columns={"filing_date": "submitted_on"}, inplace=True)

    # Rename org_name -> organization_name if v3 uses that
    if "organization_name" in v3.columns and "org_name" in new_df.columns:
        new_df.rename(columns={"org_name": "organization_name"}, inplace=True)

    # Coerce types
    float_cols = [
        "total_revenue", "total_expenses", "total_assets_eoy",
        "total_liabilities_eoy", "net_assets_eoy", "net_assets_boy",
        "contributions_grants", "program_service_revenue",
        "investment_income", "other_revenue", "government_grants",
        "program_expenses", "management_general_expenses", "fundraising_expenses",
        "total_functional_expenses", "cash_non_interest_bearing",
        "savings_temporary_investments", "unrestricted_net_assets",
        "temp_restricted_net_assets", "perm_restricted_net_assets",
        "grants_paid", "compensation_top_officer",
    ]
    for col in float_cols:
        if col in new_df.columns:
            new_df[col] = pd.to_numeric(new_df[col], errors="coerce")

    int_cols = ["num_employees", "num_volunteers", "num_voting_board_members", "formation_year"]
    for col in int_cols:
        if col in new_df.columns:
            new_df[col] = pd.to_numeric(new_df[col], errors="coerce")

    if "fiscal_year" in new_df.columns:
        new_df["fiscal_year"] = pd.to_numeric(new_df["fiscal_year"], errors="coerce").astype("Int64")

    # Add NTEE codes from lookup
    def _apply_ntee(ein):
        if ein in ntee_lookup:
            return ntee_lookup[ein]
        return (pd.NA, pd.NA, pd.NA)

    ntee_tuples = new_df["ein"].map(lambda e: _apply_ntee(e))
    new_df["ntee_code"] = [t[0] for t in ntee_tuples]
    new_df["ntee_major_category"] = [t[1] for t in ntee_tuples]
    new_df["ntee_major_category_name"] = [t[2] for t in ntee_tuples]

    # Add columns that v3 has but new_df doesn't
    for col in v3.columns:
        if col not in new_df.columns:
            new_df[col] = pd.NA

    # Drop columns v3 doesn't have
    extra = [c for c in new_df.columns if c not in v3.columns]
    if extra:
        print(f"  Dropping extra columns from new data: {extra}", file=sys.stderr)
        new_df.drop(columns=extra, inplace=True)

    # Reorder to match v3
    new_df = new_df[v3.columns]

    # --- Dedupe logic ---
    # Create join keys
    v3["_key"] = v3["ein"].astype(str) + "_" + v3["tax_period_end"].astype(str)
    new_df["_key"] = new_df["ein"].astype(str) + "_" + new_df["tax_period_end"].astype(str)

    v3_keys = set(v3["_key"])
    new_keys = set(new_df["_key"])

    overlap = v3_keys & new_keys
    net_new = new_keys - v3_keys

    print(f"  New rows total: {len(new_df):,}", file=sys.stderr)
    print(f"  Overlap with v3: {len(overlap):,}", file=sys.stderr)
    print(f"  Net-new rows: {len(net_new):,}", file=sys.stderr)

    # For overlapping rows: update v3 rows that came from IRS (submitted_on not null)
    # or that had null v2 fields. For GT-sourced rows, keep GT version (it has v2 fields from Basic 120).
    # For net-new rows: append directly.

    # Identify which v3 overlap rows are IRS-sourced (have submitted_on, missing v2 fields)
    v3_overlap = v3[v3["_key"].isin(overlap)].copy()
    v3_irs_overlap_mask = v3_overlap["submitted_on"].notna()
    v3_gt_overlap_keys = set(v3_overlap.loc[~v3_irs_overlap_mask, "_key"])
    v3_irs_overlap_keys = set(v3_overlap.loc[v3_irs_overlap_mask, "_key"])

    print(f"    GT-sourced overlap (keep GT): {len(v3_gt_overlap_keys):,}", file=sys.stderr)
    print(f"    IRS-sourced overlap (update with new XML): {len(v3_irs_overlap_keys):,}", file=sys.stderr)

    # Keep: all v3 rows except IRS-sourced overlaps (those get replaced by new XML with v2 fields)
    v3_keep = v3[~v3["_key"].isin(v3_irs_overlap_keys)].copy()

    # From new_df: take net-new rows + IRS overlap replacements (skip GT overlap — GT is better)
    new_to_add = new_df[~new_df["_key"].isin(v3_gt_overlap_keys)].copy()

    v3_keep.drop(columns=["_key"], inplace=True)
    new_to_add.drop(columns=["_key"], inplace=True)

    merged = pd.concat([v3_keep, new_to_add], ignore_index=True)

    # --- Recompute derived fields ---
    print(f"\n  Recomputing derived fields...", file=sys.stderr)
    merged.sort_values(["ein", "fiscal_year"], inplace=True)

    # other_revenue (if not already set)
    mask = merged["other_revenue"].isna() & merged["total_revenue"].notna()
    merged.loc[mask, "other_revenue"] = (
        merged.loc[mask, "total_revenue"]
        - merged.loc[mask, "contributions_grants"].fillna(0)
        - merged.loc[mask, "program_service_revenue"].fillna(0)
        - merged.loc[mask, "investment_income"].fillna(0)
    )

    # net_assets_boy from prior year
    merged["net_assets_boy"] = merged.groupby("ein")["net_assets_eoy"].shift(1)

    # years_of_data
    merged["years_of_data"] = merged.groupby("ein")["fiscal_year"].transform("count")

    # Revenue mix percentages
    for col, pct_col in [
        ("contributions_grants", "pct_contributions"),
        ("program_service_revenue", "pct_program_revenue"),
        ("investment_income", "pct_investment_income"),
        ("other_revenue", "pct_other_revenue"),
    ]:
        merged[pct_col] = (merged[col] / merged["total_revenue"]).where(merged["total_revenue"] != 0)

    # --- Enforce dtypes ---
    print(f"  Enforcing final dtypes...", file=sys.stderr)
    for col in float_cols + ["other_revenue", "net_assets_boy",
                              "pct_contributions", "pct_program_revenue",
                              "pct_investment_income", "pct_other_revenue"]:
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").astype("float64")

    for col in ["fiscal_year", "years_of_data", "num_employees",
                "num_voting_board_members", "formation_year"]:
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").astype("Int64")

    for col in ["ein", "state", "city", "tax_period_end", "return_type",
                "mission_desc", "submitted_on", "ntee_code",
                "ntee_major_category", "ntee_major_category_name"]:
        if col in merged.columns:
            merged[col] = merged[col].astype("string")

    # Handle org_name column (may be org_name or organization_name)
    for col in ["org_name", "organization_name"]:
        if col in merged.columns:
            merged[col] = merged[col].astype("string")

    elapsed = time.time() - t0
    print(f"  Merge done in {elapsed:.1f}s", file=sys.stderr)
    return merged, elapsed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t_total = time.time()

    # Step 0: Load NTEE lookup
    ntee_lookup = load_ntee_lookup()

    # Step 1: Download
    dl_results, dl_time = download_all()
    if not dl_results:
        print("FATAL: No downloads succeeded. Aborting.", file=sys.stderr)
        sys.exit(1)

    # Step 2: Unzip
    batch_dirs, unzip_time = unzip_all(dl_results)

    # Step 3: Parse
    new_df, parse_errors, parse_time = parse_all(batch_dirs)

    if len(new_df) == 0:
        print("FATAL: No rows parsed. Aborting.", file=sys.stderr)
        sys.exit(1)

    # Step 4: Merge
    merged, merge_time = merge_into_panel(new_df, ntee_lookup)

    # Step 5: Write v4
    out_path = PROCESSED / "panel_990_extended_v4.parquet"
    merged.to_parquet(out_path, index=False, engine="pyarrow", compression="snappy")
    file_mb = out_path.stat().st_size / (1024 * 1024)

    total_time = time.time() - t_total

    # --- Final report ---
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"FY2024 EXPANSION REPORT", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)
    print(f"Wall-clock times:", file=sys.stderr)
    print(f"  Download: {dl_time:.1f}s", file=sys.stderr)
    print(f"  Unzip:    {unzip_time:.1f}s", file=sys.stderr)
    print(f"  Parse:    {parse_time:.1f}s", file=sys.stderr)
    print(f"  Merge:    {merge_time:.1f}s", file=sys.stderr)
    print(f"  Total:    {total_time:.1f}s", file=sys.stderr)

    print(f"\nv4 panel stats:", file=sys.stderr)
    print(f"  Total rows: {len(merged):,}", file=sys.stderr)
    print(f"  Unique EINs: {merged['ein'].nunique():,}", file=sys.stderr)
    print(f"  Columns: {len(merged.columns)}", file=sys.stderr)
    print(f"  File size: {file_mb:.1f} MB", file=sys.stderr)

    # FY2024 before vs after — compare against v3 (original baseline)
    v3_orig = pd.read_parquet(PROCESSED / "panel_990_extended_v3.parquet")
    v3_fy24 = (v3_orig["fiscal_year"] == 2024).sum()
    v4_fy24 = (merged["fiscal_year"] == 2024).sum()
    v3_fy24_cawa = ((v3_orig["fiscal_year"] == 2024) & (v3_orig["state"].isin(["CA", "WA"]))).sum()
    v4_fy24_cawa = ((merged["fiscal_year"] == 2024) & (merged["state"].isin(["CA", "WA"]))).sum()

    print(f"\nFY2024 coverage improvement (vs v3 baseline):", file=sys.stderr)
    print(f"  National: {v3_fy24:,} -> {v4_fy24:,} (+{v4_fy24 - v3_fy24:,})", file=sys.stderr)
    print(f"  CA+WA:    {v3_fy24_cawa:,} -> {v4_fy24_cawa:,} (+{v4_fy24_cawa - v3_fy24_cawa:,})", file=sys.stderr)

    # Year-by-year CA+WA
    cawa = merged[merged["state"].isin(["CA", "WA"])]
    fy_dist = cawa.groupby("fiscal_year")["ein"].nunique().sort_index()
    print(f"\n  CA+WA EINs by fiscal year (v4):", file=sys.stderr)
    for yr, cnt in fy_dist.items():
        marker = " <<<" if yr == 2024 else ""
        print(f"    FY{yr}: {cnt:,}{marker}", file=sys.stderr)

    # v2 field coverage for FY2024
    fy24 = merged[merged["fiscal_year"] == 2024]
    v2_fields = ["cash_non_interest_bearing", "savings_temporary_investments",
                 "program_expenses", "formation_year", "num_employees"]
    print(f"\n  FY2024 v2 field coverage ({len(fy24):,} rows):", file=sys.stderr)
    for col in v2_fields:
        if col in fy24.columns:
            non_null = fy24[col].notna().sum()
            pct = 100 * non_null / len(fy24) if len(fy24) > 0 else 0
            print(f"    {col}: {non_null:,}/{len(fy24):,} ({pct:.1f}%)", file=sys.stderr)

    print(f"\n  Output: {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
