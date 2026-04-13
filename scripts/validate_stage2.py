"""
Quick validation of Stage 2 output.
Usage: python scripts/validate_stage2.py
"""
import sys
from pathlib import Path
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parents[1]

def main():
    stage1_path = ROOT / "outputs" / "stage1" / "scored_rows.parquet"
    stage2_path = ROOT / "outputs" / "stage2" / "scored_rows_enriched.parquet"

    stage1 = pd.read_parquet(stage1_path)
    stage2 = pd.read_parquet(stage2_path)

    print(f"Stage 1 rows: {len(stage1):,}")
    print(f"Stage 2 rows: {len(stage2):,}")
    assert len(stage2) == len(stage1), f"Row count mismatch: {len(stage2)} != {len(stage1)}"

    # Check (ein, fiscal_year) identity preserved
    s1_keys = set(zip(stage1["ein"].astype(str), stage1["fiscal_year"].astype(str)))
    s2_keys = set(zip(stage2["ein"].astype(str), stage2["fiscal_year"].astype(str)))
    assert s1_keys == s2_keys, f"(ein, fiscal_year) mismatch: {len(s1_keys - s2_keys)} dropped, {len(s2_keys - s1_keys)} added"
    print("(ein, fiscal_year) identity: OK")

    # Required Stage 2 fields
    required = [
        "largest_revenue_source", "largest_revenue_source_pct", "gov_dependency_pct",
        "stress_25pct_post_shock_revenue", "stress_25pct_burn_months", "stress_25pct_severity",
        "stress_50pct_post_shock_revenue", "stress_50pct_burn_months", "stress_50pct_severity",
        "stress_test_status",
        "recovery_analog_eins", "recovery_analog_count", "recovery_analog_evidence",
        "recovery_analog_constraint", "recovery_analog_status",
        "urgency_flag", "urgency_severity", "urgency_reason",
    ]
    missing = [f for f in required if f not in stage2.columns]
    assert not missing, f"Missing fields: {missing}"
    print(f"All {len(required)} required Stage 2 fields present")

    # No infinity values
    for col in stage2.select_dtypes(include=["float64", "float32"]).columns:
        inf_count = stage2[col].isin([float("inf"), float("-inf")]).sum()
        assert inf_count == 0, f"{col} has {inf_count} infinity values"
    print("No infinity values: OK")

    # urgency_flag no nulls
    assert stage2["urgency_flag"].notna().all(), "urgency_flag has nulls"
    print("urgency_flag no nulls: OK")

    # Stress test coverage
    stress_vc = stage2["stress_test_status"].value_counts().to_dict()
    print(f"stress_test_status: {stress_vc}")

    # Urgency summary
    urgent = stage2["urgency_flag"].sum()
    acute = (stage2["urgency_severity"] == "acute").sum()
    print(f"urgency: {urgent:,} flagged, {acute:,} acute")

    # Analog summary
    analog_vc = stage2["recovery_analog_status"].value_counts().to_dict()
    print(f"recovery_analog_status: {analog_vc}")

    found_count = stage2[stage2["recovery_analog_status"] == "found"]["recovery_analog_count"].describe()
    print(f"analogs found - count stats: {found_count.to_dict()}")

    # Shared samples
    shared = stage2[stage2["is_shared_sample"] == True]
    print(f"\nShared samples ({len(shared)} rows):")
    cols = ["ein", "urgency_flag", "stress_test_status", "recovery_analog_status", "recovery_analog_count"]
    print(shared[cols].to_string(index=False))

    print("\n=== VALIDATION PASSED ===")

if __name__ == "__main__":
    main()
