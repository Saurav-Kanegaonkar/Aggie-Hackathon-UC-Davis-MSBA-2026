import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scoring.stage4_distress_model import (
    DISTRESS_NUMERIC_FEATURES,
    DISTRESS_CATEGORICAL_FEATURES,
    assign_distress_tiers,
    build_modeling_frame,
    dedupe_panel_by_scoring_year,
    prepare_stage2_scoring_frame,
)


def _panel_fixture() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "ein": "100",
                "fiscal_year": 2018,
                "state": "CA",
                "ntee_major_category": "B",
                "total_revenue": 1_000_000.0,
                "total_expenses": 900_000.0,
                "net_assets_eoy": 400.0,
                "cash_non_interest_bearing": 120.0,
                "savings_temporary_investments": 0.0,
                "contributions_grants": 400_000.0,
                "program_service_revenue": 500_000.0,
                "investment_income": 50_000.0,
                "other_revenue": 50_000.0,
                "pct_contributions": 0.40,
                "pct_program_revenue": 0.50,
                "pct_investment_income": 0.05,
                "pct_other_revenue": 0.05,
                "years_of_data": 6,
            },
            {
                "ein": "100",
                "fiscal_year": 2019,
                "tax_period_end": "2019-06-30",
                "state": "CA",
                "ntee_major_category": "B",
                "total_revenue": 1_200_000.0,
                "total_expenses": 1_000_000.0,
                "net_assets_eoy": 450.0,
                "cash_non_interest_bearing": 150.0,
                "savings_temporary_investments": 50.0,
                "contributions_grants": 300_000.0,
                "program_service_revenue": 700_000.0,
                "investment_income": 100_000.0,
                "other_revenue": 100_000.0,
                "pct_contributions": 0.25,
                "pct_program_revenue": 0.58,
                "pct_investment_income": 0.08,
                "pct_other_revenue": 0.09,
                "years_of_data": 6,
            },
            {
                "ein": "100",
                "fiscal_year": 2020,
                "tax_period_end": "2020-06-30",
                "state": "CA",
                "ntee_major_category": "B",
                "total_revenue": 900_000.0,
                "total_expenses": 1_200_000.0,
                "net_assets_eoy": 200.0,
                "cash_non_interest_bearing": 50.0,
                "savings_temporary_investments": 0.0,
                "contributions_grants": 200_000.0,
                "program_service_revenue": 600_000.0,
                "investment_income": 50_000.0,
                "other_revenue": 50_000.0,
                "pct_contributions": 0.22,
                "pct_program_revenue": 0.67,
                "pct_investment_income": 0.06,
                "pct_other_revenue": 0.05,
                "years_of_data": 6,
            },
            {
                "ein": "200",
                "fiscal_year": 2019,
                "tax_period_end": "2019-06-30",
                "state": "WA",
                "ntee_major_category": "C",
                "total_revenue": 3000000.0,
                "total_expenses": 2500000.0,
                "net_assets_eoy": 700000.0,
                "cash_non_interest_bearing": 500000.0,
                "savings_temporary_investments": 250000.0,
                "contributions_grants": 500000.0,
                "program_service_revenue": 2200000.0,
                "investment_income": 150000.0,
                "other_revenue": 150000.0,
                "pct_contributions": 0.17,
                "pct_program_revenue": 0.73,
                "pct_investment_income": 0.05,
                "pct_other_revenue": 0.05,
                "years_of_data": 5,
            },
            {
                "ein": "200",
                "fiscal_year": 2020,
                "tax_period_end": "2020-06-30",
                "state": "WA",
                "ntee_major_category": "C",
                "total_revenue": 3100000.0,
                "total_expenses": 2600000.0,
                "net_assets_eoy": 800000.0,
                "cash_non_interest_bearing": 550000.0,
                "savings_temporary_investments": 250000.0,
                "contributions_grants": 450000.0,
                "program_service_revenue": 2350000.0,
                "investment_income": 150000.0,
                "other_revenue": 150000.0,
                "pct_contributions": 0.15,
                "pct_program_revenue": 0.76,
                "pct_investment_income": 0.05,
                "pct_other_revenue": 0.04,
                "years_of_data": 5,
            },
        ]
    )


def _stage2_fixture() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"ein": "100", "fiscal_year": 2019},
            {"ein": "200", "fiscal_year": 2020},
        ]
    )


class DistressModelFeatureTests(unittest.TestCase):
    def test_build_modeling_frame_computes_target_and_lagged_features(self):
        modeled = build_modeling_frame(_panel_fixture())

        row_2019 = modeled[(modeled["ein"] == "100") & (modeled["fiscal_year"] == 2019)].iloc[0]
        row_2020 = modeled[(modeled["ein"] == "100") & (modeled["fiscal_year"] == 2020)].iloc[0]

        self.assertEqual(row_2019["size_bucket"], "500K-2M")
        self.assertAlmostEqual(row_2019["operating_margin"], (1_200_000.0 - 1_000_000.0) / 1_200_000.0, places=6)
        self.assertAlmostEqual(
            row_2019["shock_absorption_months"],
            (150.0 + 50.0) / (1_000_000.0 / 12.0),
            places=6,
        )
        self.assertAlmostEqual(row_2019["operating_margin_lagged_1y"], (1_000_000.0 - 900_000.0) / 1_000_000.0, places=6)
        self.assertAlmostEqual(row_2019["revenue_growth_yoy"], (1_200_000.0 - 1_000_000.0) / 1_000_000.0, places=6)
        self.assertEqual(row_2019["target"], 1)
        self.assertTrue(pd.isna(row_2020["target"]))

    def test_dedupe_panel_by_scoring_year_keeps_latest_tax_period_end(self):
        panel = pd.concat(
            [
                _panel_fixture(),
                pd.DataFrame(
                    [
                        {
                            "ein": "100",
                            "fiscal_year": 2019,
                            "tax_period_end": "2019-12-31",
                            "state": "CA",
                            "ntee_major_category": "B",
                            "total_revenue": 1_400_000.0,
                            "total_expenses": 1_050_000.0,
                            "net_assets_eoy": 500.0,
                            "cash_non_interest_bearing": 175.0,
                            "savings_temporary_investments": 75.0,
                            "contributions_grants": 300_000.0,
                            "program_service_revenue": 850_000.0,
                            "investment_income": 150_000.0,
                            "other_revenue": 100_000.0,
                            "pct_contributions": 0.21,
                            "pct_program_revenue": 0.61,
                            "pct_investment_income": 0.11,
                            "pct_other_revenue": 0.07,
                            "years_of_data": 6,
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )

        deduped = dedupe_panel_by_scoring_year(panel)
        row = deduped[(deduped["ein"] == "100") & (deduped["fiscal_year"] == 2019)].iloc[0]
        self.assertEqual(len(deduped[(deduped["ein"] == "100") & (deduped["fiscal_year"] == 2019)]), 1)
        self.assertEqual(str(row["tax_period_end"].date()), "2019-12-31")
        self.assertEqual(row["total_revenue"], 1_400_000.0)

    def test_prepare_stage2_scoring_frame_matches_feature_contract(self):
        scoring = prepare_stage2_scoring_frame(_stage2_fixture(), _panel_fixture())

        self.assertEqual(len(scoring), 2)
        self.assertEqual(scoring["ein"].tolist(), ["100", "200"])
        self.assertEqual(scoring["fiscal_year"].tolist(), [2019, 2020])
        for column in DISTRESS_NUMERIC_FEATURES + DISTRESS_CATEGORICAL_FEATURES:
            self.assertIn(column, scoring.columns)

    def test_assign_distress_tiers_uses_fixed_cutoffs(self):
        probs = pd.Series([0.10, 0.35, 0.70])
        tiers = assign_distress_tiers(probs, medium_cutoff=0.25, high_cutoff=0.60)
        self.assertEqual(tiers.tolist(), ["Low", "Medium", "High"])


if __name__ == "__main__":
    unittest.main()
