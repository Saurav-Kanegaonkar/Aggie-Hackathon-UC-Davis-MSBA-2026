from __future__ import annotations

from pathlib import Path
import heapq

import numpy as np
import pandas as pd

from scoring.stage2_hydrate import canonicalize_stage2_panel


PRIMARY_GAP_ORDER = [
    ("operating_margin_gap", "low_margin", "operating_margin"),
    ("operating_runway_gap", "low_runway", "operating_runway_proxy_months"),
    ("revenue_diversification_gap", "high_concentration_in_volatile_source", "revenue_diversification_index"),
]
PRE_WINDOW_YEARS = range(2014, 2020)
POST_WINDOW_YEARS = range(2020, 2025)
METRIC_NAMES = [metric_name for _, _, metric_name in PRIMARY_GAP_ORDER]
STRICT_GROUP_COLUMNS = ["ntee_major_category", "size_bucket"]
FALLBACK_GROUP_COLUMNS = ["size_bucket"]


def _as_frame(value: pd.DataFrame | str | Path) -> pd.DataFrame:
    if isinstance(value, pd.DataFrame):
        return value.copy()
    return pd.read_parquet(Path(value))


def _numeric_series(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(np.nan, index=frame.index, dtype="float64")
    return pd.to_numeric(frame[column], errors="coerce")


def _text_series(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series("", index=frame.index, dtype="string")
    return frame[column].fillna("").astype("string")


def _derive_operating_margin_series(frame: pd.DataFrame) -> pd.Series:
    existing = _numeric_series(frame, "operating_margin")
    total_revenue = _numeric_series(frame, "total_revenue")
    total_expenses = _numeric_series(frame, "total_expenses")
    derived = (total_revenue - total_expenses) / total_revenue.where(total_revenue > 0)
    return existing.combine_first(derived.replace([np.inf, -np.inf], np.nan))


def _derive_operating_runway_series(frame: pd.DataFrame) -> pd.Series:
    existing = _numeric_series(frame, "operating_runway_proxy_months")
    total_expenses = _numeric_series(frame, "total_expenses")
    net_assets = _numeric_series(frame, "net_assets_eoy")
    monthly_expenses = total_expenses / 12.0
    derived = net_assets / monthly_expenses.where(monthly_expenses > 0)
    return existing.combine_first(derived.replace([np.inf, -np.inf], np.nan))


def _derive_revenue_diversification_series(frame: pd.DataFrame) -> pd.Series:
    existing = _numeric_series(frame, "revenue_diversification_index")

    pct_columns = ["pct_contributions", "pct_program_revenue", "pct_investment_income", "pct_other_revenue"]
    pct_frame = pd.DataFrame({column: _numeric_series(frame, column) for column in pct_columns}, index=frame.index)
    any_pct = pct_frame.notna().any(axis=1)
    pct_based = 1.0 - pct_frame.fillna(0).pow(2).sum(axis=1)
    pct_based = pct_based.where(any_pct, np.nan)

    total_revenue = _numeric_series(frame, "total_revenue")
    contributions = _numeric_series(frame, "contributions_grants")
    program = _numeric_series(frame, "program_service_revenue")
    investment = _numeric_series(frame, "investment_income")
    other = _numeric_series(frame, "other_revenue")
    missing_other = other.isna() & total_revenue.notna()
    other.loc[missing_other] = total_revenue.loc[missing_other] - contributions.loc[missing_other].fillna(0) - program.loc[missing_other].fillna(0) - investment.loc[missing_other].fillna(0)

    component_frame = pd.DataFrame(
        {
            "contributions": contributions,
            "program": program,
            "investment": investment,
            "other": other,
        },
        index=frame.index,
    )
    any_component = component_frame.notna().any(axis=1)
    shares = component_frame.div(total_revenue.where(total_revenue > 0), axis=0)
    component_based = 1.0 - shares.fillna(0).pow(2).sum(axis=1)
    component_based = component_based.where(any_component & total_revenue.gt(0), np.nan)

    return existing.combine_first(pct_based).combine_first(component_based).replace([np.inf, -np.inf], np.nan)


def _prepare_panel(panel: pd.DataFrame | str | Path, *, canonicalized: bool) -> pd.DataFrame:
    frame = _as_frame(panel) if canonicalized else canonicalize_stage2_panel(panel)
    frame = frame.copy()
    frame["ein"] = frame["ein"].astype(str)
    frame["fiscal_year"] = pd.to_numeric(frame["fiscal_year"], errors="coerce").astype("Int64")
    frame["state"] = _text_series(frame, "state").str.upper()
    frame["ntee_major_category"] = _text_series(frame, "ntee_major_category")
    frame["size_bucket"] = _text_series(frame, "size_bucket")
    frame["org_name"] = _text_series(frame, "org_name")
    frame["tax_period_end"] = _text_series(frame, "tax_period_end")
    frame["total_revenue"] = _numeric_series(frame, "total_revenue")
    frame["operating_margin"] = _derive_operating_margin_series(frame)
    frame["operating_runway_proxy_months"] = _derive_operating_runway_series(frame)
    frame["revenue_diversification_index"] = _derive_revenue_diversification_series(frame)
    return frame


def _primary_constraint(row: pd.Series) -> tuple[str | None, str | None]:
    return _primary_constraint_values(
        row.get("operating_margin_gap"),
        row.get("operating_runway_gap"),
        row.get("revenue_diversification_gap"),
    )


def _primary_constraint_values(
    operating_margin_gap: float | int | None,
    operating_runway_gap: float | int | None,
    revenue_diversification_gap: float | int | None,
) -> tuple[str | None, str | None]:
    best_gap = None
    best_label = None
    best_metric = None
    for value, (_, label, metric_name) in zip(
        [operating_margin_gap, operating_runway_gap, revenue_diversification_gap],
        PRIMARY_GAP_ORDER,
    ):
        if pd.isna(value):
            continue
        value = float(value)
        if best_gap is None or value < best_gap:
            best_gap = value
            best_label = label
            best_metric = metric_name
    return best_label, best_metric


def _valid_history_eins(frame: pd.DataFrame) -> set[str]:
    counts = frame.groupby("ein", sort=False)["fiscal_year"].nunique()
    return set(counts.loc[counts >= 5].index.astype(str))


def _build_metric_pool(frame: pd.DataFrame, metric_name: str, valid_eins: set[str]) -> pd.DataFrame:
    metric_rows = frame.loc[frame[metric_name].notna() & frame["fiscal_year"].notna()].copy()
    if metric_rows.empty:
        return pd.DataFrame(
            columns=[
                "ein",
                "ntee_major_category",
                "size_bucket",
                "org_name",
                "state",
                "total_revenue",
                "pre_window_year",
                "post_recovery_year",
                "matched_metric_name",
                "matched_metric_pre_value",
                "matched_metric_post_value",
            ]
        )

    thresholds = (
        metric_rows.groupby("fiscal_year", sort=False)[metric_name]
        .quantile([0.25, 0.75])
        .unstack(level=-1)
        .rename(columns={0.25: "q25", 0.75: "q75"})
        .reset_index()
    )
    metric_rows = metric_rows.merge(thresholds, on="fiscal_year", how="left")

    pre_rows = metric_rows.loc[
        metric_rows["fiscal_year"].isin(PRE_WINDOW_YEARS) & metric_rows[metric_name].le(metric_rows["q25"])
    ].copy()
    post_rows = metric_rows.loc[
        metric_rows["fiscal_year"].isin(POST_WINDOW_YEARS) & metric_rows[metric_name].ge(metric_rows["q75"])
    ].copy()

    candidate_eins = (
        set(pre_rows["ein"].astype(str))
        & set(post_rows["ein"].astype(str))
        & valid_eins
    )
    if not candidate_eins:
        return pd.DataFrame(
            columns=[
                "ein",
                "ntee_major_category",
                "size_bucket",
                "org_name",
                "state",
                "total_revenue",
                "pre_window_year",
                "post_recovery_year",
                "matched_metric_name",
                "matched_metric_pre_value",
                "matched_metric_post_value",
            ]
        )

    pre_choice = (
        pre_rows.loc[pre_rows["ein"].astype(str).isin(candidate_eins)]
        .sort_values(["ein", "fiscal_year", "tax_period_end"], ascending=[True, False, False], kind="mergesort")
        .drop_duplicates(subset=["ein"], keep="first")
        .loc[:, ["ein", "fiscal_year", metric_name]]
        .rename(columns={"fiscal_year": "pre_window_year", metric_name: "matched_metric_pre_value"})
    )
    post_choice = (
        post_rows.loc[post_rows["ein"].astype(str).isin(candidate_eins)]
        .sort_values(["ein", "fiscal_year", "tax_period_end"], ascending=[True, False, False], kind="mergesort")
        .drop_duplicates(subset=["ein"], keep="first")
        .loc[:, ["ein", "ntee_major_category", "size_bucket", "org_name", "state", "total_revenue", "fiscal_year", metric_name]]
        .rename(columns={"fiscal_year": "post_recovery_year", metric_name: "matched_metric_post_value"})
    )

    pool = pre_choice.merge(post_choice, on="ein", how="inner", validate="one_to_one")
    pool["matched_metric_name"] = metric_name
    pool["ein"] = pool["ein"].astype(str)
    pool["state"] = pool["state"].astype("string").str.upper()
    pool["ntee_major_category"] = pool["ntee_major_category"].astype("string")
    pool["size_bucket"] = pool["size_bucket"].astype("string")
    return pool


def _candidate_record(row: pd.Series) -> dict:
    return {
        "ein": str(row["ein"]),
        "ntee_major_category": str(row["ntee_major_category"]),
        "size_bucket": str(row["size_bucket"]),
        "org_name": str(row["org_name"]),
        "state": str(row["state"]),
        "total_revenue": None if pd.isna(row["total_revenue"]) else float(row["total_revenue"]),
        "pre_window_year": int(row["pre_window_year"]),
        "post_recovery_year": int(row["post_recovery_year"]),
        "matched_metric_name": str(row["matched_metric_name"]),
        "matched_metric_pre_value": float(row["matched_metric_pre_value"]),
        "matched_metric_post_value": float(row["matched_metric_post_value"]),
    }


def _build_pool_indexes(pool: pd.DataFrame) -> tuple[dict[tuple[str, str], list[dict]], dict[str, list[dict]]]:
    strict_index: dict[tuple[str, str], list[dict]] = {}
    fallback_index: dict[str, list[dict]] = {}

    if pool.empty:
        return strict_index, fallback_index

    for key, group in pool.groupby(["ntee_major_category", "size_bucket"], dropna=False, sort=False):
        strict_index[(str(key[0]), str(key[1]))] = [_candidate_record(row) for _, row in group.iterrows()]
    for key, group in pool.groupby("size_bucket", dropna=False, sort=False):
        fallback_index[str(key)] = [_candidate_record(row) for _, row in group.iterrows()]
    return strict_index, fallback_index


def _sorted_candidates(pool: list[dict], target_ein: str, target_state: str, target_revenue: float | int | None) -> list[dict]:
    if not pool:
        return []

    same_state_ranked: list[tuple[tuple, dict]] = []
    other_state_ranked: list[tuple[tuple, dict]] = []
    for candidate in pool:
        if candidate["ein"] == target_ein:
            continue
        candidate_revenue = candidate["total_revenue"]
        if pd.isna(target_revenue) or float(target_revenue) <= 0 or candidate_revenue is None or candidate_revenue <= 0:
            revenue_ratio_diff = np.inf
        else:
            revenue_ratio_diff = abs(candidate_revenue / float(target_revenue) - 1.0)
        entry = (
            (
                revenue_ratio_diff,
                -candidate["post_recovery_year"],
                candidate["ein"],
            ),
            candidate,
        )
        if candidate["state"].upper() == target_state:
            same_state_ranked.append(entry)
        else:
            other_state_ranked.append(entry)

    selected = [item[1] for item in heapq.nsmallest(3, same_state_ranked, key=lambda item: item[0])]
    if len(selected) < 3:
        selected.extend(
            item[1]
            for item in heapq.nsmallest(3 - len(selected), other_state_ranked, key=lambda item: item[0])
        )
    return selected


def enrich_recovery_analogs(
    df: pd.DataFrame,
    panel: pd.DataFrame | str | Path,
    *,
    canonicalized: bool = False,
) -> pd.DataFrame:
    frame = df.copy()
    frame["ein"] = frame["ein"].astype(str)
    panel_frame = _prepare_panel(panel, canonicalized=canonicalized)
    valid_eins = _valid_history_eins(panel_frame)

    metric_pools = {metric_name: _build_metric_pool(panel_frame, metric_name, valid_eins) for metric_name in METRIC_NAMES}
    strict_indexes = {}
    fallback_indexes = {}
    for metric_name, pool in metric_pools.items():
        strict_indexes[metric_name], fallback_indexes[metric_name] = _build_pool_indexes(pool)

    recovery_eins: list[list[str]] = []
    recovery_count: list[int] = []
    recovery_evidence: list[list[dict]] = []
    recovery_constraint: list[str | None] = []
    recovery_status: list[str] = []

    target_tuples = list(
        zip(
            frame["ein"].astype(str),
            frame.get("benchmark_status", pd.Series(index=frame.index, dtype="object")),
            frame.get("state", pd.Series(index=frame.index, dtype="object")).fillna("").astype(str).str.upper(),
            pd.to_numeric(frame.get("total_revenue", pd.Series(index=frame.index, dtype="float64")), errors="coerce"),
            frame.get("ntee_major_category", pd.Series(index=frame.index, dtype="object")).fillna("").astype(str),
            frame.get("size_bucket", pd.Series(index=frame.index, dtype="object")).fillna("").astype(str),
            pd.to_numeric(frame.get("operating_margin_gap", pd.Series(index=frame.index, dtype="float64")), errors="coerce"),
            pd.to_numeric(frame.get("operating_runway_gap", pd.Series(index=frame.index, dtype="float64")), errors="coerce"),
            pd.to_numeric(frame.get("revenue_diversification_gap", pd.Series(index=frame.index, dtype="float64")), errors="coerce"),
        )
    )

    for (
        target_ein,
        benchmark_status,
        target_state,
        target_revenue,
        target_ntee,
        target_size_bucket,
        operating_margin_gap,
        operating_runway_gap,
        revenue_diversification_gap,
    ) in target_tuples:
        if benchmark_status in {"not_scoreable", "insufficient_resilient_refs", "insufficient_reference_set"}:
            recovery_status.append("not_applicable")
            recovery_constraint.append(None)
            recovery_eins.append([])
            recovery_count.append(0)
            recovery_evidence.append([])
            continue

        primary_label, metric_name = _primary_constraint_values(
            operating_margin_gap,
            operating_runway_gap,
            revenue_diversification_gap,
        )
        if primary_label is None or metric_name is None:
            recovery_status.append("none_in_cohort")
            recovery_constraint.append(None)
            recovery_eins.append([])
            recovery_count.append(0)
            recovery_evidence.append([])
            continue

        strict_key = (target_ntee, target_size_bucket)
        fallback_key = target_size_bucket

        strict_pool = strict_indexes.get(metric_name, {}).get(strict_key, [])
        selected = _sorted_candidates(strict_pool, target_ein, target_state, target_revenue)
        if not selected:
            fallback_pool = fallback_indexes.get(metric_name, {}).get(fallback_key, [])
            selected = _sorted_candidates(fallback_pool, target_ein, target_state, target_revenue)

        if not selected:
            recovery_status.append("none_in_cohort")
            recovery_constraint.append(primary_label)
            recovery_eins.append([])
            recovery_count.append(0)
            recovery_evidence.append([])
            continue

        recovery_status.append("found")
        recovery_constraint.append(primary_label)
        recovery_eins.append([candidate["ein"] for candidate in selected])
        recovery_count.append(len(selected))
        recovery_evidence.append(selected)

    frame["recovery_analog_eins"] = recovery_eins
    frame["recovery_analog_count"] = recovery_count
    frame["recovery_analog_evidence"] = recovery_evidence
    frame["recovery_analog_constraint"] = recovery_constraint
    frame["recovery_analog_status"] = recovery_status
    return frame
