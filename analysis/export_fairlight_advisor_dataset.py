#!/usr/bin/env python3
"""
Export a curated Fairlight advisor dataset for the frontend app.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
STAGE3_PATH = ROOT / "outputs" / "stage3" / "scored_rows_with_actions.parquet"
STAGE4_PATH = ROOT / "outputs" / "stage4" / "distress_predictions.parquet"
RAW_PANEL_PATH = ROOT / "Data" / "panel_990_extended_v4.parquet"
METRICS_PATH = ROOT / "outputs" / "stage4" / "distress_model_metrics.json"

ACTION_QUOTAS = {
    "Deep Review": 30,
    "Stabilize": 36,
    "Diversify": 30,
    "Amplify": 24,
}
ACTION_PRIORITY = {
    "Deep Review": 4,
    "Stabilize": 3,
    "Diversify": 2,
    "Amplify": 1,
}
FAIRLIGHT_REVENUE_MIN = 250_000
FAIRLIGHT_REVENUE_MAX = 100_000_000
TIER_PRIORITY = {"High": 3, "Medium": 2, "Low": 1}
URGENCY_PRIORITY = {"acute": 3, "flagged": 2, "none": 1}
CONSTRAINT_LABELS = {
    "low_runway": "runway pressure",
    "low_margin": "operating deficit pressure",
    "high_concentration_in_volatile_source": "revenue concentration pressure",
}
SOURCE_LABELS = {
    "contributions": "contributions",
    "program_revenue": "program revenue",
    "investment_income": "investment income",
    "other_revenue": "other revenue",
}


def _read_stage_data() -> pd.DataFrame:
    stage3 = pd.read_parquet(STAGE3_PATH)
    stage4 = pd.read_parquet(STAGE4_PATH)
    raw = pd.read_parquet(
        RAW_PANEL_PATH,
        columns=["ein", "fiscal_year", "tax_period_end", "org_name", "ntee_major_category", "total_revenue", "state"],
    )
    raw["tax_period_end"] = pd.to_datetime(raw["tax_period_end"], errors="coerce")
    raw = raw.sort_values(["ein", "fiscal_year", "tax_period_end"]).drop_duplicates(["ein", "fiscal_year"], keep="last")

    merged = stage3.merge(stage4, on=["ein", "fiscal_year"], how="left", validate="one_to_one")
    merged = merged.merge(
        raw[["ein", "fiscal_year", "org_name", "ntee_major_category", "total_revenue"]],
        on=["ein", "fiscal_year"],
        how="left",
        validate="one_to_one",
    )
    merged = merged.sort_values(["ein", "fiscal_year"]).groupby("ein", as_index=False).tail(1).reset_index(drop=True)
    return merged


def _load_baseline_rate() -> float:
    metrics = json.loads(METRICS_PATH.read_text())
    return float(metrics["test_metrics"]["baseline_rate"])


def _optional_str(value: Any, fallback: str = "") -> str:
    if pd.isna(value):
        return fallback
    return str(value)


def _optional_float(value: Any, default: float = 0.0) -> float:
    if pd.isna(value):
        return default
    return float(value)


def _format_currency(value: Any) -> str:
    amount = _optional_float(value, 0.0)
    if abs(amount) < 1_000:
        return "Unavailable"
    return "${:,.0f}".format(amount)


def _format_percent(value: Any) -> str:
    return "{:.1f}%".format(_optional_float(value, 0.0) * 100.0)


def _format_delta(value: Any) -> str:
    numeric = _optional_float(value, 0.0)
    return "{:+.2f}".format(numeric)


def _humanize_action_reason(row: pd.Series) -> str:
    label = row["action_label"]
    constraint = CONSTRAINT_LABELS.get(_optional_str(row.get("recovery_analog_constraint"), ""), "portfolio pressure")
    if label == "Amplify":
        return "Strong peer-relative profile with room to back from strength."
    if label == "Diversify":
        return "Operationally viable, but concentration risk still needs active mitigation."
    if label == "Deep Review":
        if _optional_str(row.get("urgency_severity"), "none") == "acute":
            return "Immediate diligence is warranted before capital is committed."
        return "This case needs deeper diligence before a capital recommendation is defensible."
    if constraint == "runway pressure":
        return "The core issue is liquidity runway, which makes near-term support design decisive."
    if constraint == "operating deficit pressure":
        return "The core issue is margin pressure, so any support should be paired with operating reset discipline."
    return "The core issue is concentrated revenue dependence, so support should be tied to diversification progress."


def _confidence_note(row: pd.Series) -> str:
    confidence = _optional_str(row.get("checkpoint1_confidence_tier"), "Medium")
    benchmark_status = _optional_str(row.get("benchmark_status"), "ok")
    if confidence == "High":
        return "High confidence: peer benchmarks resolved cleanly and the filing history is stable enough for direct comparison."
    if confidence == "Low":
        return "Low confidence: the filing history or peer benchmark support is thin, so advisor judgment should dominate."
    if benchmark_status == "insufficient_resilient_refs":
        return "Medium confidence: the case is informative, but resilient peer references are limited."
    return "Medium confidence: the signal is usable, but it should be read with context rather than as a standalone answer."


def _why_surfaced(row: pd.Series) -> str:
    action = _optional_str(row["action_label"])
    distress = _optional_str(row["distress_tier"])
    confidence = _optional_str(row["checkpoint1_confidence_tier"])
    if action == "Amplify":
        return f"Surfaced as a back-from-strength candidate with {distress.lower()} forward distress risk and {confidence.lower()} confidence."
    if action == "Diversify":
        return f"Surfaced as a diversification case with concentrated revenue exposure and {distress.lower()} forward distress risk."
    if action == "Deep Review":
        return f"Surfaced because recommendation certainty is low relative to downside exposure; current confidence is {confidence.lower()}."
    return f"Surfaced as a stabilization case with practical intervention potential and {distress.lower()} forward distress risk."


def _intervention_type(row: pd.Series) -> str:
    action = _optional_str(row["action_label"])
    constraint = _optional_str(row.get("recovery_analog_constraint"), "")
    if action == "Amplify":
        return "Growth-aligned support"
    if action == "Diversify":
        return "Diversification support"
    if action == "Deep Review":
        return "Diligence-first review"
    if constraint == "low_runway":
        return "Bridge support"
    if constraint == "low_margin":
        return "Operating reset support"
    return "Revenue diversification support"


def _decision_status(row: pd.Series) -> str:
    action = _optional_str(row["action_label"])
    if action == "Amplify":
        return "Back from strength"
    if action == "Diversify":
        return "Support with diversification guardrails"
    if action == "Deep Review":
        return "Pause for direct diligence"
    return "Support with operating guardrails"


def _stress_summary(row: pd.Series) -> dict[str, Any]:
    source = SOURCE_LABELS.get(_optional_str(row.get("largest_revenue_source"), ""), "largest revenue source")
    source_pct = _optional_float(row.get("largest_revenue_source_pct"), 0.0) * 100.0
    return {
        "headline": f"{_optional_str(row.get('stress_25pct_severity'), 'Unavailable').title()} under 25% source shock",
        "largestSource": source,
        "largestSourcePct": round(source_pct, 1),
        "severity25": _optional_str(row.get("stress_25pct_severity"), "unavailable").title(),
        "severity50": _optional_str(row.get("stress_50pct_severity"), "unavailable").title(),
        "burnMonths25": None if pd.isna(row.get("stress_25pct_burn_months")) else round(float(row["stress_25pct_burn_months"]), 1),
        "burnMonths50": None if pd.isna(row.get("stress_50pct_burn_months")) else round(float(row["stress_50pct_burn_months"]), 1),
    }


def _analog_cards(row: pd.Series) -> list[dict[str, Any]]:
    evidence = row.get("recovery_analog_evidence")
    if evidence is None or (isinstance(evidence, float) and pd.isna(evidence)):
        evidence = []
    elif not isinstance(evidence, list):
        evidence = list(evidence)
    cards: list[dict[str, Any]] = []
    for item in evidence[:3]:
        cards.append(
            {
                "orgName": _optional_str(item.get("org_name"), "Comparable organization"),
                "state": _optional_str(item.get("state"), "NA"),
                "metricName": _optional_str(item.get("matched_metric_name"), "recovery metric").replace("_", " "),
                "preValue": round(_optional_float(item.get("matched_metric_pre_value"), 0.0), 2),
                "postValue": round(_optional_float(item.get("matched_metric_post_value"), 0.0), 2),
                "recoveryWindow": f"{int(item.get('pre_window_year', 0))}-{int(item.get('post_recovery_year', 0))}",
            }
        )
    return cards


def _scenario_cards(row: pd.Series, baseline_rate: float) -> list[dict[str, Any]]:
    distress_prob = _optional_float(row["distress_prob"])
    concentration_gap = _optional_float(row["revenue_diversification_gap"])
    runway_gap = _optional_float(row["operating_runway_gap"])
    margin_gap = _optional_float(row["operating_margin_gap"])
    label = _optional_str(row["action_label"])

    downside_effect = "Recommendation pressure increases"
    if distress_prob < baseline_rate:
        downside_effect = "Recommendation likely holds, but monitoring tightens"

    reserve_effect = "Runway support can materially improve the case"
    if runway_gap >= 0:
        reserve_effect = "Reserve support is additive rather than critical"

    diversification_effect = "Diversification improvement can de-risk the case"
    if concentration_gap >= 0:
        diversification_effect = "Diversification is already comparatively healthy"

    return [
        {
            "id": "downside-shock",
            "title": "Downside shock",
            "thesis": f"A repeat shock to the current largest revenue source would test the {label.lower()} stance immediately.",
            "effectOnRisk": downside_effect,
            "effectOnRecommendation": _optional_str(row.get("stress_25pct_severity"), "unavailable").title(),
        },
        {
            "id": "reserve-support",
            "title": "Reserve or bridge support",
            "thesis": f"Closing the runway gap of {_format_delta(runway_gap)} months is the fastest path to stabilization.",
            "effectOnRisk": reserve_effect,
            "effectOnRecommendation": "Best fit when liquidity is the binding constraint",
        },
        {
            "id": "diversification-improvement",
            "title": "Diversification improvement",
            "thesis": f"Moving diversification by {_format_delta(abs(concentration_gap))} toward benchmark can change how resilient this case looks.",
            "effectOnRisk": diversification_effect,
            "effectOnRecommendation": "Most relevant when revenue concentration dominates the case",
        },
    ]


def _build_priority(row: pd.Series) -> float:
    action_score = ACTION_PRIORITY.get(_optional_str(row["action_label"]), 0)
    tier_score = TIER_PRIORITY.get(_optional_str(row["distress_tier"]), 0)
    urgency_score = URGENCY_PRIORITY.get(_optional_str(row["urgency_severity"], "none"), 0)
    stress_score = TIER_PRIORITY.get(_optional_str(row["stress_25pct_severity"]).title(), 0)
    analog_score = min(int(_optional_float(row.get("recovery_analog_count"), 0.0)), 3)
    magnitude = (
        abs(_optional_float(row.get("operating_margin_gap"), 0.0))
        + abs(_optional_float(row.get("operating_runway_gap"), 0.0)) / 10.0
        + abs(_optional_float(row.get("revenue_diversification_gap"), 0.0))
    )
    return action_score * 100 + tier_score * 20 + urgency_score * 10 + stress_score * 5 + analog_score + magnitude


def _curated_shortlist(df: pd.DataFrame) -> pd.DataFrame:
    ranked = df.copy()
    ranked = ranked[
        ranked["total_revenue"].notna()
        & (ranked["total_revenue"] >= FAIRLIGHT_REVENUE_MIN)
        & (ranked["total_revenue"] < FAIRLIGHT_REVENUE_MAX)
    ].copy()
    ranked["priority_score"] = ranked.apply(_build_priority, axis=1)
    ranked = ranked.sort_values(
        ["action_label", "priority_score", "distress_prob", "total_revenue", "ein"],
        ascending=[True, False, False, False, True],
    )

    selected_parts = []
    for label, quota in ACTION_QUOTAS.items():
        label_rows = ranked[ranked["action_label"] == label].head(quota)
        selected_parts.append(label_rows)

    selected = pd.concat(selected_parts, ignore_index=True)
    selected = selected.sort_values(["priority_score", "distress_prob", "org_name"], ascending=[False, False, True]).reset_index(drop=True)
    return selected


def _organization_record(row: pd.Series, baseline_rate: float) -> dict[str, Any]:
    distress_prob = _optional_float(row["distress_prob"])
    recommendation_caveats = [
        _confidence_note(row),
        f"Stress posture: {_optional_str(row.get('stress_25pct_severity'), 'unavailable').title()} under a 25% source shock.",
    ]

    return {
        "id": f"{row['ein']}-{int(row['fiscal_year'])}",
        "ein": _optional_str(row["ein"]),
        "orgName": _optional_str(row["org_name"], "Unknown organization"),
        "fiscalYear": int(row["fiscal_year"]),
        "state": _optional_str(row["state"]),
        "nteeCategory": _optional_str(row.get("ntee_major_category"), "Unclassified") or "Unclassified",
        "sizeBucket": _optional_str(row.get("size_bucket"), "Unknown"),
        "revenueAmount": None if pd.isna(row.get("total_revenue")) else round(float(row["total_revenue"]), 2),
        "revenueDisplay": _format_currency(row.get("total_revenue")),
        "actionLabel": _optional_str(row["action_label"]),
        "distressTier": _optional_str(row["distress_tier"]),
        "distressProbability": round(distress_prob * 100.0, 1),
        "distressBaseline": round(baseline_rate * 100.0, 1),
        "distressLabel": f"{_optional_str(row['distress_tier'])} distress risk",
        "decisionReason": _humanize_action_reason(row),
        "whySurfaced": _why_surfaced(row),
        "confidenceTier": _optional_str(row["checkpoint1_confidence_tier"]),
        "confidenceNote": _confidence_note(row),
        "trendDirection": _optional_str(row.get("trend_direction"), "unavailable"),
        "memoText": _optional_str(row["memo_text"]),
        "benchmark": {
            "headline": f"{_optional_str(row['action_label'])} vs peer benchmark",
            "operatingMarginGap": _format_delta(row.get("operating_margin_gap")),
            "operatingRunwayGap": _format_delta(row.get("operating_runway_gap")),
            "diversificationGap": _format_delta(row.get("revenue_diversification_gap")),
            "peerCohort": _optional_str(row.get("cohort_key")),
            "benchmarkRule": _optional_str(row.get("benchmark_rule")),
        },
        "stress": _stress_summary(row),
        "distress": {
            "headline": f"{round(distress_prob * 100.0, 1)}% risk vs. {round(baseline_rate * 100.0, 1)}% baseline",
            "tier": _optional_str(row["distress_tier"]),
            "probability": round(distress_prob * 100.0, 1),
            "baseline": round(baseline_rate * 100.0, 1),
        },
        "analogs": _analog_cards(row),
        "scenarioCards": _scenario_cards(row, baseline_rate),
        "recommendation": {
            "status": _decision_status(row),
            "interventionType": _intervention_type(row),
            "rationale": _humanize_action_reason(row),
            "caveats": recommendation_caveats,
            "exportSummary": f"{_optional_str(row['org_name'])} is currently a {_optional_str(row['action_label']).lower()} case with {_optional_str(row['distress_tier']).lower()} forward distress risk and {_optional_str(row['checkpoint1_confidence_tier']).lower()} confidence.",
        },
    }


def export_dataset(output_path: Path) -> dict[str, Any]:
    baseline_rate = _load_baseline_rate()
    curated = _curated_shortlist(_read_stage_data())

    organizations = [_organization_record(row, baseline_rate) for _, row in curated.iterrows()]
    payload = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "summary": {
            "totalOrganizations": len(organizations),
            "distressBaselineRate": round(baseline_rate * 100.0, 1),
            "countsByAction": curated["action_label"].value_counts().sort_index().to_dict(),
            "countsByDistress": curated["distress_tier"].value_counts().sort_index().to_dict(),
            "countsByConfidence": curated["checkpoint1_confidence_tier"].value_counts().sort_index().to_dict(),
            "states": sorted(curated["state"].dropna().unique().tolist()),
        },
        "organizations": organizations,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2))
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the Fairlight advisor JSON dataset.")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON path.")
    args = parser.parse_args()
    export_dataset(output_path=args.output)


if __name__ == "__main__":
    main()
