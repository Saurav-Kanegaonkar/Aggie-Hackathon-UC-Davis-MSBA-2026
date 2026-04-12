#!/usr/bin/env python3
"""Download late-2025 + early-2026 IRS bulk XML, parse, dedupe against GT panel.

Usage:
    python parsing/extend_panel.py

Produces: data/processed/panel_990_extended.parquet
"""

import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path
from urllib.request import urlretrieve

import pandas as pd

# Reuse existing parser
sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_990 import parse_one

ROOT = Path(__file__).resolve().parent.parent
RAW_EXT = ROOT / "raw_data" / "irs_extension"
PROCESSED = ROOT / "data" / "processed"

BASE_URL = "https://apps.irs.gov/pub/epostcard/990/xml"

ZIPS = [
    # 10B does not exist on IRS servers (404)
    "2025/2025_TEOS_XML_11A.zip",
    "2025/2025_TEOS_XML_11B.zip",
    "2025/2025_TEOS_XML_11C.zip",
    "2025/2025_TEOS_XML_11D.zip",
    "2025/2025_TEOS_XML_12A.zip",
    "2026/2026_TEOS_XML_01A.zip",
    "2026/2026_TEOS_XML_02A.zip",
]


# ---------------------------------------------------------------------------
# Step 1: Download
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
    print("Step 1: Downloading 8 ZIPs (threaded)...", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(download_one, ZIPS))
    elapsed = time.time() - t0
    print(f"  Downloads finished in {elapsed:.1f}s", file=sys.stderr)
    for rel, path, size, err in results:
        mb = size / (1024 * 1024)
        status = f"{mb:.1f} MB" if not err else f"ERROR: {err}"
        print(f"  {rel}: {status}", file=sys.stderr)
    errors = [r for r in results if r[3]]
    if errors:
        print(f"FATAL: {len(errors)} download(s) failed. Aborting.", file=sys.stderr)
        sys.exit(1)
    return results, elapsed


# ---------------------------------------------------------------------------
# Step 2: Verify ZIPs
# ---------------------------------------------------------------------------

def verify_zips(download_results):
    t0 = time.time()
    print("\nStep 2: Verifying ZIP integrity...", file=sys.stderr)
    for rel, path, size, _ in download_results:
        # Use unzip -t (command-line) because IRS ZIPs use Deflate64
        # which Python's zipfile module doesn't support
        import subprocess
        result = subprocess.run(
            ["unzip", "-tq", path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            # Some IRS ZIPs have corrupt trailing entries but are mostly valid
            print(f"  WARNING: {rel} — partial corruption (will extract what we can)", file=sys.stderr)
        else:
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
            print(f"  {rel}: OK ({lines[-1] if lines else 'verified'})", file=sys.stderr)
    elapsed = time.time() - t0
    print(f"  Verification done in {elapsed:.1f}s", file=sys.stderr)
    return elapsed


# ---------------------------------------------------------------------------
# Step 3: Unzip
# ---------------------------------------------------------------------------

def unzip_all(download_results):
    t0 = time.time()
    print("\nStep 3: Unzipping into per-batch subdirectories...", file=sys.stderr)
    batch_dirs = []
    for rel, path, _, _ in download_results:
        batch_name = Path(path).stem
        batch_dir = RAW_EXT / batch_name
        batch_dir.mkdir(exist_ok=True)
        # Use command-line unzip (handles Deflate64)
        import subprocess
        # -o overwrite, -q quiet; don't check=True since some ZIPs have corrupt tails
        subprocess.run(
            ["unzip", "-oq", path, "-d", str(batch_dir)],
        )
        xml_count = len(list(batch_dir.rglob("*.xml")))
        print(f"  {batch_name}/: {xml_count} XML files", file=sys.stderr)
        batch_dirs.append(batch_dir)
    elapsed = time.time() - t0
    print(f"  Unzipping done in {elapsed:.1f}s", file=sys.stderr)
    return batch_dirs, elapsed


# ---------------------------------------------------------------------------
# Step 4: Parse (multiprocessing)
# ---------------------------------------------------------------------------

def parse_file(filepath):
    """Wrapper for multiprocessing — returns (row_dict, error_string)."""
    try:
        row = parse_one(Path(filepath))
        return (row, None)
    except Exception as e:
        return (None, f"{Path(filepath).name}: {e}")


def parse_all(batch_dirs):
    t0 = time.time()
    print("\nStep 4: Parsing XML files (multiprocessing)...", file=sys.stderr)
    all_xmls = []
    for bd in batch_dirs:
        all_xmls.extend(sorted(bd.rglob("*.xml")))
    all_xmls = [str(f) for f in all_xmls]
    print(f"  Found {len(all_xmls)} XML files across {len(batch_dirs)} batches", file=sys.stderr)

    workers = os.cpu_count() or 4
    print(f"  Using {workers} workers", file=sys.stderr)

    rows = []
    errors = []
    with Pool(workers) as pool:
        for i, (row, err) in enumerate(pool.imap_unordered(parse_file, all_xmls, chunksize=200)):
            if err:
                errors.append(err)
            elif row:
                rows.append(row)
            if (i + 1) % 10000 == 0:
                print(f"  ... processed {i+1}/{len(all_xmls)}", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"  Parsed {len(rows)} rows, {len(errors)} errors in {elapsed:.1f}s", file=sys.stderr)
    if errors:
        print(f"  First 10 errors:", file=sys.stderr)
        for e in errors[:10]:
            print(f"    {e}", file=sys.stderr)

    df = pd.DataFrame(rows)

    # Filter to full 990 only — IRS monthly ZIPs contain mixed return types
    pre = len(df)
    non990 = df[df["return_type"] != "990"]["return_type"].value_counts()
    df = df[df["return_type"] == "990"].copy()
    print(f"  Filtered to 990 only: {len(df):,} rows (dropped {pre - len(df):,} non-990)", file=sys.stderr)
    if len(non990) > 0:
        for rt, cnt in non990.items():
            print(f"    Skipped {rt}: {cnt:,}", file=sys.stderr)

    return df, errors, elapsed


# ---------------------------------------------------------------------------
# Step 5: Sanity check
# ---------------------------------------------------------------------------

def sanity_check(df):
    print("\nStep 5: Sanity check on new rows...", file=sys.stderr)
    print(f"  Shape: {df.shape[0]:,} rows x {df.shape[1]} cols", file=sys.stderr)

    # Fiscal year distribution
    if "fiscal_year" in df.columns:
        fy = df["fiscal_year"].value_counts().sort_index()
        print(f"  Fiscal year distribution:", file=sys.stderr)
        for yr, cnt in fy.items():
            print(f"    {yr}: {cnt:,}", file=sys.stderr)

    # Null counts
    print(f"  Null counts:", file=sys.stderr)
    nulls = df.isnull().sum()
    for col in df.columns:
        if nulls[col] > 0:
            print(f"    {col}: {nulls[col]:,}/{len(df):,} ({100*nulls[col]/len(df):.1f}%)", file=sys.stderr)


# ---------------------------------------------------------------------------
# Step 6: Dedupe and build extended panel
# ---------------------------------------------------------------------------

def dedupe_and_extend(new_df):
    t0 = time.time()
    print("\nStep 6: Deduping against GT panel...", file=sys.stderr)

    gt = pd.read_parquet(PROCESSED / "panel_990.parquet")
    print(f"  GT panel: {len(gt):,} rows, {gt['ein'].nunique():,} EINs", file=sys.stderr)

    # Align new_df schema to match GT panel
    # New rows from parser have raw schema; GT panel has derived fields
    # We need to add the derived fields to new rows

    # Rename columns to match GT panel
    new_df = new_df.copy()

    # Coerce types
    for col in ["total_revenue", "total_expenses", "total_assets_eoy",
                "total_liabilities_eoy", "net_assets_eoy", "net_assets_boy",
                "contributions_grants", "program_service_revenue",
                "investment_income", "other_revenue"]:
        if col in new_df.columns:
            new_df[col] = pd.to_numeric(new_df[col], errors="coerce")

    if "fiscal_year" in new_df.columns:
        new_df["fiscal_year"] = pd.to_numeric(new_df["fiscal_year"], errors="coerce").astype("Int64")

    # Rename filing_date -> submitted_on (ReturnTs from XML)
    if "filing_date" in new_df.columns:
        new_df.rename(columns={"filing_date": "submitted_on"}, inplace=True)

    # Add submitted_on to GT panel as null (GT doesn't have this field)
    gt["submitted_on"] = pd.NA

    # Add missing columns that GT panel has
    for col in gt.columns:
        if col not in new_df.columns:
            new_df[col] = pd.NA

    # Drop columns GT panel doesn't have
    extra_cols = [c for c in new_df.columns if c not in gt.columns]
    if extra_cols:
        new_df.drop(columns=extra_cols, inplace=True)

    # Reorder
    new_df = new_df[gt.columns]

    # Create join keys
    gt_keys = set(zip(gt["ein"], gt["tax_period_end"]))
    new_keys = set(zip(new_df["ein"], new_df["tax_period_end"]))

    overlap = gt_keys & new_keys
    net_new = new_keys - gt_keys

    print(f"  New rows total: {len(new_df):,}", file=sys.stderr)
    print(f"  Overlap (preferring IRS — likely amendments): {len(overlap):,}", file=sys.stderr)
    print(f"  Net-new rows to append: {len(net_new):,}", file=sys.stderr)
    print(f"  GT-only rows (unchanged): {len(gt_keys - new_keys):,}", file=sys.stderr)

    # Check amendment rate in overlap
    if len(overlap) > 0:
        overlap_gt = gt[gt.apply(lambda r: (r["ein"], r["tax_period_end"]) in overlap, axis=1)].copy()
        overlap_new = new_df[new_df.apply(lambda r: (r["ein"], r["tax_period_end"]) in overlap, axis=1)].copy()

        compare_cols = ["total_assets_eoy", "total_revenue", "net_assets_eoy"]
        merged = overlap_gt[["ein", "tax_period_end"] + compare_cols].merge(
            overlap_new[["ein", "tax_period_end"] + compare_cols],
            on=["ein", "tax_period_end"],
            suffixes=("_gt", "_new"),
        )
        discrepancies = 0
        for col in compare_cols:
            diff = (merged[f"{col}_gt"] != merged[f"{col}_new"]) & merged[f"{col}_gt"].notna() & merged[f"{col}_new"].notna()
            discrepancies += diff.sum()
        total_comparisons = len(merged) * len(compare_cols)
        disc_rate = 100 * discrepancies / total_comparisons if total_comparisons > 0 else 0
        print(f"  Amendment discrepancy rate: {discrepancies}/{total_comparisons} ({disc_rate:.1f}%)", file=sys.stderr)

    # Dedupe rule: for overlapping (ein, tax_period_end), prefer IRS version
    # (more recent, likely amended). Keep GT only where IRS has no data.
    gt_only = gt[gt.apply(lambda r: (r["ein"], r["tax_period_end"]) not in new_keys, axis=1)]
    # IRS rows = all net-new + all overlap (IRS preferred over GT for overlap)
    irs_rows = new_df.copy()

    extended = pd.concat([gt_only, irs_rows], ignore_index=True)

    # Recompute derived fields for net-new rows
    # other_revenue
    mask_new = extended["other_revenue"].isna() & extended["total_revenue"].notna()
    extended.loc[mask_new, "other_revenue"] = (
        extended.loc[mask_new, "total_revenue"]
        - extended.loc[mask_new, "contributions_grants"].fillna(0)
        - extended.loc[mask_new, "program_service_revenue"].fillna(0)
        - extended.loc[mask_new, "investment_income"].fillna(0)
    )

    # Re-sort and recompute net_assets_boy and years_of_data for ALL rows
    extended.sort_values(["ein", "fiscal_year"], inplace=True)
    extended["net_assets_boy"] = extended.groupby("ein")["net_assets_eoy"].shift(1)
    extended["years_of_data"] = extended.groupby("ein")["fiscal_year"].transform("count")

    # Revenue mix pcts
    for col, pct_col in [
        ("contributions_grants", "pct_contributions"),
        ("program_service_revenue", "pct_program_revenue"),
        ("investment_income", "pct_investment_income"),
        ("other_revenue", "pct_other_revenue"),
    ]:
        extended[pct_col] = (extended[col] / extended["total_revenue"]).where(extended["total_revenue"] != 0)

    # Write
    out_path = PROCESSED / "panel_990_extended.parquet"
    extended.to_parquet(out_path, index=False, engine="pyarrow")
    file_mb = out_path.stat().st_size / (1024 * 1024)

    elapsed = time.time() - t0
    print(f"\n  Extended panel written: {out_path} ({file_mb:.1f} MB)", file=sys.stderr)
    print(f"  Dedupe + write done in {elapsed:.1f}s", file=sys.stderr)

    return extended, irs_rows, elapsed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    t_total = time.time()

    # Step 1: Download
    dl_results, dl_time = download_all()

    # Step 2: Verify
    verify_time = verify_zips(dl_results)

    # Step 3: Unzip
    batch_dirs, unzip_time = unzip_all(dl_results)

    # Step 4: Parse
    new_df, parse_errors, parse_time = parse_all(batch_dirs)

    if len(new_df) == 0:
        print("FATAL: No rows parsed. Aborting.", file=sys.stderr)
        sys.exit(1)

    # Step 5: Sanity check
    sanity_check(new_df)

    # Step 6: Dedupe and extend
    extended, net_new_df, dedupe_time = dedupe_and_extend(new_df)

    # Step 7: Final report
    total_time = time.time() - t_total
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"FINAL REPORT", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)
    print(f"Wall-clock times:", file=sys.stderr)
    print(f"  Download: {dl_time:.1f}s", file=sys.stderr)
    print(f"  Verify:   {verify_time:.1f}s", file=sys.stderr)
    print(f"  Unzip:    {unzip_time:.1f}s", file=sys.stderr)
    print(f"  Parse:    {parse_time:.1f}s", file=sys.stderr)
    print(f"  Dedupe:   {dedupe_time:.1f}s", file=sys.stderr)
    print(f"  Total:    {total_time:.1f}s", file=sys.stderr)

    print(f"\nExtended panel stats:", file=sys.stderr)
    print(f"  Total rows: {len(extended):,}", file=sys.stderr)
    print(f"  Unique EINs: {extended['ein'].nunique():,}", file=sys.stderr)
    print(f"  Fiscal year range: {extended['fiscal_year'].min()} - {extended['fiscal_year'].max()}", file=sys.stderr)

    gt = pd.read_parquet(PROCESSED / "panel_990.parquet")
    gt_max_tpe = gt["tax_period_end"].max()
    ext_max_tpe = extended["tax_period_end"].max()
    print(f"\n  Max tax_period_end (GT):       {gt_max_tpe}", file=sys.stderr)
    print(f"  Max tax_period_end (extended): {ext_max_tpe}", file=sys.stderr)

    print(f"\nFirst 5 net-new rows:", file=sys.stderr)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.width", 200)
    if len(net_new_df) > 0:
        print(net_new_df.head().to_string(), file=sys.stderr)
    else:
        print("  (none)", file=sys.stderr)


if __name__ == "__main__":
    main()
