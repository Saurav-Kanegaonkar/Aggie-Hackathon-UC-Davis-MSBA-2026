from __future__ import annotations

import pandas as pd


def _is_number(value: object) -> bool:
    return not pd.isna(value)


def _compute_urgency(row: pd.Series) -> tuple[bool, str, str]:
    if row.get("benchmark_status") == "not_scoreable":
        return False, "none", "none"

    shock_absorption_months = row.get("shock_absorption_months")
    operating_margin = row.get("operating_margin")
    if not _is_number(shock_absorption_months) or not _is_number(operating_margin):
        return False, "none", "none"

    shock_absorption_months = float(shock_absorption_months)
    operating_margin = float(operating_margin)

    urgency_flag = shock_absorption_months < 3 and operating_margin < 0
    if not urgency_flag:
        return False, "none", "none"

    urgency_severity = "acute" if shock_absorption_months < 1 and operating_margin < -0.10 else "flagged"
    urgency_reason = (
        "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct"
        if urgency_severity == "acute"
        else "negative_margin_and_lt3m_shock_absorption"
    )
    return True, urgency_severity, urgency_reason


def enrich_urgency_fields(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for index, row in out.iterrows():
        urgency_flag, urgency_severity, urgency_reason = _compute_urgency(row)
        out.at[index, "urgency_flag"] = urgency_flag
        out.at[index, "urgency_severity"] = urgency_severity
        out.at[index, "urgency_reason"] = urgency_reason
    return out
