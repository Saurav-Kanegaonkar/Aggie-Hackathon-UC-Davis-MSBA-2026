#!/usr/bin/env python3
"""
Stage 3 build orchestrator.
Adds action labels, trend direction, and Capital Stewardship Memos
to the canonical merged Stage 2 output.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
import time

import pandas as pd
import numpy as np

from scoring.stage3_labels import assign_labels
from scoring.stage3_trend import compute_trend
from scoring.stage3_memo import generate_memos

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stage3_build")

STAGE2_PATH = Path("outputs/stage2/scored_rows_enriched.parquet")
PANEL_CANDIDATES = (
    Path("data/processed/panel_990_extended_v4.parquet"),
    Path("Data/panel_990_extended_v4.parquet"),
    Path("data/panel_990_extended_v4.parquet"),
)
OUTPUT_PATH = Path("outputs/stage3/scored_rows_with_actions.parquet")


def resolve_panel_path() -> Path:
    for candidate in PANEL_CANDIDATES:
        if candidate.exists():
            return candidate
    return PANEL_CANDIDATES[0]


def hydrate_memo_fields(df: pd.DataFrame, panel_path: Path) -> pd.DataFrame:
    """Hydrate org_name, total_revenue, ntee_major_category from raw panel.
    Per contract: join on (ein, fiscal_year), fallback rendering for missing."""
    out = df.copy()
    logger.info("Hydrating memo fields from %s", panel_path)

    panel = pd.read_parquet(panel_path)

    # Ensure matching types
    panel["ein"] = panel["ein"].astype(str)
    panel["fiscal_year"] = panel["fiscal_year"].astype(int)
    out["ein"] = out["ein"].astype(str)
    out["fiscal_year"] = out["fiscal_year"].astype(int)

    # Select and deduplicate panel rows
    hydrate_cols = ["ein", "fiscal_year", "org_name", "total_revenue", "ntee_major_category"]
    available_cols = [c for c in hydrate_cols if c in panel.columns]
    panel_sub = panel[available_cols].drop_duplicates(subset=["ein", "fiscal_year"], keep="first")

    # Left join
    out = out.merge(panel_sub, on=["ein", "fiscal_year"], how="left", suffixes=("", "_hydrated"))

    # Apply fallback rendering per contract
    if "org_name" not in out.columns:
        out["org_name"] = "unknown"
    else:
        out["org_name"] = out["org_name"].fillna("unknown")

    if "total_revenue" not in out.columns:
        out["total_revenue"] = np.nan
    # total_revenue fallback is null — already null from left join miss

    if "ntee_major_category" not in out.columns:
        out["ntee_major_category"] = "unclassified"
    else:
        out["ntee_major_category"] = out["ntee_major_category"].fillna("unclassified")

    hydrated_count = out["org_name"].ne("unknown").sum()
    logger.info("Hydrated %d / %d rows with org_name", hydrated_count, len(out))

    return out


def build_stage3(
    stage2_path: Path = STAGE2_PATH,
    panel_path: Path = resolve_panel_path(),
    output_path: Path = OUTPUT_PATH,
) -> pd.DataFrame:
    started = time.perf_counter()

    # Load Stage 2
    logger.info("Loading Stage 2 from %s", stage2_path)
    df = pd.read_parquet(stage2_path)
    logger.info("Stage 2 loaded: %d rows, %d columns", len(df), len(df.columns))

    # Hydrate memo fields
    t = time.perf_counter()
    df = hydrate_memo_fields(df, panel_path)
    logger.info("Hydration completed in %.2fs", time.perf_counter() - t)

    # Assign action labels
    t = time.perf_counter()
    df = assign_labels(df)
    logger.info("Label assignment completed in %.2fs", time.perf_counter() - t)

    # Compute trend direction
    t = time.perf_counter()
    df = compute_trend(df)
    logger.info("Trend computation completed in %.2fs", time.perf_counter() - t)

    # Generate memos
    t = time.perf_counter()
    df = generate_memos(df)
    logger.info("Memo generation completed in %.2fs", time.perf_counter() - t)

    # Drop hydration-only columns that aren't in Stage 2 or Stage 3 schema
    # Keep the 46 Stage 2 columns + 4 new Stage 3 columns
    stage3_new_cols = {"action_label", "action_label_rationale", "memo_text", "trend_direction"}
    hydration_only = {"org_name", "total_revenue", "ntee_major_category"}
    cols_to_drop = [c for c in hydration_only if c in df.columns]
    # Also drop any _hydrated suffix columns from merge
    cols_to_drop += [c for c in df.columns if c.endswith("_hydrated")]
    if cols_to_drop:
        logger.info("Dropping hydration-only columns: %s", cols_to_drop)
        df = df.drop(columns=cols_to_drop)

    # Validate
    assert "action_label" in df.columns, "Missing action_label"
    assert "action_label_rationale" in df.columns, "Missing action_label_rationale"
    assert "memo_text" in df.columns, "Missing memo_text"
    assert "trend_direction" in df.columns, "Missing trend_direction"

    # Check no nulls in action_label
    null_labels = df["action_label"].isna().sum()
    if null_labels > 0:
        raise ValueError(f"{null_labels} rows have null action_label")

    # Write
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    logger.info("Wrote %d rows (%d columns) to %s",
                len(df), len(df.columns), output_path)

    total = time.perf_counter() - started
    logger.info("Stage 3 build completed in %.1fs", total)

    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Fairlight Stage 3.")
    parser.add_argument("--stage2", default=str(STAGE2_PATH))
    parser.add_argument("--panel", default=str(resolve_panel_path()))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    args = parser.parse_args()

    build_stage3(
        stage2_path=Path(args.stage2),
        panel_path=Path(args.panel),
        output_path=Path(args.output),
    )


if __name__ == "__main__":
    main()
