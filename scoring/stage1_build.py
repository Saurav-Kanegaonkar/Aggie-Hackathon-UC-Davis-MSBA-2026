#!/usr/bin/env python3
"""
Stage 1 Build — Builder A (feat/task-01-a)
Entry point. Runs Deliverables 1–5 sequentially, writes scored_rows.parquet,
validates against schema and shared samples.
"""

import sys
import os
import json
import logging
import time

import pandas as pd
import numpy as np

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scoring.stage1_clean import clean_panel
from scoring.stage1_cohort import assign_cohorts
from scoring.stage1_benchmark import compute_metrics, build_benchmarks
from scoring.stage1_gap import compute_gaps
from scoring.stage1_confidence import compute_confidence

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stage1_build")

CONTRACT_PATH = "config/checkpoint1_contract.json"
SCHEMA_PATH = "config/schemas/checkpoint1_scored_row.schema.json"
OUTPUT_PATH = "outputs/stage1/scored_rows.parquet"
SHARED_SAMPLES_PATH = "outputs/stage0/checkpoint1_shared_samples.csv"


def load_contract():
    with open(CONTRACT_PATH) as f:
        return json.load(f)


def load_schema():
    with open(SCHEMA_PATH) as f:
        return json.load(f)


def validate_output(scored_df, contract, schema):
    """Run validation checklist before writing."""
    errors = []
    warnings = []

    # 1. Schema conformance: all 28 properties present
    schema_cols = list(schema["properties"].keys())
    missing_cols = [c for c in schema_cols if c not in scored_df.columns]
    if missing_cols:
        errors.append(f"Missing schema columns: {missing_cols}")

    # Required columns never null
    for req in schema.get("required", []):
        nulls = scored_df[req].isna().sum()
        if nulls > 0:
            errors.append(f"Required column '{req}' has {nulls} nulls")

    # 2. Row count sanity
    logger.info(f"Total scored rows: {len(scored_df):,}")
    if len(scored_df) < 50_000:
        warnings.append(f"Row count {len(scored_df)} seems low (expected ~68K)")

    # 3. Shared sample EINs
    shared_eins = contract["shared_sample_selection"]["eins"]
    shared_mask = scored_df["ein"].isin(shared_eins)
    found_eins = scored_df[shared_mask]["ein"].unique()
    missing_eins = set(shared_eins) - set(found_eins)
    if missing_eins:
        warnings.append(f"Missing shared sample EINs: {missing_eins}")
    else:
        logger.info(f"All {len(shared_eins)} shared sample EINs present ✓")

    # Verify is_shared_sample flag
    if "is_shared_sample" in scored_df.columns:
        flagged = scored_df["is_shared_sample"].sum()
        logger.info(f"  is_shared_sample=True: {flagged} rows")

    # 4. Diversification null checks
    pct_cols = [
        "pct_contributions",
        "pct_program_revenue",
        "pct_investment_income",
        "pct_other_revenue",
    ]
    if all(c in scored_df.columns for c in pct_cols):
        all_pct_null = scored_df[pct_cols].isna().all(axis=1)
        div_should_null = all_pct_null & scored_df["revenue_diversification_index"].notna()
        if div_should_null.sum() > 0:
            errors.append(
                f"{div_should_null.sum()} rows have all-null pct_ but non-null diversification"
            )

    # 5. Benchmark Q75 range sanity
    for col, lo, hi in [
        ("benchmark_operating_margin_q75", -5, 5),
        ("benchmark_operating_runway_q75", -1000, 10000),
        ("benchmark_revenue_diversification_q75", -0.5, 1.0),
    ]:
        if col in scored_df.columns:
            vals = scored_df[col].dropna()
            if len(vals) > 0:
                vmin, vmax = vals.min(), vals.max()
                if vmin < lo or vmax > hi:
                    warnings.append(f"{col} range [{vmin:.2f}, {vmax:.2f}] outside expected [{lo}, {hi}]")

    # 6. Confidence tier distribution
    for tier_col in [
        "data_confidence_tier",
        "cohort_confidence_tier",
        "checkpoint1_confidence_tier",
    ]:
        if tier_col in scored_df.columns:
            dist = scored_df[tier_col].value_counts()
            if len(dist) == 0:
                warnings.append(f"{tier_col} is entirely null")
            logger.info(f"  {tier_col}:\n{dist.to_string()}")

    # 7. No null cohort_key
    null_cohorts = scored_df["cohort_key"].isna().sum()
    if null_cohorts > 0:
        errors.append(f"{null_cohorts} scored rows with null cohort_key")

    # Report
    for w in warnings:
        logger.warning(f"VALIDATION WARNING: {w}")
    for e in errors:
        logger.error(f"VALIDATION ERROR: {e}")

    return len(errors) == 0


def main():
    t0 = time.time()
    contract = load_contract()
    schema = load_schema()

    # ── Deliverable 1: Clean panel ──
    logger.info("=" * 60)
    logger.info("DELIVERABLE 1: Cleaning panel")
    logger.info("=" * 60)
    panel = clean_panel()

    # ── Compute metrics on full panel (needed by D3 and D4) ──
    logger.info("=" * 60)
    logger.info("COMPUTING METRICS on full panel")
    logger.info("=" * 60)
    compute_metrics(panel)

    # ── Deliverable 2: Cohort assignment ──
    logger.info("=" * 60)
    logger.info("DELIVERABLE 2: Cohort assignment")
    logger.info("=" * 60)
    scored = assign_cohorts(panel, contract)

    # ── Deliverable 3: Benchmark construction ──
    logger.info("=" * 60)
    logger.info("DELIVERABLE 3: Benchmark construction")
    logger.info("=" * 60)
    scored = build_benchmarks(scored, panel, contract)

    # ── Deliverable 4: Resilience gap ──
    logger.info("=" * 60)
    logger.info("DELIVERABLE 4: Resilience gap")
    logger.info("=" * 60)
    scored = compute_gaps(scored, panel)

    # ── Deliverable 5: Confidence tagging ──
    logger.info("=" * 60)
    logger.info("DELIVERABLE 5: Confidence tagging")
    logger.info("=" * 60)
    scored = compute_confidence(scored, panel)

    # ── Tag shared samples ──
    shared_eins = contract["shared_sample_selection"]["eins"]
    scored["is_shared_sample"] = scored["ein"].isin(shared_eins)

    # ── Select output columns per schema ──
    schema_cols = list(schema["properties"].keys())
    # Keep pct_ columns in the dataframe for validation but don't require them in output
    output_cols = [c for c in schema_cols if c in scored.columns]

    # Add any schema columns that might be missing as null
    for c in schema_cols:
        if c not in scored.columns:
            scored[c] = None
            output_cols.append(c)

    output = scored[schema_cols].copy()

    # ── Validate ──
    logger.info("=" * 60)
    logger.info("VALIDATION")
    logger.info("=" * 60)
    valid = validate_output(scored, contract, schema)

    # ── Print shared samples ──
    logger.info("=" * 60)
    logger.info("SHARED SAMPLE OUTPUTS (11 EINs)")
    logger.info("=" * 60)
    shared = scored[scored["is_shared_sample"]].sort_values(["ein", "fiscal_year"])
    display_cols = [
        "ein",
        "fiscal_year",
        "state",
        "size_bucket",
        "cohort_key",
        "cohort_level",
        "cohort_size",
        "operating_margin",
        "operating_runway_proxy_months",
        "revenue_diversification_index",
        "benchmark_operating_margin_q75",
        "benchmark_operating_runway_q75",
        "benchmark_revenue_diversification_q75",
        "resilience_gap",
        "benchmark_fallback_step",
        "benchmark_status",
        "checkpoint1_confidence_tier",
        "confidence_reason",
    ]
    display_cols = [c for c in display_cols if c in shared.columns]
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)
    pd.set_option("display.max_colwidth", 60)
    for _, row in shared.iterrows():
        logger.info(f"\n  EIN {row['ein']} FY{row['fiscal_year']}:")
        for c in display_cols:
            v = row[c]
            if isinstance(v, float):
                logger.info(f"    {c}: {v:.4f}")
            else:
                logger.info(f"    {c}: {v}")

    # ── Write output ──
    if valid:
        # Ensure types match schema expectations
        output["benchmark_fallback_step"] = output["benchmark_fallback_step"].astype(
            "Int64"
        )
        output["reference_org_count"] = output["reference_org_count"].astype("Int64")
        output["cohort_size"] = output["cohort_size"].astype("Int64")

        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        output.to_parquet(OUTPUT_PATH, index=False)
        logger.info(f"\n✓ Wrote {len(output):,} rows to {OUTPUT_PATH}")
    else:
        logger.error("\n✗ Validation failed — output NOT written. Fix errors above.")
        sys.exit(1)

    elapsed = time.time() - t0
    logger.info(f"Total time: {elapsed:.0f}s")


if __name__ == "__main__":
    main()
