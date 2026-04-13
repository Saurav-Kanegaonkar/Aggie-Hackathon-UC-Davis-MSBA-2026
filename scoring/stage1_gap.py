"""
Deliverable 4 — Resilience gap.
Per-metric raw gaps, z-score normalization within cohort-window,
combined resilience_gap = negative mean of z-scores.
"""

import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

METRICS = [
    ("operating_margin", "benchmark_operating_margin_q75", "operating_margin_gap"),
    (
        "operating_runway_proxy_months",
        "benchmark_operating_runway_q75",
        "operating_runway_gap",
    ),
    (
        "revenue_diversification_index",
        "benchmark_revenue_diversification_q75",
        "revenue_diversification_gap",
    ),
]


def compute_gaps(scored_df, full_panel):
    """
    Compute per-metric raw gaps and combined resilience_gap.

    Raw gap = org_value - benchmark_q75 (positive = above benchmark = good).

    Z-score normalization base: all peer year-rows in the cohort-window
    [Y-6...Y], all cohort members, non-null gap values only. Same population
    as the Q75 baseline.

    Combined: resilience_gap = -mean(z_margin, z_runway, z_diversification)
    over available (non-null) metrics. Higher = worse.

    Args:
        scored_df: Scored rows with benchmark Q75s and cohort assignments.
        full_panel: Full CA+WA panel with metrics and _cohort_key.

    Returns:
        scored_df with gap columns added.
    """
    scored_df = scored_df.copy()
    eligible_panel = full_panel[full_panel["scoring_eligible"]].copy()

    # Compute raw gaps
    for org_col, bm_col, gap_col in METRICS:
        scored_df[gap_col] = scored_df[org_col] - scored_df[bm_col]

    # Z-score normalization within cohort-window
    # For each (cohort_key, fiscal_year) group, compute z-scores using
    # the cohort-window population stats
    window_size = 7

    z_cols = {
        "operating_margin_gap": "_z_margin",
        "operating_runway_gap": "_z_runway",
        "revenue_diversification_gap": "_z_diversification",
    }

    for zc in z_cols.values():
        scored_df[zc] = np.nan

    groups = scored_df.groupby(["cohort_key", "fiscal_year"])
    for (ck, fy), group_indices in groups.groups.items():
        window_start = fy - (window_size - 1)

        # Get cohort-window rows from eligible panel
        cohort_rows = eligible_panel[eligible_panel["_cohort_key"] == ck]
        window_rows = cohort_rows[
            (cohort_rows["fiscal_year"] >= window_start)
            & (cohort_rows["fiscal_year"] <= fy)
        ]

        if len(window_rows) == 0:
            continue

        # Compute gap values for the window population (using same Q75 benchmarks)
        bm_margin = scored_df.loc[group_indices[0], "benchmark_operating_margin_q75"]
        bm_runway = scored_df.loc[group_indices[0], "benchmark_operating_runway_q75"]
        bm_div = scored_df.loc[
            group_indices[0], "benchmark_revenue_diversification_q75"
        ]

        window_gaps = {
            "operating_margin_gap": window_rows["operating_margin"] - bm_margin,
            "operating_runway_gap": window_rows["operating_runway_proxy_months"]
            - bm_runway,
            "revenue_diversification_gap": window_rows[
                "revenue_diversification_index"
            ]
            - bm_div,
        }

        for gap_col, z_col in z_cols.items():
            pop_gaps = window_gaps[gap_col].dropna()
            if len(pop_gaps) < 2:
                # Can't z-score with <2 values — leave raw
                scored_df.loc[group_indices, z_col] = 0.0
                continue

            mu = pop_gaps.mean()
            sigma = pop_gaps.std(ddof=0)  # population std

            if sigma == 0:
                scored_df.loc[group_indices, z_col] = 0.0
            else:
                scored_row_gaps = scored_df.loc[group_indices, gap_col]
                scored_df.loc[group_indices, z_col] = (scored_row_gaps - mu) / sigma

    # Combined resilience_gap = -mean of available z-scores
    z_matrix = scored_df[["_z_margin", "_z_runway", "_z_diversification"]]
    scored_df["resilience_gap"] = -z_matrix.mean(axis=1, skipna=True)

    # If all three z-scores are null, resilience_gap is null
    all_null = z_matrix.isna().all(axis=1)
    scored_df.loc[all_null, "resilience_gap"] = np.nan

    # Log stats
    logger.info(
        f"Gap computation complete. resilience_gap non-null: "
        f"{scored_df['resilience_gap'].notna().sum():,}"
    )
    logger.info(
        f"  resilience_gap stats:\n{scored_df['resilience_gap'].describe().to_string()}"
    )

    # Drop internal z-score columns
    scored_df.drop(columns=["_z_margin", "_z_runway", "_z_diversification"], inplace=True)

    return scored_df
