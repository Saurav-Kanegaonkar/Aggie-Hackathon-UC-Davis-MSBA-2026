#!/usr/bin/env python3
"""Cross-validate panel_990.parquet against raw-XML filings_2019.parquet.

Compares total_assets_eoy, total_liabilities_eoy, net_assets_eoy,
and program_service_revenue for all shared EINs in fiscal_year 2018
(since Canton Properties and the 2019 XML corpus cover FY ending in 2018/2019).
"""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"


def main():
    panel = pd.read_parquet(PROCESSED / "panel_990.parquet")
    raw = pd.read_parquet(PROCESSED / "filings_2019.parquet")

    print(f"Panel: {len(panel):,} rows, {panel['ein'].nunique():,} unique EINs", file=sys.stderr)
    print(f"Raw XML: {len(raw):,} rows, {raw['ein'].nunique():,} unique EINs", file=sys.stderr)

    # The raw XML parse covers 2019 filings, which have varying fiscal year ends.
    # Match on EIN + tax_period_end for exact comparison.
    compare_cols = [
        "total_assets_eoy",
        "total_liabilities_eoy",
        "net_assets_eoy",
        "program_service_revenue",
    ]

    # Merge on ein + tax_period_end
    merged = panel.merge(
        raw[["ein", "tax_period_end"] + compare_cols],
        on=["ein", "tax_period_end"],
        how="inner",
        suffixes=("_panel", "_raw"),
    )

    print(f"\nShared EIN+tax_period_end pairs: {len(merged):,}", file=sys.stderr)

    if len(merged) == 0:
        print("ERROR: No overlapping records found. Check EIN formats (leading zeros?).", file=sys.stderr)
        sys.exit(1)

    # Compare each field
    total_checks = 0
    total_matches = 0
    for col in compare_cols:
        panel_col = f"{col}_panel"
        raw_col = f"{col}_raw"

        both_present = merged[[panel_col, raw_col]].dropna()
        matches = (both_present[panel_col] == both_present[raw_col]).sum()
        total = len(both_present)
        total_checks += total
        total_matches += matches
        pct = 100 * matches / total if total > 0 else 0

        print(f"\n  {col}:", file=sys.stderr)
        print(f"    Comparable pairs: {total:,}", file=sys.stderr)
        print(f"    Exact matches: {matches:,} ({pct:.1f}%)", file=sys.stderr)

        if matches < total:
            mismatches = both_present[both_present[panel_col] != both_present[raw_col]]
            print(f"    Mismatches (first 5):", file=sys.stderr)
            for _, row in mismatches.head().iterrows():
                ein = merged.loc[row.name, "ein"]
                print(f"      EIN {ein}: panel={row[panel_col]}, raw={row[raw_col]}", file=sys.stderr)

    overall_pct = 100 * total_matches / total_checks if total_checks > 0 else 0
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Overall match rate: {total_matches:,}/{total_checks:,} ({overall_pct:.1f}%)", file=sys.stderr)

    if overall_pct >= 99:
        print("PASS: Match rate >= 99%. GivingTuesday data is consistent with raw XML parse.", file=sys.stderr)
    else:
        print("WARNING: Match rate < 99%. Investigate discrepancies before proceeding.", file=sys.stderr)


if __name__ == "__main__":
    main()
