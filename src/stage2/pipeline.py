"""
Stage 2 pipeline orchestrator.

Loads canonical Stage 1 output (outputs/stage1/scored_rows.parquet),
hydrates with raw financial inputs, runs stress/analogs/urgency modules,
and writes outputs/stage2/scored_rows_enriched.parquet.

Usage:
  python -m src.stage2.pipeline
  python src/stage2/pipeline.py [--stage1 PATH] [--panel PATH] [--output-dir DIR]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

# Allow running from repo root without installing package
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.stage2.hydrate import load_national_panel, hydrate_stage2, PANEL_PATH
from src.stage2.stress import compute_stress
from src.stage2.analogs import build_analog_pool, compute_analogs
from src.stage2.urgency import compute_urgency

STAGE1_PATH = _ROOT / "outputs" / "stage1" / "scored_rows.parquet"
DEFAULT_OUTPUT_DIR = _ROOT / "outputs" / "stage2"


def run_pipeline(
    stage1_path: Path = STAGE1_PATH,
    panel_path: Path = PANEL_PATH,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> pd.DataFrame:
    t0 = time.time()

    # 1. Load Stage 1 (canonical row universe)
    print(f"[stage2] Loading Stage 1: {stage1_path}")
    stage1 = pd.read_parquet(stage1_path)
    print(f"[stage2] Stage 1 rows: {len(stage1):,}  columns: {len(stage1.columns)}")

    # 2. Load national panel and hydrate
    print(f"[stage2] Loading national panel: {panel_path}")
    panel = load_national_panel(panel_path)
    print(f"[stage2] Panel rows (deduped): {len(panel):,}")

    print("[stage2] Hydrating Stage 1 with raw financial fields...")
    enriched = hydrate_stage2(stage1, panel)
    print(f"[stage2] After hydration: {len(enriched):,} rows (must equal Stage 1 count)")
    assert len(enriched) == len(stage1), "Row count changed during hydration"

    # 3. Stress test
    print("[stage2] Computing stress tests...")
    enriched = compute_stress(enriched)
    print(f"[stage2] stress_test_status: {enriched['stress_test_status'].value_counts().to_dict()}")

    # 4. Urgency
    print("[stage2] Computing urgency flags...")
    enriched = compute_urgency(enriched)
    urgent_count = enriched["urgency_flag"].sum()
    acute_count = (enriched["urgency_severity"] == "acute").sum()
    print(f"[stage2] Urgent: {urgent_count:,}  Acute: {acute_count:,}")

    # 5. Recovery analogs (most expensive — national panel pass)
    print("[stage2] Building analog pool (national panel, all years 2014-2024)...")
    analog_pool = build_analog_pool(panel)
    strict_keys = len(analog_pool["strict_lookup"])
    fallback_keys = len(analog_pool["fallback_lookup"])
    print(f"[stage2] Analog pool: {strict_keys} strict keys, {fallback_keys} fallback keys")

    print("[stage2] Assigning recovery analogs to Stage 1 rows...")
    enriched = compute_analogs(enriched, analog_pool)
    status_counts = enriched["recovery_analog_status"].value_counts().to_dict()
    print(f"[stage2] recovery_analog_status: {status_counts}")

    # 6. Write output
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "scored_rows_enriched.parquet"
    enriched.to_parquet(out_path, index=False)
    print(f"[stage2] Written: {out_path}  ({len(enriched):,} rows, {len(enriched.columns)} columns)")

    elapsed = time.time() - t0
    print(f"[stage2] Done in {elapsed:.1f}s")
    return enriched


def _validate(df: pd.DataFrame, expected_rows: int) -> None:
    print("[stage2] Validating output...")

    assert len(df) == expected_rows, f"Row count {len(df)} != expected {expected_rows}"

    # All Stage 2 fields present
    required = [
        "largest_revenue_source", "largest_revenue_source_pct", "gov_dependency_pct",
        "stress_25pct_post_shock_revenue", "stress_25pct_burn_months", "stress_25pct_severity",
        "stress_50pct_post_shock_revenue", "stress_50pct_burn_months", "stress_50pct_severity",
        "stress_test_status",
        "recovery_analog_eins", "recovery_analog_count", "recovery_analog_evidence",
        "recovery_analog_constraint", "recovery_analog_status",
        "urgency_flag", "urgency_severity", "urgency_reason",
    ]
    missing = [f for f in required if f not in df.columns]
    assert not missing, f"Missing Stage 2 fields: {missing}"

    # No infinity values
    numeric_cols = df.select_dtypes(include=["float64", "float32"]).columns
    for col in numeric_cols:
        inf_count = df[col].isin([float("inf"), float("-inf")]).sum()
        assert inf_count == 0, f"Column {col} has {inf_count} infinity values"

    # urgency_flag must be bool, no nulls
    assert df["urgency_flag"].dtype == bool or df["urgency_flag"].dtype == object
    assert df["urgency_flag"].notna().all(), "urgency_flag has nulls"

    # Addendum: recovery_analog_eins must be a list (not a string)
    import json as _json
    sample_found = df[df["recovery_analog_status"] == "found"]
    if len(sample_found) > 0:
        sample_eins = sample_found["recovery_analog_eins"].iloc[0]
        assert isinstance(sample_eins, list), (
            f"recovery_analog_eins must be list, got {type(sample_eins)}"
        )
        _json.dumps(list(sample_eins))  # must be JSON serializable

    print("[stage2] Validation passed.")


def main():
    parser = argparse.ArgumentParser(description="Run Fairlight Stage 2 pipeline")
    parser.add_argument("--stage1", type=Path, default=STAGE1_PATH)
    parser.add_argument("--panel", type=Path, default=PANEL_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    result = run_pipeline(
        stage1_path=args.stage1,
        panel_path=args.panel,
        output_dir=args.output_dir,
    )
    _validate(result, expected_rows=len(pd.read_parquet(args.stage1)))


if __name__ == "__main__":
    main()
