from __future__ import annotations

import pandas as pd


def enrich_urgency_fields(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    benchmark_status = out.get("benchmark_status")
    shock_absorption_months = pd.to_numeric(out.get("shock_absorption_months"), errors="coerce")
    operating_margin = pd.to_numeric(out.get("operating_margin"), errors="coerce")

    applicable_mask = benchmark_status != "not_scoreable"
    urgency_flag = applicable_mask & shock_absorption_months.notna() & operating_margin.notna()
    urgency_flag &= (shock_absorption_months < 3) & (operating_margin < 0)
    acute_mask = urgency_flag & (shock_absorption_months < 1) & (operating_margin < -0.10)

    out["urgency_flag"] = urgency_flag.astype(bool)
    out["urgency_severity"] = "none"
    out.loc[urgency_flag, "urgency_severity"] = "flagged"
    out.loc[acute_mask, "urgency_severity"] = "acute"

    out["urgency_reason"] = "none"
    out.loc[urgency_flag, "urgency_reason"] = "negative_margin_and_lt3m_shock_absorption"
    out.loc[
        acute_mask,
        "urgency_reason",
    ] = "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct"
    return out
