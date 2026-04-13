import unittest

import pandas as pd

from scoring.stage2_analogs import enrich_recovery_analogs


def _panel_row(
    ein: str,
    fiscal_year: int,
    *,
    state: str,
    ntee_major_category: str,
    size_bucket: str,
    org_name: str,
    total_revenue: float,
    operating_margin: float,
) -> dict:
    total_expenses = total_revenue * (1 - operating_margin)
    return {
        "ein": ein,
        "fiscal_year": fiscal_year,
        "state": state,
        "ntee_major_category": ntee_major_category,
        "size_bucket": size_bucket,
        "org_name": org_name,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "cash_non_interest_bearing": 10.0,
        "savings_temporary_investments": 5.0,
        "contributions_grants": total_revenue * 0.5,
        "program_service_revenue": total_revenue * 0.3,
        "investment_income": total_revenue * 0.1,
        "other_revenue": total_revenue * 0.1,
        "operating_margin": operating_margin,
    }


def _years_for_candidate(
    ein: str,
    *,
    state: str,
    ntee_major_category: str,
    size_bucket: str,
    org_name: str,
    pre_value: float,
    post_value: float,
    total_revenue: float,
    years: list[int] | None = None,
) -> list[dict]:
    years = years or [2014, 2016, 2018, 2020, 2021]
    rows = []
    for year in years:
        metric_value = pre_value if year in {2014, 2016, 2018} else post_value
        rows.append(
            _panel_row(
                ein,
                year,
                state=state,
                ntee_major_category=ntee_major_category,
                size_bucket=size_bucket,
                org_name=org_name,
                total_revenue=total_revenue,
                operating_margin=metric_value,
            )
        )
    return rows


class Stage2AnalogTests(unittest.TestCase):
    def test_not_scoreable_rows_are_not_applicable(self):
        scored = pd.DataFrame(
            [
                {
                    "ein": "1",
                    "fiscal_year": 2024,
                    "state": "CA",
                    "size_bucket": "500K-2M",
                    "ntee_major_category": "B",
                    "benchmark_status": "not_scoreable",
                    "operating_margin_gap": -1.0,
                    "operating_runway_gap": -0.5,
                    "revenue_diversification_gap": -0.25,
                }
            ]
        )

        out = enrich_recovery_analogs(scored, pd.DataFrame())

        self.assertEqual(out.loc[0, "recovery_analog_status"], "not_applicable")
        self.assertEqual(out.loc[0, "recovery_analog_count"], 0)
        self.assertEqual(out.loc[0, "recovery_analog_eins"], [])
        self.assertEqual(out.loc[0, "recovery_analog_evidence"], [])

    def test_none_in_cohort_is_returned_when_no_candidate_qualifies(self):
        scored = pd.DataFrame(
            [
                {
                    "ein": "1",
                    "fiscal_year": 2024,
                    "state": "CA",
                    "size_bucket": "500K-2M",
                    "ntee_major_category": "A",
                    "benchmark_status": "ok",
                    "operating_margin_gap": -1.0,
                    "operating_runway_gap": -0.5,
                    "revenue_diversification_gap": -0.25,
                    "total_revenue": 1000.0,
                }
            ]
        )
        panel = pd.DataFrame(
            _years_for_candidate(
                "201",
                state="CA",
                ntee_major_category="B",
                size_bucket="500K-2M",
                org_name="Short History",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=900.0,
                years=[2014, 2015, 2016, 2021],
            )
        )

        out = enrich_recovery_analogs(scored, panel)

        self.assertEqual(out.loc[0, "recovery_analog_status"], "none_in_cohort")
        self.assertEqual(out.loc[0, "recovery_analog_count"], 0)
        self.assertEqual(out.loc[0, "recovery_analog_eins"], [])

    def test_recovery_analogs_prefer_same_state_and_low_margin_on_gap_tie(self):
        scored = pd.DataFrame(
            [
                {
                    "ein": "1",
                    "fiscal_year": 2024,
                    "state": "CA",
                    "size_bucket": "500K-2M",
                    "ntee_major_category": "B",
                    "benchmark_status": "ok",
                    "operating_margin_gap": -0.5,
                    "operating_runway_gap": -0.5,
                    "revenue_diversification_gap": -0.1,
                    "total_revenue": 1000.0,
                }
            ]
        )
        panel = pd.DataFrame(
            _years_for_candidate(
                "101",
                state="CA",
                ntee_major_category="B",
                size_bucket="500K-2M",
                org_name="Same State",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=2000.0,
            )
            + _years_for_candidate(
                "202",
                state="OR",
                ntee_major_category="B",
                size_bucket="500K-2M",
                org_name="Different State",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=1200.0,
            )
        )

        out = enrich_recovery_analogs(scored, panel)

        self.assertEqual(out.loc[0, "recovery_analog_status"], "found")
        self.assertEqual(out.loc[0, "recovery_analog_constraint"], "low_margin")
        self.assertEqual(out.loc[0, "recovery_analog_count"], 2)
        self.assertEqual(out.loc[0, "recovery_analog_eins"], ["101", "202"])
        self.assertEqual(out.loc[0, "recovery_analog_evidence"][0]["ein"], "101")
        self.assertEqual(out.loc[0, "recovery_analog_evidence"][0]["state"], "CA")

    def test_recovery_analogs_fallback_to_size_bucket_and_cap_at_three(self):
        scored = pd.DataFrame(
            [
                {
                    "ein": "1",
                    "fiscal_year": 2024,
                    "state": "CA",
                    "size_bucket": "500K-2M",
                    "ntee_major_category": "A",
                    "benchmark_status": "ok",
                    "operating_margin_gap": -0.6,
                    "operating_runway_gap": -0.2,
                    "revenue_diversification_gap": -0.1,
                    "total_revenue": 1000.0,
                }
            ]
        )
        panel = pd.DataFrame(
            _years_for_candidate(
                "301",
                state="CA",
                ntee_major_category="B",
                size_bucket="500K-2M",
                org_name="Fallback Same State",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=2000.0,
            )
            + _years_for_candidate(
                "302",
                state="OR",
                ntee_major_category="C",
                size_bucket="500K-2M",
                org_name="Fallback One",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=1500.0,
            )
            + _years_for_candidate(
                "303",
                state="NV",
                ntee_major_category="D",
                size_bucket="500K-2M",
                org_name="Fallback Two",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=1200.0,
            )
            + _years_for_candidate(
                "304",
                state="WA",
                ntee_major_category="E",
                size_bucket="500K-2M",
                org_name="Short History",
                pre_value=10.0,
                post_value=100.0,
                total_revenue=1400.0,
                years=[2014, 2015, 2016, 2021],
            )
        )

        out = enrich_recovery_analogs(scored, panel)

        self.assertEqual(out.loc[0, "recovery_analog_status"], "found")
        self.assertEqual(out.loc[0, "recovery_analog_count"], 3)
        self.assertEqual(out.loc[0, "recovery_analog_eins"], ["301", "303", "302"])
        self.assertNotIn("304", out.loc[0, "recovery_analog_eins"])
        self.assertEqual(out.loc[0, "recovery_analog_evidence"][0]["ein"], "301")
        self.assertEqual(out.loc[0, "recovery_analog_evidence"][0]["state"], "CA")
