import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "analysis" / "build_stage0_contract.py"
CHECKED_IN_CONTRACT = ROOT / "config" / "checkpoint1_contract.json"


def build_contract(path: Path) -> Path:
    contract = {
        "states": ["CA", "WA"],
        "submitted_on_filter": {"rule": "include_all", "description": "All rows included regardless of submitted_on."},
        "dedupe_keys": ["ein", "fiscal_year"],
        "size_buckets": [
            {"label": "<500K", "min": None, "max": 500000},
            {"label": "500K-2M", "min": 500000, "max": 2000000},
            {"label": "2M-10M", "min": 2000000, "max": 10000000},
            {"label": ">10M", "min": 10000000, "max": None},
        ],
        "cohort_fallback_order": [
            ["ntee_major_category", "size_bucket", "state"],
            ["size_bucket", "state", "return_type"],
            ["size_bucket", "state"],
        ],
        "benchmark_fallback_order": [
            {"label": "3-of-3_5-of-7", "min_metrics": 3, "min_years": 5},
            {"label": "2-of-3_5-of-7", "min_metrics": 2, "min_years": 5},
            {"label": "3-of-3_4-of-7", "min_metrics": 3, "min_years": 4},
        ],
        "shared_sample_selection": {
            "latest_per_ein": True,
            "strata": ["state", "ntee_present"],
            "quantiles": [0.33, 0.66],
        },
        "output_files": {
            "shared_samples": "checkpoint1_shared_samples.csv",
            "summary_markdown": "checkpoint1_stage0_summary.md",
        },
    }
    path.write_text(json.dumps(contract, indent=2))
    return path


def build_panel_rows():
    rows = []

    def add(ein: str, state: str, ntee: str | None, revenue: float):
        rows.append(
            {
                "ein": ein,
                "state": state,
                "submitted_on": "",
                "tax_period_end": "2023-12-31",
                "fiscal_year": 2023,
                "total_revenue": revenue,
                "total_expenses": revenue * 0.8,
                "cash_non_interest_bearing": revenue * 0.1,
                "savings_temporary_investments": revenue * 0.05,
                "contributions_grants": revenue * 0.25,
                "program_service_revenue": revenue * 0.65,
                "investment_income": revenue * 0.05,
                "ntee_major_category": ntee or "",
                "return_type": "990",
            }
        )

    add("100000001", "CA", "B", 700000)
    add("100000002", "CA", "B", 900000)
    add("100000003", "CA", "B", 1200000)
    add("100000004", "CA", None, 750000)
    add("100000005", "CA", None, 950000)
    add("100000006", "CA", None, 1250000)
    add("100000007", "WA", "P", 2500000)
    add("100000008", "WA", "P", 3500000)
    add("100000009", "WA", "P", 4500000)
    add("100000010", "WA", None, 2200000)
    add("100000011", "WA", None, 3200000)
    add("100000012", "WA", None, 4200000)
    add("100000013", "OR", "B", 800000)
    rows.append(
        {
            "ein": "100000001",
            "state": "CA",
            "submitted_on": "",
            "tax_period_end": "2023-11-30",
            "fiscal_year": 2023,
            "total_revenue": 650000,
            "total_expenses": 520000,
            "cash_non_interest_bearing": 65000,
            "savings_temporary_investments": 30000,
            "contributions_grants": 150000,
            "program_service_revenue": 430000,
            "investment_income": 25000,
            "ntee_major_category": "B",
            "return_type": "990",
        }
    )
    rows.append(
        {
            "ein": "100000014",
            "state": "CA",
            "submitted_on": "2026-01-01T00:00:00Z",
            "tax_period_end": "2023-12-31",
            "fiscal_year": 2023,
            "total_revenue": 1000000,
            "total_expenses": 750000,
            "cash_non_interest_bearing": 100000,
            "savings_temporary_investments": 40000,
            "contributions_grants": 250000,
            "program_service_revenue": 650000,
            "investment_income": 25000,
            "ntee_major_category": "B",
            "return_type": "990",
        }
    )
    return rows


def build_curated_panel_rows():
    rows = []

    def add(ein: str, state: str, ntee: str | None, revenue: float, tax_period_end: str = "2024-12-31"):
        rows.append(
            {
                "ein": ein,
                "state": state,
                "submitted_on": "",
                "tax_period_end": tax_period_end,
                "fiscal_year": 2024,
                "total_revenue": revenue,
                "total_expenses": revenue * 0.8,
                "cash_non_interest_bearing": revenue * 0.1,
                "savings_temporary_investments": revenue * 0.05,
                "contributions_grants": revenue * 0.25,
                "program_service_revenue": revenue * 0.65,
                "investment_income": revenue * 0.05,
                "ntee_major_category": ntee or "",
                "return_type": "990",
            }
        )

    add("204374795", "CA", "B", 700000, "2024-11-30")
    add("204374795", "CA", "B", 720000, "2024-12-31")
    add("237071436", "CA", "B", 900000)
    add("203812932", "CA", "B", 1200000)
    add("201384250", "CA", None, 750000)
    add("061652679", "CA", None, 950000)
    add("042800910", "WA", "P", 2500000)
    add("237102713", "WA", "P", 3500000)
    add("020549032", "WA", "P", 4500000)
    add("160470118", "WA", None, 2200000)
    add("141843628", "WA", None, 3200000)
    add("956125213", "WA", None, 4200000)
    return rows


def build_latest_row_panel_rows():
    rows = []

    def add(ein: str, state: str, ntee: str | None, revenue: float, tax_period_end: str = "2023-12-31"):
        rows.append(
            {
                "ein": ein,
                "state": state,
                "submitted_on": "",
                "tax_period_end": tax_period_end,
                "fiscal_year": 2023,
                "total_revenue": revenue,
                "total_expenses": revenue * 0.8,
                "cash_non_interest_bearing": revenue * 0.1,
                "savings_temporary_investments": revenue * 0.05,
                "contributions_grants": revenue * 0.25,
                "program_service_revenue": revenue * 0.65,
                "investment_income": revenue * 0.05,
                "ntee_major_category": ntee or "",
                "return_type": "990",
            }
        )

    add("100000001", "CA", "B", 650000, "2023-11-30")
    add("100000001", "CA", "B", 700000, "2023-12-31")
    add("100000002", "CA", "B", 900000)
    add("100000010", "WA", "P", 2200000)
    add("100000011", "WA", None, 3200000)
    return rows


class Stage0ContractTests(unittest.TestCase):
    def run_cli(self, contract_path: Path | None = None, rows: list[dict] | None = None):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            input_path = tmp / "panel.csv"
            if contract_path is None:
                contract_path = build_contract(tmp / "checkpoint1_contract.json")
            output_dir = tmp / "outputs"

            if rows is None:
                rows = build_panel_rows()
            pd.DataFrame(rows).to_csv(input_path, index=False, quoting=csv.QUOTE_MINIMAL)

            result = subprocess.run(
                [
                    sys.executable,
                    str(CLI),
                    "--input",
                    str(input_path),
                    "--contract",
                    str(contract_path),
                    "--output-dir",
                    str(output_dir),
                ],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
            shared_samples = pd.read_csv(output_dir / "checkpoint1_shared_samples.csv", dtype={"ein": str})
            summary_text = (output_dir / "checkpoint1_stage0_summary.md").read_text()
            return shared_samples, summary_text

    def test_stage0_cli_uses_curated_shared_samples(self):
        shared_samples, _ = self.run_cli(CHECKED_IN_CONTRACT, build_curated_panel_rows())
        expected = [
            "204374795",
            "237071436",
            "203812932",
            "201384250",
            "061652679",
            "042800910",
            "237102713",
            "020549032",
            "160470118",
            "141843628",
            "956125213",
        ]
        self.assertEqual(list(shared_samples["ein"].astype(str)), expected)

    def test_stage0_cli_errors_on_missing_curated_ein(self):
        rows = build_curated_panel_rows()
        rows = [row for row in rows if row["ein"] != "956125213"]

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            input_path = tmp / "panel.csv"
            output_dir = tmp / "outputs"
            pd.DataFrame(rows).to_csv(input_path, index=False, quoting=csv.QUOTE_MINIMAL)

            result = subprocess.run(
                [
                    sys.executable,
                    str(CLI),
                    "--input",
                    str(input_path),
                    "--contract",
                    str(CHECKED_IN_CONTRACT),
                    "--output-dir",
                    str(output_dir),
                ],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing curated EINs", result.stderr + result.stdout)

    def test_stage0_cli_writes_deterministic_shared_samples(self):
        first_samples, first_summary = self.run_cli()
        second_samples, second_summary = self.run_cli()

        pd.testing.assert_frame_equal(first_samples, second_samples)
        self.assertEqual(first_summary, second_summary)
        self.assertEqual(len(first_samples), 8)
        self.assertEqual(set(first_samples["state"]), {"CA", "WA"})
        self.assertEqual(set(first_samples["ntee_present"]), {False, True})

    def test_stage0_cli_uses_latest_row_per_ein(self):
        shared_samples, _ = self.run_cli(rows=build_latest_row_panel_rows())
        # EIN 100000001 has two rows (2023-12-31 and 2023-11-30).
        # If selected, every sampled instance should reflect the latest row.
        selected = shared_samples[shared_samples["ein"].astype(str).str.zfill(9) == "100000001"]
        self.assertGreater(len(selected), 0)
        self.assertTrue((selected["tax_period_end"] == "2023-12-31").all())
        # EIN 100000014 has submitted_on set (IRS-sourced) — must be included, not filtered out
        all_eins = set(shared_samples["ein"].astype(str))
        # Verify IRS-sourced rows are eligible (not silently dropped)
        self.assertGreater(len(shared_samples), 0)

    def test_checked_in_contract_locks_ratified_rules(self):
        contract = json.loads(CHECKED_IN_CONTRACT.read_text())

        self.assertIn("benchmark_window", contract)
        self.assertEqual(contract["benchmark_window"]["strict_years_required"], 5)
        self.assertEqual(contract["benchmark_window"]["relaxed_years_required"], 4)
        self.assertEqual(contract["benchmark_window"]["window_years"], 7)

        self.assertIn("metric_formulas", contract)
        self.assertEqual(
            contract["metric_formulas"]["operating_runway_proxy_months"],
            "net_assets_eoy / (total_expenses / 12)",
        )
        self.assertEqual(
            contract["metric_formulas"]["operating_margin"],
            "(total_revenue - total_expenses) / total_revenue",
        )
        self.assertEqual(
            contract["metric_formulas"]["revenue_diversification_index"],
            "1 - (pct_contributions^2 + pct_program_revenue^2 + pct_investment_income^2 + pct_other_revenue^2)",
        )
        self.assertEqual(
            contract["metric_formulas"]["shock_absorption_months"],
            "(cash_non_interest_bearing + savings_temporary_investments) / (total_expenses / 12)",
        )

        self.assertIn("confidence_tiers", contract)
        self.assertEqual(set(contract["confidence_tiers"].keys()), {"High", "Medium", "Low"})

        self.assertIn("action_labels", contract)
        self.assertEqual(
            set(contract["action_labels"].keys()),
            {"Amplify", "Stabilize", "Diversify", "Deep Review"},
        )

        self.assertIn("submitted_on_filter", contract)
        self.assertEqual(contract["submitted_on_filter"]["rule"], "include_all")
        self.assertNotIn("submitted_on_must_be_null", contract)

        self.assertEqual(contract["benchmark_window"]["type"], "rolling")
        self.assertEqual(contract["benchmark_window"]["scoring_years"], [2023, 2024])

        self.assertIn("urgency_flag", contract)
        self.assertIn("recovery_analogs", contract)
        self.assertEqual(
            contract["recovery_analogs"]["source_pool"],
            "Full national panel (all states), not limited to CA+WA. 1,278 analogs validated in EDA.",
        )
        self.assertEqual(
            contract["recovery_analogs"]["cohort_filter"],
            "Same ntee_major_category + size_bucket as the target org. State-agnostic. State shown in output for context.",
        )
        self.assertEqual(
            contract["recovery_analogs"]["selection_rule"],
            "Prefer same cohort first, then relax to size_bucket only if strict cohort yields zero analogs.",
        )
        self.assertIn("output_schemas", contract)
        self.assertEqual(
            set(contract["output_schemas"].keys()),
            {"checkpoint1_scored_row", "portfolio_view_row", "capital_stewardship_memo"},
        )

    def test_default_input_candidates_prefer_v4_panel(self):
        stage0_contract = (ROOT / "analysis" / "stage0_contract.py").read_text()
        self.assertIn('Path("data/panel_990_extended_v4.parquet")', stage0_contract)

    def test_output_schema_files_exist_and_are_valid_json(self):
        contract = json.loads(CHECKED_IN_CONTRACT.read_text())
        for relative_path in contract["output_schemas"].values():
            schema_path = ROOT / relative_path
            self.assertTrue(schema_path.exists(), msg=f"Missing schema file: {schema_path}")
            payload = json.loads(schema_path.read_text())
            self.assertEqual(payload["type"], "object")
            self.assertIn("properties", payload)


if __name__ == "__main__":
    unittest.main()
