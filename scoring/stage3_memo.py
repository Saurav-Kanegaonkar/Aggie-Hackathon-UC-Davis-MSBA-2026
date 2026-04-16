"""
Stage 3 — Deterministic Capital Stewardship Memo.
Template-fill only, no LLM. 250-word max. Fixed section order per contract.
"""

import json
import math
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


def _gap_phrase(gap_val):
    """Fixed phrasing dictionary per contract."""
    if pd.isna(gap_val):
        return "data unavailable"
    if gap_val >= 0:
        return "above peer benchmark"
    if gap_val >= -0.3:
        return "near peer benchmark"
    if gap_val >= -1.0:
        return "below peer benchmark"
    return "materially behind peer benchmark"


def _fmt_val(val, fmt=".2f"):
    """Format a numeric value, handling nulls."""
    if pd.isna(val):
        return "N/A"
    return f"{val:{fmt}}"


def _fmt_revenue(val):
    """Format total_revenue as human-readable."""
    if pd.isna(val):
        return "N/A"
    if abs(val) >= 1_000_000:
        return f"${val/1_000_000:,.1f}M"
    if abs(val) >= 1_000:
        return f"${val/1_000:,.0f}K"
    return f"${val:,.0f}"


def _constraint_plain_english(constraint):
    """Map constraint label to plain English for memo."""
    mapping = {
        "low_margin": "low operating margin",
        "low_runway": "low operating runway",
        "high_concentration_in_volatile_source": "high revenue concentration",
    }
    return mapping.get(constraint, constraint or "unspecified constraint")


def _action_explanation(row):
    """One sentence explaining the decisive rule logic per contract."""
    label = row["action_label"]
    if label == "Needs Data Diligence":
        reasons = row.get("action_label_rationale", [])
        if not reasons:
            return "This organization requires deeper diligence before any recommendation."
        # Map first reason to plain English
        reason_map = {
            "review_insufficient_resilient_refs": "insufficient resilient peer references for benchmarking",
            "review_low_confidence": "low data confidence in the underlying filings",
            "review_acute_and_severe_25pct_stress": "acute urgency combined with severe stress-test exposure",
            "review_structural_outlier": f"resilience gap of {_fmt_val(row.get('resilience_gap'))} exceeds the structural outlier threshold of 2.0",
        }
        explanations = [reason_map.get(r, r) for r in reasons]
        return f"This is driven by {'; '.join(explanations)}."

    elif label == "Underinvested Asset Base":
        return (
            f"All three resilience metrics are at or above cohort benchmarks, "
            f"with no severe stress-test exposure and no urgency flag."
        )

    elif label == "Revenue Concentration Risk":
        rd_gap = row.get("revenue_diversification_gap")
        return (
            f"Revenue diversification gap of {_fmt_val(rd_gap)} indicates elevated concentration risk, "
            f"while operating margin remains adequate for targeted diversification."
        )

    else:  # Strengthen
        constraint = row.get("recovery_analog_constraint", "")
        return (
            f"The primary constraint is {_constraint_plain_english(constraint)}, "
            f"which should be addressed before additional capital deployment."
        )


def _build_analog_sentence(row):
    """Build the recovery analog sentence per contract template."""
    evidence = row.get("recovery_analog_evidence")
    constraint = row.get("recovery_analog_constraint", "")
    status = row.get("recovery_analog_status")

    if status != "found":
        return "No recovery analog evidence is available for this organization."

    # Parse evidence — could be a list of dicts, a JSON string, or numpy array
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except (json.JSONDecodeError, TypeError):
            return "No recovery analog evidence is available for this organization."

    # Convert numpy arrays or other array-likes to list
    if hasattr(evidence, 'tolist'):
        evidence = evidence.tolist()

    if not isinstance(evidence, list) or len(evidence) == 0:
        return "No recovery analog evidence is available for this organization."

    # Take top-ranked analog (first in list)
    analog = evidence[0]
    if not isinstance(analog, dict):
        return "No recovery analog evidence is available for this organization."

    org_name = analog.get("org_name", "A peer organization")
    state = analog.get("state", "unknown")
    pre_year = analog.get("pre_window_year", "N/A")
    post_year = analog.get("post_window_year", "N/A")
    metric = analog.get("matched_metric_name", "the constraint metric")
    pre_val = analog.get("matched_metric_pre_value")
    post_val = analog.get("matched_metric_post_value")

    constraint_label = _constraint_plain_english(constraint)

    return (
        f"{org_name} ({state}) recovered from a similar {constraint_label} position "
        f"between {pre_year} and {post_year}, improving {metric} "
        f"from {_fmt_val(pre_val)} to {_fmt_val(post_val)}."
    )


def generate_memos(df: pd.DataFrame) -> pd.DataFrame:
    """Add memo_text column via deterministic template fill."""
    out = df.copy()
    memos = []

    for i in range(len(out)):
        row = out.iloc[i]
        parts = []

        # 1. Org snapshot
        org_name = row.get("org_name", "unknown")
        if pd.isna(org_name):
            org_name = "unknown"
        state = row.get("state", "unknown")
        fy = row.get("fiscal_year", "N/A")
        sb = row.get("size_bucket", "N/A")
        if pd.isna(sb):
            sb = "N/A"
        tr = row.get("total_revenue")
        parts.append(
            f"{org_name} ({state}, FY{fy}, {sb}, revenue {_fmt_revenue(tr)})."
        )

        # 2. Cohort context
        ntee = row.get("ntee_major_category")
        if pd.isna(ntee) or ntee in ("", "unclassified"):
            ntee_str = "unclassified sector"
        else:
            ntee_str = f"NTEE category {ntee}"
        cohort_size = row.get("cohort_size")
        cs_str = f"{int(cohort_size)}" if pd.notna(cohort_size) else "N/A"
        bench_rule = row.get("benchmark_rule")
        if pd.isna(bench_rule):
            bench_rule = "N/A"
        parts.append(
            f"Benchmarked within {ntee_str}, cohort of {cs_str} peers, rule: {bench_rule}."
        )

        # 3. Resilience assessment
        om = row.get("operating_margin")
        om_bench = row.get("benchmark_operating_margin_q75")
        om_gap = row.get("operating_margin_gap")
        orpm = row.get("operating_runway_proxy_months")
        or_bench = row.get("benchmark_operating_runway_q75")
        or_gap = row.get("operating_runway_gap")
        rdi = row.get("revenue_diversification_index")
        rd_bench = row.get("benchmark_revenue_diversification_q75")
        rd_gap = row.get("revenue_diversification_gap")

        parts.append(
            f"Operating margin of {_fmt_val(om)} versus benchmark {_fmt_val(om_bench)}"
            f" ({_gap_phrase(om_gap)})."
            f" Operating runway of {_fmt_val(orpm)} months versus benchmark {_fmt_val(or_bench)} months"
            f" ({_gap_phrase(or_gap)})."
            f" Revenue diversification of {_fmt_val(rdi)} versus benchmark {_fmt_val(rd_bench)}"
            f" ({_gap_phrase(rd_gap)})."
        )

        # 4. Stress test results
        stress_status = row.get("stress_test_status")
        if stress_status == "computed":
            s25_sev = row.get("stress_25pct_severity", "N/A")
            s25_burn = row.get("stress_25pct_burn_months")
            burn_str = f" with {_fmt_val(s25_burn, '.1f')} months of burn runway" if pd.notna(s25_burn) else ""
            parts.append(
                f"Under a 25% largest-source shock, severity is {s25_sev}{burn_str}."
            )
        else:
            parts.append(
                "Stress-test scenario unavailable due to missing raw inputs."
            )

        # 5. Recovery analog evidence
        parts.append(_build_analog_sentence(row))

        # 6. Recommended action
        action = row.get("action_label", "N/A")
        parts.append(f"Recommended action: {action}.")
        parts.append(_action_explanation(row))

        # 7. Confidence note
        conf = row.get("checkpoint1_confidence_tier")
        urg_sev = row.get("urgency_severity")
        if conf == "Low":
            if urg_sev == "acute":
                parts.append(
                    "Data confidence is insufficient to support a specific action recommendation. "
                    "The available data suggests potential imminent distress, "
                    "but current filings should be verified directly before any capital decision."
                )
            else:
                parts.append(
                    "Data confidence is insufficient to support a specific action recommendation "
                    "and the row should be reviewed directly before action."
                )
        elif conf == "Medium":
            parts.append(
                "Data confidence is moderate; additional verification may strengthen this assessment."
            )
        elif conf == "High":
            parts.append("Data confidence is high.")

        memo = " ".join(parts)
        memos.append(memo)

    out["memo_text"] = memos

    # Validate word count
    word_counts = out["memo_text"].str.split().str.len()
    over_limit = (word_counts > 250).sum()
    if over_limit > 0:
        logger.warning(f"{over_limit} memos exceed 250-word limit")
        logger.warning(f"Max word count: {word_counts.max()}")
    logger.info(f"Memo word count stats: mean={word_counts.mean():.0f}, "
                f"median={word_counts.median():.0f}, max={word_counts.max()}")

    return out
