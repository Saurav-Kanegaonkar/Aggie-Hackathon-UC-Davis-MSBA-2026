from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import time

import numpy as np
import pandas as pd

from analysis.stage0_contract import (
    assign_size_bucket,
    filter_stage0_panel,
    load_contract,
    load_panel,
    resolve_input_path,
)


CORE_METRICS = [
    "operating_margin",
    "operating_runway_proxy_months",
    "revenue_diversification_index",
]
TIER_ORDER = {"Low": 0, "Medium": 1, "High": 2}
PCT_COLUMNS = [
    "pct_contributions",
    "pct_program_revenue",
    "pct_investment_income",
    "pct_other_revenue",
]


@dataclass(frozen=True)
class Stage1Outputs:
    scored_rows: pd.DataFrame


def stage1_year_bounds(contract: dict) -> tuple[int, int]:
    scoring_years = [int(year) for year in contract["benchmark_window"]["scoring_years"]]
    window_years = int(contract["benchmark_window"]["window_years"])
    return min(scoring_years) - window_years + 1, max(scoring_years)


def load_stage1_inputs(input_path: str | Path | None, contract_path: str | Path) -> tuple[pd.DataFrame, dict]:
    contract = load_contract(contract_path)
    panel = load_panel(resolve_input_path(str(input_path) if input_path is not None else None))
    return panel, contract


def safe_divide(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    result = numerator / denominator.replace({0: np.nan})
    return result.replace([np.inf, -np.inf], np.nan)


def _optional_numeric(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series(np.nan, index=df.index, dtype="float64")
    return pd.to_numeric(df[column], errors="coerce")


def _build_group_key(frame: pd.DataFrame, dimensions: list[str]) -> pd.Series:
    if not dimensions:
        return pd.Series(pd.NA, index=frame.index, dtype="string")

    parts: list[pd.Series] = []
    valid = pd.Series(True, index=frame.index)
    for dimension in dimensions:
        values = frame[dimension]
        text_values = values.astype("string")
        present = values.notna() & text_values.str.strip().ne("")
        valid &= present
        parts.append(text_values)

    key = pd.Series(pd.NA, index=frame.index, dtype="string")
    joined = pd.Series("", index=frame.index, dtype="string")
    for idx, dimension in enumerate(dimensions):
        segment = dimension + "=" + parts[idx]
        joined = segment if idx == 0 else joined + "|" + segment
    key.loc[valid] = joined.loc[valid]
    return key


def dedupe_stage1_panel(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    deduped = frame.copy()
    deduped["net_assets_eoy"] = _optional_numeric(deduped, "net_assets_eoy")
    stage1_key_fields = list(contract["key_fields"]) + ["net_assets_eoy"]
    deduped["_net_assets_present"] = deduped["net_assets_eoy"].notna().astype(int)
    deduped["_stage1_null_score"] = deduped[stage1_key_fields].isna().sum(axis=1)
    deduped = deduped.sort_values(
        ["ein", "fiscal_year", "_net_assets_present", "_stage1_null_score", "tax_period_end"],
        ascending=[True, True, False, True, False],
        kind="mergesort",
    )
    deduped = deduped.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")
    return deduped.drop(columns=["_net_assets_present", "_stage1_null_score"])


def restrict_stage1_history_window(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    lower_year, upper_year = stage1_year_bounds(contract)
    year_mask = frame["fiscal_year"].astype("Int64").between(lower_year, upper_year, inclusive="both")
    return frame.loc[year_mask.fillna(False)].copy()


def add_stage1_metrics(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = frame.copy()
    scored["size_bucket"] = scored["total_revenue"].apply(assign_size_bucket, buckets=contract["size_buckets"])

    liquid_assets = scored["cash_non_interest_bearing"].fillna(0) + scored["savings_temporary_investments"].fillna(0)
    net_assets_eoy = _optional_numeric(scored, "net_assets_eoy")
    monthly_expenses = scored["total_expenses"] / 12.0
    scored["operating_margin"] = safe_divide(scored["total_revenue"] - scored["total_expenses"], scored["total_revenue"])
    scored["operating_runway_proxy_months"] = safe_divide(net_assets_eoy, monthly_expenses)
    scored["shock_absorption_months"] = safe_divide(liquid_assets, monthly_expenses)

    pct_frame = pd.DataFrame({column: _optional_numeric(scored, column) for column in PCT_COLUMNS}, index=scored.index)
    all_pct_null = pct_frame.isna().all(axis=1)
    scored["revenue_diversification_index"] = (
        1.0 - pct_frame.fillna(0).pow(2).sum(axis=1)
    ).astype("float64")
    scored.loc[all_pct_null, "revenue_diversification_index"] = np.nan

    pct_sums = pct_frame.sum(axis=1, skipna=True)
    renormalized_shares = pct_frame.div(pct_sums.replace(0, np.nan), axis=0)
    scored["revenue_diversification_index_renormalized"] = (
        1.0 - renormalized_shares.pow(2).sum(axis=1, skipna=True)
    ).astype("float64")
    scored.loc[all_pct_null | pct_sums.le(0), "revenue_diversification_index_renormalized"] = np.nan

    scored["scoreable_flag"] = (
        scored["total_revenue"].gt(0).fillna(False)
        & scored["total_expenses"].gt(0).fillna(False)
        & scored["fiscal_year"].notna()
        & scored["state"].astype("string").str.strip().ne("")
    )
    return scored


def assign_stage1_cohorts(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    assigned = frame.copy()
    assigned["cohort_level"] = pd.Series(pd.NA, index=assigned.index, dtype="string")
    assigned["cohort_key"] = pd.Series(pd.NA, index=assigned.index, dtype="string")
    assigned["cohort_size"] = pd.Series(pd.NA, index=assigned.index, dtype="Int64")
    assigned["_assigned_level_idx"] = pd.Series(pd.NA, index=assigned.index, dtype="Int64")

    min_size = int(contract["min_cohort_size"])
    fallback_order = contract["cohort_fallback_order"]

    for level_idx, dimensions in enumerate(fallback_order):
        key_col = f"_cohort_key_{level_idx}"
        size_col = f"_cohort_size_{level_idx}"
        assigned[key_col] = _build_group_key(assigned, dimensions)

        level_sizes = pd.Series(pd.NA, index=assigned.index, dtype="Int64")
        eligible = assigned["scoreable_flag"] & assigned[key_col].notna()
        if eligible.any():
            counts = (
                assigned.loc[eligible]
                .groupby(["fiscal_year", key_col], dropna=False)["ein"]
                .transform("nunique")
                .astype("Int64")
            )
            level_sizes.loc[eligible] = counts
        assigned[size_col] = level_sizes

    unassigned = assigned["scoreable_flag"] & assigned["cohort_level"].isna()
    for level_idx, dimensions in enumerate(fallback_order):
        key_col = f"_cohort_key_{level_idx}"
        size_col = f"_cohort_size_{level_idx}"
        eligible = (
            unassigned
            & assigned[key_col].notna()
            & assigned[size_col].fillna(0).astype("Int64").ge(min_size)
        )
        assigned.loc[eligible, "cohort_level"] = "+".join(dimensions)
        assigned.loc[eligible, "cohort_key"] = assigned.loc[eligible, key_col]
        assigned.loc[eligible, "cohort_size"] = assigned.loc[eligible, size_col]
        assigned.loc[eligible, "_assigned_level_idx"] = level_idx
        unassigned = assigned["scoreable_flag"] & assigned["cohort_level"].isna()

    # If no level reaches the preferred minimum size, still assign the broadest available cohort.
    for level_idx in reversed(range(len(fallback_order))):
        key_col = f"_cohort_key_{level_idx}"
        size_col = f"_cohort_size_{level_idx}"
        eligible = unassigned & assigned[key_col].notna()
        assigned.loc[eligible, "cohort_level"] = "+".join(fallback_order[level_idx])
        assigned.loc[eligible, "cohort_key"] = assigned.loc[eligible, key_col]
        assigned.loc[eligible, "cohort_size"] = assigned.loc[eligible, size_col]
        assigned.loc[eligible, "_assigned_level_idx"] = level_idx
        unassigned = assigned["scoreable_flag"] & assigned["cohort_level"].isna()

    return assigned


def _rolling_metric_counts(group: pd.DataFrame, window_years: int) -> pd.Series:
    years = group["fiscal_year"].astype(int).to_numpy()
    counts = group["_available_metric_count"].astype(int).to_numpy()
    rolling = np.zeros(len(group), dtype=int)
    start = 0
    running = 0
    for idx, year in enumerate(years):
        while years[start] < year - window_years + 1:
            running -= counts[start]
            start += 1
        running += int(counts[idx] > 0)
        rolling[idx] = running
    return pd.Series(rolling, index=group.index)


def _rolling_qualifies(group: pd.DataFrame, qualifies: pd.Series, window_years: int, min_years: int) -> pd.Series:
    years = group["fiscal_year"].astype(int).to_numpy()
    hits = qualifies.astype(int).to_numpy()
    rolling = np.zeros(len(group), dtype=bool)
    start = 0
    running = 0
    for idx, year in enumerate(years):
        while years[start] < year - window_years + 1:
            running -= hits[start]
            start += 1
        running += hits[idx]
        rolling[idx] = running >= min_years
    return pd.Series(rolling, index=group.index)


def build_resilient_benchmark(
    cohort_window: pd.DataFrame,
    scoring_year: int,
    contract: dict,
) -> dict[str, float | int | str | None]:
    min_ref = int(contract["min_reference_orgs"])
    window_years = int(contract["benchmark_window"]["window_years"])
    year_min = scoring_year - window_years + 1

    w = cohort_window.loc[
        cohort_window["fiscal_year"].astype("Int64").between(year_min, scoring_year, inclusive="both")
    ].copy()
    if w.empty:
        return {
            "benchmark_operating_margin_q75": np.nan,
            "benchmark_operating_runway_q75": np.nan,
            "benchmark_revenue_diversification_q75": np.nan,
            "reference_org_count": 0,
            "rule_step": None,
            "benchmark_rule": None,
            "benchmark_status": "no_window_data",
        }

    scoring_eins = set(w.loc[w["fiscal_year"].astype(int) == scoring_year, "ein"].astype(str))
    if not scoring_eins:
        return {
            "benchmark_operating_margin_q75": np.nan,
            "benchmark_operating_runway_q75": np.nan,
            "benchmark_revenue_diversification_q75": np.nan,
            "reference_org_count": 0,
            "rule_step": None,
            "benchmark_rule": None,
            "benchmark_status": "no_scoring_year_data",
        }

    q75_per_year = (
        w.groupby("fiscal_year", dropna=False)[CORE_METRICS]
        .quantile(0.75)
        .rename(columns={metric: f"{metric}_q75" for metric in CORE_METRICS})
    )
    w = w.merge(q75_per_year, on="fiscal_year", how="left")
    for metric in CORE_METRICS:
        q75_col = f"{metric}_q75"
        w[f"{metric}_above"] = w[metric].notna() & (w[metric] >= w[q75_col])
    above_cols = [f"{metric}_above" for metric in CORE_METRICS]
    w["n_metrics_above"] = w[above_cols].sum(axis=1)

    w_scored = w.loc[w["ein"].astype(str).isin(scoring_eins)].copy()
    for rule_idx, rule in enumerate(contract["benchmark_fallback_order"], start=1):
        qualifies = (w_scored["n_metrics_above"] >= int(rule["min_metrics"])).rename("q")
        year_counts = w_scored.assign(q=qualifies).groupby("ein", sort=False)["q"].sum()
        resilient_eins = year_counts[year_counts >= int(rule["min_years"])].index.astype(str).tolist()
        if len(resilient_eins) < min_ref:
            continue

        res_sy = w.loc[
            w["ein"].astype(str).isin(resilient_eins)
            & (w["fiscal_year"].astype(int) == scoring_year)
        ].copy()
        return {
            "benchmark_operating_margin_q75": float(res_sy["operating_margin"].quantile(0.75))
            if res_sy["operating_margin"].notna().any()
            else np.nan,
            "benchmark_operating_runway_q75": float(res_sy["operating_runway_proxy_months"].quantile(0.75))
            if res_sy["operating_runway_proxy_months"].notna().any()
            else np.nan,
            "benchmark_revenue_diversification_q75": float(res_sy["revenue_diversification_index"].quantile(0.75))
            if res_sy["revenue_diversification_index"].notna().any()
            else np.nan,
            "reference_org_count": len(resilient_eins),
            "rule_step": rule_idx,
            "benchmark_rule": rule["label"],
            "benchmark_status": "ok",
        }

    return {
        "benchmark_operating_margin_q75": np.nan,
        "benchmark_operating_runway_q75": np.nan,
        "benchmark_revenue_diversification_q75": np.nan,
        "reference_org_count": 0,
        "rule_step": 4,
        "benchmark_rule": contract["benchmark_fallback_order"][-1]["label"],
        "benchmark_status": "insufficient_reference_set",
    }


def _normalized_gap_series(values: pd.Series, benchmarks: pd.Series) -> pd.Series:
    scale = benchmarks.abs().where(benchmarks.abs() > 1e-9, 1.0)
    gaps = (values - benchmarks) / scale
    return gaps.where(values.notna() & benchmarks.notna(), np.nan)


def attach_resilient_benchmarks(scoring_rows: pd.DataFrame, history_frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = scoring_rows.copy()

    scored["benchmark_rule"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["reference_org_count"] = pd.Series(pd.NA, index=scored.index, dtype="Int64")
    scored["benchmark_status"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["benchmark_operating_margin_q75"] = np.nan
    scored["benchmark_operating_runway_q75"] = np.nan
    scored["benchmark_revenue_diversification_q75"] = np.nan
    scored["operating_margin_gap"] = np.nan
    scored["operating_runway_gap"] = np.nan
    scored["revenue_diversification_gap"] = np.nan
    scored["resilience_gap"] = np.nan
    scored["benchmark_fallback_step"] = pd.Series(pd.NA, index=scored.index, dtype="Int64")
    cohort_key_cols = [f"_cohort_key_{idx}" for idx in range(len(contract["cohort_fallback_order"]))]
    group_fields = ["fiscal_year", "_assigned_level_idx"] + cohort_key_cols
    benchmark_records: list[dict[str, object]] = []

    unique_groups = (
        scored.loc[scored["scoreable_flag"]]
        .drop_duplicates(subset=group_fields)
        .loc[:, group_fields]
    )
    history_scoreable = history_frame.loc[history_frame["scoreable_flag"]].copy()
    history_by_level_key: dict[int, dict[str, pd.DataFrame]] = {}
    for level_idx in range(len(contract["cohort_fallback_order"])):
        key_col = f"_cohort_key_{level_idx}"
        level_rows = history_scoreable.loc[history_scoreable[key_col].notna()].copy()
        if level_rows.empty:
            history_by_level_key[level_idx] = {}
            continue
        history_by_level_key[level_idx] = {
            str(level_key): group.copy()
            for level_key, group in level_rows.groupby(key_col, sort=False)
        }

    for group in unique_groups.itertuples(index=False):
        group_dict = dict(zip(group_fields, group))
        year = int(group_dict["fiscal_year"])
        assigned_level_idx = int(group_dict["_assigned_level_idx"])

        chosen_level_idx: int | None = None
        chosen_stats: dict[str, float | int | str | None] | None = None
        for level_idx in range(assigned_level_idx, len(contract["cohort_fallback_order"])):
            key = group_dict.get(f"_cohort_key_{level_idx}")
            if pd.isna(key):
                continue
            cohort_window = history_by_level_key.get(level_idx, {}).get(str(key))
            if cohort_window is None:
                continue
            stats = build_resilient_benchmark(cohort_window, year, contract)
            if stats["benchmark_status"] == "ok":
                chosen_level_idx = level_idx
                chosen_stats = stats
                break
            if chosen_stats is None:
                chosen_level_idx = level_idx
                chosen_stats = stats

        if chosen_stats is None:
            continue

        level_name = "+".join(contract["cohort_fallback_order"][chosen_level_idx]) if chosen_level_idx is not None else None
        benchmark_records.append(
            {
                **group_dict,
                "benchmark_rule": f"{level_name}::{chosen_stats['benchmark_rule']}" if level_name and chosen_stats["benchmark_rule"] else pd.NA,
                "reference_org_count": chosen_stats["reference_org_count"],
                "benchmark_status": chosen_stats["benchmark_status"],
                "benchmark_operating_margin_q75": chosen_stats["benchmark_operating_margin_q75"],
                "benchmark_operating_runway_q75": chosen_stats["benchmark_operating_runway_q75"],
                "benchmark_revenue_diversification_q75": chosen_stats["benchmark_revenue_diversification_q75"],
                "benchmark_fallback_step": 4 if chosen_level_idx is not None and chosen_level_idx > 0 else chosen_stats["rule_step"],
            }
        )

    if benchmark_records:
        benchmark_df = pd.DataFrame(benchmark_records)
        benchmark_value_cols = [
            "benchmark_rule",
            "reference_org_count",
            "benchmark_status",
            "benchmark_operating_margin_q75",
            "benchmark_operating_runway_q75",
            "benchmark_revenue_diversification_q75",
            "benchmark_fallback_step",
        ]
        scored = scored.merge(benchmark_df, on=group_fields, how="left", suffixes=("", "_new"))
        for column in benchmark_value_cols:
            new_col = f"{column}_new"
            if new_col in scored.columns:
                scored[column] = scored[new_col].combine_first(scored[column])
                scored = scored.drop(columns=[new_col])

    missing_status = scored["benchmark_status"].isna()
    scored.loc[~scored["scoreable_flag"], "benchmark_status"] = "not_scoreable"
    scored.loc[scored["scoreable_flag"] & scored["_assigned_level_idx"].isna(), "benchmark_status"] = "missing_cohort"
    scored.loc[
        scored["scoreable_flag"] & scored["_assigned_level_idx"].notna() & missing_status,
        "benchmark_status",
    ] = "insufficient_reference_set"

    scored["operating_margin_gap"] = _normalized_gap_series(
        scored["operating_margin"], scored["benchmark_operating_margin_q75"]
    )
    scored["operating_runway_gap"] = _normalized_gap_series(
        scored["operating_runway_proxy_months"], scored["benchmark_operating_runway_q75"]
    )
    scored["revenue_diversification_gap"] = _normalized_gap_series(
        scored["revenue_diversification_index"], scored["benchmark_revenue_diversification_q75"]
    )
    scored["resilience_gap"] = scored[
        ["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]
    ].mean(axis=1, skipna=True)
    scored.loc[
        scored[["operating_margin_gap", "operating_runway_gap", "revenue_diversification_gap"]].isna().all(axis=1),
        "resilience_gap",
    ] = np.nan

    return scored


def _data_confidence_for_window(window: pd.DataFrame, key_fields: list[str]) -> tuple[str, str]:
    years_present = int(window["fiscal_year"].nunique())
    if years_present == 0:
        return "Low", "no years in window"

    missing_share = float(window[key_fields].isna().sum().sum()) / float(len(window) * len(key_fields))
    if missing_share > 0.2:
        return "Low", f"{years_present} years in window; >20% missing key fields"
    if years_present >= 6 and missing_share < 0.2:
        return "High", f"{years_present} years in window"
    if years_present >= 4:
        return "Medium", f"{years_present} years in window"
    return "Low", f"{years_present} years in window"


def _cohort_confidence(row: pd.Series) -> tuple[str, str]:
    status = row["benchmark_status"]
    if status == "ok":
        fallback_step = row["benchmark_fallback_step"]
        assigned_level = row["_assigned_level_idx"]
        if pd.notna(fallback_step) and int(fallback_step) == 1 and pd.notna(assigned_level) and int(assigned_level) == 0:
            return "High", "strict benchmark"
        if pd.notna(fallback_step) and int(fallback_step) in (2, 3):
            return "Medium", f"benchmark fallback step {int(fallback_step)}"
        if pd.notna(fallback_step) and int(fallback_step) == 4:
            return "Low", "cohort broadened"
        return "Medium", "usable benchmark"
    if status == "not_scored_year":
        return "Medium", "outside scoring years"
    if status == "insufficient_reference_set":
        return "Low", "insufficient reference set"
    if status == "missing_cohort":
        return "Low", "missing cohort"
    return "Low", "not scoreable"


def attach_confidence_fields(scoring_rows: pd.DataFrame, history_frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = scoring_rows.copy()
    scored["data_confidence_tier"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["cohort_confidence_tier"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["checkpoint1_confidence_tier"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["confidence_reason"] = pd.Series(pd.NA, index=scored.index, dtype="string")

    window_years = int(contract["benchmark_window"]["window_years"])
    key_fields = contract["key_fields"]

    history = history_frame.copy()
    history["fiscal_year"] = history["fiscal_year"].astype("Int64")
    scored["fiscal_year"] = scored["fiscal_year"].astype("Int64")

    data_frames: list[pd.DataFrame] = []
    for scoring_year in sorted(scored["fiscal_year"].dropna().astype(int).unique()):
        lower_year = scoring_year - window_years + 1
        window = history.loc[
            history["fiscal_year"].between(lower_year, scoring_year, inclusive="both").fillna(False)
        ].copy()
        if window.empty:
            continue

        years_in_window = window.groupby("ein", sort=False)["fiscal_year"].nunique()
        window_row_counts = window.groupby("ein", sort=False).size()
        missing_cells = window[key_fields].isna().sum(axis=1).groupby(window["ein"], sort=False).sum()
        pct_missing = (missing_cells / (window_row_counts * len(key_fields))).astype("float64")

        window_stats = pd.DataFrame(
            {
                "ein": years_in_window.index.astype(str),
                "fiscal_year": scoring_year,
                "years_in_window": years_in_window.astype("Int64").to_numpy(),
                "pct_missing_key_fields": pct_missing.reindex(years_in_window.index).astype("float64").to_numpy(),
            }
        )
        data_frames.append(window_stats)

    if data_frames:
        data_stats = pd.concat(data_frames, ignore_index=True)
        data_stats["ein"] = data_stats["ein"].astype("string")
        scored["ein"] = scored["ein"].astype("string")
        scored = scored.merge(data_stats, on=["ein", "fiscal_year"], how="left", suffixes=("", "_window"))
        for column in ["years_in_window", "pct_missing_key_fields"]:
            window_col = f"{column}_window"
            if window_col in scored.columns:
                scored[column] = scored[window_col].combine_first(scored[column]) if column in scored.columns else scored[window_col]
                scored = scored.drop(columns=[window_col])

    years_present = pd.to_numeric(scored.get("years_in_window"), errors="coerce").fillna(0).astype(int)
    pct_missing = pd.to_numeric(scored.get("pct_missing_key_fields"), errors="coerce")

    data_high = years_present.ge(6) & pct_missing.lt(0.2)
    data_medium = years_present.ge(4) & ~data_high & pct_missing.le(0.2)
    scored.loc[data_high, "data_confidence_tier"] = "High"
    scored.loc[data_medium, "data_confidence_tier"] = "Medium"
    scored.loc[scored["data_confidence_tier"].isna(), "data_confidence_tier"] = "Low"

    data_reason = pd.Series(index=scored.index, dtype="string")
    data_reason.loc[years_present.eq(0)] = "no years in window"
    data_reason.loc[years_present.gt(0) & pct_missing.gt(0.2)] = (
        years_present[years_present.gt(0) & pct_missing.gt(0.2)].astype(str) + " years in window; >20% missing key fields"
    )
    default_data_mask = data_reason.isna()
    data_reason.loc[default_data_mask] = years_present[default_data_mask].astype(str) + " years in window"

    status = scored["benchmark_status"].astype("string")
    fallback_step = pd.to_numeric(scored["benchmark_fallback_step"], errors="coerce")
    assigned_level = pd.to_numeric(scored["_assigned_level_idx"], errors="coerce")
    cohort_reason = pd.Series(index=scored.index, dtype="string")

    high_mask = status.eq("ok") & fallback_step.eq(1) & assigned_level.eq(0)
    medium_fallback_mask = status.eq("ok") & fallback_step.isin([2, 3])
    low_broadened_mask = status.eq("ok") & fallback_step.eq(4)
    medium_ok_mask = status.eq("ok") & ~(high_mask | medium_fallback_mask | low_broadened_mask)
    medium_not_scored_mask = status.eq("not_scored_year")
    low_insufficient_mask = status.eq("insufficient_reference_set")
    low_missing_mask = status.eq("missing_cohort")

    scored.loc[high_mask, "cohort_confidence_tier"] = "High"
    scored.loc[medium_fallback_mask | medium_ok_mask | medium_not_scored_mask, "cohort_confidence_tier"] = "Medium"
    scored.loc[low_broadened_mask | low_insufficient_mask | low_missing_mask, "cohort_confidence_tier"] = "Low"
    scored.loc[scored["cohort_confidence_tier"].isna(), "cohort_confidence_tier"] = "Low"

    cohort_reason.loc[high_mask] = "strict benchmark"
    cohort_reason.loc[medium_fallback_mask] = "benchmark fallback step " + fallback_step[medium_fallback_mask].astype(int).astype(str)
    cohort_reason.loc[low_broadened_mask] = "cohort broadened"
    cohort_reason.loc[medium_ok_mask] = "usable benchmark"
    cohort_reason.loc[medium_not_scored_mask] = "outside scoring years"
    cohort_reason.loc[low_insufficient_mask] = "insufficient reference set"
    cohort_reason.loc[low_missing_mask] = "missing cohort"
    cohort_reason.loc[cohort_reason.isna()] = "not scoreable"

    checkpoint_is_data = scored["data_confidence_tier"].map(TIER_ORDER) <= scored["cohort_confidence_tier"].map(TIER_ORDER)
    scored.loc[checkpoint_is_data, "checkpoint1_confidence_tier"] = scored.loc[checkpoint_is_data, "data_confidence_tier"]
    scored.loc[~checkpoint_is_data, "checkpoint1_confidence_tier"] = scored.loc[~checkpoint_is_data, "cohort_confidence_tier"]
    scored["confidence_reason"] = data_reason + "; " + cohort_reason

    return scored


def tag_shared_samples(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = frame.copy()
    shared_eins = {str(ein).zfill(9) for ein in contract["shared_sample_selection"]["eins"]}
    scored["is_shared_sample"] = scored["ein"].astype("string").isin(shared_eins)
    return scored


def finalize_output(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = frame.copy()
    scoring_years = {int(year) for year in contract["benchmark_window"]["scoring_years"]}
    scored = scored.loc[scored["fiscal_year"].astype("Int64").isin(scoring_years)].copy()
    scored["benchmark_fallback_step"] = scored["benchmark_fallback_step"].astype("Int64")
    scored["reference_org_count"] = scored["reference_org_count"].astype("Int64")
    scored["cohort_size"] = scored["cohort_size"].astype("Int64")
    scored["fiscal_year"] = scored["fiscal_year"].astype("Int64")

    drop_cols = [column for column in scored.columns if column.startswith("_cohort_key_") or column.startswith("_cohort_size_")]
    drop_cols.append("scoreable_flag")
    output = scored.drop(columns=drop_cols, errors="ignore")
    ordered_prefix = [
        "ein",
        "fiscal_year",
        "state",
        "size_bucket",
        "cohort_level",
        "cohort_key",
        "cohort_size",
        "benchmark_rule",
        "reference_org_count",
        "benchmark_status",
        "operating_margin",
        "operating_runway_proxy_months",
        "revenue_diversification_index",
        "shock_absorption_months",
        "resilience_gap",
        "benchmark_operating_margin_q75",
        "benchmark_operating_runway_q75",
        "benchmark_revenue_diversification_q75",
        "operating_margin_gap",
        "operating_runway_gap",
        "revenue_diversification_gap",
        "revenue_diversification_index_renormalized",
        "confidence_reason",
        "benchmark_fallback_step",
        "is_shared_sample",
        "data_confidence_tier",
        "cohort_confidence_tier",
        "checkpoint1_confidence_tier",
    ]
    remaining = [column for column in output.columns if column not in ordered_prefix]
    return (
        output.loc[:, ordered_prefix + remaining]
        .sort_values(["ein", "fiscal_year"], ascending=[True, False], kind="mergesort")
        .reset_index(drop=True)
    )


def build_checkpoint1_outputs(panel: pd.DataFrame, contract: dict) -> Stage1Outputs:
    t0 = time.perf_counter()
    filtered = filter_stage0_panel(panel, contract)
    print(f"[stage1] filter_stage0_panel: {time.perf_counter() - t0:.2f}s", flush=True)

    t1 = time.perf_counter()
    filtered = restrict_stage1_history_window(filtered, contract)
    print(f"[stage1] restrict_stage1_history_window: {time.perf_counter() - t1:.2f}s", flush=True)

    t2 = time.perf_counter()
    history_panel = dedupe_stage1_panel(filtered, contract)
    print(f"[stage1] dedupe_stage1_panel: {time.perf_counter() - t2:.2f}s", flush=True)

    t3 = time.perf_counter()
    history_panel = add_stage1_metrics(history_panel, contract)
    print(f"[stage1] add_stage1_metrics: {time.perf_counter() - t3:.2f}s", flush=True)

    t4 = time.perf_counter()
    history_panel = assign_stage1_cohorts(history_panel, contract)
    print(f"[stage1] assign_stage1_cohorts: {time.perf_counter() - t4:.2f}s", flush=True)

    scoring_years = {int(year) for year in contract["benchmark_window"]["scoring_years"]}
    scored = history_panel.loc[history_panel["fiscal_year"].astype("Int64").isin(scoring_years)].copy()

    t5 = time.perf_counter()
    scored = attach_resilient_benchmarks(scored, history_panel, contract)
    print(f"[stage1] attach_resilient_benchmarks: {time.perf_counter() - t5:.2f}s", flush=True)

    t6 = time.perf_counter()
    scored = attach_confidence_fields(scored, history_panel, contract)
    print(f"[stage1] attach_confidence_fields: {time.perf_counter() - t6:.2f}s", flush=True)

    t7 = time.perf_counter()
    scored = tag_shared_samples(scored, contract)
    scored = finalize_output(scored, contract)
    print(f"[stage1] finalize_output: {time.perf_counter() - t7:.2f}s", flush=True)

    return Stage1Outputs(scored_rows=scored)


def write_checkpoint1_outputs(outputs: Stage1Outputs, output_dir: str | Path, contract: dict) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    configured_path = contract.get("stage1_output", {}).get("path", "outputs/stage1/scored_rows.parquet")
    filename = Path(configured_path).name
    outputs.scored_rows.to_parquet(output_dir / filename, index=False)
