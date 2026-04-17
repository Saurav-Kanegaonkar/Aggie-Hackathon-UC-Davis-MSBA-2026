#!/usr/bin/env python3
"""
D5.1 — Dual model retrain (Logistic + XGBoost + SHAP) with expanded features.

Extends the D5 temporal-holdout work with:
  - Category 1: temporal features (trends, YoY deltas, consecutive deficits)
  - Category 2: interaction features (concentration × runway, etc.)
  - Category 3: sector-specific shock indicators (lookup table)
  - Category 4: geographic/political context

Trains two models in parallel on the same split and persists artifacts.

Outputs in outputs/d5_1_validation/:
  models/logistic_expanded.joblib
  models/xgboost_expanded.joblib
  models/shap_explainer.joblib
  metrics_summary.json
  feature_coefficients_logistic.csv
  feature_importances_xgboost.csv
  shap_values_test.parquet
  shap_summary_plot.png
  calibration_table_expanded.csv
  crisis_replay_shortlist_v2.csv
"""
from __future__ import annotations

import json
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/mpl-d51")

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scoring.stage4_distress_model import (  # noqa: E402
    DISTRESS_NUMERIC_FEATURES,
    DISTRESS_CATEGORICAL_FEATURES,
    build_modeling_frame,
)

ROOT = Path(__file__).resolve().parents[1]
PANEL_PATH = ROOT / "data" / "processed" / "panel_990_extended_v4.parquet"
D5_DIR = ROOT / "outputs" / "d5_validation"
OUT_DIR = ROOT / "outputs" / "d5_1_validation"
MODELS_DIR = OUT_DIR / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_YEARS = range(2009, 2021)
TEST_YEARS = range(2021, 2025)
THRESHOLD = 0.4956  # production threshold, kept constant for apples-to-apples

# ────────────────────────────────────────────────────────────────
# Sector-shock lookup (Category 3)
# ────────────────────────────────────────────────────────────────
SECTOR_SHOCKS = {
    # (ntee_major, fiscal_year) -> 1 if shock present
    # Education (B)
    ("B", 2013): 1, ("B", 2014): 1,   # federal sequestration
    ("B", 2020): 1, ("B", 2021): 1, ("B", 2022): 1,  # COVID K-12 disruption
    # Healthcare (E)
    ("E", 2013): 1,                   # Medicare sequester
    ("E", 2020): 1, ("E", 2021): 1, ("E", 2022): 1,  # COVID
    # Housing (L)
    ("L", 2013): 1,                   # HUD sequestration
    ("L", 2018): 1, ("L", 2019): 1,   # government shutdown impacts
    # Arts (A)
    ("A", 2020): 1, ("A", 2021): 1, ("A", 2022): 1,  # venue closures
}

# State fiscal stress — conservative, only clearly documented years
STATE_FISCAL_STRESS = {
    ("CA", 2020): 1,
    ("WA", 2020): 1,
}

COVID_YEARS = {2020, 2021, 2022}


def fiscal_year_bucket(year: int) -> str:
    if year < 2013: return "pre-2013"
    if year < 2020: return "2013-2019"
    if year < 2023: return "covid-era 2020-2022"
    return "post-covid 2023+"


def is_govt_funded(row) -> int:
    # Largest-source is program_service_revenue often reflects Medicare/Medicaid/
    # government contracts for human-services orgs; contributions_grants often
    # includes government grants. For a conservative proxy we flag when
    # 'pct_contributions' is high AND NTEE is a gov-heavy sector.
    ntee = row.get("ntee_major_category")
    pct_contrib = row.get("pct_contributions")
    if pd.isna(pct_contrib):
        return 0
    # Housing, Education, Human Services are most government-funded
    if ntee in ("L", "B", "P") and pct_contrib >= 0.70:
        return 1
    # Healthcare: program service revenue is often Medicare/Medicaid
    if ntee == "E" and row.get("pct_program_revenue", 0) >= 0.80:
        return 1
    return 0


def compute_expanded_features(modeled: pd.DataFrame) -> pd.DataFrame:
    """Add D5.1 features on top of the existing D5 feature frame."""
    df = modeled.copy()
    df = df.sort_values(["ein", "fiscal_year"]).reset_index(drop=True)

    # Helper: cash runway in months (bounded at 120 to avoid extreme values
    # dominating downstream ratio features)
    monthly_exp = df["total_expenses"] / 12.0
    liquid = df["cash_non_interest_bearing"].fillna(0) + df["savings_temporary_investments"].fillna(0)
    deficit = (df["total_expenses"] - df["total_revenue"]).clip(lower=0)
    df["cash_runway_months"] = np.where(
        deficit > 0,
        (liquid / (deficit / 12)).clip(upper=120),
        120.0,  # surplus => capped at 120
    )

    grouped = df.groupby("ein", sort=False)

    # ── Category 1: temporal features ────────────────────────────────
    df["margin_yoy_delta"] = grouped["operating_margin"].diff(1)
    df["runway_yoy_delta"] = grouped["cash_runway_months"].diff(1)
    df["net_assets_yoy_delta"] = grouped["net_assets_eoy"].diff(1)

    # revenue/expense YoY growth (percentage)
    df["total_revenue_prev"] = grouped["total_revenue"].shift(1)
    df["total_expenses_prev"] = grouped["total_expenses"].shift(1)
    df["revenue_yoy_growth"] = np.where(
        df["total_revenue_prev"].abs() > 1e-6,
        (df["total_revenue"] - df["total_revenue_prev"]) / df["total_revenue_prev"],
        np.nan,
    )
    df["expense_yoy_growth"] = np.where(
        df["total_expenses_prev"].abs() > 1e-6,
        (df["total_expenses"] - df["total_expenses_prev"]) / df["total_expenses_prev"],
        np.nan,
    )
    df = df.drop(columns=["total_revenue_prev", "total_expenses_prev"])

    # 3-year margin trend (slope of linear regression over T-2, T-1, T)
    m_lag1 = grouped["operating_margin"].shift(1)
    m_lag2 = grouped["operating_margin"].shift(2)
    # slope of OLS on x=[0,1,2], y=[m_lag2, m_lag1, m]: (m - m_lag2) / 2 when all three present
    df["margin_3yr_trend"] = np.where(
        m_lag2.notna() & m_lag1.notna() & df["operating_margin"].notna(),
        (df["operating_margin"] - m_lag2) / 2.0,
        np.nan,
    )

    # Consecutive-years-with-negative-margin (ending at T)
    neg = (df["operating_margin"] < 0).astype(int)
    # per-EIN cumulative-reset counter: within each EIN, count runs of 1s ending at current row.
    def consec_neg(series: pd.Series) -> pd.Series:
        count = 0
        out = []
        for v in series:
            if v == 1:
                count += 1
            else:
                count = 0
            out.append(count)
        return pd.Series(out, index=series.index)
    df["years_of_consecutive_deficits"] = neg.groupby(df["ein"]).transform(consec_neg)

    # Largest-source-pct and its YoY delta
    comparison = ["contributions_grants", "program_service_revenue",
                  "investment_income", "other_revenue"]
    for c in comparison:
        if c not in df.columns:
            df[c] = np.nan
    largest = df[comparison].fillna(0).max(axis=1)
    df["largest_source_amount"] = largest
    df["largest_source_pct"] = np.where(
        df["total_revenue"].abs() > 1e-6,
        (largest / df["total_revenue"]).clip(lower=0, upper=1.5),
        np.nan,
    )
    df["concentration_yoy_delta"] = df.groupby("ein", sort=False)["largest_source_pct"].diff(1)

    # ── Category 2: interaction features ─────────────────────────────
    runway_safe = df["cash_runway_months"].clip(lower=1)
    df["concentration_x_thin_runway"] = df["largest_source_pct"] * (1 / runway_safe)
    # Vectorized government-funded flag (NaN-safe)
    pct_contrib = pd.to_numeric(df["pct_contributions"], errors="coerce")
    pct_prog = pd.to_numeric(df["pct_program_revenue"], errors="coerce")
    ntee = df["ntee_major_category"].astype("object")
    cond_A = ntee.isin(["L","B","P"]) & (pct_contrib >= 0.70)
    cond_B = (ntee == "E") & (pct_prog >= 0.80)
    df["is_government_funded"] = (cond_A.fillna(False) | cond_B.fillna(False)).astype(int)
    df["concentration_x_govt_funded"] = df["largest_source_pct"] * df["is_government_funded"]
    df["margin_x_runway"] = df["operating_margin"] * df["cash_runway_months"]
    df["negative_margin_years_x_concentration"] = (
        df["years_of_consecutive_deficits"] * df["largest_source_pct"]
    )
    df["small_and_thin"] = (
        (df["net_assets_eoy"] < 2_000_000) & (df["cash_runway_months"] < 6)
    ).astype(int)
    df["large_and_negative_margin"] = (
        (df["net_assets_eoy"] > 20_000_000) & (df["operating_margin"] < -0.10)
    ).astype(int)

    # ── Category 3: sector shock indicators ──────────────────────────
    df["covid_era"] = df["fiscal_year"].isin(COVID_YEARS).astype(int)
    # Vectorized sector-shock lookup (NaN-safe)
    pair_sector = list(zip(df["ntee_major_category"].astype("object"),
                             df["fiscal_year"].astype(int)))
    df["sector_budget_shock"] = [SECTOR_SHOCKS.get(p, 0) for p in pair_sector]
    df["fiscal_year_bucket"] = df["fiscal_year"].apply(fiscal_year_bucket)

    # ── Category 4: geographic/political ─────────────────────────────
    pair_state = list(zip(df["state"].astype("object"),
                            df["fiscal_year"].astype(int)))
    df["state_fiscal_stress"] = [STATE_FISCAL_STRESS.get(p, 0) for p in pair_state]

    return df


# Feature registry for the expanded model ---------------------------------
EXPANDED_NUMERIC = DISTRESS_NUMERIC_FEATURES + [
    # Category 1
    "margin_yoy_delta", "margin_3yr_trend", "runway_yoy_delta",
    "revenue_yoy_growth", "expense_yoy_growth", "net_assets_yoy_delta",
    "years_of_consecutive_deficits", "concentration_yoy_delta",
    "largest_source_pct",
    # Category 2
    "concentration_x_thin_runway", "concentration_x_govt_funded",
    "margin_x_runway", "negative_margin_years_x_concentration",
    "small_and_thin", "large_and_negative_margin",
    "is_government_funded",
    # Category 3 (binary/integer as numeric)
    "covid_era", "sector_budget_shock", "state_fiscal_stress",
    # Keep cash_runway_months as a direct feature too
    "cash_runway_months",
]
EXPANDED_CATEGORICAL = DISTRESS_CATEGORICAL_FEATURES + ["fiscal_year_bucket"]


def build_preprocessor(numeric_cols, categorical_cols):
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    categorical = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("num", numeric, numeric_cols),
        ("cat", categorical, categorical_cols),
    ])


def _decile_calibration(y_true, proba, bins=None):
    if bins is None:
        bins = np.linspace(0, 1, 11)
    bin_idx = np.clip(np.digitize(proba, bins) - 1, 0, 9)
    rows = []
    for i in range(10):
        mask = bin_idx == i
        if mask.sum() == 0:
            rows.append({"decile": i, "range_low": float(bins[i]),
                         "range_high": float(bins[i + 1]), "count": 0,
                         "mean_predicted": None, "actual_rate": None})
        else:
            rows.append({"decile": i, "range_low": float(bins[i]),
                         "range_high": float(bins[i + 1]),
                         "count": int(mask.sum()),
                         "mean_predicted": float(proba[mask].mean()),
                         "actual_rate": float(y_true[mask].mean())})
    return pd.DataFrame(rows)


def _basic_metrics(y_true, proba, threshold=THRESHOLD):
    pred = (proba >= threshold).astype(int)
    return {
        "auc": float(roc_auc_score(y_true, proba)),
        "threshold": threshold,
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
    }


def main() -> None:
    print("Loading panel + building D5 modeling frame...")
    panel = pd.read_parquet(PANEL_PATH)
    year_counts = panel.groupby("ein")["fiscal_year"].transform("nunique")
    eligible = panel.loc[year_counts >= 5].copy()
    modeled = build_modeling_frame(eligible)
    modeled = modeled.loc[modeled["target"].notna()].copy()
    modeled["target"] = modeled["target"].astype(int)
    print(f"  Base rows with target: {len(modeled):,}")

    print("Computing D5.1 expanded features...")
    modeled = compute_expanded_features(modeled)

    # Ensure correct dtypes
    for c in EXPANDED_NUMERIC:
        modeled[c] = pd.to_numeric(modeled[c], errors="coerce").astype(float)
    for c in EXPANDED_CATEGORICAL:
        modeled[c] = modeled[c].astype("object").where(modeled[c].notna(), np.nan)

    modeled["fiscal_year"] = modeled["fiscal_year"].astype(int)
    train_df = modeled[modeled["fiscal_year"].isin(TRAIN_YEARS)].copy()
    test_df = modeled[modeled["fiscal_year"].isin(TEST_YEARS)].copy()
    print(f"  Train: {len(train_df):,}   Test: {len(test_df):,}   Base rate: {test_df['target'].mean():.4f}")

    feature_cols = EXPANDED_NUMERIC + EXPANDED_CATEGORICAL
    X_train = train_df[feature_cols]; y_train = train_df["target"].values
    X_test  = test_df[feature_cols];  y_test  = test_df["target"].values

    # ────────────────────────────────────────────────────────────────
    # TRACK A — Logistic expanded
    # ────────────────────────────────────────────────────────────────
    print("\n[Track A] Training expanded logistic regression...")
    log_pipe = Pipeline([
        ("pre", build_preprocessor(EXPANDED_NUMERIC, EXPANDED_CATEGORICAL)),
        ("clf", LogisticRegression(solver="lbfgs", class_weight="balanced",
                                    max_iter=1000, random_state=42)),
    ])
    log_pipe.fit(X_train, y_train)
    log_proba = log_pipe.predict_proba(X_test)[:, 1]
    log_metrics = _basic_metrics(y_test, log_proba)
    print(f"  Logistic(expanded) — AUC={log_metrics['auc']:.4f}  "
          f"P={log_metrics['precision']:.4f}  R={log_metrics['recall']:.4f}  "
          f"F1={log_metrics['f1']:.4f}")

    # Coefficients (tied to one-hot expanded feature names)
    pre = log_pipe.named_steps["pre"]
    onehot_names = (pre.named_transformers_["cat"]["onehot"]
                    .get_feature_names_out(EXPANDED_CATEGORICAL).tolist())
    feat_names = EXPANDED_NUMERIC + onehot_names
    coefs = log_pipe.named_steps["clf"].coef_[0]
    coef_df = pd.DataFrame({"feature": feat_names, "coefficient": coefs})
    coef_df["abs_coef"] = coef_df["coefficient"].abs()
    coef_df = coef_df.sort_values("abs_coef", ascending=False)
    coef_df.to_csv(OUT_DIR / "feature_coefficients_logistic.csv", index=False)

    # ────────────────────────────────────────────────────────────────
    # TRACK B — XGBoost expanded (with early stopping on internal val)
    # ────────────────────────────────────────────────────────────────
    print("\n[Track B] Training expanded XGBoost...")
    # Pre-process (shared with SHAP later so we work on matrix form)
    xgb_pre = build_preprocessor(EXPANDED_NUMERIC, EXPANDED_CATEGORICAL)
    X_train_mat = xgb_pre.fit_transform(X_train)
    X_test_mat = xgb_pre.transform(X_test)
    # Densify if sparse (SHAP + XGBoost both handle dense better for this size)
    if hasattr(X_train_mat, "toarray"):
        X_train_mat = X_train_mat.toarray()
        X_test_mat = X_test_mat.toarray()

    # Carve a validation slice from the tail of the training window (FY2018–2020)
    # so early stopping has a real held-out set without touching the test window.
    val_mask = train_df["fiscal_year"].isin([2018, 2019, 2020]).values
    X_val_mat = X_train_mat[val_mask]; y_val = y_train[val_mask]
    X_train_fit = X_train_mat[~val_mask]; y_train_fit = y_train[~val_mask]
    print(f"  XGB train_fit rows: {len(y_train_fit):,}   val rows: {len(y_val):,}")

    spw = (y_train_fit == 0).sum() / max((y_train_fit == 1).sum(), 1)
    xgb_clf = xgb.XGBClassifier(
        n_estimators=400, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        scale_pos_weight=spw,
        objective="binary:logistic", eval_metric="auc",
        tree_method="hist", random_state=42, n_jobs=-1,
        early_stopping_rounds=25,
    )
    xgb_clf.fit(X_train_fit, y_train_fit, eval_set=[(X_val_mat, y_val)], verbose=False)
    xgb_proba = xgb_clf.predict_proba(X_test_mat)[:, 1]
    xgb_metrics = _basic_metrics(y_test, xgb_proba)
    print(f"  XGBoost(expanded) — AUC={xgb_metrics['auc']:.4f}  "
          f"P={xgb_metrics['precision']:.4f}  R={xgb_metrics['recall']:.4f}  "
          f"F1={xgb_metrics['f1']:.4f}")

    feat_imp = xgb_clf.feature_importances_
    imp_df = pd.DataFrame({"feature": feat_names, "importance": feat_imp})
    # Group one-hots back to source
    def _grp(f):
        for c in EXPANDED_CATEGORICAL:
            if f.startswith(c + "_"): return c
        return f
    imp_df["group"] = imp_df["feature"].apply(_grp)
    imp_df_grouped = imp_df.groupby("group", as_index=False)["importance"].sum().sort_values("importance", ascending=False)
    imp_df.sort_values("importance", ascending=False).to_csv(
        OUT_DIR / "feature_importances_xgboost.csv", index=False)

    # ────────────────────────────────────────────────────────────────
    # TRACK C — SHAP on test set
    # ────────────────────────────────────────────────────────────────
    print("\n[Track C] Computing SHAP values on test set...")
    explainer = shap.TreeExplainer(xgb_clf)
    shap_values = explainer.shap_values(X_test_mat)
    # Mean |SHAP| per feature (global importance)
    mean_abs = np.abs(shap_values).mean(axis=0)
    shap_global = pd.DataFrame({"feature": feat_names, "mean_abs_shap": mean_abs})
    shap_global["group"] = shap_global["feature"].apply(_grp)
    shap_global_grouped = shap_global.groupby("group", as_index=False)["mean_abs_shap"].sum().sort_values("mean_abs_shap", ascending=False)
    print("  Top-10 SHAP feature groups:")
    for _, r in shap_global_grouped.head(10).iterrows():
        print(f"    {r['group']:<38} {r['mean_abs_shap']:.4f}")

    # Save SHAP values (with feature names) to parquet
    shap_df = pd.DataFrame(shap_values, columns=feat_names)
    shap_df["ein"] = test_df["ein"].values
    shap_df["fiscal_year"] = test_df["fiscal_year"].values
    shap_df.to_parquet(OUT_DIR / "shap_values_test.parquet", index=False)

    # Summary plot
    print("  Rendering SHAP summary plot...")
    plt.figure(figsize=(10, 8))
    shap.summary_plot(shap_values, X_test_mat, feature_names=feat_names,
                       show=False, max_display=20)
    plt.tight_layout()
    plt.savefig(OUT_DIR / "shap_summary_plot.png", dpi=120, bbox_inches="tight")
    plt.close()

    # ────────────────────────────────────────────────────────────────
    # Comparison & agreement
    # ────────────────────────────────────────────────────────────────
    log_pred = (log_proba >= THRESHOLD).astype(int)
    xgb_pred = (xgb_proba >= THRESHOLD).astype(int)
    both_high = int(((log_pred == 1) & (xgb_pred == 1)).sum())
    log_only = int(((log_pred == 1) & (xgb_pred == 0)).sum())
    xgb_only = int(((xgb_pred == 1) & (log_pred == 0)).sum())
    both_low = int(((log_pred == 0) & (xgb_pred == 0)).sum())
    prob_corr = float(np.corrcoef(log_proba, xgb_proba)[0, 1])

    cm_log = confusion_matrix(y_test, log_pred).tolist()
    cm_xgb = confusion_matrix(y_test, xgb_pred).tolist()
    print(f"\nAgreement — both_high={both_high:,}  log_only={log_only:,}  "
          f"xgb_only={xgb_only:,}  both_low={both_low:,}  corr={prob_corr:.4f}")

    # Calibration tables
    cal_log = _decile_calibration(y_test, log_proba); cal_log["model"] = "logistic_expanded"
    cal_xgb = _decile_calibration(y_test, xgb_proba); cal_xgb["model"] = "xgboost_expanded"
    cal_both = pd.concat([cal_log, cal_xgb], ignore_index=True)
    cal_both.to_csv(OUT_DIR / "calibration_table_expanded.csv", index=False)

    cal_log_mae = float((cal_log.dropna(subset=["actual_rate"])["mean_predicted"]
                          - cal_log.dropna(subset=["actual_rate"])["actual_rate"]).abs().mean())
    cal_xgb_mae = float((cal_xgb.dropna(subset=["actual_rate"])["mean_predicted"]
                          - cal_xgb.dropna(subset=["actual_rate"])["actual_rate"]).abs().mean())
    print(f"Calibration MAE — logistic={cal_log_mae:.4f}  xgb={cal_xgb_mae:.4f}")

    # ────────────────────────────────────────────────────────────────
    # Crisis Replay shortlist update (from D5)
    # ────────────────────────────────────────────────────────────────
    print("\nUpdating Crisis Replay shortlist with new probs + SHAP explanations...")
    d5_shortlist = pd.read_csv(D5_DIR / "crisis_replay_shortlist.csv")
    d5_shortlist["ein"] = d5_shortlist["ein"].astype(str)
    d5_shortlist["call_year_T"] = d5_shortlist["call_year_T"].astype(int)

    # Join to test_df to pull features & positions for each (ein, call_year)
    test_df_idx = test_df.reset_index(drop=True).copy()
    test_df_idx["ein"] = test_df_idx["ein"].astype(str)
    test_df_idx["_row"] = np.arange(len(test_df_idx))
    lookup = test_df_idx.set_index(["ein", "fiscal_year"])[["_row"]]

    new_log_proba = []
    new_xgb_proba = []
    shap_explanations = []
    for _, row in d5_shortlist.iterrows():
        key = (row["ein"], row["call_year_T"])
        if key not in lookup.index:
            new_log_proba.append(np.nan)
            new_xgb_proba.append(np.nan)
            shap_explanations.append("")
            continue
        ridx = int(lookup.loc[key, "_row"])
        new_log_proba.append(float(log_proba[ridx]))
        new_xgb_proba.append(float(xgb_proba[ridx]))

        # Build explanation from top positive SHAP contributors
        sv = shap_values[ridx]
        # rank by signed contribution (positive = pushes toward HIGH risk)
        contrib = pd.Series(sv, index=feat_names)
        contrib_grouped = contrib.groupby(lambda f: _grp(f)).sum()
        top = contrib_grouped.sort_values(ascending=False).head(3)
        # Humanize labels
        label_map = {
            "cash_to_expenses": "thin cash-to-expenses ratio",
            "shock_absorption_months": "short shock-absorption runway",
            "operating_margin": "weak operating margin",
            "largest_source_pct": "high revenue concentration",
            "years_of_consecutive_deficits": "multi-year deficit streak",
            "margin_3yr_trend": "declining three-year margin trend",
            "margin_yoy_delta": "year-over-year margin drop",
            "runway_yoy_delta": "runway shrinkage year-over-year",
            "revenue_yoy_growth": "revenue contraction",
            "expense_yoy_growth": "expense acceleration",
            "concentration_x_thin_runway": "concentration combined with thin liquidity",
            "concentration_x_govt_funded": "concentrated government funding",
            "margin_x_runway": "combined margin-and-runway weakness",
            "small_and_thin": "small and under-reserved",
            "large_and_negative_margin": "large with negative margin",
            "is_government_funded": "heavy government funding dependence",
            "sector_budget_shock": "sector-wide budget shock exposure",
            "covid_era": "COVID-era disruption",
            "state_fiscal_stress": "state-level fiscal stress",
            "fiscal_year_bucket": "era-specific baseline risk",
            "state": "geographic pattern",
            "ntee_major_category": "sector-specific base rate",
            "size_bucket": "size-bucket base rate",
            "revenue_diversification_index": "low revenue diversification",
            "revenue_to_expenses": "low revenue-to-expense coverage",
            "net_assets_to_expenses": "thin reserves relative to expenses",
        }
        parts = []
        for name, val in top.items():
            if val <= 0:
                continue
            parts.append(f"{label_map.get(name, name)} (+{val:.2f})")
        if not parts:
            shap_explanations.append("No positive risk drivers — this case is model-neutral.")
        else:
            shap_explanations.append(
                "Elevated risk is driven by " + ", ".join(parts) + "."
            )

    d5_shortlist["predicted_distress_probability_logistic_v2"] = new_log_proba
    d5_shortlist["predicted_distress_probability_xgboost"] = new_xgb_proba
    d5_shortlist["xgboost_shap_explanation"] = shap_explanations
    d5_shortlist.to_csv(OUT_DIR / "crisis_replay_shortlist_v2.csv", index=False)
    print(f"  Updated shortlist written.")

    # ────────────────────────────────────────────────────────────────
    # Persist everything
    # ────────────────────────────────────────────────────────────────
    joblib.dump(log_pipe, MODELS_DIR / "logistic_expanded.joblib")
    joblib.dump({"pre": xgb_pre, "xgb": xgb_clf}, MODELS_DIR / "xgboost_expanded.joblib")
    joblib.dump(explainer, MODELS_DIR / "shap_explainer.joblib")

    # D5 originals (for comparison)
    d5_summary = json.loads((D5_DIR / "metrics_summary.json").read_text())

    summary = {
        "train_years": f"FY{min(TRAIN_YEARS)}–FY{max(TRAIN_YEARS)}",
        "test_years": f"FY{min(TEST_YEARS)}–FY{max(TEST_YEARS)}",
        "threshold": THRESHOLD,
        "baseline_rate_test": float(y_test.mean()),
        "n_test": int(len(y_test)),
        "n_train": int(len(y_train)),
        "expanded_feature_count": len(EXPANDED_NUMERIC) + len(EXPANDED_CATEGORICAL),
        "logistic_expanded": {
            **log_metrics,
            "calibration_mae_across_deciles": cal_log_mae,
            "confusion_matrix": cm_log,
            "top_15_abs_coefs": coef_df.head(15).to_dict(orient="records"),
        },
        "xgboost_expanded": {
            **xgb_metrics,
            "calibration_mae_across_deciles": cal_xgb_mae,
            "confusion_matrix": cm_xgb,
            "top_15_feature_importances": imp_df.sort_values("importance", ascending=False).head(15).to_dict(orient="records"),
            "top_10_shap_groups": shap_global_grouped.head(10).to_dict(orient="records"),
            "n_estimators_after_early_stop": int(getattr(xgb_clf, "best_iteration", xgb_clf.n_estimators) + 1),
        },
        "agreement": {
            "both_high": both_high, "log_only_high": log_only,
            "xgb_only_high": xgb_only, "both_low": both_low,
            "prob_correlation": prob_corr,
        },
        "d5_baseline_for_reference": {
            "logistic_original": d5_summary["logistic"],
            "xgboost_original":  d5_summary["xgboost"],
        },
    }
    (OUT_DIR / "metrics_summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nAll artifacts saved under {OUT_DIR}")
    print(f"  AUC delta logistic: {log_metrics['auc'] - d5_summary['logistic']['auc']:+.4f}")
    print(f"  AUC delta xgboost:  {xgb_metrics['auc'] - d5_summary['xgboost']['auc']:+.4f}")


if __name__ == "__main__":
    main()
