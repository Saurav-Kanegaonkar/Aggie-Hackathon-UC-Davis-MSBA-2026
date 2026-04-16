#!/usr/bin/env python3
"""
Stage 3 build orchestrator.
Adds deterministic action labels, rationale, trend direction,
and memo text to the canonical merged Stage 2 output.
"""

from __future__ import annotations

import argparse
from io import BytesIO
import json
import logging
from pathlib import Path
import subprocess

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stage3_build")

STAGE2_GIT_REF = "origin/main:outputs/stage2/scored_rows_enriched.parquet"
PANEL_PATH = Path("data/processed/panel_990_extended_v4.parquet")
OUTPUT_PATH = Path("outputs/stage3/scored_rows_with_actions.parquet")
SCHEMA_PATH = Path("config/schemas/stage3_scored_row.schema.json")
PANEL_CANDIDATES = [
    Path("data/panel_990_extended_v4.parquet"),
    Path("data/processed/panel_990_extended_v4.parquet"),
    Path("Data/panel_990_extended_v4.parquet"),
]

REVIEW_RULES = [
    "review_insufficient_resilient_refs",
    "review_low_confidence",
    "review_acute_and_severe_25pct_stress",
    "review_structural_outlier",
]
OPTIMIZE_RULES = [
    "amplify_margin_above_benchmark",
    "amplify_runway_above_benchmark",
    "amplify_diversification_above_benchmark",
    "amplify_no_severe_25pct_stress",
    "amplify_no_urgency",
]
DIVERSIFY_RULES = [
    "diversify_concentration_gap_below_neg_0_30",
    "diversify_margin_at_or_above_neg_0_30",
    "diversify_no_severe_25pct_stress",
    "diversify_no_urgency",
]
STRENGTHEN_RULE_MAP = {
    "operating_margin_gap": "stabilize_primary_constraint_low_margin",
    "operating_runway_gap": "stabilize_primary_constraint_low_runway",
    "revenue_diversification_gap": "stabilize_primary_constraint_high_concentration_in_volatile_source",
}
DIVERSIFY_GAP_THRESHOLD = -0.30


def _load_from_git_ref(ref: str) -> pd.DataFrame:
    payload = subprocess.check_output(["git", "show", ref])
    return pd.read_parquet(BytesIO(payload))


def _load_stage2(source) -> pd.DataFrame:
    if isinstance(source, pd.DataFrame):
        return source.copy()
    if isinstance(source, str) and ":" in source:
        logger.info("Loading Stage 2 from git ref: %s", source)
        return _load_from_git_ref(source)
    logger.info("Loading Stage 2 from file: %s", source)
    return pd.read_parquet(source)


def resolve_panel_path(explicit_path: Path | str | None = None) -> Path:
    if explicit_path:
        explicit = Path(explicit_path)
        if explicit.exists():
            return explicit
    for candidate in PANEL_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "No panel_990_extended_v4.parquet found under data/, data/processed/, or Data/."
    )


def hydrate_memo_fields(stage2_keys: pd.DataFrame, panel_path: Path) -> pd.DataFrame:
    """Hydrate memo-only fields from the raw panel using exact (ein, fiscal_year) match."""
    logger.info("Hydrating memo fields from %s", panel_path)
    panel = pd.read_parquet(panel_path, columns=["ein", "fiscal_year", "org_name", "total_revenue", "ntee_major_category"])

    panel["ein"] = panel["ein"].astype(str)
    panel["fiscal_year"] = pd.to_numeric(panel["fiscal_year"], errors="coerce").astype("Int64")
    panel = panel.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")

    hydrated = stage2_keys.copy()
    hydrated["ein"] = hydrated["ein"].astype(str)
    hydrated["_order"] = np.arange(len(hydrated))
    hydrated = hydrated.merge(panel, on=["ein", "fiscal_year"], how="left", validate="one_to_one")
    hydrated = hydrated.sort_values("_order").drop(columns="_order").reset_index(drop=True)

    hydrated["org_name"] = hydrated["org_name"].fillna("unknown")
    hydrated["ntee_major_category"] = hydrated["ntee_major_category"].fillna("unclassified")
    return hydrated


def compute_trend_direction(stage2_df: pd.DataFrame) -> pd.DataFrame:
    out = stage2_df.copy()
    out["trend_direction"] = "unavailable"

    prior = (
        out.loc[out["fiscal_year"] == 2023, ["ein", "resilience_gap"]]
        .drop_duplicates(subset=["ein"], keep="last")
        .set_index("ein")["resilience_gap"]
    )
    current_2024 = out["fiscal_year"] == 2024
    has_prior = out["ein"].map(prior).notna()
    comparable = current_2024 & has_prior
    prior_values = out.loc[comparable, "ein"].map(prior)
    improving = out.loc[comparable, "resilience_gap"] <= (prior_values + 0.10)

    out.loc[comparable, "trend_direction"] = np.where(improving, "improving", "declining")
    return out


def _build_review_rationales(df: pd.DataFrame) -> list[list[str]]:
    insuff = df["benchmark_status"].eq("insufficient_resilient_refs")
    low_conf = df["checkpoint1_confidence_tier"].eq("Low")
    acute_severe = df["urgency_severity"].eq("acute") & df["stress_25pct_severity"].isin(["severe", "critical"])
    outlier = df["resilience_gap"].gt(2.0).fillna(False)

    rationales = []
    for i in range(len(df)):
        row_rules = []
        if insuff.iat[i]:
            row_rules.append(REVIEW_RULES[0])
        if low_conf.iat[i]:
            row_rules.append(REVIEW_RULES[1])
        if acute_severe.iat[i]:
            row_rules.append(REVIEW_RULES[2])
        if outlier.iat[i]:
            row_rules.append(REVIEW_RULES[3])
        rationales.append(row_rules)
    return rationales


def assign_action_labels(stage2_df: pd.DataFrame) -> pd.DataFrame:
    out = stage2_df.copy()

    no_severe_stress = ~out["stress_25pct_severity"].isin(["severe", "critical"])
    no_urgency = out["urgency_severity"].eq("none")

    deep_mask = (
        out["benchmark_status"].eq("insufficient_resilient_refs")
        | out["checkpoint1_confidence_tier"].eq("Low")
        | (out["urgency_severity"].eq("acute") & out["stress_25pct_severity"].isin(["severe", "critical"]))
        | out["resilience_gap"].gt(2.0).fillna(False)
    )
    amplify_mask = (
        ~deep_mask
        & out["operating_margin_gap"].ge(0)
        & out["operating_runway_gap"].ge(0)
        & out["revenue_diversification_gap"].ge(0)
        & no_severe_stress
        & no_urgency
    )
    diversify_mask = (
        ~deep_mask
        & ~amplify_mask
        & out["revenue_diversification_gap"].le(DIVERSIFY_GAP_THRESHOLD)
        & out["operating_margin_gap"].ge(-0.30)
        & no_severe_stress
        & no_urgency
    )
    stabilize_mask = ~(deep_mask | amplify_mask | diversify_mask)

    out["action_label"] = np.select(
        [deep_mask, amplify_mask, diversify_mask, stabilize_mask],
        ["Needs Data Diligence", "Underinvested Asset Base", "Revenue Concentration Risk", "Weak Financial Foundation"],
        default="Weak Financial Foundation",
    )

    rationales: list[list[str]] = [[] for _ in range(len(out))]

    deep_rationales = _build_review_rationales(out)
    for idx in out.index[deep_mask]:
        rationales[idx] = deep_rationales[idx]

    for idx in out.index[amplify_mask]:
        rationales[idx] = OPTIMIZE_RULES.copy()

    for idx in out.index[diversify_mask]:
        rationales[idx] = DIVERSIFY_RULES.copy()

    if stabilize_mask.any():
        gap_cols = ["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]
        stabilize_gaps = out.loc[stabilize_mask, gap_cols]
        if stabilize_gaps.isna().all(axis=1).any():
            raise ValueError(
                "Row reached Strengthen with all three per-metric gaps null. "
                "This indicates upstream data corruption."
            )
        primary_constraint = stabilize_gaps.fillna(np.inf).idxmin(axis=1)
        for idx, gap_col in primary_constraint.items():
            rationales[idx] = ["stabilize_default_scoreable", STRENGTHEN_RULE_MAP[gap_col]]

    out["action_label_rationale"] = rationales
    return out


def _gap_phrase(gap: float | None) -> str:
    if pd.isna(gap):
        return "unavailable"
    if gap >= 0:
        return "above peer benchmark"
    if gap >= -0.3:
        return "near peer benchmark"
    if gap >= -1.0:
        return "below peer benchmark"
    return "materially behind peer benchmark"


def _format_currency(value) -> str:
    if pd.isna(value):
        return "null"
    return f"${float(value):,.0f}"


def _format_number(value, decimals: int = 2, null_text: str = "null") -> str:
    if pd.isna(value):
        return null_text
    return f"{float(value):.{decimals}f}"


def _normalize_constraint_label(value) -> str:
    mapping = {
        "low_margin": "low margin",
        "low_runway": "low runway",
        "high_concentration_in_volatile_source": "high concentration in a volatile source",
        None: "constraint",
        pd.NA: "constraint",
    }
    return mapping.get(value, str(value).replace("_", " "))


def _top_analog_sentence(evidence, constraint_label: str) -> str:
    if evidence is None or (isinstance(evidence, float) and pd.isna(evidence)):
        return "Recovery analog evidence is unavailable."
    if isinstance(evidence, np.ndarray):
        evidence = evidence.tolist()
    if not evidence:
        return "Recovery analog evidence is unavailable."
    top = evidence[0]
    return (
        f"{top.get('org_name', 'Unknown analog')} ({top.get('state', 'NA')}) recovered from a similar "
        f"{constraint_label} position between {top.get('pre_window_year', 'NA')} and "
        f"{top.get('post_recovery_year', 'NA')}, improving {top.get('matched_metric_name', 'metric')} "
        f"from {_format_number(top.get('matched_metric_pre_value'))} to "
        f"{_format_number(top.get('matched_metric_post_value'))}."
    )


def _action_reason_sentence(row) -> str:
    label = row.action_label
    if label == "Underinvested Asset Base":
        return (
            f"Margin gap {_format_number(row.operating_margin_gap)}, runway gap {_format_number(row.operating_runway_gap)}, "
            f"and diversification gap {_format_number(row.revenue_diversification_gap)} are all above benchmark, "
            f"with 25% stress severity {row.stress_25pct_severity} and urgency {row.urgency_severity}."
        )
    if label == "Revenue Concentration Risk":
        return (
            f"Diversification gap {_format_number(row.revenue_diversification_gap)} is materially below benchmark "
            f"while margin gap {_format_number(row.operating_margin_gap)} remains above the -0.30 floor and "
            f"25% stress severity is {row.stress_25pct_severity}."
        )
    if label == "Needs Data Diligence":
        reasons = ", ".join(row.action_label_rationale) if row.action_label_rationale else "contract triggers"
        return (
            f"This row triggered {reasons}, with benchmark status {row.benchmark_status}, "
            f"confidence {row.checkpoint1_confidence_tier}, and resilience gap {_format_number(row.resilience_gap)}."
        )
    return (
        f"Primary constraint is {_normalize_constraint_label(row.recovery_analog_constraint)} with "
        f"margin gap {_format_number(row.operating_margin_gap)}, runway gap {_format_number(row.operating_runway_gap)}, "
        f"and diversification gap {_format_number(row.revenue_diversification_gap)}."
    )


def _confidence_note(row) -> str:
    if row.checkpoint1_confidence_tier == "Low" and row.urgency_severity == "acute":
        return (
            "Confidence: Low. The available data suggests potential imminent distress, "
            "but current filings should be verified directly before any capital decision."
        )
    if row.checkpoint1_confidence_tier == "Low":
        return (
            "Confidence: Low. Data confidence is insufficient to support a specific action recommendation "
            "and the row should be reviewed directly before action."
        )
    if row.checkpoint1_confidence_tier == "Medium":
        return "Confidence: Medium. Moderate confidence due to filing or cohort limitations."
    return "Confidence: High."


def _stress_sentence(row) -> str:
    if row.stress_test_status != "computed":
        return "Stress test: unavailable due to missing raw inputs."
    burn = (
        f"burn months {_format_number(row.stress_25pct_burn_months, decimals=1)}"
        if not pd.isna(row.stress_25pct_burn_months)
        else "no burn-month estimate"
    )
    return (
        f"Stress test: a 25% shock to the largest revenue source yields {burn} "
        f"with severity {row.stress_25pct_severity}."
    )


def _trend_sentence(trend_direction: str) -> str:
    if trend_direction == "unavailable":
        return ""
    return f" Trend is {trend_direction}."


def _build_memo_texts(df: pd.DataFrame) -> list[str]:
    memos: list[str] = []
    for row in df.itertuples(index=False):
        snapshot = (
            f"{row.org_name} ({row.state}) FY{row.fiscal_year}, {row.size_bucket}, "
            f"revenue {_format_currency(row.total_revenue)}."
        )
        cohort = (
            f"Cohort: {row.ntee_major_category}, {int(row.cohort_size) if not pd.isna(row.cohort_size) else 'null'} orgs, "
            f"benchmark rule {row.benchmark_rule}."
        )
        resilience = (
            f"Resilience: margin {_format_number(row.operating_margin)} vs {_format_number(row.benchmark_operating_margin_q75)} "
            f"({_gap_phrase(row.operating_margin_gap)}); runway {_format_number(row.operating_runway_proxy_months, decimals=1)} "
            f"vs {_format_number(row.benchmark_operating_runway_q75, decimals=1)} ({_gap_phrase(row.operating_runway_gap)}); "
            f"diversification {_format_number(row.revenue_diversification_index)} vs "
            f"{_format_number(row.benchmark_revenue_diversification_q75)} "
            f"({_gap_phrase(row.revenue_diversification_gap)}).{_trend_sentence(row.trend_direction)}"
        )
        analog = _top_analog_sentence(row.recovery_analog_evidence, _normalize_constraint_label(row.recovery_analog_constraint))
        action = f"Recommended action: {row.action_label}. {_action_reason_sentence(row)}"
        memo = " ".join(
            [
                snapshot,
                cohort,
                resilience,
                _stress_sentence(row),
                analog,
                action,
                _confidence_note(row),
            ]
        )
        if len(memo.split()) > 250:
            raise ValueError(
                f"Memo exceeded 250 words for {(row.ein, row.fiscal_year)}: {len(memo.split())}"
            )
        memos.append(memo)
    return memos


def validate_output(stage2_df: pd.DataFrame, stage3_df: pd.DataFrame, schema: dict):
    schema_cols = set(schema["properties"].keys())
    missing = schema_cols - set(stage3_df.columns)
    if missing:
        raise ValueError(f"Stage 3 output missing schema columns: {sorted(missing)}")

    if len(stage2_df) != len(stage3_df):
        raise ValueError(f"Row count mismatch: Stage 2={len(stage2_df)}, Stage 3={len(stage3_df)}")

    s2_ids = list(stage2_df[["ein", "fiscal_year"]].itertuples(index=False, name=None))
    s3_ids = list(stage3_df[["ein", "fiscal_year"]].itertuples(index=False, name=None))
    if s2_ids != s3_ids:
        raise ValueError("Stage 3 changed (ein, fiscal_year) identity or order")

    if stage3_df["action_label"].isna().any():
        raise ValueError("Stage 3 output contains null action labels")
    if stage3_df["trend_direction"].isna().any():
        raise ValueError("Stage 3 output contains null trend_direction values")

    numeric_cols = stage3_df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        inf_count = np.isinf(stage3_df[col].dropna()).sum()
        if inf_count > 0:
            raise ValueError(f"Infinity values found in {col}: {inf_count}")


def build_stage3(
    stage2_source=STAGE2_GIT_REF,
    panel_path: Path = PANEL_PATH,
    output_path: Path = OUTPUT_PATH,
    schema_path: Path = SCHEMA_PATH,
) -> pd.DataFrame:
    stage2_df = _load_stage2(stage2_source)
    logger.info("Stage 2 loaded: %s rows, %s EINs", f"{len(stage2_df):,}", f"{stage2_df['ein'].nunique():,}")

    panel_path = resolve_panel_path(panel_path)
    memo_fields = hydrate_memo_fields(stage2_df[["ein", "fiscal_year"]], panel_path)
    working = stage2_df.copy()
    working["org_name"] = memo_fields["org_name"]
    working["total_revenue"] = memo_fields["total_revenue"]
    working["ntee_major_category"] = memo_fields["ntee_major_category"]

    working = compute_trend_direction(working)
    working = assign_action_labels(working)
    working["memo_text"] = _build_memo_texts(working)

    final_df = stage2_df.copy()
    for col in ["action_label", "action_label_rationale", "memo_text", "trend_direction"]:
        final_df[col] = working[col]

    schema = json.loads(Path(schema_path).read_text())
    for col in schema["properties"]:
        if col not in final_df.columns:
            final_df[col] = pd.NA

    extra_cols = [c for c in final_df.columns if c not in schema["properties"]]
    if extra_cols:
        final_df = final_df.drop(columns=extra_cols)

    validate_output(stage2_df, final_df, schema)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    final_df.to_parquet(output_path, index=False)
    logger.info("Wrote %s rows to %s", f"{len(final_df):,}", output_path)
    _print_summary(final_df)
    return final_df


def _print_summary(df: pd.DataFrame):
    logger.info("=== Stage 3 Summary ===")
    logger.info("Total rows: %s", f"{len(df):,}")
    logger.info("action_label:\n%s", df["action_label"].value_counts(dropna=False).to_string())
    logger.info("trend_direction:\n%s", df["trend_direction"].value_counts(dropna=False).to_string())
    shared = df[df.get("is_shared_sample", pd.Series(False, index=df.index)).fillna(False)]
    if len(shared):
        logger.info("Shared sample labels:\n%s", shared[["ein", "fiscal_year", "action_label"]].to_string(index=False))


def main():
    parser = argparse.ArgumentParser(description="Build Fairlight Stage 3 output.")
    parser.add_argument("--stage2", default=STAGE2_GIT_REF, help="Stage 2 source (git ref or file path)")
    parser.add_argument("--panel", default=str(PANEL_PATH), help="Path to panel parquet")
    parser.add_argument("--output", default=str(OUTPUT_PATH), help="Output path for Stage 3 parquet")
    parser.add_argument("--schema", default=str(SCHEMA_PATH), help="Path to Stage 3 schema JSON")
    args = parser.parse_args()

    build_stage3(
        stage2_source=args.stage2,
        panel_path=Path(args.panel),
        output_path=Path(args.output),
        schema_path=Path(args.schema),
    )


if __name__ == "__main__":
    main()
