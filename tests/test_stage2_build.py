from pathlib import Path

import pandas as pd
import unittest

from scoring.stage2_build import build_stage2


class Stage2BuildTests(unittest.TestCase):
    def test_build_stage2_hydrates_latest_raw_row_and_computes_stage2_fields(self):
        stage1 = pd.DataFrame(
            [
                {
                    "ein": "100",
                    "fiscal_year": 2024,
                    "state": "CA",
                    "size_bucket": "<500K",
                    "ntee_major_category": "B",
                    "benchmark_status": "ok",
                    "operating_margin": -0.15,
                    "shock_absorption_months": 0.8,
                    "operating_margin_gap": -0.7,
                    "operating_runway_gap": -0.2,
                    "revenue_diversification_gap": -0.1,
                }
            ]
        )
        panel = pd.DataFrame(
            [
                {
                    "ein": "100",
                    "fiscal_year": 2024,
                    "tax_period_end": "2024-06-30",
                    "org_name": "First Filing",
                    "state": "CA",
                    "ntee_major_category": "B",
                    "size_bucket": "<500K",
                    "total_revenue": 1000.0,
                    "total_expenses": 900.0,
                    "cash_non_interest_bearing": 100.0,
                    "savings_temporary_investments": 50.0,
                    "contributions_grants": 700.0,
                    "program_service_revenue": 150.0,
                    "investment_income": 100.0,
                    "other_revenue": 50.0,
                    "government_grants": 200.0,
                    "net_assets_eoy": 80.0,
                    "largest_revenue_source": "stale",
                },
                {
                    "ein": "100",
                    "fiscal_year": 2024,
                    "tax_period_end": "2024-12-31",
                    "org_name": "Latest Filing",
                    "state": "CA",
                    "ntee_major_category": "B",
                    "size_bucket": "<500K",
                    "total_revenue": 1200.0,
                    "total_expenses": 900.0,
                    "cash_non_interest_bearing": 100.0,
                    "savings_temporary_investments": 50.0,
                    "contributions_grants": 800.0,
                    "program_service_revenue": 200.0,
                    "investment_income": 100.0,
                    "other_revenue": 100.0,
                    "government_grants": 240.0,
                    "net_assets_eoy": 80.0,
                },
            ]
        )

        output_path = Path(self._testMethodName).with_suffix(".parquet")
        out = build_stage2(stage1, panel, output_path)

        self.assertTrue(output_path.exists())
        self.assertEqual(len(out), 1)
        self.assertEqual(out.loc[0, "ein"], "100")
        self.assertEqual(out.loc[0, "fiscal_year"], 2024)
        self.assertEqual(out.loc[0, "tax_period_end"], "2024-12-31")
        self.assertEqual(out.loc[0, "org_name"], "Latest Filing")
        self.assertEqual(out.loc[0, "largest_revenue_source"], "contributions")
        self.assertEqual(out.loc[0, "stress_25pct_severity"], "none")
        self.assertEqual(out.loc[0, "stress_50pct_severity"], "moderate")
        self.assertTrue(pd.isna(out.loc[0, "stress_25pct_burn_months"]))
        self.assertAlmostEqual(float(out.loc[0, "stress_50pct_burn_months"]), 18.0)
        self.assertEqual(out.loc[0, "recovery_analog_status"], "none_in_cohort")
        self.assertTrue(bool(out.loc[0, "urgency_flag"]))
        self.assertEqual(out.loc[0, "urgency_severity"], "acute")
        self.assertEqual(
            out.loc[0, "urgency_reason"],
            "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct",
        )
        self.assertEqual(out.loc[0, "gov_dependency_pct"], 0.2)
        output_path.unlink()

    def test_build_stage2_preserves_not_scoreable_edge_case(self):
        stage1 = pd.DataFrame(
            [
                {
                    "ein": "200",
                    "fiscal_year": 2024,
                    "state": "WA",
                    "size_bucket": "500K-2M",
                    "ntee_major_category": "P",
                    "benchmark_status": "not_scoreable",
                    "operating_margin": None,
                    "shock_absorption_months": None,
                    "operating_margin_gap": None,
                    "operating_runway_gap": None,
                    "revenue_diversification_gap": None,
                }
            ]
        )
        panel = pd.DataFrame(
            [
                {
                    "ein": "200",
                    "fiscal_year": 2024,
                    "tax_period_end": "2024-12-31",
                    "org_name": "No Score",
                    "state": "WA",
                    "ntee_major_category": "P",
                    "size_bucket": "500K-2M",
                    "total_revenue": 500.0,
                    "total_expenses": 400.0,
                    "cash_non_interest_bearing": 25.0,
                    "savings_temporary_investments": 25.0,
                    "contributions_grants": 250.0,
                    "program_service_revenue": 200.0,
                    "investment_income": 25.0,
                    "other_revenue": 25.0,
                    "government_grants": 100.0,
                    "net_assets_eoy": 10.0,
                }
            ]
        )

        output_path = Path(self._testMethodName).with_suffix(".parquet")
        out = build_stage2(stage1, panel, output_path)

        self.assertEqual(len(out), 1)
        self.assertEqual(out.loc[0, "stress_test_status"], "not_applicable")
        self.assertEqual(out.loc[0, "recovery_analog_status"], "not_applicable")
        self.assertFalse(bool(out.loc[0, "urgency_flag"]))
        self.assertEqual(out.loc[0, "urgency_severity"], "none")
        self.assertEqual(out.loc[0, "urgency_reason"], "none")
        self.assertEqual(out.loc[0, "gov_dependency_pct"], 0.2)
        output_path.unlink()
