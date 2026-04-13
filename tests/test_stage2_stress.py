import unittest
import math

import pandas as pd

from scoring.stage2_stress import enrich_stress_fields
from scoring.stage2_urgency import enrich_urgency_fields


class Stage2StressTests(unittest.TestCase):
    def test_stress_fields_use_largest_source_tie_break_and_both_shocks(self):
        df = pd.DataFrame(
            [
                {
                    "benchmark_status": "ok",
                    "total_revenue": 1000.0,
                    "total_expenses": 700.0,
                    "cash_non_interest_bearing": 120.0,
                    "savings_temporary_investments": 30.0,
                    "net_assets_eoy": 50.0,
                    "contributions_grants": 250.0,
                    "program_service_revenue": 250.0,
                    "investment_income": 250.0,
                    "other_revenue": 250.0,
                    "government_grants": 40.0,
                }
            ]
        )

        out = enrich_stress_fields(df)

        self.assertEqual(out.loc[0, "largest_revenue_source"], "contributions")
        self.assertEqual(out.loc[0, "largest_revenue_source_pct"], 0.25)
        self.assertEqual(out.loc[0, "gov_dependency_pct"], 0.04)
        self.assertEqual(out.loc[0, "stress_25pct_post_shock_revenue"], 937.5)
        self.assertEqual(out.loc[0, "stress_50pct_post_shock_revenue"], 875.0)
        self.assertTrue(pd.isna(out.loc[0, "stress_25pct_burn_months"]))
        self.assertTrue(pd.isna(out.loc[0, "stress_50pct_burn_months"]))
        self.assertEqual(out.loc[0, "stress_25pct_severity"], "none")
        self.assertEqual(out.loc[0, "stress_50pct_severity"], "none")
        self.assertEqual(out.loc[0, "stress_test_status"], "computed")

    def test_stress_fields_compute_burn_months_and_severity_buckets_without_infinity(self):
        df = pd.DataFrame(
            [
                {
                    "benchmark_status": "ok",
                    "total_revenue": 200.0,
                    "total_expenses": 500.0,
                    "cash_non_interest_bearing": 60.0,
                    "savings_temporary_investments": 40.0,
                    "net_assets_eoy": -10.0,
                    "contributions_grants": 200.0,
                    "program_service_revenue": 0.0,
                    "investment_income": 0.0,
                    "other_revenue": 0.0,
                    "government_grants": 10.0,
                }
            ]
        )

        out = enrich_stress_fields(df)

        self.assertEqual(out.loc[0, "stress_test_status"], "computed")
        self.assertEqual(out.loc[0, "stress_25pct_severity"], "critical")
        self.assertEqual(out.loc[0, "stress_50pct_severity"], "critical")
        self.assertAlmostEqual(out.loc[0, "stress_25pct_burn_months"], 3.4285714286)
        self.assertAlmostEqual(out.loc[0, "stress_50pct_burn_months"], 3.0)
        self.assertTrue(pd.notna(out.loc[0, "stress_25pct_burn_months"]))
        self.assertTrue(pd.notna(out.loc[0, "stress_50pct_burn_months"]))

    def test_stress_fields_cover_moderate_and_severe_buckets(self):
        df = pd.DataFrame(
            [
                {
                    "benchmark_status": "insufficient_resilient_refs",
                    "total_revenue": 1000.0,
                    "total_expenses": 980.0,
                    "cash_non_interest_bearing": 25.0,
                    "savings_temporary_investments": 15.0,
                    "net_assets_eoy": 100.0,
                    "contributions_grants": 250.0,
                    "program_service_revenue": 250.0,
                    "investment_income": 250.0,
                    "other_revenue": 250.0,
                    "government_grants": 0.0,
                }
            ]
        )

        out = enrich_stress_fields(df)

        self.assertEqual(out.loc[0, "stress_25pct_severity"], "moderate")
        self.assertEqual(out.loc[0, "stress_50pct_severity"], "severe")
        self.assertTrue(math.isfinite(out.loc[0, "stress_25pct_burn_months"]))
        self.assertTrue(math.isfinite(out.loc[0, "stress_50pct_burn_months"]))

    def test_stress_fields_respect_not_scoreable_edge_case(self):
        df = pd.DataFrame(
            [
                {
                    "benchmark_status": "not_scoreable",
                    "total_revenue": 1000.0,
                    "total_expenses": 700.0,
                    "cash_non_interest_bearing": 120.0,
                    "savings_temporary_investments": 30.0,
                    "net_assets_eoy": 50.0,
                    "contributions_grants": 250.0,
                    "program_service_revenue": 250.0,
                    "investment_income": 250.0,
                    "other_revenue": 250.0,
                    "government_grants": 0.0,
                }
            ]
        )

        out = enrich_stress_fields(df)

        self.assertEqual(out.loc[0, "stress_test_status"], "not_applicable")
        self.assertTrue(pd.isna(out.loc[0, "stress_25pct_post_shock_revenue"]))
        self.assertTrue(pd.isna(out.loc[0, "stress_50pct_post_shock_revenue"]))
        self.assertTrue(pd.isna(out.loc[0, "stress_25pct_burn_months"]))
        self.assertTrue(pd.isna(out.loc[0, "stress_50pct_burn_months"]))
        self.assertTrue(pd.isna(out.loc[0, "stress_25pct_severity"]))
        self.assertTrue(pd.isna(out.loc[0, "stress_50pct_severity"]))
        self.assertEqual(out.loc[0, "gov_dependency_pct"], 0.0)


class Stage2UrgencyTests(unittest.TestCase):
    def test_urgency_fields_apply_binary_rule_and_machine_readable_reason(self):
        df = pd.DataFrame(
            [
                {
                    "benchmark_status": "insufficient_resilient_refs",
                    "shock_absorption_months": 0.8,
                    "operating_margin": -0.15,
                },
                {
                    "benchmark_status": "ok",
                    "shock_absorption_months": 4.0,
                    "operating_margin": -0.05,
                },
            ]
        )

        out = enrich_urgency_fields(df)

        self.assertTrue(out.loc[0, "urgency_flag"])
        self.assertEqual(out.loc[0, "urgency_severity"], "acute")
        self.assertEqual(
            out.loc[0, "urgency_reason"],
            "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct",
        )
        self.assertFalse(out.loc[1, "urgency_flag"])
        self.assertEqual(out.loc[1, "urgency_severity"], "none")
        self.assertEqual(out.loc[1, "urgency_reason"], "none")

    def test_urgency_fields_clear_not_scoreable_rows(self):
        df = pd.DataFrame(
            [
                {
                    "benchmark_status": "not_scoreable",
                    "shock_absorption_months": 0.1,
                    "operating_margin": -0.5,
                }
            ]
        )

        out = enrich_urgency_fields(df)

        self.assertFalse(out.loc[0, "urgency_flag"])
        self.assertEqual(out.loc[0, "urgency_severity"], "none")
        self.assertEqual(out.loc[0, "urgency_reason"], "none")
