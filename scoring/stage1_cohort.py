"""
Deliverable 2 — Cohort assignment.
Assign each scorable row to a cohort via the contract's fallback hierarchy.
Cohort membership spans the full panel history (all fiscal years).
"""

import pandas as pd
import numpy as np
import json
import logging

logger = logging.getLogger(__name__)


def _cohort_key(row, level_cols):
    """Build a stable pipe-delimited key=value cohort key per ratified contract."""
    parts = []
    for c in level_cols:
        v = row.get(c)
        if pd.isna(v):
            parts.append(f"{c}=unclassified")
        else:
            parts.append(f"{c}={v}")
    return "|".join(parts)


def assign_cohorts(df, contract):
    """
    Assign cohort_key, cohort_level, cohort_size to every scorable row.

    Args:
        df: Full CA+WA panel with size_bucket, scoring_eligible, is_scoring_year.
        contract: Parsed checkpoint1_contract.json.

    Returns:
        DataFrame of scorable rows with cohort columns added.
    """
    fallback_order = contract["cohort_fallback_order"]
    min_cohort_size = contract["min_cohort_size"]

    # Scorable rows = eligible + scoring year
    scorable_mask = df["scoring_eligible"] & df["is_scoring_year"]
    scored = df[scorable_mask].copy()
    logger.info(f"Cohort assignment: {len(scored):,} scorable rows")

    # Pre-compute cohort sizes for each fallback level across full panel
    # Cohort size = distinct EINs in full panel matching the cohort key
    level_names = [
        "ntee+size_bucket+state",
        "size_bucket+state+return_type",
        "size_bucket+state",
    ]

    # Build cohort EIN counts for each level using the full panel
    # (only rows that are themselves scoring-eligible, since ineligible rows
    # shouldn't define the peer set)
    eligible_panel = df[df["scoring_eligible"]].copy()

    cohort_ein_counts = {}
    for level_idx, level_cols in enumerate(fallback_order):
        # Group by the cohort columns across the full eligible panel
        grouped = eligible_panel.groupby(list(level_cols))["ein"].nunique()
        cohort_ein_counts[level_idx] = grouped.to_dict()

    # Assign cohorts per scored row
    cohort_keys = []
    cohort_levels = []
    cohort_sizes = []

    for idx, row in scored.iterrows():
        assigned = False

        for level_idx, level_cols in enumerate(fallback_order):
            # Level 0 (primary): skip if NTEE is null
            if level_idx == 0 and pd.isna(row.get("ntee_major_category")):
                continue

            # Build the lookup key
            key_tuple = tuple(
                row[c] if not pd.isna(row.get(c)) else None
                for c in level_cols
            )

            # Look up cohort size
            size = cohort_ein_counts[level_idx].get(key_tuple, 0)

            if size >= min_cohort_size:
                cohort_keys.append(_cohort_key(row, level_cols))
                cohort_levels.append(level_names[level_idx])
                cohort_sizes.append(size)
                assigned = True
                break

        if not assigned:
            # Broadest fallback — use it regardless of size
            last_cols = fallback_order[-1]
            cohort_keys.append(_cohort_key(row, last_cols))
            cohort_levels.append(level_names[-1])
            size = cohort_ein_counts[len(fallback_order) - 1].get(
                tuple(row[c] if not pd.isna(row.get(c)) else None for c in last_cols),
                0,
            )
            cohort_sizes.append(size)

    scored["cohort_key"] = cohort_keys
    scored["cohort_level"] = cohort_levels
    scored["cohort_size"] = cohort_sizes

    # Log distribution
    level_dist = scored["cohort_level"].value_counts()
    logger.info(f"Cohort level distribution:\n{level_dist.to_string()}")

    small_cohorts = scored[scored["cohort_size"] < min_cohort_size]
    logger.info(
        f"Cohorts below min_cohort_size ({min_cohort_size}): "
        f"{len(small_cohorts):,} scored rows affected"
    )

    unique_cohorts = scored["cohort_key"].nunique()
    logger.info(f"Unique cohort keys: {unique_cohorts}")

    return scored
