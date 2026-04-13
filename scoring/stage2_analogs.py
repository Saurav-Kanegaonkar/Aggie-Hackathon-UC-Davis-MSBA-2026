from __future__ import annotations

from pathlib import Path

import pandas as pd

from scoring.stage2_hydrate import canonicalize_stage2_panel


PRIMARY_GAP_ORDER = [
    ("operating_margin_gap", "low_margin", "operating_margin"),
    ("operating_runway_gap", "low_runway", "operating_runway_proxy_months"),
    ("revenue_diversification_gap", "high_concentration_in_volatile_source", "revenue_diversification_index"),
]
PRE_WINDOW_YEARS = range(2014, 2020)
POST_WINDOW_YEARS = range(2020, 2025)


def _as_frame(value: pd.DataFrame | str | Path) -> pd.DataFrame:
    if isinstance(value, pd.DataFrame):
        return value.copy()
    return pd.read_parquet(Path(value))


def _derive_operating_margin(row: pd.Series) -> float | None:
    value = row.get("operating_margin")
    if pd.notna(value):
        return float(value)
    total_revenue = row.get("total_revenue")
    total_expenses = row.get("total_expenses")
    if pd.isna(total_revenue) or pd.isna(total_expenses) or float(total_revenue) <= 0:
        return None
    return (float(total_revenue) - float(total_expenses)) / float(total_revenue)


def _derive_operating_runway(row: pd.Series) -> float | None:
    value = row.get("operating_runway_proxy_months")
    if pd.notna(value):
        return float(value)
    total_expenses = row.get("total_expenses")
    net_assets = row.get("net_assets_eoy")
    if pd.isna(total_expenses) or pd.isna(net_assets) or float(total_expenses) <= 0:
        return None
    return float(net_assets) / (float(total_expenses) / 12.0)


def _derive_revenue_diversification(row: pd.Series) -> float | None:
    value = row.get("revenue_diversification_index")
    if pd.notna(value):
        return float(value)

    pct_columns = ["pct_contributions", "pct_program_revenue", "pct_investment_income", "pct_other_revenue"]
    if any(column in row.index and pd.notna(row[column]) for column in pct_columns):
        shares = [float(row[column]) if column in row.index and pd.notna(row[column]) else 0.0 for column in pct_columns]
    else:
        total_revenue = row.get("total_revenue")
        if pd.isna(total_revenue) or float(total_revenue) <= 0:
            return None
        total_revenue = float(total_revenue)
        shares = [
            float(row.get("contributions_grants", 0.0)) / total_revenue if pd.notna(row.get("contributions_grants")) else 0.0,
            float(row.get("program_service_revenue", 0.0)) / total_revenue if pd.notna(row.get("program_service_revenue")) else 0.0,
            float(row.get("investment_income", 0.0)) / total_revenue if pd.notna(row.get("investment_income")) else 0.0,
            float(row.get("other_revenue", 0.0)) / total_revenue if pd.notna(row.get("other_revenue")) else 0.0,
        ]
    return 1 - sum(share ** 2 for share in shares)


def _metric_value(row: pd.Series, metric_name: str) -> float | None:
    if metric_name == "operating_margin":
        return _derive_operating_margin(row)
    if metric_name == "operating_runway_proxy_months":
        return _derive_operating_runway(row)
    if metric_name == "revenue_diversification_index":
        return _derive_revenue_diversification(row)
    raise ValueError(f"Unsupported metric: {metric_name}")


def _metric_series(frame: pd.DataFrame, metric_name: str) -> pd.Series:
    return frame.apply(lambda row: _metric_value(row, metric_name), axis=1)


def _primary_constraint(row: pd.Series) -> tuple[str | None, str | None]:
    best_gap = None
    best_label = None
    best_metric = None
    for gap_name, label, metric_name in PRIMARY_GAP_ORDER:
        value = row.get(gap_name)
        if pd.isna(value):
            continue
        value = float(value)
        if best_gap is None or value < best_gap:
            best_gap = value
            best_label = label
            best_metric = metric_name
    return best_label, best_metric


def _cohort_columns(kind: str) -> list[str]:
    if kind == "strict":
        return ["ntee_major_category", "size_bucket"]
    if kind == "fallback":
        return ["size_bucket"]
    raise ValueError(kind)


def _candidate_pool(panel: pd.DataFrame, target: pd.Series, kind: str) -> pd.DataFrame:
    if "size_bucket" not in panel.columns:
        return panel.iloc[0:0].copy()
    if kind == "strict" and "ntee_major_category" not in panel.columns:
        return panel.iloc[0:0].copy()
    if kind == "strict":
        mask = (
            panel["ntee_major_category"].fillna("").astype(str) == str(target.get("ntee_major_category", ""))
        ) & (panel["size_bucket"].fillna("").astype(str) == str(target.get("size_bucket", "")))
    else:
        mask = panel["size_bucket"].fillna("").astype(str) == str(target.get("size_bucket", ""))
    return panel[mask & (panel["ein"] != str(target["ein"]))].copy()


def _qualifying_candidates(
    pool: pd.DataFrame,
    target: pd.Series,
    kind: str,
    valid_history_eins: set[str],
) -> list[dict]:
    if pool.empty:
        return []

    metric_label, metric_name = _primary_constraint(target)
    if metric_label is None or metric_name is None:
        return []

    pool = pool.copy()
    pool["_metric_value"] = _metric_series(pool, metric_name)
    pool = pool.dropna(subset=["_metric_value"])
    if pool.empty:
        return []

    pool = pool[pool["ein"].isin(valid_history_eins)]
    if pool.empty:
        return []

    cohort_cols = _cohort_columns(kind)
    group_cols = cohort_cols + ["fiscal_year"]
    thresholds = (
        pool.groupby(group_cols)["_metric_value"]
        .quantile([0.25, 0.75])
        .unstack(level=-1)
        .rename(columns={0.25: "q25", 0.75: "q75"})
        .reset_index()
    )

    threshold_lookup = {
        tuple(row[col] for col in group_cols): {"q25": row["q25"], "q75": row["q75"]}
        for _, row in thresholds.iterrows()
    }

    target_state = str(target.get("state", "")).upper()
    target_revenue = target.get("total_revenue")
    target_revenue = None if pd.isna(target_revenue) or float(target_revenue) <= 0 else float(target_revenue)

    candidates: list[dict] = []
    for ein, org_rows in pool.groupby("ein", sort=False):
        org_rows = org_rows.sort_values(["fiscal_year", "tax_period_end"], ascending=[True, False], kind="mergesort")
        valid_pre: list[pd.Series] = []
        valid_post: list[pd.Series] = []

        for _, row in org_rows.iterrows():
            year = int(row["fiscal_year"])
            lookup_key = tuple(row[col] for col in group_cols)
            band = threshold_lookup.get(lookup_key)
            if band is None:
                continue
            metric_value = float(row["_metric_value"])
            if year in PRE_WINDOW_YEARS and metric_value <= float(band["q25"]):
                valid_pre.append(row)
            if year in POST_WINDOW_YEARS and metric_value >= float(band["q75"]):
                valid_post.append(row)

        if not valid_pre or not valid_post:
            continue

        pre_row = max(valid_pre, key=lambda row: int(row["fiscal_year"]))
        post_row = max(valid_post, key=lambda row: int(row["fiscal_year"]))
        candidate_revenue = post_row.get("total_revenue")
        if target_revenue is None or pd.isna(candidate_revenue) or float(candidate_revenue) <= 0:
            revenue_ratio_diff = float("inf")
        else:
            revenue_ratio_diff = abs(float(candidate_revenue) / target_revenue - 1.0)

        candidates.append(
            {
                "ein": str(post_row["ein"]),
                "org_name": str(post_row.get("org_name", "")),
                "state": str(post_row.get("state", "")).upper(),
                "pre_window_year": int(pre_row["fiscal_year"]),
                "post_recovery_year": int(post_row["fiscal_year"]),
                "matched_metric_name": metric_name,
                "matched_metric_pre_value": float(pre_row["_metric_value"]),
                "matched_metric_post_value": float(post_row["_metric_value"]),
                "same_state": str(post_row.get("state", "")).upper() == target_state,
                "revenue_ratio_diff": revenue_ratio_diff,
                "cohort_priority": 0 if kind == "strict" else 1,
                "ein_sort": int(str(post_row["ein"])) if str(post_row["ein"]).isdigit() else str(post_row["ein"]),
            }
        )

    candidates.sort(
        key=lambda row: (
            row["cohort_priority"],
            0 if row["same_state"] else 1,
            row["revenue_ratio_diff"],
            -row["post_recovery_year"],
            row["ein_sort"],
        )
    )
    return candidates[:3]


def enrich_recovery_analogs(
    df: pd.DataFrame,
    panel: pd.DataFrame | str | Path,
    *,
    canonicalized: bool = False,
) -> pd.DataFrame:
    frame = df.copy()
    panel_frame = _as_frame(panel) if canonicalized else canonicalize_stage2_panel(panel)
    valid_history_eins = set(
        panel_frame.groupby("ein")["fiscal_year"].nunique().loc[lambda s: s >= 5].index.astype(str)
    )

    recovery_eins: list[list[str]] = []
    recovery_count: list[int] = []
    recovery_evidence: list[list[dict]] = []
    recovery_constraint: list[str | None] = []
    recovery_status: list[str] = []

    for _, target in frame.iterrows():
        benchmark_status = target.get("benchmark_status")
        if benchmark_status in {"not_scoreable", "insufficient_resilient_refs"}:
            recovery_status.append("not_applicable")
            recovery_constraint.append(None)
            recovery_eins.append([])
            recovery_count.append(0)
            recovery_evidence.append([])
            continue

        pool = _candidate_pool(panel_frame, target, "strict")
        candidates = _qualifying_candidates(pool, target, "strict", valid_history_eins)
        if not candidates:
            pool = _candidate_pool(panel_frame, target, "fallback")
            candidates = _qualifying_candidates(pool, target, "fallback", valid_history_eins)

        primary_label, _ = _primary_constraint(target)
        if not candidates:
            recovery_status.append("none_in_cohort")
            recovery_constraint.append(primary_label)
            recovery_eins.append([])
            recovery_count.append(0)
            recovery_evidence.append([])
            continue

        recovery_status.append("found")
        recovery_constraint.append(primary_label)
        recovery_eins.append([candidate["ein"] for candidate in candidates])
        recovery_count.append(len(candidates))
        recovery_evidence.append(
            [
                {
                    "ein": candidate["ein"],
                    "org_name": candidate["org_name"],
                    "state": candidate["state"],
                    "pre_window_year": candidate["pre_window_year"],
                    "post_recovery_year": candidate["post_recovery_year"],
                    "matched_metric_name": candidate["matched_metric_name"],
                    "matched_metric_pre_value": candidate["matched_metric_pre_value"],
                    "matched_metric_post_value": candidate["matched_metric_post_value"],
                }
                for candidate in candidates
            ]
        )

    frame["recovery_analog_eins"] = recovery_eins
    frame["recovery_analog_count"] = recovery_count
    frame["recovery_analog_evidence"] = recovery_evidence
    frame["recovery_analog_constraint"] = recovery_constraint
    frame["recovery_analog_status"] = recovery_status
    return frame
