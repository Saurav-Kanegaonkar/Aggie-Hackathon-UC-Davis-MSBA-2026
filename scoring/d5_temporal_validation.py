#!/usr/bin/env python3
"""
D5 — Temporal-holdout validation for the distress model.

Training window: FY2009–FY2020
Test window:     FY2021–FY2024

Reports logistic-regression metrics (AUC, precision, recall, F1), calibration
deciles, and an XGBoost comparison with top-5 feature importances.

Persists:
  outputs/d5_validation/models/logistic_temporal.joblib
  outputs/d5_validation/models/xgboost_temporal.joblib
  outputs/d5_validation/calibration_table.csv
  outputs/d5_validation/metrics_summary.json
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
import xgboost as xgb

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scoring.stage4_distress_model import (  # noqa: E402
    DISTRESS_NUMERIC_FEATURES,
    DISTRESS_CATEGORICAL_FEATURES,
    build_modeling_frame,
    normalize_feature_dtypes,
)

ROOT = Path(__file__).resolve().parents[1]
PANEL_PATH = ROOT / "data" / "processed" / "panel_990_extended_v4.parquet"
OUT_DIR = ROOT / "outputs" / "d5_validation"
MODELS_DIR = OUT_DIR / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_YEARS = range(2009, 2021)      # FY2009–FY2020 inclusive
TEST_YEARS = range(2021, 2025)        # FY2021–FY2024 inclusive


def build_preprocessor() -> ColumnTransformer:
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    categorical = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("num", numeric, DISTRESS_NUMERIC_FEATURES),
        ("cat", categorical, DISTRESS_CATEGORICAL_FEATURES),
    ])


def main() -> None:
    print("Loading panel...")
    panel = pd.read_parquet(PANEL_PATH)
    print(f"  Panel rows: {len(panel):,}")

    print("Building modeling frame (this computes features and target)...")
    year_counts = panel.groupby("ein")["fiscal_year"].transform("nunique")
    eligible = panel.loc[year_counts >= 5].copy()
    modeled = build_modeling_frame(eligible)
    modeled = modeled.loc[modeled["target"].notna()].copy()
    modeled["target"] = modeled["target"].astype(int)
    modeled = normalize_feature_dtypes(modeled)
    print(f"  Total eligible org-years with observed target: {len(modeled):,}")

    # Temporal split on fiscal_year
    modeled["fiscal_year"] = modeled["fiscal_year"].astype(int)
    train_df = modeled[modeled["fiscal_year"].isin(TRAIN_YEARS)].copy()
    test_df = modeled[modeled["fiscal_year"].isin(TEST_YEARS)].copy()
    print(f"  Train (FY{min(TRAIN_YEARS)}–FY{max(TRAIN_YEARS)}): {len(train_df):,} rows, "
          f"positive rate {train_df['target'].mean():.4f}")
    print(f"  Test  (FY{min(TEST_YEARS)}–FY{max(TEST_YEARS)}): {len(test_df):,} rows, "
          f"positive rate {test_df['target'].mean():.4f}")

    feature_cols = DISTRESS_NUMERIC_FEATURES + DISTRESS_CATEGORICAL_FEATURES
    X_train = train_df[feature_cols]
    y_train = train_df["target"].values
    X_test = test_df[feature_cols]
    y_test = test_df["target"].values

    # ══════════════════════════════════════════════════════════════════
    # LOGISTIC REGRESSION
    # ══════════════════════════════════════════════════════════════════
    print("\nTraining logistic regression (balanced class weights)...")
    logistic = Pipeline([
        ("pre", build_preprocessor()),
        ("clf", LogisticRegression(
            solver="lbfgs",
            class_weight="balanced",
            max_iter=500,
            random_state=42,
        )),
    ])
    logistic.fit(X_train, y_train)

    logistic_proba = logistic.predict_proba(X_test)[:, 1]
    # Use the same production threshold as the legacy random-split model (0.4956)
    # so we're reporting comparable numbers.
    prod_threshold = 0.4956
    logistic_pred = (logistic_proba >= prod_threshold).astype(int)

    log_metrics = {
        "auc": float(roc_auc_score(y_test, logistic_proba)),
        "threshold": prod_threshold,
        "precision": float(precision_score(y_test, logistic_pred, zero_division=0)),
        "recall": float(recall_score(y_test, logistic_pred, zero_division=0)),
        "f1": float(f1_score(y_test, logistic_pred, zero_division=0)),
        "baseline_rate": float(y_test.mean()),
        "n_test": int(len(y_test)),
        "n_train": int(len(y_train)),
    }
    print(f"  Logistic — AUC={log_metrics['auc']:.4f}, "
          f"Precision={log_metrics['precision']:.4f}, "
          f"Recall={log_metrics['recall']:.4f}, "
          f"F1={log_metrics['f1']:.4f}")

    # ── Calibration deciles ───────────────────────────────────────────
    print("\nCalibration (deciles of predicted probability):")
    bins = np.linspace(0, 1, 11)
    bin_idx = np.clip(np.digitize(logistic_proba, bins) - 1, 0, 9)
    cal_rows = []
    for i in range(10):
        mask = bin_idx == i
        if mask.sum() == 0:
            cal_rows.append({
                "decile": i,
                "range_low": bins[i],
                "range_high": bins[i + 1],
                "count": 0,
                "mean_predicted": None,
                "actual_rate": None,
            })
            continue
        cal_rows.append({
            "decile": i,
            "range_low": float(bins[i]),
            "range_high": float(bins[i + 1]),
            "count": int(mask.sum()),
            "mean_predicted": float(logistic_proba[mask].mean()),
            "actual_rate": float(y_test[mask].mean()),
        })
    cal_df = pd.DataFrame(cal_rows)
    cal_df.to_csv(OUT_DIR / "calibration_table.csv", index=False)
    print(cal_df.to_string(index=False))

    # Calibration-quality summary: mean |predicted − actual| across deciles (MAE)
    cal_with_data = cal_df.dropna(subset=["actual_rate"])
    cal_mae = float((cal_with_data["mean_predicted"] - cal_with_data["actual_rate"]).abs().mean())
    log_metrics["calibration_mae_across_deciles"] = cal_mae
    print(f"\n  Mean absolute calibration error across deciles: {cal_mae:.4f}")

    # ══════════════════════════════════════════════════════════════════
    # XGBOOST
    # ══════════════════════════════════════════════════════════════════
    print("\nTraining XGBoost...")
    # Pre-process with the same pipeline so we're comparing apples to apples.
    pre = build_preprocessor()
    X_train_pre = pre.fit_transform(X_train)
    X_test_pre = pre.transform(X_test)

    # Class weight via scale_pos_weight
    spw = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    xgb_clf = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=spw,
        objective="binary:logistic",
        eval_metric="auc",
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
    )
    xgb_clf.fit(X_train_pre, y_train)
    xgb_proba = xgb_clf.predict_proba(X_test_pre)[:, 1]

    # Match the same threshold for a fair comparison
    xgb_pred = (xgb_proba >= prod_threshold).astype(int)
    xgb_metrics = {
        "auc": float(roc_auc_score(y_test, xgb_proba)),
        "threshold": prod_threshold,
        "precision": float(precision_score(y_test, xgb_pred, zero_division=0)),
        "recall": float(recall_score(y_test, xgb_pred, zero_division=0)),
        "f1": float(f1_score(y_test, xgb_pred, zero_division=0)),
    }
    print(f"  XGBoost — AUC={xgb_metrics['auc']:.4f}, "
          f"Precision={xgb_metrics['precision']:.4f}, "
          f"Recall={xgb_metrics['recall']:.4f}, "
          f"F1={xgb_metrics['f1']:.4f}")

    # Feature importances (by gain)
    onehot_names = pre.named_transformers_["cat"]["onehot"].get_feature_names_out(
        DISTRESS_CATEGORICAL_FEATURES
    ).tolist()
    feature_names = DISTRESS_NUMERIC_FEATURES + onehot_names
    importances = xgb_clf.feature_importances_
    top = pd.DataFrame({"feature": feature_names, "importance": importances})
    # Group one-hot columns back to their source feature for readability
    def _group(f):
        for cat in DISTRESS_CATEGORICAL_FEATURES:
            if f.startswith(cat + "_"):
                return cat
        return f
    top["group"] = top["feature"].apply(_group)
    grouped = top.groupby("group", as_index=False)["importance"].sum().sort_values(
        "importance", ascending=False
    )
    top5 = grouped.head(5)
    print("\n  XGBoost top-5 feature groups (by gain):")
    for _, row in top5.iterrows():
        print(f"    {row['group']:<35} {row['importance']:.4f}")

    # ── Agreement analysis ────────────────────────────────────────────
    agree_high = ((logistic_pred == 1) & (xgb_pred == 1)).sum()
    log_only = ((logistic_pred == 1) & (xgb_pred == 0)).sum()
    xgb_only = ((xgb_pred == 1) & (logistic_pred == 0)).sum()
    agree_low = ((logistic_pred == 0) & (xgb_pred == 0)).sum()
    # Pearson correlation between probabilities
    prob_corr = float(np.corrcoef(logistic_proba, xgb_proba)[0, 1])
    print(f"\n  Agreement on test set:")
    print(f"    Both call HIGH risk:       {agree_high:>7,}")
    print(f"    Logistic only HIGH:        {log_only:>7,}")
    print(f"    XGBoost only HIGH:         {xgb_only:>7,}")
    print(f"    Both call LOW risk:        {agree_low:>7,}")
    print(f"    Correlation of predicted probs: {prob_corr:.4f}")

    # ══════════════════════════════════════════════════════════════════
    # PERSIST
    # ══════════════════════════════════════════════════════════════════
    joblib.dump(logistic, MODELS_DIR / "logistic_temporal.joblib")
    joblib.dump({"pre": pre, "xgb": xgb_clf}, MODELS_DIR / "xgboost_temporal.joblib")
    print(f"\nModels saved under {MODELS_DIR}")

    summary = {
        "train_years": f"FY{min(TRAIN_YEARS)}–FY{max(TRAIN_YEARS)}",
        "test_years": f"FY{min(TEST_YEARS)}–FY{max(TEST_YEARS)}",
        "target_rule": "shock_absorption_months_t1 < 3 AND operating_margin_t1 < 0",
        "logistic": log_metrics,
        "xgboost": {**xgb_metrics, "top_5_feature_groups": top5.to_dict(orient="records")},
        "agreement": {
            "both_high": int(agree_high),
            "logistic_only_high": int(log_only),
            "xgboost_only_high": int(xgb_only),
            "both_low": int(agree_low),
            "prob_correlation": prob_corr,
        },
    }
    (OUT_DIR / "metrics_summary.json").write_text(json.dumps(summary, indent=2))
    print(f"Metrics summary saved to {OUT_DIR / 'metrics_summary.json'}")

    # Also persist the scored test-set rows so Deliverable 2 can use them
    test_out = test_df[["ein", "fiscal_year", "state", "ntee_major_category",
                        "total_revenue", "total_expenses", "net_assets_eoy",
                        "operating_margin", "shock_absorption_months", "target"]].copy()
    test_out["logistic_proba"] = logistic_proba
    test_out["xgboost_proba"] = xgb_proba
    test_out.to_parquet(OUT_DIR / "temporal_test_predictions.parquet", index=False)
    print(f"Test-set scored rows saved to {OUT_DIR / 'temporal_test_predictions.parquet'}")


if __name__ == "__main__":
    main()
