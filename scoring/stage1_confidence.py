"""
Deliverable 5 — Confidence tagging.
Three tiers: data_confidence_tier, cohort_confidence_tier, checkpoint1_confidence_tier.
"""

import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Null-rate fields: only these 5 count against data quality.
# The four pct_ columns have semantic zero-meaning nulls per Patch 3
# and must NOT penalize data quality.
NULL_RATE_FIELDS = [
    "total_revenue",
    "total_expenses",
    "net_assets_eoy",
    "cash_non_interest_bearing",
    "savings_temporary_investments",
]

TIER_ORDER = {"High": 3, "Medium": 2, "Low": 1}
TIER_REVERSE = {3: "High", 2: "Medium", 1: "Low"}


def compute_confidence(scored_df, full_panel):
    """
    Compute three confidence tiers and confidence_reason.

    Args:
        scored_df: Scored rows with cohort_level.
        full_panel: Full CA+WA panel.

    Returns:
        scored_df with confidence columns added.
    """
    scored_df = scored_df.copy()
    window_size = 7

    # --- data_confidence_tier ---
    data_tiers = []
    data_reasons = []

    for idx, row in scored_df.iterrows():
        ein = row["ein"]
        fy = row["fiscal_year"]
        window_start = fy - (window_size - 1)

        # Get this EIN's rows in the window
        ein_rows = full_panel[
            (full_panel["ein"] == ein)
            & (full_panel["fiscal_year"] >= window_start)
            & (full_panel["fiscal_year"] <= fy)
        ]

        window_years = ein_rows["fiscal_year"].nunique()

        # Null rate across 5 fields
        if len(ein_rows) > 0:
            total_cells = len(ein_rows) * len(NULL_RATE_FIELDS)
            null_cells = ein_rows[NULL_RATE_FIELDS].isna().sum().sum()
            null_rate = null_cells / total_cells if total_cells > 0 else 1.0
        else:
            null_rate = 1.0

        # Tier assignment
        if window_years >= 6 and null_rate < 0.20:
            tier = "High"
            reason_parts = []
        elif window_years <= 3:
            tier = "Low"
            reason_parts = [f"{window_years} years in window"]
        elif null_rate > 0.20:
            tier = "Low"
            reason_parts = [f"null rate {null_rate:.0%}"]
        else:
            # Medium: 4-5 years, or >=6 years with null_rate exactly 0.20
            tier = "Medium"
            if window_years <= 5:
                reason_parts = [f"{window_years} years in window"]
            else:
                reason_parts = [f"null rate {null_rate:.0%}"]

        data_tiers.append(tier)
        data_reasons.append(reason_parts)

    scored_df["data_confidence_tier"] = data_tiers

    # --- cohort_confidence_tier ---
    cohort_tier_map = {
        "ntee+size_bucket+state": "High",
        "size_bucket+state+return_type": "Medium",
        "size_bucket+state": "Low",
    }
    scored_df["cohort_confidence_tier"] = scored_df["cohort_level"].map(cohort_tier_map)

    # --- checkpoint1_confidence_tier = min(data, cohort) ---
    def _min_tier(data_t, cohort_t):
        d = TIER_ORDER.get(data_t, 1)
        c = TIER_ORDER.get(cohort_t, 1)
        return TIER_REVERSE[min(d, c)]

    scored_df["checkpoint1_confidence_tier"] = scored_df.apply(
        lambda r: _min_tier(r["data_confidence_tier"], r["cohort_confidence_tier"]),
        axis=1,
    )

    # --- confidence_reason ---
    cohort_reasons = []
    for idx, row in scored_df.iterrows():
        parts = list(data_reasons[list(scored_df.index).index(idx)])
        cohort_level = row["cohort_level"]
        if cohort_level != "ntee+size_bucket+state":
            parts.append(f"fallback cohort: {cohort_level}")
        if len(parts) == 0:
            parts.append("primary data quality; primary cohort")
        cohort_reasons.append("; ".join(parts))

    scored_df["confidence_reason"] = cohort_reasons

    # Log
    logger.info(
        f"Confidence tiers:\n"
        f"  data: {scored_df['data_confidence_tier'].value_counts().to_string()}\n"
        f"  cohort: {scored_df['cohort_confidence_tier'].value_counts().to_string()}\n"
        f"  combined: {scored_df['checkpoint1_confidence_tier'].value_counts().to_string()}"
    )

    return scored_df
