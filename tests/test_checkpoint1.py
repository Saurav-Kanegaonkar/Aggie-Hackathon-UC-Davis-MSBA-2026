from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import shutil
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "analysis" / "build_checkpoint1.py"
CONTRACT = ROOT / "config" / "checkpoint1_contract.json"
CANONICAL_OUTPUT_SUFFIX = Path("outputs/stage1/scored_rows.parquet")


def build_fixture_rows() -> list[dict]:
    rows: list[dict] = []
    years = list(range(2017, 2025))

    def add_org(
        ein: str,
        state: str,
        ntee: str | None,
        revenue: float,
        expenses: float,
        net_assets_eoy: float,
        cash: float,
        savings: float,
        pct_contributions: float | None,
        pct_program_revenue: float | None,
        pct_investment_income: float | None,
        pct_other_revenue: float | None,
    ) -> None:
        for year in years:
            rows.append(
                {
                    "ein": ein,
                    "state": state,
                    "submitted_on": "",
                    "tax_period_end": f"{year}-12-31",
                    "fiscal_year": year,
                    "total_revenue": revenue,
                    "total_expenses": expenses,
                    "net_assets_eoy": net_assets_eoy,
                    "cash_non_interest_bearing": cash,
                    "savings_temporary_investments": savings,
                    "contributions_grants": revenue * 0.25,
                    "program_service_revenue": revenue * 0.65,
                    "investment_income": revenue * 0.05,
                    "pct_contributions": pct_contributions,
                    "pct_program_revenue": pct_program_revenue,
                    "pct_investment_income": pct_investment_income,
                    "pct_other_revenue": pct_other_revenue,
                    "ntee_major_category": ntee or "",
                    "return_type": "990",
                }
            )

    add_org("000000001", "CA", "B", 1_200_000, 700_000, 480_000, 200_000, 80_000, 0.25, 0.65, 0.05, 0.05)
    add_org("000000002", "CA", "B", 1_100_000, 1_000_000, 160_000, 40_000, 10_000, 0.25, 0.65, 0.05, 0.05)
    add_org("000000003", "CA", None, 900_000, 850_000, 220_000, 30_000, 5_000, None, 0.55, 0.10, None)
    add_org("000000004", "WA", "P", 2_400_000, 1_700_000, 900_000, 300_000, 120_000, 0.20, 0.70, 0.05, 0.05)
    add_org("000000005", "WA", None, 2_100_000, 1_950_000, 260_000, 60_000, 15_000, 0.30, 0.55, None, 0.15)
    add_org("000000006", "WA", "P", 12_000_000, 10_500_000, 4_500_000, 2_000_000, 700_000, 0.15, 0.75, 0.05, 0.05)
    add_org("000000007", "CA", "B", 600_000, 580_000, 95_000, 20_000, 5_000, 0.35, 0.50, 0.05, 0.10)
    add_org("000000008", "CA", None, 650_000, 640_000, 85_000, 15_000, 5_000, 0.40, 0.45, 0.05, 0.10)
    add_org("000000009", "WA", "P", 3_000_000, 2_500_000, 1_150_000, 250_000, 90_000, 0.10, 0.80, 0.05, 0.05)
    add_org("000000010", "WA", None, 2_900_000, 2_800_000, 310_000, 45_000, 5_000, 0.20, 0.60, 0.10, 0.10)
    add_org("000000011", "CA", "B", 900_000, 850_000, 210_000, 30_000, 5_000, 0.25, 0.60, 0.05, 0.10)

    for row in rows:
        if row["ein"] == "000000011" and row["fiscal_year"] == 2023:
            row["investment_income"] = None
            break

    rows.append(
        {
            "ein": "000000002",
            "state": "CA",
            "submitted_on": "",
            "tax_period_end": "2024-01-31",
            "fiscal_year": 2023,
            "total_revenue": 1_100_000,
            "total_expenses": 1_000_000,
            "net_assets_eoy": "not-a-number",
            "cash_non_interest_bearing": 10_000,
            "savings_temporary_investments": 2_000,
            "contributions_grants": 250_000,
            "program_service_revenue": 700_000,
            "investment_income": 25_000,
            "pct_contributions": 0.25,
            "pct_program_revenue": 0.65,
            "pct_investment_income": 0.05,
            "pct_other_revenue": 0.05,
            "ntee_major_category": "B",
            "return_type": "990",
        }
    )
    rows.append(
        {
            "ein": "000000011",
            "state": "CA",
            "submitted_on": "",
            "tax_period_end": "2024-01-31",
            "fiscal_year": 2023,
            "total_revenue": 900_000,
            "total_expenses": 850_000,
            "net_assets_eoy": "not-a-number",
            "cash_non_interest_bearing": 30_000,
            "savings_temporary_investments": 5_000,
            "contributions_grants": 225_000,
            "program_service_revenue": 585_000,
            "investment_income": 45_000,
            "pct_contributions": 0.25,
            "pct_program_revenue": 0.60,
            "pct_investment_income": 0.05,
            "pct_other_revenue": 0.10,
            "ntee_major_category": "B",
            "return_type": "990",
        }
    )
    rows.append(
        {
            "ein": "000000012",
            "state": "CA",
            "submitted_on": "2026-01-01T00:00:00Z",
            "tax_period_end": "2023-12-31",
            "fiscal_year": 2023,
            "total_revenue": 1_000_000,
            "total_expenses": 900_000,
            "net_assets_eoy": 260_000,
            "cash_non_interest_bearing": 90_000,
            "savings_temporary_investments": 25_000,
            "contributions_grants": 300_000,
            "program_service_revenue": 600_000,
            "investment_income": 25_000,
            "pct_contributions": 0.30,
            "pct_program_revenue": 0.60,
            "pct_investment_income": 0.05,
            "pct_other_revenue": 0.05,
            "ntee_major_category": "B",
            "return_type": "990",
        }
    )
    return rows


class Checkpoint1CliTests(unittest.TestCase):
    def run_cli(self) -> Path:
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)

        input_path = tmp / "panel.csv"
        output_dir = tmp / "outputs" / "stage1"
        pd.DataFrame(build_fixture_rows()).to_csv(input_path, index=False)

        result = subprocess.run(
            [
                sys.executable,
                str(CLI),
                "--input",
                str(input_path),
                "--output-dir",
                str(output_dir),
                "--contract",
                str(CONTRACT),
            ],
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        return output_dir / "scored_rows.parquet"

    def test_checkpoint1_cli_writes_contract_parquet_output(self) -> None:
        output_path = self.run_cli()
        self.assertTrue(output_path.as_posix().endswith(CANONICAL_OUTPUT_SUFFIX.as_posix()))
        self.assertEqual(output_path.parent.name, "stage1")
        self.assertEqual(output_path.name, "scored_rows.parquet")
        self.assertTrue(output_path.exists(), msg=f"Expected canonical parquet output at {output_path}")

        scored = pd.read_parquet(output_path)
        required_columns = {
            "ein",
            "fiscal_year",
            "state",
            "size_bucket",
            "cohort_level",
            "cohort_key",
            "cohort_size",
            "benchmark_rule",
            "reference_org_count",
            "benchmark_status",
            "operating_margin",
            "operating_runway_proxy_months",
            "revenue_diversification_index",
            "resilience_gap",
            "benchmark_operating_margin_q75",
            "benchmark_operating_runway_q75",
            "benchmark_revenue_diversification_q75",
            "operating_margin_gap",
            "operating_runway_gap",
            "revenue_diversification_gap",
            "benchmark_fallback_step",
            "is_shared_sample",
            "confidence_reason",
            "revenue_diversification_index_renormalized",
            "data_confidence_tier",
            "cohort_confidence_tier",
            "checkpoint1_confidence_tier",
        }
        self.assertTrue(required_columns.issubset(set(scored.columns)))
        self.assertGreaterEqual(len(scored), 50)
        self.assertIn(2024, set(scored["fiscal_year"].astype(int)))
        self.assertTrue(pd.api.types.is_bool_dtype(scored["is_shared_sample"]))
        self.assertTrue(pd.api.types.is_integer_dtype(scored["benchmark_fallback_step"]))
        numeric_columns = [
            "operating_margin",
            "operating_runway_proxy_months",
            "revenue_diversification_index",
            "benchmark_operating_margin_q75",
            "benchmark_operating_runway_q75",
            "benchmark_revenue_diversification_q75",
            "operating_margin_gap",
            "operating_runway_gap",
            "revenue_diversification_gap",
            "revenue_diversification_index_renormalized",
            "resilience_gap",
        ]
        for column in numeric_columns:
            self.assertTrue(pd.api.types.is_numeric_dtype(scored[column]), msg=f"{column} should be numeric")
        self.assertTrue(scored["confidence_reason"].notna().any())
        self.assertTrue(scored["benchmark_rule"].notna().any())
        self.assertTrue(scored["benchmark_status"].notna().any())

    def test_diversification_zero_fill_and_shadow_metric(self) -> None:
        output_path = self.run_cli()
        scored = pd.read_parquet(output_path)

        runway_row = scored.loc[
            scored["ein"].astype(str).eq("000000002") & scored["fiscal_year"].astype(int).eq(2023)
        ].iloc[0]
        self.assertAlmostEqual(float(runway_row["operating_runway_proxy_months"]), 1.92, places=6)
        self.assertAlmostEqual(float(runway_row["net_assets_eoy"]), 160_000.0, places=6)

        tie_row = scored.loc[
            scored["ein"].astype(str).eq("000000011") & scored["fiscal_year"].astype(int).eq(2023)
        ].iloc[0]
        self.assertAlmostEqual(float(tie_row["operating_runway_proxy_months"]), 210_000.0 / (850_000.0 / 12.0), places=6)
        self.assertAlmostEqual(float(tie_row["net_assets_eoy"]), 210_000.0, places=6)
        self.assertTrue(pd.isna(tie_row["investment_income"]))

        row = scored.loc[scored["ein"].astype(str).eq("000000003")].iloc[0]
        self.assertTrue(pd.notna(row["revenue_diversification_index"]))
        self.assertTrue(pd.notna(row["revenue_diversification_index_renormalized"]))
        self.assertTrue(pd.notna(row["benchmark_operating_margin_q75"]))
        self.assertTrue(pd.notna(row["benchmark_operating_runway_q75"]))
        self.assertTrue(pd.notna(row["benchmark_revenue_diversification_q75"]))
        self.assertTrue(pd.notna(row["benchmark_fallback_step"]))
        self.assertTrue(pd.notna(row["is_shared_sample"]))
        self.assertTrue(pd.notna(row["confidence_reason"]))
        self.assertNotAlmostEqual(
            float(row["revenue_diversification_index"]),
            float(row["revenue_diversification_index_renormalized"]),
        )


if __name__ == "__main__":
    unittest.main()
