"""
Stage 3 — Trend direction computation.
FY2024 rows with a matching FY2023 row get improving/declining.
All other rows get unavailable.
"""

import pandas as pd
import logging

logger = logging.getLogger(__name__)


def compute_trend(df: pd.DataFrame) -> pd.DataFrame:
    """Add trend_direction column. Contract: FY2024 self-join to FY2023 only."""
    out = df.copy()

    # Default: unavailable
    out["trend_direction"] = "unavailable"

    # Get FY2023 resilience_gap by EIN
    fy23 = out.loc[out["fiscal_year"] == 2023, ["ein", "resilience_gap"]].copy()
    fy23 = fy23.rename(columns={"resilience_gap": "resilience_gap_2023"})
    fy23["ein"] = fy23["ein"].astype(str)

    # Get FY2024 rows
    fy24_mask = out["fiscal_year"] == 2024
    fy24_eins = out.loc[fy24_mask, "ein"].astype(str)

    # Join FY2024 rows to FY2023 resilience_gap
    fy24_joined = fy24_eins.to_frame().merge(fy23, on="ein", how="left")

    # Compute trend for matched rows
    fy24_rg = out.loc[fy24_mask, "resilience_gap"].values
    fy23_rg = fy24_joined["resilience_gap_2023"].values

    has_match = pd.notna(fy23_rg)
    has_both = has_match & pd.notna(fy24_rg)

    # improving if resilience_gap_2024 <= resilience_gap_2023 + 0.10
    # Note: resilience_gap sign convention: more positive = worse
    # So "improving" means 2024 is not much worse than 2023
    improving = has_both & (fy24_rg <= fy23_rg + 0.10)

    # Use numpy indexing via iloc positions
    fy24_indices = out.index[fy24_mask]
    for j, idx in enumerate(fy24_indices):
        if improving[j]:
            out.at[idx, "trend_direction"] = "improving"
        elif has_both[j]:
            out.at[idx, "trend_direction"] = "declining"
        # else stays "unavailable"

    vc = out["trend_direction"].value_counts()
    logger.info("Trend direction distribution:\n%s", vc.to_string())

    return out
