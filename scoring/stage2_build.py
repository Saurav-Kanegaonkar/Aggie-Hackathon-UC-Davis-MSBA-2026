#!/usr/bin/env python3
"""
Stage 2 build orchestrator.
Enriches the canonical merged Stage 1 output with stress test,
recovery analog, and urgency fields per the ratified Stage 2 contract.
"""

from __future__ import annotations

import argparse
import json
import logging
from io import BytesIO
from pathlib import Path
import subprocess

import pandas as pd
import numpy as np

from scoring.stage2_stress import enrich_stress_fields
from scoring.stage2_analogs import enrich_recovery_analogs
from scoring.stage2_urgency import enrich_urgency_fields

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stage2_build")

# Default Stage 1 source: canonical merged output on main
STAGE1_GIT_REF = "origin/main:outputs/stage1/scored_rows.parquet"
PANEL_PATH = Path("data/processed/panel_990_extended_v4.parquet")
OUTPUT_PATH = Path("outputs/stage2/scored_rows_enriched.parquet")
SCHEMA_PATH = Path("config/schemas/checkpoint2_scored_row.schema.json")


def _load_from_git_ref(ref: str) -> pd.DataFrame:
    """Load a parquet file from a git ref (e.g. origin/main:path/to/file.parquet)."""
    payload = subprocess.check_output(["git", "show", ref])
    return pd.read_parquet(BytesIO(payload))


def _load_stage1(source) -> pd.DataFrame:
    """Load Stage 1 parquet from git ref or file path."""
    if isinstance(source, pd.DataFrame):
        return source.copy()
    if isinstance(source, str) and ":" in source:
        logger.info(f"Loading Stage 1 from git ref: {source}")
        return _load_from_git_ref(source)
    logger.info(f"Loading Stage 1 from file: {source}")
    return pd.read_parquet(source)


def hydrate_raw_inputs(stage1_df: pd.DataFrame, panel_path: Path) -> pd.DataFrame:
    """
    Join raw financial fields from the panel back to scored rows.
    Only for raw-input retrieval — does not change (ein, fiscal_year) identity or row count.
    """
    logger.info(f"Hydrating raw inputs from {panel_path}...")
    panel = pd.read_parquet(panel_path)

    # Dedupe panel to match Stage 1's (ein, fiscal_year) resolution
    panel["ein"] = panel["ein"].astype(str)
    panel["fiscal_year"] = pd.to_numeric(panel["fiscal_year"], errors="coerce").astype("Int64")
    if "tax_period_end" in panel.columns:
        panel = panel.sort_values("tax_period_end", ascending=False)
    panel = panel.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")

    # Columns to hydrate from the raw panel — all fields needed by Stage 2
    # that are not in the Stage 1 schema
    stage1_cols = set(stage1_df.columns)
    hydrate_cols = [
        "total_revenue", "total_expenses", "net_assets_eoy",
        "cash_non_interest_bearing", "savings_temporary_investments",
        "contributions_grants", "program_service_revenue", "investment_income",
        "other_revenue", "government_grants", "org_name",
        "ntee_major_category",
    ]
    needed = [c for c in hydrate_cols if c in panel.columns]
    needed = list(dict.fromkeys(needed))  # dedupe preserving order
    if not needed:
        logger.info("  No columns to hydrate.")
        return stage1_df

    panel_subset = panel[["ein", "fiscal_year"] + needed].copy()

    # Drop any columns from stage1 that we're replacing with panel values
    drop_cols = [c for c in needed if c in stage1_df.columns]
    out = stage1_df.drop(columns=drop_cols, errors="ignore")

    # Preserve order
    out["_order"] = range(len(out))
    out["ein"] = out["ein"].astype(str)
    merged = out.merge(panel_subset, on=["ein", "fiscal_year"], how="left", validate="one_to_one")
    merged = merged.sort_values("_order").drop(columns=["_order"]).reset_index(drop=True)

    assert len(merged) == len(stage1_df), (
        f"Hydration changed row count: {len(stage1_df)} → {len(merged)}"
    )
    logger.info(f"  Hydrated {len(needed)} columns: {needed}")
    return merged


def validate_output(stage1_df: pd.DataFrame, stage2_df: pd.DataFrame, schema: dict):
    """Validate Stage 2 output against contract requirements."""
    # Schema column check
    schema_cols = set(schema["properties"].keys())
    missing = schema_cols - set(stage2_df.columns)
    if missing:
        raise ValueError(f"Stage 2 output missing schema columns: {sorted(missing)}")

    # Row count
    if len(stage1_df) != len(stage2_df):
        raise ValueError(
            f"Row count mismatch: Stage 1={len(stage1_df)}, Stage 2={len(stage2_df)}"
        )

    # (ein, fiscal_year) identity preserved
    s1_ids = stage1_df[["ein", "fiscal_year"]].astype(str).values.tolist()
    s2_ids = stage2_df[["ein", "fiscal_year"]].astype(str).values.tolist()
    if s1_ids != s2_ids:
        raise ValueError("Stage 2 changed (ein, fiscal_year) identity or order")

    # No infinity values
    numeric_cols = stage2_df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        inf_count = np.isinf(stage2_df[col].dropna()).sum()
        if inf_count > 0:
            raise ValueError(f"Infinity values found in {col}: {inf_count}")

    logger.info("Validation passed: schema, row count, identity, no infinities.")


def build_stage2(
    stage1_source=STAGE1_GIT_REF,
    panel_path: Path = PANEL_PATH,
    output_path: Path = OUTPUT_PATH,
    schema_path: Path = SCHEMA_PATH,
) -> pd.DataFrame:
    """Build Stage 2 enriched output."""
    # Load Stage 1
    stage1_df = _load_stage1(stage1_source)
    logger.info(f"Stage 1 loaded: {len(stage1_df):,} rows, {stage1_df['ein'].nunique():,} EINs")

    # Hydrate raw inputs
    hydrated = hydrate_raw_inputs(stage1_df, panel_path)

    # Load full national panel for analog retrieval
    logger.info("Loading full national panel for analog retrieval...")
    full_panel = pd.read_parquet(panel_path)

    # Stage 2 enrichment pipeline
    logger.info("=== Step 1: Stress test ===")
    stressed = enrich_stress_fields(hydrated)

    logger.info("=== Step 2: Recovery analogs ===")
    analoged = enrich_recovery_analogs(stressed, full_panel)

    logger.info("=== Step 3: Urgency ===")
    enriched = enrich_urgency_fields(analoged)

    # Ensure all schema columns present
    schema = json.loads(schema_path.read_text())
    for col in schema["properties"]:
        if col not in enriched.columns:
            enriched[col] = pd.NA

    # Drop hydration-only columns not in schema
    schema_cols = set(schema["properties"].keys())
    extra_cols = [c for c in enriched.columns if c not in schema_cols]
    if extra_cols:
        logger.info(f"Dropping {len(extra_cols)} non-schema columns: {extra_cols[:5]}...")
        enriched = enriched.drop(columns=extra_cols)

    # Validate
    validate_output(stage1_df, enriched, schema)

    # Write
    output_path.parent.mkdir(parents=True, exist_ok=True)
    enriched.to_parquet(output_path, index=False)
    logger.info(f"Wrote {len(enriched):,} rows to {output_path}")

    # Summary diagnostics
    _print_summary(enriched)

    return enriched


def _print_summary(df: pd.DataFrame):
    """Print Stage 2 summary diagnostics."""
    logger.info("=== Stage 2 Summary ===")
    logger.info(f"Total rows: {len(df):,}")
    logger.info(f"stress_test_status:\n{df['stress_test_status'].value_counts().to_string()}")
    logger.info(f"recovery_analog_status:\n{df['recovery_analog_status'].value_counts().to_string()}")
    logger.info(f"urgency_flag:\n{df['urgency_flag'].value_counts().to_string()}")
    logger.info(f"urgency_severity:\n{df['urgency_severity'].value_counts().to_string()}")

    # Stress severity distributions
    for scenario in ["25pct", "50pct"]:
        col = f"stress_{scenario}_severity"
        if col in df.columns:
            logger.info(f"{col}:\n{df[col].value_counts(dropna=False).to_string()}")

    # Shared sample check
    shared = df[df.get("is_shared_sample", pd.Series(False, index=df.index)) == True]
    logger.info(f"Shared sample EINs in output: {shared['ein'].nunique()}")


def main():
    parser = argparse.ArgumentParser(description="Build Fairlight Stage 2 enriched output.")
    parser.add_argument("--stage1", default=STAGE1_GIT_REF,
                        help="Stage 1 source (git ref or file path)")
    parser.add_argument("--panel", default=str(PANEL_PATH),
                        help="Path to panel parquet")
    parser.add_argument("--output", default=str(OUTPUT_PATH),
                        help="Output path for enriched parquet")
    parser.add_argument("--schema", default=str(SCHEMA_PATH),
                        help="Path to Stage 2 schema JSON")
    args = parser.parse_args()

    build_stage2(
        stage1_source=args.stage1,
        panel_path=Path(args.panel),
        output_path=Path(args.output),
        schema_path=Path(args.schema),
    )


if __name__ == "__main__":
    main()
