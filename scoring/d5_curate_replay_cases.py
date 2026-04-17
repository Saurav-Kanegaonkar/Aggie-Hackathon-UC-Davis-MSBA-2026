#!/usr/bin/env python3
"""
D5 Deliverable 2 — Curate Crisis Replay cases.

Identifies orgs in the temporal test window (FY2021–FY2024) where:
  - The logistic model predicted distress_probability > 0.50 at year T
  - Urgency actually materialized at T+1 or T+2
  - Clean 5-year filing trajectory exists (T-2 through T+2)
  - CA or WA
  - Net assets $2M-$500M at year T
  - Org looked "okay-ish" at T (not already in crisis)
  - Recognizable org type

Outputs:
  outputs/d5_validation/crisis_replay_shortlist.csv
  outputs/d5_validation/crisis_replay_trajectories.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PANEL_PATH = ROOT / "data" / "processed" / "panel_990_extended_v4.parquet"
TEST_PRED_PATH = ROOT / "outputs" / "d5_validation" / "temporal_test_predictions.parquet"
OUT_DIR = ROOT / "outputs" / "d5_validation"

# Exclusion keywords for obscure org types
EXCLUDE_KEYWORDS = [
    "TRUST FUND", "BENEFIT TRUST", "INSURANCE TRUST", "VEBA", "BARGAINED",
    "PENSION", "ALUMNI", "LODGE", "LEGION", "ROTARY CLUB", "CHAMBER OF COMMERCE",
    "SOCIETY OF", "GUILD OF", "LOCAL UNION", "LABOR MANAGEMENT",
    "FRATERNAL", "BOY SCOUTS TROOP", "GIRL SCOUT TROOP",
    "LIMITED LIABILITY", " LLC", " LP ",
]

# NTEE major groups that are broadly recognizable
RECOGNIZABLE_SECTORS = {"A","B","C","E","G","H","L","O","P","Q","S","T"}


def is_recognizable(name: str) -> bool:
    up = (name or "").upper()
    return not any(kw in up for kw in EXCLUDE_KEYWORDS)


def main() -> None:
    print("Loading panel and predictions...")
    panel = pd.read_parquet(PANEL_PATH)
    panel["ein"] = panel["ein"].astype(str)
    panel["fiscal_year"] = panel["fiscal_year"].astype(int)

    preds = pd.read_parquet(TEST_PRED_PATH)
    preds["ein"] = preds["ein"].astype(str)
    preds["fiscal_year"] = preds["fiscal_year"].astype(int)

    # Compute per-row runway/margin from panel to support trajectory reconstruction
    panel["monthly_expenses"] = panel["total_expenses"] / 12
    panel["liquid_cash"] = (panel["cash_non_interest_bearing"].fillna(0) +
                            panel["savings_temporary_investments"].fillna(0))
    # cash-runway variants
    def runway(cash, exp, rev):
        if pd.isna(exp) or exp <= 0: return 120.0
        deficit = exp - (rev if pd.notna(rev) else 0)
        if deficit <= 0: return 120.0
        return min(120.0, cash / (deficit / 12))
    panel["cash_runway_months"] = panel.apply(
        lambda r: runway(r["liquid_cash"], r["total_expenses"], r["total_revenue"]), axis=1
    )
    panel["operating_margin_pct"] = np.where(
        panel["total_revenue"] > 0,
        (panel["total_revenue"] - panel["total_expenses"]) / panel["total_revenue"] * 100,
        np.nan,
    )
    # Largest-source-pct from raw fields
    comparison = ["contributions_grants", "program_service_revenue", "investment_income", "other_revenue"]
    labels = {
        "contributions_grants": "Contributions & grants",
        "program_service_revenue": "Program service revenue",
        "investment_income": "Investment income",
        "other_revenue": "Other revenue",
    }
    def largest_src(row):
        vals = {c: (float(row[c]) if pd.notna(row[c]) else 0.0) for c in comparison}
        best = max(vals, key=vals.get)
        return pd.Series({"largest_source_name": labels[best],
                          "largest_source_amount": vals[best]})
    ls = panel.apply(largest_src, axis=1)
    panel["largest_source_name"] = ls["largest_source_name"]
    panel["largest_source_amount"] = ls["largest_source_amount"]
    panel["largest_source_pct"] = np.where(
        panel["total_revenue"] > 0,
        panel["largest_source_amount"] / panel["total_revenue"] * 100,
        np.nan,
    )

    # ── Candidate filter on predictions ───────────────────────────────
    print("Filtering predictions to CA/WA, $2M–$100M (boutique-serviceable), "
          "predicted distress > 0.5, $2M+ revenue (not a passive foundation)...")
    cand = preds[
        (preds["state"].isin(["CA", "WA"])) &
        (preds["net_assets_eoy"].between(2_000_000, 100_000_000)) &
        (preds["total_revenue"] >= 2_000_000) &
        (preds["total_revenue"] <= 150_000_000) &
        (preds["total_expenses"] >= 1_000_000) &
        (preds["logistic_proba"] > 0.50) &
        (preds["target"] == 1)
    ].copy()
    print(f"  Candidates passing size/prediction/target filter: {len(cand):,}")

    # ── "Looked healthy at T" filter (tightened) ──────────────────────
    # Both conditions must be satisfied: the org had real runway AND was not
    # operating in a severe deficit at the call year.
    cand = cand[
        (cand["shock_absorption_months"] >= 6) &
        (cand["operating_margin"] >= -0.05)
    ].copy()
    print(f"  After 'looked healthy at T' (runway>=6mo AND margin>=-5%): {len(cand):,}")

    # ── Attach org name + NTEE label (already has ntee_major_category from preds) ──
    name_lookup = (panel.sort_values(["ein", "fiscal_year"])
                        .drop_duplicates("ein", keep="last")
                        [["ein", "org_name", "ntee_major_category_name"]])
    cand = cand.merge(name_lookup, on="ein", how="left")

    # ── Recognizable filter ───────────────────────────────────────────
    cand = cand[cand["org_name"].fillna("").apply(is_recognizable)]
    cand = cand[cand["ntee_major_category"].fillna("").isin(RECOGNIZABLE_SECTORS)]
    print(f"  After recognizable/sector filter: {len(cand):,}")

    # ── Filing continuity check (T-2 through T+2) ─────────────────────
    all_years_by_ein = panel.groupby("ein")["fiscal_year"].apply(set).to_dict()

    def has_continuous_window(ein, t):
        years = all_years_by_ein.get(ein, set())
        required = set(range(t - 2, t + 3))
        return required.issubset(years)

    cand["has_window"] = cand.apply(lambda r: has_continuous_window(r["ein"], r["fiscal_year"]), axis=1)
    cand = cand[cand["has_window"]].copy()
    print(f"  After T-2..T+2 continuity check: {len(cand):,}")

    # ── Pick the single best "call year" per EIN ──────────────────────
    # Prefer the most recent call where model was right and org had window
    cand = cand.sort_values(["ein", "fiscal_year"]).groupby("ein", as_index=False).last()
    print(f"  Unique orgs: {len(cand):,}")

    # ── Demo strength score ──────────────────────────────────────────
    # Components:
    #  - Confidence in prediction (higher logistic_proba = better)
    #  - How dramatic the outcome was (T+1 runway < 1 mo is more dramatic)
    #  - Recognizable sector bonus
    #  - Healthy-at-T = wasn't obviously already broken
    def post_shock_runway(ein, t):
        rows = panel[(panel["ein"] == ein) & (panel["fiscal_year"].isin([t + 1, t + 2]))]
        if rows.empty: return np.nan
        return float(rows["cash_runway_months"].min())

    def post_margin(ein, t):
        rows = panel[(panel["ein"] == ein) & (panel["fiscal_year"].isin([t + 1, t + 2]))]
        if rows.empty: return np.nan
        return float(rows["operating_margin_pct"].min())

    cand["t_plus_min_runway"] = cand.apply(
        lambda r: post_shock_runway(r["ein"], r["fiscal_year"]), axis=1)
    cand["t_plus_min_margin"] = cand.apply(
        lambda r: post_margin(r["ein"], r["fiscal_year"]), axis=1)

    # Drama: how sharp was the collapse?
    # runway_drop = shock_absorption_months(t) - t_plus_min_runway
    # We want big drops from "okay" to "bad"
    cand["runway_drop"] = cand["shock_absorption_months"] - cand["t_plus_min_runway"]
    cand["demo_strength"] = (
        cand["logistic_proba"] * 40 +                           # confidence 0-40
        (12 - cand["t_plus_min_runway"].clip(0, 12)) * 3 +      # post-crash severity 0-36
        cand["runway_drop"].clip(lower=0, upper=20) * 1.5       # 0-30
    )

    cand = cand.sort_values("demo_strength", ascending=False).reset_index(drop=True)

    print(f"\nTop-30 preliminary list produced — building trajectories for top 30...")

    # ── Build T-2..T+2 trajectories ───────────────────────────────────
    trajectories = {}
    top_pool = cand.head(30)
    rows_out = []
    for _, row in top_pool.iterrows():
        ein = row["ein"]; t = int(row["fiscal_year"])
        years = range(t - 2, t + 3)
        traj = []
        for yr in years:
            rec = panel[(panel["ein"] == ein) & (panel["fiscal_year"] == yr)]
            if rec.empty:
                traj.append({"fy": yr, "missing": True})
                continue
            r = rec.iloc[0]
            traj.append({
                "fy": int(yr),
                "total_revenue": None if pd.isna(r["total_revenue"]) else float(r["total_revenue"]),
                "total_expenses": None if pd.isna(r["total_expenses"]) else float(r["total_expenses"]),
                "net_assets_eoy": None if pd.isna(r["net_assets_eoy"]) else float(r["net_assets_eoy"]),
                "operating_margin_pct": None if pd.isna(r["operating_margin_pct"]) else float(r["operating_margin_pct"]),
                "cash_runway_months": None if pd.isna(r["cash_runway_months"]) else float(r["cash_runway_months"]),
                "largest_source_name": r["largest_source_name"],
                "largest_source_pct": None if pd.isna(r["largest_source_pct"]) else float(r["largest_source_pct"]),
            })
        trajectories[ein] = {
            "org_name": row["org_name"],
            "ntee_major_category": row["ntee_major_category"],
            "state": row["state"],
            "call_year": t,
            "predicted_distress_proba": float(row["logistic_proba"]),
            "t_plus_min_runway_months": None if pd.isna(row["t_plus_min_runway"]) else float(row["t_plus_min_runway"]),
            "t_plus_min_margin_pct": None if pd.isna(row["t_plus_min_margin"]) else float(row["t_plus_min_margin"]),
            "demo_strength": float(row["demo_strength"]),
            "trajectory": traj,
        }
        # Narrative
        narrative = (
            f"Northstar flagged this {row['ntee_major_category']} sector {row['state']} org in FY{t} at "
            f"{row['logistic_proba']*100:.0f}% distress probability. "
        )
        if pd.notna(row["t_plus_min_runway"]) and row["t_plus_min_runway"] < 3:
            narrative += (
                f"Within 2 years their cash runway collapsed to "
                f"{row['t_plus_min_runway']:.1f} months"
            )
            if pd.notna(row["t_plus_min_margin"]):
                narrative += f" with operating margin {row['t_plus_min_margin']:.1f}%."
            else:
                narrative += "."
        else:
            narrative += "Urgency materialized per the target rule in T+1."

        rows_out.append({
            "ein": ein,
            "org_name": row["org_name"],
            "ntee_major_category": row["ntee_major_category"],
            "ntee_major_category_name": row.get("ntee_major_category_name"),
            "state": row["state"],
            "call_year_T": t,
            "net_assets_at_T": float(row["net_assets_eoy"]),
            "total_revenue_at_T": float(row["total_revenue"]),
            "total_expenses_at_T": float(row["total_expenses"]),
            "op_margin_at_T": float(row["operating_margin"]) * 100 if pd.notna(row["operating_margin"]) else None,
            "runway_at_T": float(row["shock_absorption_months"]) if pd.notna(row["shock_absorption_months"]) else None,
            "predicted_distress_proba": float(row["logistic_proba"]),
            "t_plus_min_runway_months": float(row["t_plus_min_runway"]) if pd.notna(row["t_plus_min_runway"]) else None,
            "t_plus_min_margin_pct": float(row["t_plus_min_margin"]) if pd.notna(row["t_plus_min_margin"]) else None,
            "runway_drop": float(row["runway_drop"]) if pd.notna(row["runway_drop"]) else None,
            "demo_strength": float(row["demo_strength"]),
            "narrative": narrative,
        })

    shortlist = pd.DataFrame(rows_out)
    shortlist.to_csv(OUT_DIR / "crisis_replay_shortlist.csv", index=False)
    (OUT_DIR / "crisis_replay_trajectories.json").write_text(json.dumps(trajectories, indent=2))

    # Print the top 10
    print("\n" + "="*100)
    print("TOP 10 CRISIS REPLAY CASES")
    print("="*100)
    for i, row in enumerate(rows_out[:10], 1):
        print(f"\n#{i}  {row['org_name']} (EIN {row['ein']})")
        print(f"    Sector: {row['ntee_major_category']} ({row.get('ntee_major_category_name','?')})   State: {row['state']}")
        print(f"    Call year T: FY{row['call_year_T']}    Predicted distress: {row['predicted_distress_proba']*100:.1f}%")
        print(f"    At T:  net_assets=${row['net_assets_at_T']:,.0f}  revenue=${row['total_revenue_at_T']:,.0f}  "
              f"margin={row['op_margin_at_T']:.1f}%  runway={row['runway_at_T']:.1f}mo")
        print(f"    Post-T:  min runway in T+1/T+2 = {row['t_plus_min_runway_months']:.1f}mo   "
              f"min margin = {row['t_plus_min_margin_pct']:.1f}%   runway drop = {row['runway_drop']:.1f}mo")
        print(f"    Demo strength: {row['demo_strength']:.1f}")
        print(f"    Narrative: {row['narrative']}")
        # Print trajectory table
        traj = trajectories[row["ein"]]["trajectory"]
        print(f"    Trajectory:")
        print(f"      {'FY':<6} {'Revenue':>14} {'Expenses':>14} {'Margin%':>8} {'Runway':>8} {'LargestSrc%':>12}")
        for t_row in traj:
            if t_row.get("missing"):
                print(f"      {t_row['fy']:<6} {'(missing)':>14}")
                continue
            rev = f"${t_row['total_revenue']:,.0f}" if t_row['total_revenue'] is not None else "-"
            exp = f"${t_row['total_expenses']:,.0f}" if t_row['total_expenses'] is not None else "-"
            margin = f"{t_row['operating_margin_pct']:.1f}%" if t_row['operating_margin_pct'] is not None else "-"
            runway = f"{t_row['cash_runway_months']:.1f}mo" if t_row['cash_runway_months'] is not None else "-"
            lsp = f"{t_row['largest_source_pct']:.1f}%" if t_row['largest_source_pct'] is not None else "-"
            print(f"      {t_row['fy']:<6} {rev:>14} {exp:>14} {margin:>8} {runway:>8} {lsp:>12}")

    print(f"\nShortlist saved to {OUT_DIR / 'crisis_replay_shortlist.csv'}")
    print(f"Trajectories saved to {OUT_DIR / 'crisis_replay_trajectories.json'}")


if __name__ == "__main__":
    main()
