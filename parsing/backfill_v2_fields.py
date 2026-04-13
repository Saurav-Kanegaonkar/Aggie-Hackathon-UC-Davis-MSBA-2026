#!/usr/bin/env python3
"""Backfill v2 extension fields for old IRS-sourced rows in the v4 panel.

The original extend_panel.py parsed XML with an older parser that didn't
extract v2 fields (cash, program_expenses, etc.). The XML files are still
on disk. This script re-parses them and updates the v4 panel in-place.

Usage:
    python parsing/backfill_v2_fields.py
"""

import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_990 import parse_one

ROOT = Path(__file__).resolve().parent.parent
RAW_EXT = ROOT / "raw_data" / "irs_extension"
PROCESSED = ROOT / "data" / "processed"

# Original 7 batches that were parsed without v2 fields
OLD_BATCHES = [
    "2025_2025_TEOS_XML_11A",
    "2025_2025_TEOS_XML_11B",
    "2025_2025_TEOS_XML_11C",
    "2025_2025_TEOS_XML_11D",
    "2025_2025_TEOS_XML_12A",
    "2026_2026_TEOS_XML_01A",
    "2026_2026_TEOS_XML_02A",
]

V2_FIELDS = [
    "program_expenses", "management_general_expenses", "fundraising_expenses",
    "total_functional_expenses", "cash_non_interest_bearing",
    "savings_temporary_investments", "unrestricted_net_assets",
    "temp_restricted_net_assets", "perm_restricted_net_assets",
    "grants_paid", "compensation_top_officer", "government_grants",
    "num_employees", "num_voting_board_members", "formation_year",
]


def parse_file(filepath):
    try:
        row = parse_one(Path(filepath))
        return (row, None)
    except Exception as e:
        return (None, f"{Path(filepath).name}: {e}")


def main():
    t0 = time.time()

    # Collect XML files from old batches
    all_xmls = []
    for batch_name in OLD_BATCHES:
        batch_dir = RAW_EXT / batch_name
        if not batch_dir.exists():
            print(f"  Skipping {batch_name} (not found)", file=sys.stderr)
            continue
        xmls = sorted(batch_dir.rglob("*.xml"))
        print(f"  {batch_name}: {len(xmls):,} XML files", file=sys.stderr)
        all_xmls.extend(xmls)

    all_xmls = [str(f) for f in all_xmls]
    print(f"\nTotal: {len(all_xmls):,} XML files to re-parse", file=sys.stderr)

    # Parse with updated parser (now extracts v2 fields)
    workers = min(os.cpu_count() or 4, 8)
    print(f"Parsing with {workers} workers...", file=sys.stderr)

    rows = []
    errors = 0
    with Pool(workers) as pool:
        for i, (row, err) in enumerate(pool.imap_unordered(parse_file, all_xmls, chunksize=200)):
            if err:
                errors += 1
            elif row and row.get("return_type") == "990":
                rows.append(row)
            if (i + 1) % 25000 == 0:
                print(f"  ... processed {i+1:,}/{len(all_xmls):,}", file=sys.stderr)

    parse_time = time.time() - t0
    print(f"Parsed {len(rows):,} full-990 rows, {errors:,} errors in {parse_time:.1f}s", file=sys.stderr)

    # Build lookup: (ein, tax_period_end) -> v2 field values
    parsed_df = pd.DataFrame(rows)
    parsed_df["_key"] = parsed_df["ein"].astype(str) + "_" + parsed_df["tax_period_end"].astype(str)

    # Coerce v2 fields
    for col in V2_FIELDS:
        if col in parsed_df.columns:
            parsed_df[col] = pd.to_numeric(parsed_df[col], errors="coerce")

    # Keep only _key + v2 fields
    keep_cols = ["_key"] + [c for c in V2_FIELDS if c in parsed_df.columns]
    v2_lookup = parsed_df[keep_cols].drop_duplicates(subset=["_key"], keep="last")
    v2_lookup.set_index("_key", inplace=True)
    print(f"Built v2 lookup: {len(v2_lookup):,} unique (ein, tax_period_end) entries", file=sys.stderr)

    # Load v4 panel
    print("\nLoading v4 panel...", file=sys.stderr)
    v4 = pd.read_parquet(PROCESSED / "panel_990_extended_v4.parquet")
    v4["_key"] = v4["ein"].astype(str) + "_" + v4["tax_period_end"].astype(str)

    # Find rows needing backfill: submitted_on is set AND cash_non_interest_bearing is null
    needs_backfill = (
        v4["submitted_on"].notna()
        & v4["cash_non_interest_bearing"].isna()
        & v4["_key"].isin(v2_lookup.index)
    )
    print(f"Rows needing backfill: {needs_backfill.sum():,}", file=sys.stderr)

    # Apply backfill
    if needs_backfill.sum() > 0:
        backfill_keys = v4.loc[needs_backfill, "_key"]
        for col in V2_FIELDS:
            if col in v2_lookup.columns:
                v4.loc[needs_backfill, col] = backfill_keys.map(v2_lookup[col]).values

        # Re-enforce dtypes
        float_v2 = [c for c in V2_FIELDS if c not in ["num_employees", "num_voting_board_members", "formation_year"]]
        for col in float_v2:
            if col in v4.columns:
                v4[col] = pd.to_numeric(v4[col], errors="coerce").astype("float64")
        for col in ["num_employees", "num_voting_board_members", "formation_year"]:
            if col in v4.columns:
                v4[col] = pd.to_numeric(v4[col], errors="coerce").astype("Int64")

    v4.drop(columns=["_key"], inplace=True)

    # Write updated v4
    out_path = PROCESSED / "panel_990_extended_v4.parquet"
    v4.to_parquet(out_path, index=False, engine="pyarrow", compression="snappy")
    file_mb = out_path.stat().st_size / (1024 * 1024)

    total_time = time.time() - t0

    # Report
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"BACKFILL REPORT", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)
    print(f"Rows backfilled: {needs_backfill.sum():,}", file=sys.stderr)
    print(f"Time: {total_time:.1f}s", file=sys.stderr)
    print(f"Output: {out_path} ({file_mb:.1f} MB)", file=sys.stderr)

    # FY2024 v2 coverage after backfill
    v4_reloaded = pd.read_parquet(out_path)
    fy24 = v4_reloaded[v4_reloaded["fiscal_year"] == 2024]
    irs_fy24 = fy24[fy24["submitted_on"].notna()]
    print(f"\nFY2024 IRS-sourced cash coverage after backfill:", file=sys.stderr)
    pct = 100 * irs_fy24["cash_non_interest_bearing"].notna().sum() / len(irs_fy24) if len(irs_fy24) > 0 else 0
    print(f"  {pct:.1f}% (was 15.1%)", file=sys.stderr)


if __name__ == "__main__":
    main()
