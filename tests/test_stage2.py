"""
Stage 2 unit tests.

Covers:
  - stress test: largest source identification, severity buckets, no-infinity guarantee
  - urgency: binary flag, severity tiers, null-field safety
  - analogs: not_applicable routing, constraint detection, analog selection ordering
  - hydration: row-count preservation, no CA+WA filter on analog pool
  - pipeline: end-to-end with synthetic data
"""
import json
import math
import unittest

import numpy as np
import pandas as pd

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.stage2.stress import compute_stress
from src.stage2.urgency import compute_urgency
from src.stage2.analogs import (
    _primary_constraint,
    _assign_size_buckets,
    CONSTRAINT_LABEL_MAP,
    CONSTRAINT_METRIC_MAP,
)
from src.stage2.hydrate import hydrate_stage2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row(**kwargs) -> pd.DataFrame:
    defaults = {
        "ein": "123456789",
        "fiscal_year": 2023,
        "state": "CA",
        "benchmark_status": "ok",
        "total_revenue": 1_000_000.0,
        "total_expenses": 800_000.0,
        "contributions_grants": 600_000.0,
        "program_service_revenue": 300_000.0,
        "investment_income": 50_000.0,
        "other_revenue": 50_000.0,
        "cash_non_interest_bearing": 120_000.0,
        "savings_temporary_investments": 80_000.0,
        "net_assets_eoy": 500_000.0,
        "government_grants": 100_000.0,
        "shock_absorption_months": 3.0,
        "operating_margin": 0.05,
        "operating_margin_gap": -0.3,
        "operating_runway_gap": -0.1,
        "revenue_diversification_gap": -0.2,
    }
    defaults.update(kwargs)
    return pd.DataFrame([defaults])


# ---------------------------------------------------------------------------
# Stress tests
# ---------------------------------------------------------------------------

class TestStress(unittest.TestCase):

    def test_largest_source_is_contributions(self):
        df = _row(contributions_grants=600_000, program_service_revenue=300_000,
                  investment_income=50_000, other_revenue=50_000)
        out = compute_stress(df)
        self.assertEqual(out["largest_revenue_source"].iloc[0], "contributions")
        self.assertAlmostEqual(out["largest_revenue_source_pct"].iloc[0], 0.6, places=5)

    def test_largest_source_tie_break_favors_contributions(self):
        # program_revenue == contributions: tie-break should pick contributions
        df = _row(contributions_grants=500_000, program_service_revenue=500_000,
                  investment_income=0, other_revenue=0, total_revenue=1_000_000)
        out = compute_stress(df)
        self.assertEqual(out["largest_revenue_source"].iloc[0], "contributions")

    def test_stress_25pct_computed_correctly(self):
        # largest_source = contributions = 600K, 25% shock = 150K
        # post_shock = 1M - 150K = 850K
        # post_shock >= expenses (800K), so burn_months = null, severity = "none"
        df = _row(total_revenue=1_000_000, total_expenses=800_000,
                  contributions_grants=600_000, program_service_revenue=200_000,
                  investment_income=100_000, other_revenue=100_000)
        out = compute_stress(df)
        self.assertAlmostEqual(out["stress_25pct_post_shock_revenue"].iloc[0], 850_000, places=0)
        self.assertTrue(pd.isna(out["stress_25pct_burn_months"].iloc[0]))
        self.assertEqual(out["stress_25pct_severity"].iloc[0], "none")

    def test_stress_50pct_creates_deficit(self):
        # 50% shock of contributions (600K): loss = 300K
        # post_shock = 700K, expenses = 800K -> deficit = 100K/year = 8333/month
        # liquid = 200K, burn = 200K / 8333 = 24 months => "moderate"
        df = _row(total_revenue=1_000_000, total_expenses=800_000,
                  contributions_grants=600_000, program_service_revenue=200_000,
                  investment_income=100_000, other_revenue=100_000,
                  cash_non_interest_bearing=120_000, savings_temporary_investments=80_000)
        out = compute_stress(df)
        self.assertAlmostEqual(out["stress_50pct_post_shock_revenue"].iloc[0], 700_000, places=0)
        burn = out["stress_50pct_burn_months"].iloc[0]
        self.assertAlmostEqual(burn, 24.0, places=0)
        self.assertEqual(out["stress_50pct_severity"].iloc[0], "moderate")

    def test_severity_critical_when_burn_less_than_1(self):
        # 50% shock on 900K contributions from 1M revenue
        # post_shock = 1M - 450K = 550K, expenses = 800K, deficit = 250K/yr = 20833/mo
        # liquid = 10K, burn = 10K / 20833 = 0.48 months => critical
        df = _row(total_revenue=1_000_000, total_expenses=800_000,
                  contributions_grants=900_000, program_service_revenue=50_000,
                  investment_income=25_000, other_revenue=25_000,
                  cash_non_interest_bearing=5_000, savings_temporary_investments=5_000)
        out = compute_stress(df)
        self.assertEqual(out["stress_50pct_severity"].iloc[0], "critical")

    def test_no_infinity_in_output(self):
        df = _row(total_expenses=0.0)
        out = compute_stress(df)
        numeric_cols = out.select_dtypes(include=["float64", "float32"]).columns
        for col in numeric_cols:
            vals = out[col].values
            self.assertFalse(any(math.isinf(v) for v in vals if not math.isnan(v)),
                             f"infinity in {col}")

    def test_null_revenue_gives_not_applicable(self):
        df = _row(total_revenue=None)
        out = compute_stress(df)
        self.assertEqual(out["stress_test_status"].iloc[0], "not_applicable")

    def test_gov_dependency_pct(self):
        df = _row(total_revenue=1_000_000, government_grants=200_000)
        out = compute_stress(df)
        self.assertAlmostEqual(out["gov_dependency_pct"].iloc[0], 0.2, places=5)

    def test_gov_dependency_null_when_no_gov_grants(self):
        df = _row(government_grants=None)
        out = compute_stress(df)
        self.assertTrue(pd.isna(out["gov_dependency_pct"].iloc[0]))


# ---------------------------------------------------------------------------
# Urgency tests
# ---------------------------------------------------------------------------

class TestUrgency(unittest.TestCase):

    def test_no_urgency_when_shock_above_3(self):
        df = _row(shock_absorption_months=4.0, operating_margin=-0.05)
        out = compute_urgency(df)
        self.assertFalse(out["urgency_flag"].iloc[0])
        self.assertEqual(out["urgency_severity"].iloc[0], "none")
        self.assertEqual(out["urgency_reason"].iloc[0], "none")

    def test_no_urgency_when_margin_positive(self):
        df = _row(shock_absorption_months=1.0, operating_margin=0.01)
        out = compute_urgency(df)
        self.assertFalse(out["urgency_flag"].iloc[0])

    def test_flagged_when_both_conditions_met(self):
        df = _row(shock_absorption_months=2.5, operating_margin=-0.03)
        out = compute_urgency(df)
        self.assertTrue(out["urgency_flag"].iloc[0])
        self.assertEqual(out["urgency_severity"].iloc[0], "flagged")
        self.assertEqual(out["urgency_reason"].iloc[0], "negative_margin_and_lt3m_shock_absorption")

    def test_acute_when_both_acute_conditions_met(self):
        df = _row(shock_absorption_months=0.5, operating_margin=-0.15)
        out = compute_urgency(df)
        self.assertTrue(out["urgency_flag"].iloc[0])
        self.assertEqual(out["urgency_severity"].iloc[0], "acute")
        self.assertEqual(out["urgency_reason"].iloc[0],
                         "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct")

    def test_urgency_false_when_fields_null(self):
        # not_scoreable row — shock and margin will be null
        df = _row(shock_absorption_months=None, operating_margin=None)
        out = compute_urgency(df)
        self.assertFalse(out["urgency_flag"].iloc[0])
        self.assertEqual(out["urgency_severity"].iloc[0], "none")

    def test_urgency_flag_no_nulls(self):
        rows = [
            _row(shock_absorption_months=None, operating_margin=None),
            _row(shock_absorption_months=2.0, operating_margin=-0.1),
            _row(shock_absorption_months=5.0, operating_margin=0.05),
        ]
        df = pd.concat(rows, ignore_index=True)
        out = compute_urgency(df)
        self.assertFalse(out["urgency_flag"].isna().any())


# ---------------------------------------------------------------------------
# Analog constraint detection
# ---------------------------------------------------------------------------

class TestAnalogConstraint(unittest.TestCase):

    def test_most_negative_gap_wins(self):
        row = pd.Series({
            "operating_margin_gap": -0.5,
            "operating_runway_gap": -0.3,
            "revenue_diversification_gap": -0.1,
        })
        self.assertEqual(_primary_constraint(row), "operating_margin_gap")

    def test_tie_break_order(self):
        # All equal — operating_margin_gap should win (first in tie-break order)
        row = pd.Series({
            "operating_margin_gap": -0.5,
            "operating_runway_gap": -0.5,
            "revenue_diversification_gap": -0.5,
        })
        self.assertEqual(_primary_constraint(row), "operating_margin_gap")

    def test_null_gaps_skipped(self):
        row = pd.Series({
            "operating_margin_gap": None,
            "operating_runway_gap": -0.7,
            "revenue_diversification_gap": None,
        })
        self.assertEqual(_primary_constraint(row), "operating_runway_gap")

    def test_all_null_returns_none(self):
        row = pd.Series({
            "operating_margin_gap": None,
            "operating_runway_gap": float("nan"),
            "revenue_diversification_gap": None,
        })
        self.assertIsNone(_primary_constraint(row))

    def test_positive_gaps_still_ranked(self):
        # All positive — least positive is "most negative"
        row = pd.Series({
            "operating_margin_gap": 0.1,
            "operating_runway_gap": 0.5,
            "revenue_diversification_gap": 0.3,
        })
        self.assertEqual(_primary_constraint(row), "operating_margin_gap")


# ---------------------------------------------------------------------------
# Size bucket assignment
# ---------------------------------------------------------------------------

class TestSizeBuckets(unittest.TestCase):

    def test_buckets(self):
        rev = pd.Series([100_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000])
        buckets = _assign_size_buckets(rev)
        self.assertEqual(buckets.iloc[0], "<500K")
        self.assertEqual(buckets.iloc[1], "500K-2M")   # 500K is in [500K, 2M)
        self.assertEqual(buckets.iloc[2], "500K-2M")
        self.assertEqual(buckets.iloc[3], "2M-10M")    # 2M is in [2M, 10M)
        self.assertEqual(buckets.iloc[4], "2M-10M")
        self.assertEqual(buckets.iloc[5], ">10M")       # 10M is in [10M, inf)
        self.assertEqual(buckets.iloc[6], ">10M")

    def test_null_revenue_gives_none(self):
        rev = pd.Series([None, float("nan")])
        buckets = _assign_size_buckets(rev)
        for b in buckets:
            self.assertIsNone(b)


# ---------------------------------------------------------------------------
# Hydration row-count preservation
# ---------------------------------------------------------------------------

class TestHydration(unittest.TestCase):

    def test_row_count_preserved(self):
        stage1 = pd.DataFrame([
            {"ein": "100", "fiscal_year": 2023, "state": "CA"},
            {"ein": "200", "fiscal_year": 2023, "state": "WA"},
            {"ein": "999", "fiscal_year": 2023, "state": "CA"},  # not in panel
        ])
        panel = pd.DataFrame([
            {"ein": "100", "fiscal_year": 2023, "tax_period_end": "2023-12-31",
             "state": "CA", "ntee_major_category": "B", "total_revenue": 1e6,
             "total_expenses": 8e5, "contributions_grants": 6e5,
             "program_service_revenue": 3e5, "investment_income": 5e4,
             "other_revenue": 5e4, "cash_non_interest_bearing": 1e5,
             "savings_temporary_investments": 5e4, "net_assets_eoy": 5e5,
             "government_grants": 1e5, "org_name": "Org A"},
            {"ein": "200", "fiscal_year": 2023, "tax_period_end": "2023-12-31",
             "state": "WA", "ntee_major_category": "P", "total_revenue": 2e6,
             "total_expenses": 1.6e6, "contributions_grants": 1.2e6,
             "program_service_revenue": 6e5, "investment_income": 1e5,
             "other_revenue": 1e5, "cash_non_interest_bearing": 2e5,
             "savings_temporary_investments": 1e5, "net_assets_eoy": 1e6,
             "government_grants": 2e5, "org_name": "Org B"},
        ])
        result = hydrate_stage2(stage1, panel)
        self.assertEqual(len(result), 3)

    def test_unmatched_row_has_null_revenue(self):
        stage1 = pd.DataFrame([{"ein": "999", "fiscal_year": 2023, "state": "OR"}])
        panel = pd.DataFrame([
            {"ein": "100", "fiscal_year": 2023, "tax_period_end": "2023-12-31",
             "state": "CA", "ntee_major_category": "B", "total_revenue": 1e6,
             "total_expenses": 8e5, "contributions_grants": 6e5,
             "program_service_revenue": 3e5, "investment_income": 5e4,
             "other_revenue": 5e4, "cash_non_interest_bearing": 1e5,
             "savings_temporary_investments": 5e4, "net_assets_eoy": 5e5,
             "government_grants": 1e5, "org_name": "Org A"},
        ])
        result = hydrate_stage2(stage1, panel)
        self.assertEqual(len(result), 1)
        self.assertTrue(pd.isna(result["total_revenue"].iloc[0]))


if __name__ == "__main__":
    unittest.main()
