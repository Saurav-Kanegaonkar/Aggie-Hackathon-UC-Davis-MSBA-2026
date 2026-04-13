#!/usr/bin/env python3
"""Enrich v2 panel with NTEE codes from IRS Business Master File.

Usage:
    python parsing/enrich_ntee.py

Reads:
    raw_data/bmf/eo*.csv           (IRS BMF region extracts)
    data/processed/panel_990_extended_v2.parquet

Writes:
    data/processed/panel_990_extended_v3.parquet
"""

import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BMF_DIR = ROOT / "raw_data" / "bmf"
PROCESSED = ROOT / "data" / "processed"

NTEE_MAJOR_NAMES = {
    "A": "Arts, Culture & Humanities",
    "B": "Education",
    "C": "Environment",
    "D": "Animal-Related",
    "E": "Health",
    "F": "Mental Health & Crisis Intervention",
    "G": "Diseases, Disorders & Medical Disciplines",
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
    "T": "Philanthropy, Voluntarism & Grantmaking",
    "U": "Science & Technology",
    "V": "Social Science",
    "W": "Public & Societal Benefit",
    "X": "Religion-Related",
    "Y": "Mutual & Membership Benefit",
    "Z": "Unknown & Unclassified",
}


def load_bmf():
    """Load all BMF region CSVs into a single EIN → NTEE_CD lookup."""
    bmf_files = sorted(BMF_DIR.glob("eo*.csv"))
    if not bmf_files:
        print("ERROR: No BMF files found in raw_data/bmf/", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {len(bmf_files)} BMF files...", file=sys.stderr)
    frames = []
    for f in bmf_files:
        chunk = pd.read_csv(f, usecols=["EIN", "NTEE_CD"], dtype=str)
        frames.append(chunk)
        print(f"  {f.name}: {len(chunk):,} rows", file=sys.stderr)

    bmf = pd.concat(frames, ignore_index=True)
    bmf.rename(columns={"EIN": "ein", "NTEE_CD": "ntee_code"}, inplace=True)

    # Drop rows without NTEE
    bmf = bmf[bmf["ntee_code"].notna()].copy()

    # Dedupe — keep first occurrence per EIN
    bmf.drop_duplicates(subset=["ein"], keep="first", inplace=True)

    # Derive major category
    bmf["ntee_major_category"] = bmf["ntee_code"].str[0].str.upper()
    bmf["ntee_major_category_name"] = bmf["ntee_major_category"].map(NTEE_MAJOR_NAMES)

    # Coerce to string dtype
    for col in ["ein", "ntee_code", "ntee_major_category", "ntee_major_category_name"]:
        bmf[col] = bmf[col].astype("string")

    print(f"  BMF lookup: {len(bmf):,} unique EINs with NTEE codes", file=sys.stderr)
    return bmf


def main():
    t0 = time.time()

    bmf = load_bmf()

    # Load v2 panel
    print("Loading v2 panel...", file=sys.stderr)
    panel = pd.read_parquet(PROCESSED / "panel_990_extended_v2.parquet")
    print(f"  v2 panel: {len(panel):,} rows, {panel['ein'].nunique():,} EINs", file=sys.stderr)

    # Left join on EIN
    print("Joining NTEE codes...", file=sys.stderr)
    panel = panel.merge(
        bmf[["ein", "ntee_code", "ntee_major_category", "ntee_major_category_name"]],
        on="ein",
        how="left",
    )

    # Match rate
    panel_eins = panel["ein"].nunique()
    matched_eins = panel[panel["ntee_code"].notna()]["ein"].nunique()
    print(f"  NTEE match rate: {matched_eins:,} / {panel_eins:,} EINs ({100*matched_eins/panel_eins:.1f}%)", file=sys.stderr)

    # Enforce string dtype on new columns
    for col in ["ntee_code", "ntee_major_category", "ntee_major_category_name"]:
        panel[col] = panel[col].astype("string")

    # Write v3
    out_path = PROCESSED / "panel_990_extended_v3.parquet"
    panel.to_parquet(out_path, index=False, engine="pyarrow", compression="snappy")
    file_mb = out_path.stat().st_size / (1024 * 1024)

    elapsed = time.time() - t0
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"v3 panel written: {out_path}", file=sys.stderr)
    print(f"  Rows: {len(panel):,}", file=sys.stderr)
    print(f"  Columns: {len(panel.columns)}", file=sys.stderr)
    print(f"  File size: {file_mb:.1f} MB", file=sys.stderr)
    print(f"  Time: {elapsed:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
