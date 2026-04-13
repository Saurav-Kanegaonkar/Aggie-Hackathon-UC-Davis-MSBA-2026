"""
Stage 3 — Action label assignment.
Deterministic if/elif/elif/else chain per ratified contract.
Precedence: Deep Review > Amplify > Diversify > Stabilize.
"""

import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)

# Stabilize constraint mapping: gap column -> rationale rule name
CONSTRAINT_MAP = {
    "operating_margin_gap": "stabilize_primary_constraint_low_margin",
    "operating_runway_gap": "stabilize_primary_constraint_low_runway",
    "revenue_diversification_gap": "stabilize_primary_constraint_high_concentration_in_volatile_source",
}

# Tie-break order for Stabilize primary constraint
GAP_COLUMNS = ["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]


def assign_labels(df: pd.DataFrame) -> pd.DataFrame:
    """Assign action_label and action_label_rationale to every row."""
    out = df.copy()
    n = len(out)
    labels = [None] * n
    rationales = [None] * n

    for i in range(n):
        row = out.iloc[i]

        # --- Deep Review: any condition fires ---
        dr_reasons = []
        if row.get("benchmark_status") == "insufficient_resilient_refs":
            dr_reasons.append("deep_review_insufficient_resilient_refs")
        if row.get("checkpoint1_confidence_tier") == "Low":
            dr_reasons.append("deep_review_low_confidence")
        if (row.get("urgency_severity") == "acute"
                and row.get("stress_25pct_severity") in ("severe", "critical")):
            dr_reasons.append("deep_review_acute_and_severe_25pct_stress")
        rg = row.get("resilience_gap")
        if pd.notna(rg) and rg > 2.0:
            dr_reasons.append("deep_review_structural_outlier")

        if dr_reasons:
            labels[i] = "Deep Review"
            rationales[i] = dr_reasons
            continue

        # --- Amplify: all five conditions must be true ---
        om_gap = row.get("operating_margin_gap")
        or_gap = row.get("operating_runway_gap")
        rd_gap = row.get("revenue_diversification_gap")
        s25_sev = row.get("stress_25pct_severity")
        urg_sev = row.get("urgency_severity")

        if (pd.notna(om_gap) and om_gap >= 0
                and pd.notna(or_gap) and or_gap >= 0
                and pd.notna(rd_gap) and rd_gap >= 0
                and s25_sev not in ("severe", "critical")
                and urg_sev == "none"):
            labels[i] = "Amplify"
            rationales[i] = [
                "amplify_margin_above_benchmark",
                "amplify_runway_above_benchmark",
                "amplify_diversification_above_benchmark",
                "amplify_no_severe_25pct_stress",
                "amplify_no_urgency",
            ]
            continue

        # --- Diversify: all four conditions must be true ---
        if (pd.notna(rd_gap) and rd_gap <= -0.30
                and pd.notna(om_gap) and om_gap >= -0.30
                and s25_sev not in ("severe", "critical")
                and urg_sev == "none"):
            labels[i] = "Diversify"
            rationales[i] = [
                "diversify_concentration_gap_below_neg_0_30",
                "diversify_margin_at_or_above_neg_0_30",
                "diversify_no_severe_25pct_stress",
                "diversify_no_urgency",
            ]
            continue

        # --- Stabilize: unconditional fallthrough ---
        # Find most negative non-null gap
        gaps = {}
        for col in GAP_COLUMNS:
            val = row.get(col)
            if pd.notna(val):
                gaps[col] = val

        if not gaps:
            raise ValueError(
                f"Row {i} (ein={row.get('ein')}, fy={row.get('fiscal_year')}) "
                f"reached Stabilize with all three per-metric gaps null. "
                f"This indicates upstream data corruption."
            )

        # Most negative gap wins; tie-break by GAP_COLUMNS order
        primary_col = min(gaps, key=lambda c: (gaps[c], GAP_COLUMNS.index(c)))
        constraint_rule = CONSTRAINT_MAP[primary_col]

        labels[i] = "Stabilize"
        rationales[i] = ["stabilize_default_scoreable", constraint_rule]

    out["action_label"] = labels
    out["action_label_rationale"] = rationales

    # Log distribution
    vc = out["action_label"].value_counts()
    logger.info("Action label distribution:\n%s", vc.to_string())
    logger.info(
        "Action label shares:\n%s",
        (vc / len(out) * 100).round(2).to_string()
    )

    return out
