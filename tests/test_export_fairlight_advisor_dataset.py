import json
import tempfile
import unittest
from pathlib import Path

from analysis.export_fairlight_advisor_dataset import export_dataset


class ExportFairlightAdvisorDatasetTests(unittest.TestCase):
    def test_export_dataset_writes_joined_records_and_summary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "advisor.json"

            payload = export_dataset(output_path=output_path)

            self.assertTrue(output_path.exists())
            self.assertEqual(payload["summary"]["totalOrganizations"], len(payload["organizations"]))
            self.assertGreater(len(payload["organizations"]), 100)
            self.assertIn("distressBaselineRate", payload["summary"])

            first = payload["organizations"][0]
            for key in [
                "id",
                "orgName",
                "actionLabel",
                "distressTier",
                "decisionReason",
                "confidenceTier",
                "memoText",
                "scenarioCards",
                "historicalFinancials",
                "peerOperatingMarginHistory",
                "revenueCompositionHistory",
                "scoreDrivers",
            ]:
                self.assertIn(key, first)

            self.assertEqual(len(first["scenarioCards"]), 3)
            self.assertIn(first["distressTier"], {"Low", "Medium", "High"})
            self.assertGreaterEqual(len(first["historicalFinancials"]), 5)
            self.assertGreaterEqual(len(first["peerOperatingMarginHistory"]), 3)
            self.assertEqual(
                {"distressProtection", "operatingMargin", "revenueMix", "evidenceQuality"},
                set(first["scoreDrivers"].keys()),
            )

            reloaded = json.loads(output_path.read_text())
            self.assertEqual(reloaded["summary"]["totalOrganizations"], payload["summary"]["totalOrganizations"])


if __name__ == "__main__":
    unittest.main()
