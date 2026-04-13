"""
Stage 2 — Urgency flag enrichment.
Binary urgency rule + severity tier + machine-readable reason.
Fully vectorized.
"""

import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)


def enrich_urgency_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Add urgency_flag, urgency_severity, urgency_reason. Vectorized."""
    out = df.copy()

    shock_abs = pd.to_numeric(out.get("shock_absorption_months"), errors="coerce")
    margin = pd.to_numeric(out.get("operating_margin"), errors="coerce")

    # Binary urgency rule: shock_absorption_months < 3 AND operating_margin < 0
    has_both = shock_abs.notna() & margin.notna()
    urgent = has_both & (shock_abs < 3) & (margin < 0)

    # Acute: shock_absorption_months < 1 AND operating_margin < -0.10
    acute = urgent & (shock_abs < 1) & (margin < -0.10)

    out["urgency_flag"] = urgent.fillna(False)
    out["urgency_severity"] = np.where(
        acute, "acute",
        np.where(urgent, "flagged", "none")
    )
    out["urgency_reason"] = np.where(
        acute, "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct",
        np.where(urgent, "negative_margin_and_lt3m_shock_absorption", "none")
    )

    logger.info(
        f"Urgency: {urgent.sum():,} flagged, {acute.sum():,} acute, "
        f"{(~urgent).sum():,} none"
    )

    return out
