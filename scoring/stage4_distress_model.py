#!/usr/bin/env python3
"""
Stage 4 distress risk model.

Trains a forward-looking urgency model on the raw national panel and scores
the canonical Stage 2 output with probability + tier outputs.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import tempfile
from pathlib import Path

_MPL_CACHE_DIR = tempfile.mkdtemp(prefix="mpl-stage4-")
os.environ.setdefault("MPLCONFIGDIR", _MPL_CACHE_DIR)
os.environ.setdefault("XDG_CACHE_HOME", _MPL_CACHE_DIR)

import matplotlib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

matplotlib.use("Agg")
import matplotlib.pyplot as plt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stage4_distress_model")

ROOT = Path(__file__).resolve().parents[1]
PANEL_PATH = ROOT / "Data" / "panel_990_extended_v4.parquet"
STAGE2_PATH = ROOT / "outputs" / "stage2" / "scored_rows_enriched.parquet"
OUTPUT_DIR = ROOT / "outputs" / "stage4"
PREDICTIONS_PATH = OUTPUT_DIR / "distress_predictions.parquet"
METRICS_PATH = OUTPUT_DIR / "distress_model_metrics.json"
FEATURE_IMPORTANCE_PATH = OUTPUT_DIR / "distress_feature_importance.png"
ROC_CURVE_PATH = OUTPUT_DIR / "distress_roc_curve.png"
PR_CURVE_PATH = OUTPUT_DIR / "distress_pr_curve.png"
CALIBRATION_PATH = OUTPUT_DIR / "distress_calibration_curve.png"

RAW_PANEL_COLUMNS = [
    "ein",
    "fiscal_year",
    "tax_period_end",
    "state",
    "ntee_major_category",
    "total_revenue",
    "total_expenses",
    "net_assets_eoy",
    "cash_non_interest_bearing",
    "savings_temporary_investments",
    "contributions_grants",
    "program_service_revenue",
    "investment_income",
    "other_revenue",
    "pct_contributions",
    "pct_program_revenue",
    "pct_investment_income",
    "pct_other_revenue",
    "years_of_data",
]

CURRENT_LEVEL_FEATURES = [
    "total_revenue",
    "total_expenses",
    "net_assets_eoy",
    "cash_non_interest_bearing",
    "savings_temporary_investments",
    "contributions_grants",
    "program_service_revenue",
    "investment_income",
    "other_revenue",
]
RATIO_FEATURES = [
    "operating_margin",
    "shock_absorption_months",
    "cash_to_expenses",
    "revenue_to_expenses",
    "net_assets_to_expenses",
    "revenue_diversification_index",
]
COMPOSITION_FEATURES = [
    "pct_contributions",
    "pct_program_revenue",
    "pct_investment_income",
    "pct_other_revenue",
]
LAG_FEATURES = [
    "operating_margin_lagged_1y",
    "total_revenue_lagged_1y",
    "shock_absorption_months_lagged_1y",
]
YOY_FEATURES = [
    "revenue_growth_yoy",
    "expense_growth_yoy",
    "margin_change_yoy",
]

DISTRESS_NUMERIC_FEATURES = CURRENT_LEVEL_FEATURES + RATIO_FEATURES + COMPOSITION_FEATURES + LAG_FEATURES + YOY_FEATURES
DISTRESS_CATEGORICAL_FEATURES = ["size_bucket", "ntee_major_category", "state"]


def size_bucket_from_revenue(total_revenue: float) -> str:
    if pd.isna(total_revenue):
        return "unknown"
    if total_revenue < 500_000:
        return "<500K"
    if total_revenue < 2_000_000:
        return "500K-2M"
    if total_revenue < 10_000_000:
        return "2M-10M"
    return ">10M"


def _safe_divide(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    denominator = denominator.replace({0: np.nan})
    return numerator / denominator


def _compute_current_year_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["ein"] = out["ein"].astype(str)
    out["fiscal_year"] = pd.to_numeric(out["fiscal_year"], errors="coerce").astype("Int64")
    out["size_bucket"] = out["total_revenue"].map(size_bucket_from_revenue)

    monthly_expenses = out["total_expenses"] / 12.0
    liquid_reserves = out["cash_non_interest_bearing"].fillna(0) + out["savings_temporary_investments"].fillna(0)

    out["operating_margin"] = _safe_divide(out["total_revenue"] - out["total_expenses"], out["total_revenue"])
    out["shock_absorption_months"] = _safe_divide(liquid_reserves, monthly_expenses)
    out["cash_to_expenses"] = _safe_divide(liquid_reserves, out["total_expenses"])
    out["revenue_to_expenses"] = _safe_divide(out["total_revenue"], out["total_expenses"])
    out["net_assets_to_expenses"] = _safe_divide(out["net_assets_eoy"], out["total_expenses"])

    pct_cols = ["pct_contributions", "pct_program_revenue", "pct_investment_income", "pct_other_revenue"]
    filled = out[pct_cols].fillna(0)
    all_null_pct = out[pct_cols].isna().all(axis=1)
    out["revenue_diversification_index"] = 1 - (filled**2).sum(axis=1)
    out.loc[all_null_pct, "revenue_diversification_index"] = np.nan
    return out


def dedupe_panel_by_scoring_year(panel_df: pd.DataFrame) -> pd.DataFrame:
    out = panel_df.copy()
    out["ein"] = out["ein"].astype(str)
    out["fiscal_year"] = pd.to_numeric(out["fiscal_year"], errors="coerce").astype("Int64")
    out["tax_period_end"] = pd.to_datetime(out["tax_period_end"], errors="coerce")
    out = out.sort_values(["ein", "fiscal_year", "tax_period_end"], na_position="last")
    out = out.drop_duplicates(subset=["ein", "fiscal_year"], keep="last").reset_index(drop=True)
    return out


def build_modeling_frame(panel_df: pd.DataFrame) -> pd.DataFrame:
    out = _compute_current_year_features(dedupe_panel_by_scoring_year(panel_df))
    out = out.sort_values(["ein", "fiscal_year"]).reset_index(drop=True)

    grouped = out.groupby("ein", sort=False)

    out["operating_margin_lagged_1y"] = grouped["operating_margin"].shift(1)
    out["total_revenue_lagged_1y"] = grouped["total_revenue"].shift(1)
    out["total_expenses_lagged_1y"] = grouped["total_expenses"].shift(1)
    out["shock_absorption_months_lagged_1y"] = grouped["shock_absorption_months"].shift(1)

    out["revenue_growth_yoy"] = _safe_divide(
        out["total_revenue"] - out["total_revenue_lagged_1y"],
        out["total_revenue_lagged_1y"],
    )
    out["expense_growth_yoy"] = _safe_divide(
        out["total_expenses"] - out["total_expenses_lagged_1y"],
        out["total_expenses_lagged_1y"],
    )
    out["margin_change_yoy"] = out["operating_margin"] - out["operating_margin_lagged_1y"]

    next_year = out[["ein", "fiscal_year", "operating_margin", "shock_absorption_months"]].copy()
    next_year["fiscal_year"] = next_year["fiscal_year"] - 1
    next_year = next_year.rename(
        columns={
            "operating_margin": "operating_margin_t1",
            "shock_absorption_months": "shock_absorption_months_t1",
        }
    )
    out = out.merge(next_year, on=["ein", "fiscal_year"], how="left", validate="one_to_one")

    target_observed = out["operating_margin_t1"].notna() & out["shock_absorption_months_t1"].notna()
    out["target"] = np.nan
    out.loc[target_observed, "target"] = (
        (out.loc[target_observed, "shock_absorption_months_t1"] < 3)
        & (out.loc[target_observed, "operating_margin_t1"] < 0)
    ).astype(int)
    return out


def prepare_training_frame(panel_df: pd.DataFrame) -> pd.DataFrame:
    year_counts = panel_df.groupby("ein")["fiscal_year"].transform("nunique")
    eligible = panel_df.loc[year_counts >= 5].copy()
    modeled = build_modeling_frame(eligible)
    modeled = modeled.loc[modeled["target"].notna()].copy()
    modeled["target"] = modeled["target"].astype(int)
    return modeled


def prepare_stage2_scoring_frame(stage2_df: pd.DataFrame, panel_df: pd.DataFrame) -> pd.DataFrame:
    current = build_modeling_frame(panel_df)
    current = current.drop(columns=["target"], errors="ignore")
    current = current.drop_duplicates(subset=["ein", "fiscal_year"], keep="last")

    stage2_keys = stage2_df[["ein", "fiscal_year"]].copy()
    stage2_keys["ein"] = stage2_keys["ein"].astype(str)
    stage2_keys["fiscal_year"] = pd.to_numeric(stage2_keys["fiscal_year"], errors="coerce").astype("Int64")
    stage2_keys["_order"] = np.arange(len(stage2_keys))

    merged = stage2_keys.merge(current, on=["ein", "fiscal_year"], how="left", validate="one_to_one")
    merged = merged.sort_values("_order").drop(columns="_order").reset_index(drop=True)
    return merged


def normalize_feature_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for column in DISTRESS_NUMERIC_FEATURES:
        out[column] = pd.to_numeric(out[column], errors="coerce").astype(float)
    for column in DISTRESS_CATEGORICAL_FEATURES:
        out[column] = out[column].astype("object")
        out[column] = out[column].where(pd.notna(out[column]), np.nan)
    return out


def build_preprocessor() -> ColumnTransformer:
    numeric = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]
    )
    categorical = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric, DISTRESS_NUMERIC_FEATURES),
            ("cat", categorical, DISTRESS_CATEGORICAL_FEATURES),
        ]
    )


def build_model_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocess", build_preprocessor()),
            (
                "model",
                SGDClassifier(
                    loss="log_loss",
                    class_weight="balanced",
                    max_iter=25,
                    tol=1e-3,
                    early_stopping=True,
                    validation_fraction=0.1,
                    n_iter_no_change=5,
                    average=True,
                    random_state=42,
                ),
            ),
        ]
    )


def choose_threshold(y_true: pd.Series, probs: np.ndarray) -> tuple[float, dict]:
    precisions, recalls, thresholds = precision_recall_curve(y_true, probs)
    f1_scores = 2 * precisions[:-1] * recalls[:-1] / np.clip(precisions[:-1] + recalls[:-1], 1e-12, None)
    best_idx = int(np.nanargmax(f1_scores))
    threshold = float(thresholds[best_idx])
    return threshold, {
        "precision": float(precisions[best_idx]),
        "recall": float(recalls[best_idx]),
        "f1": float(f1_scores[best_idx]),
    }


def assign_distress_tiers(probabilities: pd.Series, medium_cutoff: float, high_cutoff: float) -> pd.Series:
    return pd.Series(
        np.select(
            [probabilities >= high_cutoff, probabilities >= medium_cutoff],
            ["High", "Medium"],
            default="Low",
        ),
        index=probabilities.index,
    )


def evaluate_model(y_true: pd.Series, probs: np.ndarray, decision_threshold: float) -> dict:
    preds = (probs >= decision_threshold).astype(int)
    metrics = {
        "roc_auc": float(roc_auc_score(y_true, probs)),
        "pr_auc": float(average_precision_score(y_true, probs)),
        "precision": float(precision_score(y_true, preds, zero_division=0)),
        "recall": float(recall_score(y_true, preds, zero_division=0)),
        "f1": float(f1_score(y_true, preds, zero_division=0)),
        "baseline_rate": float(np.mean(y_true)),
        "threshold": float(decision_threshold),
    }
    return metrics


def summarize_tier_outcomes(test_frame: pd.DataFrame) -> dict:
    grouped = (
        test_frame.groupby("distress_tier")
        .agg(n=("target", "size"), urgency_rate=("target", "mean"))
        .reset_index()
    )
    summary = {
        row["distress_tier"]: {"n": int(row["n"]), "urgency_rate": float(row["urgency_rate"])}
        for _, row in grouped.iterrows()
    }
    high = summary.get("High", {})
    low = summary.get("Low", {})
    high_rate = high.get("urgency_rate")
    low_rate = low.get("urgency_rate")
    summary_payload = {
        "tiers": summary,
        "high_vs_low_outcome_lift": float(high_rate / low_rate) if high_rate is not None and low_rate not in (None, 0) else None,
        "high_vs_baseline_outcome_lift": float(high_rate / float(test_frame["target"].mean())) if high_rate is not None else None,
    }

    yearly = {}
    for year, year_df in test_frame.groupby("fiscal_year"):
        year_grouped = year_df.groupby("distress_tier")["target"].mean()
        if "High" in year_grouped.index and "Low" in year_grouped.index and year_grouped["Low"] > 0:
            yearly[str(int(year))] = {
                "high_rate": float(year_grouped["High"]),
                "low_rate": float(year_grouped["Low"]),
                "lift": float(year_grouped["High"] / year_grouped["Low"]),
            }
    summary_payload["yearly"] = yearly
    return summary_payload


def _plot_roc(y_true: pd.Series, probs: np.ndarray, path: Path) -> None:
    fpr, tpr, _ = roc_curve(y_true, probs)
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(fpr, tpr, label="Model ROC")
    ax.plot([0, 1], [0, 1], linestyle="--", color="#888", label="Random")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("Distress Model ROC Curve")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def _plot_pr(y_true: pd.Series, probs: np.ndarray, path: Path) -> None:
    precision, recall, _ = precision_recall_curve(y_true, probs)
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(recall, precision, label="Model PR")
    ax.axhline(np.mean(y_true), linestyle="--", color="#888", label="Baseline")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Distress Model Precision-Recall Curve")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def _plot_calibration(y_true: pd.Series, probs: np.ndarray, path: Path) -> None:
    frac_pos, mean_pred = calibration_curve(y_true, probs, n_bins=10, strategy="quantile")
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(mean_pred, frac_pos, marker="o", label="Model")
    ax.plot([0, 1], [0, 1], linestyle="--", color="#888", label="Perfect calibration")
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Observed positive rate")
    ax.set_title("Distress Model Calibration")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def _plot_feature_importance(model: Pipeline, path: Path, top_n: int = 10) -> list[dict]:
    preprocessor = model.named_steps["preprocess"]
    feature_names = preprocessor.get_feature_names_out()
    coefficients = model.named_steps["model"].coef_[0]
    order = np.argsort(np.abs(coefficients))[-top_n:][::-1]

    labels = [feature_names[i] for i in order]
    values = [coefficients[i] for i in order]

    fig, ax = plt.subplots(figsize=(8, 5))
    y_pos = np.arange(len(labels))
    colors = ["#245bdb" if v > 0 else "#d9485f" for v in values]
    ax.barh(y_pos, values, color=colors)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_title("Top Distress Model Coefficients")
    ax.set_xlabel("Coefficient")
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)

    return [
        {"feature": labels[i], "coefficient": float(values[i])}
        for i in range(len(labels))
    ]


def train_and_score(panel_path: Path = PANEL_PATH, stage2_path: Path = STAGE2_PATH) -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading panel from %s", panel_path)
    panel = pd.read_parquet(panel_path, columns=RAW_PANEL_COLUMNS)
    logger.info("Loaded %s raw panel rows", f"{len(panel):,}")

    modeling = prepare_training_frame(panel)
    logger.info("Prepared %s training candidates with observed target", f"{len(modeling):,}")

    train = modeling.loc[modeling["fiscal_year"] <= 2020].copy()
    test = modeling.loc[modeling["fiscal_year"] >= 2021].copy()

    x_train = normalize_feature_dtypes(train[DISTRESS_NUMERIC_FEATURES + DISTRESS_CATEGORICAL_FEATURES])
    y_train = train["target"]
    x_test = normalize_feature_dtypes(test[DISTRESS_NUMERIC_FEATURES + DISTRESS_CATEGORICAL_FEATURES])
    y_test = test["target"]

    pipeline = build_model_pipeline()
    logger.info("Training logistic distress model on %s rows", f"{len(train):,}")
    pipeline.fit(x_train, y_train)

    train_probs = pipeline.predict_proba(x_train)[:, 1]
    test_probs = pipeline.predict_proba(x_test)[:, 1]

    decision_threshold, train_threshold_metrics = choose_threshold(y_train, train_probs)
    test_metrics = evaluate_model(y_test, test_probs, decision_threshold)

    high_cutoff = max(decision_threshold, np.quantile(test_probs, 0.80))
    medium_cutoff = max(0.10, np.quantile(test_probs, 0.50))
    if medium_cutoff >= high_cutoff:
        medium_cutoff = max(0.10, high_cutoff * 0.6)

    feature_importance = _plot_feature_importance(pipeline, FEATURE_IMPORTANCE_PATH)
    _plot_roc(y_test, test_probs, ROC_CURVE_PATH)
    _plot_pr(y_test, test_probs, PR_CURVE_PATH)
    _plot_calibration(y_test, test_probs, CALIBRATION_PATH)

    test_scored = test[["ein", "fiscal_year", "target"]].copy()
    test_scored["distress_prob"] = test_probs
    test_scored["distress_tier"] = assign_distress_tiers(pd.Series(test_probs, index=test_scored.index), medium_cutoff, high_cutoff)
    tier_outcomes = summarize_tier_outcomes(test_scored)

    stage2 = pd.read_parquet(stage2_path, columns=["ein", "fiscal_year"])
    scoring = prepare_stage2_scoring_frame(stage2, panel)
    score_features = normalize_feature_dtypes(scoring[DISTRESS_NUMERIC_FEATURES + DISTRESS_CATEGORICAL_FEATURES])
    stage2_probs = pipeline.predict_proba(score_features)[:, 1]
    stage2_probs = pd.Series(stage2_probs, index=scoring.index)
    scoring_output = scoring[["ein", "fiscal_year"]].copy()
    scoring_output["distress_prob"] = stage2_probs
    scoring_output["distress_tier"] = assign_distress_tiers(stage2_probs, medium_cutoff, high_cutoff)
    scoring_output.to_parquet(PREDICTIONS_PATH, index=False)

    risk_mask = scoring_output["distress_tier"].eq("High")
    lift = float(stage2_probs[risk_mask].mean() / max(test_metrics["baseline_rate"], 1e-12)) if risk_mask.any() else math.nan

    metrics_payload = {
        "panel_rows": int(len(panel)),
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "train_positive_rate": float(y_train.mean()),
        "test_positive_rate": float(y_test.mean()),
        "decision_threshold": float(decision_threshold),
        "medium_cutoff": float(medium_cutoff),
        "high_cutoff": float(high_cutoff),
        "train_threshold_metrics": train_threshold_metrics,
        "test_metrics": test_metrics,
        "top_features": feature_importance,
        "stage2_scored_rows": int(len(scoring_output)),
        "stage2_tier_counts": {k: int(v) for k, v in scoring_output["distress_tier"].value_counts().to_dict().items()},
        "high_risk_lift_vs_baseline": lift,
        "test_tier_outcomes": tier_outcomes["tiers"],
        "test_high_vs_low_outcome_lift": tier_outcomes["high_vs_low_outcome_lift"],
        "test_high_vs_baseline_outcome_lift": tier_outcomes["high_vs_baseline_outcome_lift"],
        "test_yearly_high_vs_low_outcome_lift": tier_outcomes["yearly"],
    }
    METRICS_PATH.write_text(json.dumps(metrics_payload, indent=2))
    logger.info("Wrote predictions to %s", PREDICTIONS_PATH)
    logger.info("Wrote metrics to %s", METRICS_PATH)
    return metrics_payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and score the Fairlight distress model.")
    parser.add_argument("--panel-path", type=Path, default=PANEL_PATH)
    parser.add_argument("--stage2-path", type=Path, default=STAGE2_PATH)
    args = parser.parse_args()

    metrics = train_and_score(panel_path=args.panel_path, stage2_path=args.stage2_path)
    logger.info("=== Distress Model Summary ===")
    logger.info("Train rows: %s", f"{metrics['train_rows']:,}")
    logger.info("Test rows: %s", f"{metrics['test_rows']:,}")
    logger.info("ROC-AUC: %.4f", metrics["test_metrics"]["roc_auc"])
    logger.info("PR-AUC: %.4f", metrics["test_metrics"]["pr_auc"])
    logger.info("Precision: %.4f", metrics["test_metrics"]["precision"])
    logger.info("Recall: %.4f", metrics["test_metrics"]["recall"])
    logger.info("F1: %.4f", metrics["test_metrics"]["f1"])
    logger.info("Tier counts: %s", metrics["stage2_tier_counts"])


if __name__ == "__main__":
    main()
