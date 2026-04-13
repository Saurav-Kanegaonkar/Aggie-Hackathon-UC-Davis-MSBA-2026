"""
Stage 1 pipeline entry point.

Deliverables (in order):
  1. Cleaned panel        – Stage 0 preprocessing (filter + dedupe)
  2. Cohort assignment    – 3-level fallback hierarchy
  3. Resilient benchmark  – per-cohort Q75 from persistent top-quartile peers
  4. Resilience gaps      – overall + per metric, normalised by cohort IQR
  5. Confidence tiers     – data + cohort + combined, with reason code

Output: outputs/stage1/scored_rows.parquet
STOP HERE – do not build Stage 2+ in this file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

# Stage 0 preprocessing utilities (locked contract)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from analysis.stage0_contract import (
    filter_stage0_panel,
    dedupe_panel,
    load_contract,
    load_panel,
)
from src.features import compute_metrics
from src.cohorts import assign_size_bucket_series, score_year
from src.scoring import compute_gaps, compute_confidence_tiers, mark_shared_samples

# Ordered output columns (schema-defined fields first, extras appended)
_SCHEMA_COLS = [
    "ein",
    "fiscal_year",
    "state",
    "size_bucket",
    "cohort_level",
    "cohort_key",
    "cohort_size",
    "benchmark_rule",
    "reference_org_count",
    "benchmark_status",
    "operating_margin",
    "operating_runway_proxy_months",
    "revenue_diversification_index",
    "shock_absorption_months",
    "resilience_gap",
    "benchmark_operating_margin_q75",
    "benchmark_operating_runway_q75",
    "benchmark_revenue_diversification_q75",
    "operating_margin_gap",
    "operating_runway_gap",
    "revenue_diversification_gap",
    "revenue_diversification_index_renormalized",
    "confidence_reason",
    "benchmark_fallback_step",
    "is_shared_sample",
    "data_confidence_tier",
    "cohort_confidence_tier",
    "checkpoint1_confidence_tier",
]

_EXTRA_CONTEXT_COLS = [
    "org_name",
    "ntee_code",
    "ntee_major_category",
    "ntee_major_category_name",
    "total_revenue",
    "total_expenses",
    "net_assets_eoy",
    "years_in_window",
    "pct_missing_key_fields",
]


def run(
    input_path: str | Path | None = None,
    output_path: str | Path | None = None,
    contract_path: str | Path | None = None,
) -> pd.DataFrame:
    """
    Execute the full Stage 1 pipeline.

    Parameters
    ----------
    input_path    : path to the parquet/CSV panel (defaults to clean_data/panel_990_extended_v4.parquet)
    output_path   : where to write scored_rows.parquet (defaults to outputs/stage1/scored_rows.parquet)
    contract_path : checkpoint1_contract.json (defaults to config/checkpoint1_contract.json)

    Returns
    -------
    DataFrame written to *output_path*
    """
    # ------------------------------------------------------------------ setup
    contract_path = Path(contract_path or ROOT / "config" / "checkpoint1_contract.json")
    contract = load_contract(contract_path)

    input_path = Path(
        input_path or ROOT / "clean_data" / "panel_990_extended_v4.parquet"
    )
    output_path = Path(output_path or ROOT / "outputs" / "stage1" / "scored_rows.parquet")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[stage1] loading panel from {input_path}")
    raw = load_panel(input_path)
    print(f"[stage1] raw rows: {len(raw):,}")

    # -------------------------------------------------- Stage 0 preprocessing
    filtered = filter_stage0_panel(raw, contract)
    print(f"[stage1] after CA+WA filter: {len(filtered):,}")

    deduped = dedupe_panel(filtered, contract["key_fields"])
    print(f"[stage1] after dedupe (ein+fiscal_year): {len(deduped):,}")

    # ------------------------------------------ metrics + size_bucket for all rows
    panel = compute_metrics(deduped)
    panel["size_bucket"] = assign_size_bucket_series(
        panel["total_revenue"], contract["size_buckets"]
    )
    # Ensure return_type is present (normalised to string "990" etc.)
    if "return_type" not in panel.columns:
        panel["return_type"] = "990"
    else:
        panel["return_type"] = panel["return_type"].fillna("990").astype(str)

    print(f"[stage1] metrics computed, unique EINs: {panel['ein'].nunique():,}")

    # ----------------------------------------------- score each scoring year
    scoring_years = contract["benchmark_window"]["scoring_years"]
    scored_frames: list[pd.DataFrame] = []

    for year in scoring_years:
        print(f"[stage1] scoring fiscal year {year} …")
        sy = score_year(panel, year, contract)
        print(f"  rows: {len(sy):,}")
        scored_frames.append(sy)

    if not scored_frames:
        raise RuntimeError("No scored rows produced – check scoring_years in contract.")

    scored = pd.concat(scored_frames, ignore_index=True)
    print(f"[stage1] total scored rows (pre-gap/tier): {len(scored):,}")

    # ----------------------------------------------- gaps + confidence tiers
    scored = compute_gaps(scored)
    scored = compute_confidence_tiers(scored)
    scored = mark_shared_samples(scored, contract)

    # ------------------------------------------ select + order output columns
    keep = _SCHEMA_COLS + [c for c in _EXTRA_CONTEXT_COLS if c in scored.columns]
    # Drop IQR helper columns (internal use only)
    scored_out = scored[[c for c in keep if c in scored.columns]].copy()

    # Cast types to match schema
    scored_out["ein"] = scored_out["ein"].astype(str)
    scored_out["fiscal_year"] = pd.to_numeric(
        scored_out["fiscal_year"], errors="coerce"
    ).astype("Int64")
    scored_out["cohort_size"] = pd.to_numeric(
        scored_out["cohort_size"], errors="coerce"
    ).astype("Int64")
    scored_out["reference_org_count"] = pd.to_numeric(
        scored_out["reference_org_count"], errors="coerce"
    ).astype("Int64")
    scored_out["benchmark_fallback_step"] = pd.to_numeric(
        scored_out["benchmark_fallback_step"], errors="coerce"
    ).astype("Int64")
    scored_out["is_shared_sample"] = scored_out["is_shared_sample"].fillna(False).astype(bool)

    # ----------------------------------------------------------------- write
    scored_out.to_parquet(output_path, index=False)
    print(f"[stage1] wrote {len(scored_out):,} rows to {output_path}")

    # -------------------------------------------------------- summary stats
    print("\n=== Stage 1 Summary ===")
    print(f"Total rows: {len(scored_out):,}")
    for year in scoring_years:
        n = (scored_out["fiscal_year"] == year).sum()
        print(f"  FY{year}: {n:,}")
    for tier_col in ("checkpoint1_confidence_tier", "data_confidence_tier", "cohort_confidence_tier"):
        if tier_col in scored_out.columns:
            counts = scored_out[tier_col].value_counts(dropna=False)
            print(f"\n{tier_col}:\n{counts.to_string()}")
    if "benchmark_status" in scored_out.columns:
        print(f"\nbenchmark_status:\n{scored_out['benchmark_status'].value_counts(dropna=False).to_string()}")
    if "is_shared_sample" in scored_out.columns:
        n_shared = scored_out["is_shared_sample"].sum()
        print(f"\nshared samples in output: {n_shared}")

    return scored_out


if __name__ == "__main__":
    run()
