#!/usr/bin/env python3
"""
Export the curated 20-org demo dataset for the Fairlight frontend.

Composition:
  - 5 UAB orgs from D3 Lane 1 (Portfolio Growth) — boutique-serviceable, $2M-$50M revenue
  - 5 RCR orgs from D4 stress-test demo curation
  - 10 WFF/NDD orgs from D5.1 Crisis Replay shortlist (these get a `crisisReplay` payload)

Per-org enrichment beyond the legacy exporter:
  - Replaces stress fields with D4 deficit-based runway formula
  - Re-scores distress probability with D5.1 expanded XGBoost model
  - For Crisis Replay orgs, attaches the full crisisReplay payload
    (call-year baseline, T+1/T+2 outcomes, trajectory, SHAP explanation,
     percentile rank in test cohort)
  - Generates analogs[] per-org from the panel using bucket+sector+size
    matching against orgs that improved on the org's primary stress signal.

Output: fairlight-advisor/src/data/fairlight-advisor.json (overwrite)
"""
from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PANEL_PATH = ROOT / "data" / "processed" / "panel_990_extended_v4.parquet"
STAGE3_PATH = ROOT / "outputs" / "stage3" / "scored_rows_with_actions.parquet"
STAGE4_PATH = ROOT / "outputs" / "stage4" / "distress_predictions.parquet"
METRICS_PATH = ROOT / "outputs" / "stage4" / "distress_model_metrics.json"
D5_1_DIR = ROOT / "outputs" / "d5_1_validation"
D5_TRAJECTORIES = ROOT / "outputs" / "d5_validation" / "crisis_replay_trajectories.json"
XGB_MODEL_PATH = D5_1_DIR / "models" / "xgboost_expanded.joblib"
CRISIS_SHORTLIST_V2 = D5_1_DIR / "crisis_replay_shortlist_v2.csv"

OUTPUT_PATH = ROOT / "fairlight-advisor" / "src" / "data" / "fairlight-advisor.json"

# ───────────────────────────────────────────────────────────────────────
# 20-org demo set
# ───────────────────────────────────────────────────────────────────────
DEMO_EINS_BY_BUCKET: dict[str, list[str]] = {
    "uab": [
        "330820066",  # WESTERN CENTER COMMUNITY FOUNDATION
        "943085954",  # THE CAREY SCHOOL
        "910549511",  # BOYS AND GIRLS CLUBS OF SNOHOMISH COUNTY
        "954831387",  # DEBBIE ALLEN DANCE INC
        "270179192",  # CENTER FOR COMPREHENSIVE CARE (BLOOD DISORDERS)
    ],
    "rcr": [
        "954407317",  # JHA GERIATRIC SERVICES INC
        "237314808",  # NATIONAL HEALTH FOUNDATION
        "205196718",  # CALIFORNIA VIRTUAL ACADEMY AT LOS ANGELES
        "455037770",  # GREEN LAKE PRESCHOOL & CHILDCARE
        "942909990",  # SEQUOIA HOSPITAL FOUNDATION
    ],
    "crisis_replay": [
        "330789247",  # THE MEADOWS IN IRVINE
        "953495141",  # DOMESTIC VIOLENCE SOLUTIONS FOR SANTA BARBARA COUNTY
        "952468116",  # BOYS & GIRLS CLUBS OF THE CENTRAL COAST
        "320483333",  # KINGDOM DEVELOPMENT INC
        "237279960",  # ST JOHN KRONSTADT HOME
        "952872549",  # HELP OF OJAI INC
        "943129859",  # KIRKLAND PERFORMANCE CENTER
        "911705420",  # EXPLORER WEST INDEPENDENT MIDDLE SCHOOL
        "942887073",  # BERKELEY SOCIETY FOR THE PRESERVATION OF TRADITIONAL MUSIC
        "943169584",  # VIETNAM HEALTH EDUCATION
    ],
}

ALL_DEMO_EINS = (
    DEMO_EINS_BY_BUCKET["uab"]
    + DEMO_EINS_BY_BUCKET["rcr"]
    + DEMO_EINS_BY_BUCKET["crisis_replay"]
)
CRISIS_REPLAY_EINS = set(DEMO_EINS_BY_BUCKET["crisis_replay"])

# Bucket overrides — force the desired bucket for the demo, regardless of
# what stage3 says for the latest filing year. Crisis Replay orgs naturally
# land in WFF/NDD post-crisis (which is what we want for the Portfolio Inbox).
BUCKET_OVERRIDE: dict[str, str] = {
    ein: "Underinvested Asset Base" for ein in DEMO_EINS_BY_BUCKET["uab"]
}
BUCKET_OVERRIDE.update(
    {ein: "Revenue Concentration Risk" for ein in DEMO_EINS_BY_BUCKET["rcr"]}
)
# WFF/NDD picks: leave as-is from stage3 (most are WFF; Kirkland is NDD)

# ───────────────────────────────────────────────────────────────────────
# Existing exporter helpers (reused)
# ───────────────────────────────────────────────────────────────────────
import sys
sys.path.insert(0, str(ROOT))
from analysis.export_fairlight_advisor_dataset import (  # noqa: E402
    RAW_PANEL_COLUMNS,
    _read_raw_panel,
    _read_stage_data,
    _build_history_support,
    _organization_record,
    _load_baseline_rate,
    _format_currency,
)
from scoring.stage4_distress_model import (  # noqa: E402
    DISTRESS_NUMERIC_FEATURES,
    DISTRESS_CATEGORICAL_FEATURES,
    build_modeling_frame,
)
from scoring.d5_1_expanded_models import (  # noqa: E402
    compute_expanded_features,
    EXPANDED_NUMERIC,
    EXPANDED_CATEGORICAL,
)


# ───────────────────────────────────────────────────────────────────────
# D4 stress fields — deficit-based runway formula on 4 top-level revenue buckets
# ───────────────────────────────────────────────────────────────────────
COMPARISON_SOURCES = [
    "contributions_grants",
    "program_service_revenue",
    "investment_income",
    "other_revenue",
]
SOURCE_LABELS = {
    "contributions_grants": "Contributions & grants",
    "program_service_revenue": "Program service revenue",
    "investment_income": "Investment income",
    "other_revenue": "Other revenue",
}


def _safe_float(value: Any) -> float:
    """Convert a panel cell to float, returning 0 for NaN/None/missing."""
    if value is None: return 0.0
    try:
        f = float(value)
    except (TypeError, ValueError):
        return 0.0
    if f != f:  # NaN check
        return 0.0
    return f


def _largest_source(row: pd.Series) -> tuple[str, float]:
    vals = {c: _safe_float(row.get(c)) for c in COMPARISON_SOURCES}
    best = max(vals, key=vals.get)
    return SOURCE_LABELS[best], vals[best]


def _deficit_runway_months(cash: float, expenses: float, revenue: float) -> float:
    if expenses <= 0:
        return 120.0
    deficit = expenses - revenue
    if deficit <= 0:
        return 120.0
    return min(120.0, cash / (deficit / 12))


def _shocked_runway(cash: float, expenses: float, revenue: float, largest: float, shock_pct: float) -> float:
    new_revenue = revenue - largest * shock_pct
    return _deficit_runway_months(cash, expenses, new_revenue)


def _stress_summary_d4(row: pd.Series) -> dict[str, Any]:
    """Replace legacy stress_summary with D4 deficit-based formula."""
    revenue = _safe_float(row.get("total_revenue"))
    expenses = _safe_float(row.get("total_expenses"))
    cash = _safe_float(row.get("cash_non_interest_bearing")) + _safe_float(row.get("savings_temporary_investments"))
    largest_name, largest_amount = _largest_source(row)
    largest_pct = (largest_amount / revenue * 100) if revenue > 0 else 0.0
    largest_pct = min(max(largest_pct, 0), 100)  # display cap

    shock_25 = _shocked_runway(cash, expenses, revenue, largest_amount, 0.25)
    shock_50 = _shocked_runway(cash, expenses, revenue, largest_amount, 0.50)

    def _severity(months: float) -> str:
        if months < 1: return "Severe"
        if months < 3: return "Moderate"
        if months < 6: return "Mild"
        return "None"

    # Always write a runway number (capped at 120 months) so the UI's slider
    # renders for every org. Healthy orgs show 120mo (plenty-of-runway state);
    # concentrated orgs show dramatic collapse (5–10mo).
    return {
        "headline": f"{largest_pct:.0f}% revenue from {largest_name.replace('_', ' ')}",
        "largestSource": largest_name,
        "largestSourcePct": round(largest_pct, 1),
        "severity25": _severity(shock_25),
        "severity50": _severity(shock_50),
        "burnMonths25": round(shock_25, 1),
        "burnMonths50": round(shock_50, 1),
    }


# ───────────────────────────────────────────────────────────────────────
# XGBoost re-scoring (D5.1 expanded model)
# ───────────────────────────────────────────────────────────────────────
def _score_with_xgboost(modeled_subset: pd.DataFrame) -> dict[str, float]:
    """Score each demo org with the D5.1 expanded XGBoost. Returns {ein: prob}."""
    bundle = joblib.load(XGB_MODEL_PATH)
    pre = bundle["pre"]; xgb_clf = bundle["xgb"]

    # Recompute expanded features on the panel, then filter to demo EINs+latest FY
    feature_cols = EXPANDED_NUMERIC + EXPANDED_CATEGORICAL
    # Ensure dtype consistency
    sub = modeled_subset.copy()
    for c in EXPANDED_NUMERIC:
        sub[c] = pd.to_numeric(sub[c], errors="coerce").astype(float)
    for c in EXPANDED_CATEGORICAL:
        sub[c] = sub[c].astype("object").where(sub[c].notna(), np.nan)

    X = sub[feature_cols]
    X_mat = pre.transform(X)
    if hasattr(X_mat, "toarray"):
        X_mat = X_mat.toarray()
    proba = xgb_clf.predict_proba(X_mat)[:, 1]
    return dict(zip(sub["ein"].astype(str), proba.tolist()))


# ───────────────────────────────────────────────────────────────────────
# Crisis Replay payload
# ───────────────────────────────────────────────────────────────────────
def _build_crisis_replay_payloads() -> dict[str, dict[str, Any]]:
    """Read v2 shortlist + trajectories and produce {ein: crisisReplay payload}."""
    sl = pd.read_csv(CRISIS_SHORTLIST_V2)
    trajectories = json.loads(D5_TRAJECTORIES.read_text())
    sl["ein"] = sl["ein"].astype(str)

    # Compute risk percentile (rank against all D5.1 test predictions)
    test_preds_path = ROOT / "outputs" / "d5_validation" / "temporal_test_predictions.parquet"
    percentile_lookup: dict[tuple[str, int], float] = {}
    if test_preds_path.exists():
        tp = pd.read_parquet(test_preds_path, columns=["ein", "fiscal_year", "logistic_proba"])
        tp["ein"] = tp["ein"].astype(str)
        tp["fiscal_year"] = tp["fiscal_year"].astype(int)
        # Re-score the test set with XGBoost so percentile is on the right model
        # — for simplicity we rank by logistic_proba (XGBoost not persisted on test
        # rows). This is a conservative approximation.
        tp["pct"] = tp["logistic_proba"].rank(pct=True) * 100
        for _, r in tp.iterrows():
            percentile_lookup[(r["ein"], int(r["fiscal_year"]))] = float(r["pct"])

    out: dict[str, dict[str, Any]] = {}
    for _, r in sl.iterrows():
        ein = r["ein"]
        if ein not in CRISIS_REPLAY_EINS:
            continue
        call_year = int(r["call_year_T"])

        traj_record = trajectories.get(ein, {})
        trajectory_raw = traj_record.get("trajectory", [])
        # Convert to TS schema
        trajectory: list[dict[str, Any]] = []
        for t in trajectory_raw:
            if t.get("missing"):
                continue
            margin_raw = t.get("operating_margin_pct")
            margin_decimal = (margin_raw / 100.0) if margin_raw is not None else 0.0
            trajectory.append({
                "fiscalYear": int(t["fy"]),
                "netAssets": t.get("net_assets_eoy") or 0,
                "totalRevenue": t.get("total_revenue") or 0,
                "totalExpenses": t.get("total_expenses") or 0,
                "operatingMargin": margin_decimal,
                "cashRunwayMonths": t.get("cash_runway_months") or 0,
                "largestSourcePct": t.get("largest_source_pct") or 0,
                "distressProbability": None,
                "northstarScore": None,
            })

        # Build outcome summaries by comparing T-row to T+1/T+2
        t_row = next((t for t in trajectory if t["fiscalYear"] == call_year), None)
        t1_row = next((t for t in trajectory if t["fiscalYear"] == call_year + 1), None)
        t2_row = next((t for t in trajectory if t["fiscalYear"] == call_year + 2), None)

        def _summary(label_year: int, baseline: dict, post: dict) -> str:
            margin_after = post["operatingMargin"] * 100
            runway_after = post["cashRunwayMonths"]
            return (f"FY{label_year}: margin {margin_after:+.1f}%, "
                    f"runway {runway_after:.1f}mo")

        t1_summary = _summary(call_year + 1, t_row or {}, t1_row) if t1_row and t_row else None
        t2_summary = _summary(call_year + 2, t_row or {}, t2_row) if t2_row and t_row else None

        # Risk percentile (top X% means P(percentile_rank > 100-X))
        pct = percentile_lookup.get((ein, call_year))
        risk_percentile_top = (100 - pct) if pct is not None else None

        out[ein] = {
            "callFiscalYear": call_year,
            "predictedDistressProbability": float(r["predicted_distress_proba"]),
            "predictedDistressProbabilityLogisticV2":
                float(r["predicted_distress_probability_logistic_v2"])
                if pd.notna(r.get("predicted_distress_probability_logistic_v2")) else None,
            "predictedDistressProbabilityXgboost":
                float(r["predicted_distress_probability_xgboost"])
                if pd.notna(r.get("predicted_distress_probability_xgboost")) else None,
            "riskPercentileTop": round(risk_percentile_top, 1) if risk_percentile_top is not None else None,
            "xgboostShapExplanation": r.get("xgboost_shap_explanation"),
            "netAssetsAtCall": float(r["net_assets_at_T"]) if pd.notna(r.get("net_assets_at_T")) else None,
            "revenueAtCall": float(r["total_revenue_at_T"]) if pd.notna(r.get("total_revenue_at_T")) else None,
            "marginAtCall": float(r["op_margin_at_T"]) if pd.notna(r.get("op_margin_at_T")) else None,
            "runwayAtCall": float(r["runway_at_T"]) if pd.notna(r.get("runway_at_T")) else None,
            "t1OutcomeSummary": t1_summary,
            "t2OutcomeSummary": t2_summary,
            "demoStrengthScore": float(r["demo_strength"]) if pd.notna(r.get("demo_strength")) else None,
            "trajectory": trajectory,
        }
    return out


# ───────────────────────────────────────────────────────────────────────
# Per-org analog generation (for Recovery Flight)
# ───────────────────────────────────────────────────────────────────────
def _generate_analogs(target_row: pd.Series, panel: pd.DataFrame) -> list[dict[str, Any]]:
    """
    For each demo org, find 3 peer orgs from the same NTEE major + state group
    that improved on the target's primary stress signal over a 3-5 year window.
    Returns objects matching the AnalogRecord schema.
    """
    target_ein = str(target_row["ein"])
    ntee = target_row.get("ntee_major_category")
    state = target_row.get("state")
    target_revenue = float(target_row.get("total_revenue") or 0)

    if pd.isna(ntee) or pd.isna(state):
        return []

    # Pick the metric the target needs to improve most
    margin = float(target_row.get("operating_margin") or 0)
    runway = float(target_row.get("operating_runway_proxy_months") or 120)
    rdi = float(target_row.get("revenue_diversification_index") or 0)

    if rdi < 0.3:
        metric_col, metric_name = "revenue_diversification_index_panel", "revenue_diversification_index"
    elif runway < 12:
        metric_col, metric_name = "shock_absorption_months", "operating_runway_proxy_months"
    else:
        metric_col, metric_name = "operating_margin_panel", "operating_margin"

    # Filter panel to same sector + state, same revenue band (0.3x to 3x target)
    rev_lo = max(0, target_revenue * 0.3)
    rev_hi = target_revenue * 3 if target_revenue > 0 else 1e9

    candidates = panel[
        (panel["ntee_major_category"] == ntee)
        & (panel["state"] == state)
        & (panel["total_revenue"].between(rev_lo, rev_hi))
        & (panel["ein"].astype(str) != target_ein)
    ].copy()
    if candidates.empty:
        # Relax to same NTEE only
        candidates = panel[
            (panel["ntee_major_category"] == ntee)
            & (panel["ein"].astype(str) != target_ein)
        ].copy()

    if candidates.empty:
        return []

    # Compute per-EIN improvement on the chosen metric (latest year vs 3 years prior)
    candidates["fiscal_year"] = candidates["fiscal_year"].astype(int)
    candidates["op_margin_pct"] = (
        (candidates["total_revenue"] - candidates["total_expenses"]) / candidates["total_revenue"]
    )

    # Build a metric series per ein
    metric_choices = {
        "revenue_diversification_index": lambda df: 1 - (
            (df["pct_contributions"].fillna(0) ** 2)
            + (df["pct_program_revenue"].fillna(0) ** 2)
            + (df["pct_investment_income"].fillna(0) ** 2)
            + (df["pct_other_revenue"].fillna(0) ** 2)
        ),
        "operating_margin": lambda df: df["op_margin_pct"],
        "operating_runway_proxy_months": lambda df: pd.Series(
            [_deficit_runway_months(
                (r.cash_non_interest_bearing or 0) + (r.savings_temporary_investments or 0),
                r.total_expenses or 0,
                r.total_revenue or 0,
            ) for r in df.itertuples()],
            index=df.index,
        ),
    }

    candidates["_metric"] = metric_choices[metric_name](candidates)

    analogs: list[dict[str, Any]] = []
    for ein, group in candidates.groupby("ein", sort=False):
        ordered = group.sort_values("fiscal_year")
        if len(ordered) < 4:
            continue
        # Look at 5-year window if available, else min 3-year
        for window in [5, 4, 3]:
            if len(ordered) < window:
                continue
            pre = ordered.iloc[-window]
            post = ordered.iloc[-1]
            pre_val = pre["_metric"]; post_val = post["_metric"]
            if pd.isna(pre_val) or pd.isna(post_val):
                continue
            improvement = post_val - pre_val
            if metric_name == "revenue_diversification_index" and improvement > 0.20:
                analogs.append({
                    "orgName": str(ordered.iloc[-1]["org_name"]),
                    "state": state,
                    "metricName": metric_name,
                    "preValue": float(pre_val),
                    "postValue": float(post_val),
                    "recoveryWindow": f"FY{int(pre.fiscal_year)}-FY{int(post.fiscal_year)}",
                    "_score": float(improvement),
                })
                break
            if metric_name == "operating_margin" and improvement > 0.10:
                analogs.append({
                    "orgName": str(ordered.iloc[-1]["org_name"]),
                    "state": state,
                    "metricName": metric_name,
                    "preValue": float(pre_val),
                    "postValue": float(post_val),
                    "recoveryWindow": f"FY{int(pre.fiscal_year)}-FY{int(post.fiscal_year)}",
                    "_score": float(improvement),
                })
                break
            if metric_name == "operating_runway_proxy_months" and improvement > 6:
                analogs.append({
                    "orgName": str(ordered.iloc[-1]["org_name"]),
                    "state": state,
                    "metricName": metric_name,
                    "preValue": float(pre_val),
                    "postValue": float(post_val),
                    "recoveryWindow": f"FY{int(pre.fiscal_year)}-FY{int(post.fiscal_year)}",
                    "_score": float(improvement),
                })
                break

    # Sort by improvement, take top 3
    analogs.sort(key=lambda a: a.pop("_score"), reverse=True)
    return analogs[:3]


# ───────────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────────
def main() -> None:
    print("Loading panel + stage data...")
    raw_panel = _read_raw_panel()
    curated_full = _read_stage_data(raw_panel)

    # Filter stage data to demo EINs (latest filing year per EIN)
    curated = curated_full[curated_full["ein"].astype(str).isin(ALL_DEMO_EINS)].copy()
    print(f"Demo orgs from stage data: {len(curated)}/20")
    missing = set(ALL_DEMO_EINS) - set(curated["ein"].astype(str))
    if missing:
        print(f"  ⚠️ Missing from stage data: {missing}")

    # The legacy `_read_stage_data` joins only a subset of panel columns onto
    # stage3. The D4 stress formula needs raw financials + individual revenue
    # sub-lines, so we pull them directly from the parquet and merge.
    stress_panel = pd.read_parquet(PANEL_PATH, columns=[
        "ein", "fiscal_year",
        "total_expenses",
        "contributions_grants",
        "program_service_revenue",
        "other_revenue",
        "cash_non_interest_bearing",
        "savings_temporary_investments",
    ])
    stress_panel["ein"] = stress_panel["ein"].astype(str)
    stress_panel["fiscal_year"] = stress_panel["fiscal_year"].astype(int)
    # Keep latest-FY row per EIN to match curated's grain
    stress_panel = (
        stress_panel.sort_values(["ein", "fiscal_year"])
                    .drop_duplicates(["ein", "fiscal_year"], keep="last")
    )
    curated["ein"] = curated["ein"].astype(str)
    curated["fiscal_year"] = curated["fiscal_year"].astype(int)
    curated = curated.merge(stress_panel, on=["ein", "fiscal_year"], how="left",
                             suffixes=("", "_panel"))

    # Apply bucket overrides
    curated["action_label"] = curated["ein"].astype(str).map(BUCKET_OVERRIDE).fillna(curated["action_label"])

    # Build expanded modeling frame so we can re-score with XGBoost
    print("Re-scoring with D5.1 expanded XGBoost...")
    year_counts = raw_panel.groupby("ein")["fiscal_year"].transform("nunique")
    eligible = raw_panel.loc[year_counts >= 5].copy()
    modeled = build_modeling_frame(eligible)
    modeled = modeled.loc[modeled["target"].notna()].copy()
    modeled["target"] = modeled["target"].astype(int)
    modeled = compute_expanded_features(modeled)
    modeled["ein"] = modeled["ein"].astype(str)
    modeled["fiscal_year"] = modeled["fiscal_year"].astype(int)

    # For each demo org, find its latest panel row that has a target (for XGBoost scoring)
    demo_modeled = (
        modeled[modeled["ein"].isin(ALL_DEMO_EINS)]
        .sort_values(["ein", "fiscal_year"])
        .groupby("ein", as_index=False)
        .last()
    )
    xgb_scores = _score_with_xgboost(demo_modeled)
    print(f"  XGBoost scored: {len(xgb_scores)}/20")

    # Apply XGBoost prediction to curated rows
    curated["distress_prob"] = curated["ein"].astype(str).map(xgb_scores).fillna(curated["distress_prob"])

    def _tier_from_prob(p: float) -> str:
        if p >= 0.6: return "High"
        if p >= 0.4: return "Medium"
        return "Low"
    curated["distress_tier"] = curated["distress_prob"].apply(_tier_from_prob)

    # Build history support
    target_eins = {str(e) for e in curated["ein"].astype(str).tolist()}
    target_peer_keys = {
        (str(state), str(category))
        for state, category in curated[["state", "ntee_major_category"]].itertuples(index=False, name=None)
    }
    history_lookup, peer_lookup, composition_lookup = _build_history_support(
        raw_panel, target_eins, target_peer_keys
    )

    baseline_rate = _load_baseline_rate()

    # Crisis Replay payloads (for the 10 D5.1 orgs)
    print("Building Crisis Replay payloads...")
    crisis_payloads = _build_crisis_replay_payloads()
    print(f"  Crisis Replay payloads: {len(crisis_payloads)}/10")

    # Build organizations[]
    print("Building organization records...")
    organizations: list[dict[str, Any]] = []
    for _, row in curated.iterrows():
        record = _organization_record(row, baseline_rate, history_lookup, peer_lookup, composition_lookup)
        ein = str(row["ein"])

        # Override distress with XGBoost
        if ein in xgb_scores:
            xgb_p = xgb_scores[ein] * 100.0
            record["distressProbability"] = round(xgb_p, 1)
            record["distress"]["probability"] = round(xgb_p, 1)
            record["distress"]["tier"] = _tier_from_prob(xgb_scores[ein])
            record["distressTier"] = _tier_from_prob(xgb_scores[ein])
            record["distress"]["headline"] = f"{xgb_p:.1f}% risk vs. {record['distress']['baseline']}% baseline"
            record["distressLabel"] = f"{record['distressTier']} distress risk"

        # Override stress with D4 deficit-based formula
        record["stress"] = _stress_summary_d4(row)

        # Generate analogs
        analogs = _generate_analogs(row, raw_panel)
        if analogs:
            record["analogs"] = analogs

        # Attach Crisis Replay payload
        if ein in crisis_payloads:
            record["crisisReplay"] = crisis_payloads[ein]

        organizations.append(record)

    # Order by bucket, then by Northstar-style proxy (distress_prob asc for UAB/RCR)
    bucket_order = {
        "Underinvested Asset Base": 0,
        "Revenue Concentration Risk": 1,
        "Weak Financial Foundation": 2,
        "Needs Data Diligence": 3,
    }
    organizations.sort(key=lambda o: (bucket_order.get(o["actionLabel"], 99), o["orgName"]))

    payload = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "summary": {
            "totalOrganizations": len(organizations),
            "distressBaselineRate": round(baseline_rate * 100.0, 1),
            "countsByAction": {k: int(v) for k, v in pd.Series([o["actionLabel"] for o in organizations]).value_counts().sort_index().items()},
            "countsByDistress": {k: int(v) for k, v in pd.Series([o["distressTier"] for o in organizations]).value_counts().sort_index().items()},
            "countsByConfidence": {k: int(v) for k, v in pd.Series([o["confidenceTier"] for o in organizations]).value_counts().sort_index().items()},
            "states": sorted({o["state"] for o in organizations}),
        },
        "organizations": organizations,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {len(organizations)} orgs to {OUTPUT_PATH}")
    print(f"  Buckets: {payload['summary']['countsByAction']}")
    print(f"  Crisis Replay attached: {sum(1 for o in organizations if 'crisisReplay' in o)}")
    print(f"  Analogs attached: {sum(1 for o in organizations if o.get('analogs'))}")


if __name__ == "__main__":
    main()
