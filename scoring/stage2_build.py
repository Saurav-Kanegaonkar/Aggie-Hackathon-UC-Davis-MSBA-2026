#!/usr/bin/env python3
"""Stage 2 build orchestration."""

from __future__ import annotations

import argparse
from io import BytesIO
import json
import logging
from pathlib import Path
import subprocess
from typing import Union

import pandas as pd

from scoring.stage2_analogs import enrich_recovery_analogs
from scoring.stage2_hydrate import hydrate_stage2_inputs
from scoring.stage2_stress import enrich_stress_fields
from scoring.stage2_urgency import enrich_urgency_fields

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stage2_build")

STAGE1_GIT_REF = "origin/main:outputs/stage1/scored_rows.parquet"
PANEL_PATH = Path("data/processed/panel_990_extended_v4.parquet")
OUTPUT_PATH = Path("outputs/stage2/scored_rows_enriched.parquet")
SCHEMA_PATH = Path("config/schemas/checkpoint2_scored_row.schema.json")


def load_schema(schema_path: Path = SCHEMA_PATH) -> dict:
    return json.loads(schema_path.read_text())


def _as_frame(value: Union[pd.DataFrame, Path, str]) -> pd.DataFrame:
    if isinstance(value, pd.DataFrame):
        return value.copy()
    if isinstance(value, str) and value.startswith("origin/") and ":" in value:
        payload = subprocess.check_output(["git", "show", value])
        return pd.read_parquet(BytesIO(payload))
    return pd.read_parquet(value)


def validate_stage2_output(stage1_df: pd.DataFrame, stage2_df: pd.DataFrame, schema: dict) -> None:
    schema_cols = set(schema["properties"])
    missing = sorted(c for c in schema_cols if c not in stage2_df.columns)
    if missing:
        raise ValueError(f"Stage 2 output missing schema columns: {missing}")

    if len(stage1_df) != len(stage2_df):
        raise ValueError(
            f"Stage 2 row count {len(stage2_df)} does not match Stage 1 row count {len(stage1_df)}"
        )

    left = stage1_df[["ein", "fiscal_year"]].copy()
    right = stage2_df[["ein", "fiscal_year"]].copy()
    left["ein"] = left["ein"].astype(str)
    right["ein"] = right["ein"].astype(str)
    left["fiscal_year"] = pd.to_numeric(left["fiscal_year"], errors="coerce").astype("Int64")
    right["fiscal_year"] = pd.to_numeric(right["fiscal_year"], errors="coerce").astype("Int64")

    if not left.equals(right):
        raise ValueError("Stage 2 changed authoritative (ein, fiscal_year) row identity/order")


def ensure_schema_columns(df: pd.DataFrame, schema: dict) -> pd.DataFrame:
    out = df.copy()
    for column in schema["properties"]:
        if column not in out.columns:
            out[column] = pd.NA
    return out


def build_stage2(
    stage1_path: Union[pd.DataFrame, Path, str] = STAGE1_GIT_REF,
    panel_path: Union[pd.DataFrame, Path, str] = PANEL_PATH,
    output_path: Path = OUTPUT_PATH,
    schema_path: Path = SCHEMA_PATH,
) -> pd.DataFrame:
    logger.info("Loading Stage 1 parquet source: %s", stage1_path)
    stage1_df = _as_frame(stage1_path)
    logger.info("Loading canonical panel for hydration: %s", panel_path)
    panel_df = _as_frame(panel_path)

    hydrated = hydrate_stage2_inputs(stage1_df, panel_df)
    stressed = enrich_stress_fields(hydrated)
    analoged = enrich_recovery_analogs(stressed, panel_df)
    enriched = enrich_urgency_fields(analoged)

    schema = load_schema(schema_path)
    enriched = ensure_schema_columns(enriched, schema)
    validate_stage2_output(stage1_df, enriched, schema)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    enriched.to_parquet(output_path, index=False)
    logger.info("Wrote %s rows to %s", len(enriched), output_path)
    return enriched


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Fairlight Stage 2 enriched rows.")
    parser.add_argument("--stage1", default=STAGE1_GIT_REF)
    parser.add_argument("--panel", default=str(PANEL_PATH))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    parser.add_argument("--schema", default=str(SCHEMA_PATH))
    args = parser.parse_args()

    build_stage2(
        stage1_path=args.stage1,
        panel_path=Path(args.panel),
        output_path=Path(args.output),
        schema_path=Path(args.schema),
    )


if __name__ == "__main__":
    main()
