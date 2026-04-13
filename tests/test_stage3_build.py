import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scoring.stage3_build import (
    assign_action_labels,
    build_stage3,
    compute_trend_direction,
    hydrate_memo_fields,
)


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "config" / "schemas" / "stage3_scored_row.schema.json"


def _analog(org_name: str, state: str, metric: str, pre_value: float, post_value: float):
    return {
        "ein": "999999999",
        "org_name": org_name,
        "state": state,
        "pre_window_year": 2018,
        "post_recovery_year": 2023,
        "matched_metric_name": metric,
        "matched_metric_pre_value": pre_value,
        "matched_metric_post_value": post_value,
    }


def _stage2_fixture() -> pd.DataFrame:
    rows = [
        {
            "ein": "100",
            "fiscal_year": 2023,
            "state": "CA",
            "size_bucket": "500K-2M",
            "cohort_level": "size_bucket+state",
            "cohort_key": "500K-2M|CA",
            "cohort_size": 50,
            "benchmark_rule": "2-of-3_5-of-7",
            "reference_org_count": 12,
            "benchmark_status": "ok",
            "operating_margin": 0.10,
            "operating_runway_proxy_months": 8.0,
            "revenue_diversification_index": 0.40,
            "shock_absorption_months": 4.0,
            "resilience_gap": -0.20,
            "benchmark_operating_margin_q75": 0.08,
            "benchmark_operating_runway_q75": 10.0,
            "benchmark_revenue_diversification_q75": 0.35,
            "operating_margin_gap": 0.02,
            "operating_runway_gap": -2.0,
            "revenue_diversification_gap": 0.05,
            "revenue_diversification_index_renormalized": 0.40,
            "confidence_reason": "complete",
            "benchmark_fallback_step": 2,
            "is_shared_sample": True,
            "data_confidence_tier": "High",
            "cohort_confidence_tier": "High",
            "checkpoint1_confidence_tier": "High",
            "largest_revenue_source": "program_revenue",
            "largest_revenue_source_pct": 0.60,
            "gov_dependency_pct": 0.10,
            "stress_25pct_post_shock_revenue": 750000.0,
            "stress_25pct_burn_months": 2.0,
            "stress_25pct_severity": "critical",
            "stress_50pct_post_shock_revenue": 500000.0,
            "stress_50pct_burn_months": 1.0,
            "stress_50pct_severity": "critical",
            "stress_test_status": "computed",
            "recovery_analog_eins": ["999999999"],
            "recovery_analog_count": 1,
            "recovery_analog_evidence": [_analog("Analog Stabilize", "CA", "operating_runway_proxy_months", 1.0, 12.0)],
            "recovery_analog_constraint": "low_runway",
            "recovery_analog_status": "found",
            "urgency_flag": False,
            "urgency_severity": "none",
            "urgency_reason": "none",
        },
        {
            "ein": "100",
            "fiscal_year": 2024,
            "state": "CA",
            "size_bucket": "500K-2M",
            "cohort_level": "size_bucket+state",
            "cohort_key": "500K-2M|CA",
            "cohort_size": 50,
            "benchmark_rule": "2-of-3_5-of-7",
            "reference_org_count": 12,
            "benchmark_status": "ok",
            "operating_margin": 0.20,
            "operating_runway_proxy_months": 6.0,
            "revenue_diversification_index": 0.42,
            "shock_absorption_months": 4.0,
            "resilience_gap": -0.70,
            "benchmark_operating_margin_q75": 0.09,
            "benchmark_operating_runway_q75": 12.0,
            "benchmark_revenue_diversification_q75": 0.30,
            "operating_margin_gap": 0.11,
            "operating_runway_gap": -6.0,
            "revenue_diversification_gap": 0.12,
            "revenue_diversification_index_renormalized": 0.42,
            "confidence_reason": "complete",
            "benchmark_fallback_step": 2,
            "is_shared_sample": True,
            "data_confidence_tier": "High",
            "cohort_confidence_tier": "High",
            "checkpoint1_confidence_tier": "High",
            "largest_revenue_source": "program_revenue",
            "largest_revenue_source_pct": 0.65,
            "gov_dependency_pct": 0.12,
            "stress_25pct_post_shock_revenue": 780000.0,
            "stress_25pct_burn_months": 2.2,
            "stress_25pct_severity": "critical",
            "stress_50pct_post_shock_revenue": 520000.0,
            "stress_50pct_burn_months": 1.1,
            "stress_50pct_severity": "critical",
            "stress_test_status": "computed",
            "recovery_analog_eins": ["999999999"],
            "recovery_analog_count": 1,
            "recovery_analog_evidence": [_analog("Analog Stabilize", "CA", "operating_runway_proxy_months", 1.0, 12.0)],
            "recovery_analog_constraint": "low_runway",
            "recovery_analog_status": "found",
            "urgency_flag": False,
            "urgency_severity": "none",
            "urgency_reason": "none",
        },
        {
            "ein": "200",
            "fiscal_year": 2024,
            "state": "CA",
            "size_bucket": "500K-2M",
            "cohort_level": "size_bucket+state",
            "cohort_key": "500K-2M|CA",
            "cohort_size": 60,
            "benchmark_rule": "2-of-3_5-of-7",
            "reference_org_count": 15,
            "benchmark_status": "ok",
            "operating_margin": 0.50,
            "operating_runway_proxy_months": 30.0,
            "revenue_diversification_index": 0.55,
            "shock_absorption_months": 10.0,
            "resilience_gap": -1.20,
            "benchmark_operating_margin_q75": 0.20,
            "benchmark_operating_runway_q75": 15.0,
            "benchmark_revenue_diversification_q75": 0.25,
            "operating_margin_gap": 0.30,
            "operating_runway_gap": 15.0,
            "revenue_diversification_gap": 0.30,
            "revenue_diversification_index_renormalized": 0.55,
            "confidence_reason": "complete",
            "benchmark_fallback_step": 2,
            "is_shared_sample": True,
            "data_confidence_tier": "High",
            "cohort_confidence_tier": "High",
            "checkpoint1_confidence_tier": "High",
            "largest_revenue_source": "program_revenue",
            "largest_revenue_source_pct": 0.50,
            "gov_dependency_pct": 0.08,
            "stress_25pct_post_shock_revenue": 900000.0,
            "stress_25pct_burn_months": None,
            "stress_25pct_severity": "none",
            "stress_50pct_post_shock_revenue": 700000.0,
            "stress_50pct_burn_months": None,
            "stress_50pct_severity": "none",
            "stress_test_status": "computed",
            "recovery_analog_eins": ["999999998"],
            "recovery_analog_count": 1,
            "recovery_analog_evidence": [_analog("Analog Amplify", "CA", "operating_margin", -0.05, 0.15)],
            "recovery_analog_constraint": "low_margin",
            "recovery_analog_status": "found",
            "urgency_flag": False,
            "urgency_severity": "none",
            "urgency_reason": "none",
        },
        {
            "ein": "300",
            "fiscal_year": 2024,
            "state": "WA",
            "size_bucket": "<500K",
            "cohort_level": "size_bucket+state",
            "cohort_key": "<500K|WA",
            "cohort_size": 80,
            "benchmark_rule": "3-of-3_5-of-7",
            "reference_org_count": 20,
            "benchmark_status": "ok",
            "operating_margin": 0.15,
            "operating_runway_proxy_months": 14.0,
            "revenue_diversification_index": 0.02,
            "shock_absorption_months": 5.0,
            "resilience_gap": -0.10,
            "benchmark_operating_margin_q75": 0.10,
            "benchmark_operating_runway_q75": 12.0,
            "benchmark_revenue_diversification_q75": 0.60,
            "operating_margin_gap": 0.05,
            "operating_runway_gap": 2.0,
            "revenue_diversification_gap": -0.58,
            "revenue_diversification_index_renormalized": 0.02,
            "confidence_reason": "complete",
            "benchmark_fallback_step": 1,
            "is_shared_sample": False,
            "data_confidence_tier": "Medium",
            "cohort_confidence_tier": "Medium",
            "checkpoint1_confidence_tier": "Medium",
            "largest_revenue_source": "contributions",
            "largest_revenue_source_pct": 0.95,
            "gov_dependency_pct": 0.00,
            "stress_25pct_post_shock_revenue": 150000.0,
            "stress_25pct_burn_months": 10.0,
            "stress_25pct_severity": "mild",
            "stress_50pct_post_shock_revenue": 100000.0,
            "stress_50pct_burn_months": 5.0,
            "stress_50pct_severity": "severe",
            "stress_test_status": "computed",
            "recovery_analog_eins": ["999999997"],
            "recovery_analog_count": 1,
            "recovery_analog_evidence": [_analog("Analog Diversify", "WA", "revenue_diversification_index", 0.00, 0.45)],
            "recovery_analog_constraint": "high_concentration_in_volatile_source",
            "recovery_analog_status": "found",
            "urgency_flag": False,
            "urgency_severity": "none",
            "urgency_reason": "none",
        },
        {
            "ein": "400",
            "fiscal_year": 2024,
            "state": "CA",
            "size_bucket": "2M-10M",
            "cohort_level": "size_bucket+state",
            "cohort_key": "2M-10M|CA",
            "cohort_size": 40,
            "benchmark_rule": "2-of-3_5-of-7",
            "reference_org_count": 10,
            "benchmark_status": "insufficient_resilient_refs",
            "operating_margin": -0.20,
            "operating_runway_proxy_months": 1.0,
            "revenue_diversification_index": 0.10,
            "shock_absorption_months": 0.5,
            "resilience_gap": 3.20,
            "benchmark_operating_margin_q75": 0.15,
            "benchmark_operating_runway_q75": 10.0,
            "benchmark_revenue_diversification_q75": 0.40,
            "operating_margin_gap": -0.35,
            "operating_runway_gap": -9.0,
            "revenue_diversification_gap": -0.30,
            "revenue_diversification_index_renormalized": 0.10,
            "confidence_reason": "sparse cohort",
            "benchmark_fallback_step": 2,
            "is_shared_sample": False,
            "data_confidence_tier": "Medium",
            "cohort_confidence_tier": "Low",
            "checkpoint1_confidence_tier": "Medium",
            "largest_revenue_source": "program_revenue",
            "largest_revenue_source_pct": 0.80,
            "gov_dependency_pct": 0.00,
            "stress_25pct_post_shock_revenue": None,
            "stress_25pct_burn_months": None,
            "stress_25pct_severity": None,
            "stress_50pct_post_shock_revenue": None,
            "stress_50pct_burn_months": None,
            "stress_50pct_severity": None,
            "stress_test_status": "not_applicable",
            "recovery_analog_eins": [],
            "recovery_analog_count": 0,
            "recovery_analog_evidence": [],
            "recovery_analog_constraint": None,
            "recovery_analog_status": "not_applicable",
            "urgency_flag": False,
            "urgency_severity": "none",
            "urgency_reason": "none",
        },
    ]
    return pd.DataFrame(rows)


def _panel_fixture() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"ein": "100", "fiscal_year": 2023, "org_name": "Org Stabilize Prior", "total_revenue": 700000.0, "ntee_major_category": "F"},
            {"ein": "100", "fiscal_year": 2024, "org_name": "Org Stabilize", "total_revenue": 800000.0, "ntee_major_category": "F"},
            {"ein": "200", "fiscal_year": 2024, "org_name": "Org Amplify", "total_revenue": 1200000.0, "ntee_major_category": "Q"},
            {"ein": "300", "fiscal_year": 2024, "org_name": "Org Diversify", "total_revenue": 250000.0, "ntee_major_category": "P"},
        ]
    )


class Stage3BuildTests(unittest.TestCase):
    def test_assign_action_labels_matches_contract_rules(self):
        labeled = assign_action_labels(_stage2_fixture())
        labels = dict(zip(labeled["ein"], labeled["action_label"]))
        self.assertEqual(labels["100"], "Stabilize")
        self.assertEqual(labels["200"], "Amplify")
        self.assertEqual(labels["300"], "Diversify")
        self.assertEqual(labels["400"], "Deep Review")

        deep_row = labeled[labeled["ein"] == "400"].iloc[0]
        self.assertEqual(
            deep_row["action_label_rationale"],
            ["deep_review_insufficient_resilient_refs", "deep_review_structural_outlier"],
        )

        stabilize_row = labeled[(labeled["ein"] == "100") & (labeled["fiscal_year"] == 2024)].iloc[0]
        self.assertEqual(
            stabilize_row["action_label_rationale"],
            ["stabilize_default_scoreable", "stabilize_primary_constraint_low_runway"],
        )

    def test_diversify_threshold_uses_calibrated_neg_point_three_cutoff(self):
        fixture = _stage2_fixture()
        base = fixture[fixture["ein"] == "300"].iloc[0].to_dict()

        diversify_row = base | {
            "ein": "301",
            "revenue_diversification_gap": -0.31,
            "stress_25pct_severity": "mild",
            "urgency_severity": "none",
            "operating_margin_gap": 0.05,
        }
        stabilize_row = base | {
            "ein": "302",
            "revenue_diversification_gap": -0.29,
            "stress_25pct_severity": "mild",
            "urgency_severity": "none",
            "operating_margin_gap": 0.05,
        }

        labeled = assign_action_labels(pd.DataFrame([diversify_row, stabilize_row]))
        labels = dict(zip(labeled["ein"], labeled["action_label"]))
        self.assertEqual(labels["301"], "Diversify")
        self.assertEqual(labels["302"], "Stabilize")

    def test_compute_trend_direction_uses_2023_to_2024_join_only(self):
        trended = compute_trend_direction(_stage2_fixture())
        trends = {(row.ein, row.fiscal_year): row.trend_direction for row in trended.itertuples()}
        self.assertEqual(trends[("100", 2023)], "unavailable")
        self.assertEqual(trends[("100", 2024)], "improving")
        self.assertEqual(trends[("200", 2024)], "unavailable")

    def test_hydrate_memo_fields_uses_contract_fallbacks(self):
        stage2_df = _stage2_fixture()[["ein", "fiscal_year"]].copy()
        with tempfile.TemporaryDirectory() as tmp_dir:
            panel_path = Path(tmp_dir) / "panel.parquet"
            _panel_fixture().to_parquet(panel_path, index=False)
            hydrated = hydrate_memo_fields(stage2_df, panel_path)

        matched = hydrated[(hydrated["ein"] == "200") & (hydrated["fiscal_year"] == 2024)].iloc[0]
        self.assertEqual(matched["org_name"], "Org Amplify")
        self.assertEqual(matched["ntee_major_category"], "Q")
        self.assertEqual(matched["total_revenue"], 1200000.0)

        missing = hydrated[(hydrated["ein"] == "400") & (hydrated["fiscal_year"] == 2024)].iloc[0]
        self.assertEqual(missing["org_name"], "unknown")
        self.assertTrue(pd.isna(missing["total_revenue"]))
        self.assertEqual(missing["ntee_major_category"], "unclassified")

    def test_build_stage3_writes_additive_artifact_and_contract_columns(self):
        stage2_df = _stage2_fixture()
        schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": "Stage3Fixture",
            "type": "object",
            "properties": {**{col: {} for col in stage2_df.columns}, **{
                "action_label": {},
                "action_label_rationale": {},
                "memo_text": {},
                "trend_direction": {},
            }},
        }

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            panel_path = tmp / "panel.parquet"
            output_path = tmp / "stage3.parquet"
            schema_path = tmp / "schema.json"
            _panel_fixture().to_parquet(panel_path, index=False)
            schema_path.write_text(json.dumps(schema))

            built = build_stage3(
                stage2_source=stage2_df,
                panel_path=panel_path,
                output_path=output_path,
                schema_path=schema_path,
            )

            self.assertTrue(output_path.exists())
            self.assertEqual(len(built), len(stage2_df))
            self.assertEqual(
                list(built[["ein", "fiscal_year"]].itertuples(index=False, name=None)),
                list(stage2_df[["ein", "fiscal_year"]].itertuples(index=False, name=None)),
            )
            self.assertTrue({"action_label", "action_label_rationale", "memo_text", "trend_direction"}.issubset(built.columns))

            amplify_memo = built[built["ein"] == "200"].iloc[0]["memo_text"]
            self.assertIn("Recommended action: Amplify.", amplify_memo)
            self.assertLessEqual(len(amplify_memo.split()), 250)

    def test_checked_in_stage3_schema_file_exists_and_includes_new_columns(self):
        self.assertTrue(SCHEMA_PATH.exists(), f"Missing schema file: {SCHEMA_PATH}")
        schema = json.loads(SCHEMA_PATH.read_text())
        for column in ["action_label", "action_label_rationale", "memo_text", "trend_direction"]:
            self.assertIn(column, schema["properties"])


if __name__ == "__main__":
    unittest.main()
