"""
Stage 2 urgency module.

Adds 3 fields per row:
  urgency_flag (bool)
  urgency_severity ("none" | "flagged" | "acute")
  urgency_reason (string)

Binary urgency rule (from ratified contract):
  urgency_flag = shock_absorption_months < 3 AND operating_margin < 0

Rows with benchmark_status = "not_scoreable" (null shock_absorption/operating_margin):
  urgency_flag = False, severity = "none", reason = "none"

All rows get a value for all three fields — no nulls.
"""
from __future__ import annotations

import pandas as pd


def compute_urgency(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    shock = pd.to_numeric(out.get("shock_absorption_months"), errors="coerce")
    margin = pd.to_numeric(out.get("operating_margin"), errors="coerce")

    # Both fields must be present and non-null for a positive urgency flag
    has_fields = shock.notna() & margin.notna()

    flagged = has_fields & (shock < 3.0) & (margin < 0.0)
    acute = has_fields & (shock < 1.0) & (margin < -0.10)

    out["urgency_flag"] = flagged

    def _severity(flag, ac):
        if ac:
            return "acute"
        if flag:
            return "flagged"
        return "none"

    def _reason(flag, ac):
        if ac:
            return "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct"
        if flag:
            return "negative_margin_and_lt3m_shock_absorption"
        return "none"

    out["urgency_severity"] = [
        _severity(f, a) for f, a in zip(flagged, acute)
    ]
    out["urgency_reason"] = [
        _reason(f, a) for f, a in zip(flagged, acute)
    ]

    return out
