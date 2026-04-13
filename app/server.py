#!/usr/bin/env python3
"""Lightweight dev server for the Fairlight app. Serves static files + full dataset API."""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
import pandas as pd
import numpy as np

PORT = 8080
APP_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(APP_DIR)

# Pre-load full dataset at startup
print("Loading full dataset...")
df = pd.read_parquet(os.path.join(PROJECT_DIR, "outputs/stage3/scored_rows_with_actions.parquet"))
panel = pd.read_parquet(os.path.join(PROJECT_DIR, "data/processed/panel_990_extended_v4.parquet"))

panel["ein"] = panel["ein"].astype(str)
panel["fiscal_year"] = panel["fiscal_year"].astype(int)
df["ein"] = df["ein"].astype(str)
df["fiscal_year"] = df["fiscal_year"].astype(int)

hydrate_cols = ["ein", "fiscal_year", "org_name", "total_revenue", "total_expenses",
                "ntee_major_category", "net_assets_eoy"]
panel_sub = panel[hydrate_cols].drop_duplicates(subset=["ein", "fiscal_year"], keep="first")
df = df.merge(panel_sub, on=["ein", "fiscal_year"], how="left", suffixes=("", "_h"))
df["org_name"] = df["org_name"].fillna("unknown")
df["ntee_major_category"] = df["ntee_major_category"].fillna("unclassified")

for col in ["action_label_rationale", "recovery_analog_eins", "recovery_analog_evidence"]:
    if col in df.columns:
        df[col] = df[col].apply(
            lambda x: x.tolist() if hasattr(x, "tolist") else (x if isinstance(x, list) else [])
        )

df = df.replace([np.inf, -np.inf], np.nan)
FULL_DATA = df

def clean_nans(obj):
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    elif isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    return obj

print(f"Loaded {len(FULL_DATA)} rows")


class FairlightHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/orgs":
            self._serve_org_list()
        elif self.path.startswith("/api/org/"):
            parts = self.path.split("/")
            if len(parts) >= 4:
                ein = parts[3]
                self._serve_org_detail(ein)
            else:
                self._json_response({"error": "invalid path"}, 400)
        elif self.path == "/api/stats":
            self._serve_stats()
        else:
            super().do_GET()

    def _json_response(self, data, code=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_org_list(self):
        """Return lightweight list of all orgs (FY2024 preferred, FY2023 fallback)."""
        # Prefer most recent FY per EIN
        latest = FULL_DATA.sort_values("fiscal_year", ascending=False).drop_duplicates("ein", keep="first")
        cols = ["ein", "fiscal_year", "org_name", "state", "size_bucket",
                "action_label", "urgency_severity", "trend_direction",
                "total_revenue", "operating_margin", "checkpoint1_confidence_tier"]
        records = latest[cols].to_dict(orient="records")
        self._json_response(clean_nans(records))

    def _serve_org_detail(self, ein):
        """Return all rows for a given EIN."""
        rows = FULL_DATA[FULL_DATA["ein"] == ein]
        if len(rows) == 0:
            self._json_response({"error": f"EIN {ein} not found"}, 404)
            return
        records = rows.to_dict(orient="records")
        self._json_response(clean_nans(records))

    def _serve_stats(self):
        """Return aggregate stats for the dashboard."""
        latest = FULL_DATA.sort_values("fiscal_year", ascending=False).drop_duplicates("ein", keep="first")
        stats = {
            "total_orgs": len(latest),
            "label_distribution": latest["action_label"].value_counts().to_dict(),
            "urgency_distribution": latest["urgency_severity"].value_counts().to_dict(),
            "trend_distribution": latest["trend_direction"].value_counts().to_dict(),
            "state_distribution": latest["state"].value_counts().to_dict(),
        }
        self._json_response(stats)


if __name__ == "__main__":
    print(f"Starting Fairlight server on http://localhost:{PORT}")
    httpd = HTTPServer(("", PORT), FairlightHandler)
    httpd.serve_forever()
