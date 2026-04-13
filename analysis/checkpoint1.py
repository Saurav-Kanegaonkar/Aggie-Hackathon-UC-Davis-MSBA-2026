from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.stage0_contract import (
    assign_size_bucket,
    dedupe_panel,
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


def _compute_row_diversification(values: pd.Series) -> tuple[float | None, float | None]:
    shares = pd.to_numeric(values, errors="coerce")
    all_null = shares.isna().all()
    if all_null:
        return None, None

    official = 1.0 - float(shares.fillna(0).pow(2).sum())

    present = shares.dropna()
    if present.empty:
        renormalized = None
    else:
        total = float(present.sum())
        if total <= 0:
            renormalized = None
        else:
            normalized = present / total
            renormalized = 1.0 - float(normalized.pow(2).sum())
    return official, renormalized


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
    diversification = pct_frame.apply(_compute_row_diversification, axis=1, result_type="expand")
    scored["revenue_diversification_index"] = diversification[0].astype("float64")
    scored["revenue_diversification_index_renormalized"] = diversification[1].astype("float64")

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


def build_resilient_benchmark_maps(frame: pd.DataFrame, contract: dict) -> dict[tuple[int, str], dict[tuple[int, str], dict[str, float | int]]]:
    benchmark_maps: dict[tuple[int, str], dict[tuple[int, str], dict[str, float | int]]] = {}
    scoring_years = set(int(year) for year in contract["benchmark_window"]["scoring_years"])
    window_years = int(contract["benchmark_window"]["window_years"])

    for level_idx, _dimensions in enumerate(contract["cohort_fallback_order"]):
        key_col = f"_cohort_key_{level_idx}"
        subset = frame.loc[frame["scoreable_flag"] & frame[key_col].notna()].copy()
        if subset.empty:
            for rule in contract["benchmark_fallback_order"]:
                benchmark_maps[(level_idx, rule["label"])] = {}
            continue

        subset = subset.sort_values(["ein", "fiscal_year"], kind="mergesort")
        subset["_available_metric_count"] = subset[CORE_METRICS].notna().sum(axis=1)
        for rule_idx, rule in enumerate(contract["benchmark_fallback_order"]):
            qualifies = subset["_available_metric_count"] >= int(rule["min_metrics"])
            resilient = pd.Series(False, index=subset.index)
            for _, org_group in subset.groupby("ein", sort=False):
                resilient.loc[org_group.index] = _rolling_qualifies(
                    org_group,
                    qualifies.loc[org_group.index],
                    window_years=window_years,
                    min_years=int(rule["min_years"]),
                )

            resilient_subset = subset.loc[resilient & subset["fiscal_year"].astype(int).isin(scoring_years)].copy()
            if resilient_subset.empty:
                benchmark_maps[(level_idx, rule["label"])] = {}
                continue

            aggregated = (
                resilient_subset.groupby(["fiscal_year", key_col], dropna=False)
                .agg(
                    reference_org_count=("ein", "nunique"),
                    benchmark_operating_margin_q75=("operating_margin", lambda values: values.quantile(0.75)),
                    benchmark_operating_runway_q75=("operating_runway_proxy_months", lambda values: values.quantile(0.75)),
                    benchmark_revenue_diversification_q75=("revenue_diversification_index", lambda values: values.quantile(0.75)),
                )
                .reset_index()
            )

            stats_map: dict[tuple[int, str], dict[str, float | int]] = {}
            for _, row in aggregated.iterrows():
                stats_map[(int(row["fiscal_year"]), str(row[key_col]))] = {
                    "reference_org_count": int(row["reference_org_count"]),
                    "benchmark_operating_margin_q75": float(row["benchmark_operating_margin_q75"])
                    if pd.notna(row["benchmark_operating_margin_q75"])
                    else np.nan,
                    "benchmark_operating_runway_q75": float(row["benchmark_operating_runway_q75"])
                    if pd.notna(row["benchmark_operating_runway_q75"])
                    else np.nan,
                    "benchmark_revenue_diversification_q75": float(row["benchmark_revenue_diversification_q75"])
                    if pd.notna(row["benchmark_revenue_diversification_q75"])
                    else np.nan,
                    "rule_step": rule_idx + 1,
                }
            benchmark_maps[(level_idx, rule["label"])] = stats_map

    return benchmark_maps


def _normalized_gap(value: float | int | None, benchmark: float | int | None) -> float | None:
    if pd.isna(value) or pd.isna(benchmark):
        return None
    benchmark_value = float(benchmark)
    scale = abs(benchmark_value) if abs(benchmark_value) > 1e-9 else 1.0
    return (float(value) - benchmark_value) / scale


def attach_resilient_benchmarks(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = frame.copy()
    scoring_years = set(int(year) for year in contract["benchmark_window"]["scoring_years"])
    min_reference_orgs = int(contract["min_reference_orgs"])
    benchmark_maps = build_resilient_benchmark_maps(scored, contract)

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

    for row_index, row in scored.iterrows():
        if not bool(row["scoreable_flag"]):
            scored.loc[row_index, "benchmark_status"] = "not_scoreable"
            continue

        year = int(row["fiscal_year"])
        if year not in scoring_years:
            scored.loc[row_index, "benchmark_status"] = "not_scored_year"
            continue

        if pd.isna(row["_assigned_level_idx"]):
            scored.loc[row_index, "benchmark_status"] = "missing_cohort"
            continue

        assigned_level_idx = int(row["_assigned_level_idx"])
        chosen_level_idx: int | None = None
        chosen_rule_label: str | None = None
        chosen_stats: dict[str, float | int] | None = None
        last_attempt: tuple[int, str, int] | None = None

        for level_idx in range(assigned_level_idx, len(contract["cohort_fallback_order"])):
            key = row[f"_cohort_key_{level_idx}"]
            if pd.isna(key):
                continue
            for rule in contract["benchmark_fallback_order"]:
                stats = benchmark_maps.get((level_idx, rule["label"]), {}).get((year, str(key)))
                reference_count = int(stats["reference_org_count"]) if stats else 0
                last_attempt = (level_idx, rule["label"], reference_count)
                if stats and reference_count >= min_reference_orgs:
                    chosen_level_idx = level_idx
                    chosen_rule_label = rule["label"]
                    chosen_stats = stats
                    break
            if chosen_stats is not None:
                break

        if chosen_stats is None:
            if last_attempt is not None:
                level_idx, rule_label, reference_count = last_attempt
                level_name = "+".join(contract["cohort_fallback_order"][level_idx])
                scored.loc[row_index, "benchmark_rule"] = f"{level_name}::{rule_label}"
                scored.loc[row_index, "reference_org_count"] = reference_count
            scored.loc[row_index, "benchmark_status"] = "insufficient_reference_set"
            continue

        assert chosen_level_idx is not None
        assert chosen_rule_label is not None

        level_name = "+".join(contract["cohort_fallback_order"][chosen_level_idx])
        scored.loc[row_index, "benchmark_rule"] = f"{level_name}::{chosen_rule_label}"
        scored.loc[row_index, "reference_org_count"] = int(chosen_stats["reference_org_count"])
        scored.loc[row_index, "benchmark_status"] = "ok"
        scored.loc[row_index, "benchmark_operating_margin_q75"] = chosen_stats["benchmark_operating_margin_q75"]
        scored.loc[row_index, "benchmark_operating_runway_q75"] = chosen_stats["benchmark_operating_runway_q75"]
        scored.loc[row_index, "benchmark_revenue_diversification_q75"] = chosen_stats[
            "benchmark_revenue_diversification_q75"
        ]

        op_margin_gap = _normalized_gap(row["operating_margin"], chosen_stats["benchmark_operating_margin_q75"])
        runway_gap = _normalized_gap(
            row["operating_runway_proxy_months"],
            chosen_stats["benchmark_operating_runway_q75"],
        )
        diversification_gap = _normalized_gap(
            row["revenue_diversification_index"],
            chosen_stats["benchmark_revenue_diversification_q75"],
        )
        scored.loc[row_index, "operating_margin_gap"] = op_margin_gap
        scored.loc[row_index, "operating_runway_gap"] = runway_gap
        scored.loc[row_index, "revenue_diversification_gap"] = diversification_gap

        gap_values = [gap for gap in [op_margin_gap, runway_gap, diversification_gap] if gap is not None and not pd.isna(gap)]
        scored.loc[row_index, "resilience_gap"] = float(np.mean(gap_values)) if gap_values else np.nan
        if chosen_level_idx > 0:
            scored.loc[row_index, "benchmark_fallback_step"] = 4
        else:
            scored.loc[row_index, "benchmark_fallback_step"] = int(chosen_stats["rule_step"])

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


def attach_confidence_fields(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = frame.copy()
    scored["data_confidence_tier"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["cohort_confidence_tier"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["checkpoint1_confidence_tier"] = pd.Series(pd.NA, index=scored.index, dtype="string")
    scored["confidence_reason"] = pd.Series(pd.NA, index=scored.index, dtype="string")

    window_years = int(contract["benchmark_window"]["window_years"])
    key_fields = contract["key_fields"]

    sorted_scored = scored.sort_values(["ein", "fiscal_year"], kind="mergesort")
    for _, org_group in sorted_scored.groupby("ein", sort=False):
        years = org_group["fiscal_year"].astype(int).to_numpy()
        for row in org_group.itertuples():
            lower_year = int(row.fiscal_year) - window_years + 1
            window = org_group.loc[(years >= lower_year) & (years <= int(row.fiscal_year))]
            data_tier, data_reason = _data_confidence_for_window(window, key_fields)
            cohort_tier, cohort_reason = _cohort_confidence(scored.loc[row.Index])
            checkpoint_tier = (
                data_tier if TIER_ORDER[data_tier] <= TIER_ORDER[cohort_tier] else cohort_tier
            )

            reason_parts = [data_reason, cohort_reason]
            scored.loc[row.Index, "data_confidence_tier"] = data_tier
            scored.loc[row.Index, "cohort_confidence_tier"] = cohort_tier
            scored.loc[row.Index, "checkpoint1_confidence_tier"] = checkpoint_tier
            scored.loc[row.Index, "confidence_reason"] = "; ".join(reason_parts)

    return scored


def tag_shared_samples(frame: pd.DataFrame, contract: dict) -> pd.DataFrame:
    scored = frame.copy()
    shared_eins = {str(ein).zfill(9) for ein in contract["shared_sample_selection"]["eins"]}
    scored["is_shared_sample"] = scored["ein"].astype("string").isin(shared_eins)
    return scored


def finalize_output(frame: pd.DataFrame) -> pd.DataFrame:
    scored = frame.copy()
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
    filtered = filter_stage0_panel(panel, contract)
    deduped = dedupe_panel(filtered, key_fields=contract["key_fields"])
    scored = add_stage1_metrics(deduped, contract)
    scored = assign_stage1_cohorts(scored, contract)
    scored = attach_resilient_benchmarks(scored, contract)
    scored = attach_confidence_fields(scored, contract)
    scored = tag_shared_samples(scored, contract)
    scored = finalize_output(scored)
    return Stage1Outputs(scored_rows=scored)


def write_checkpoint1_outputs(outputs: Stage1Outputs, output_dir: str | Path, contract: dict) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    configured_path = contract.get("stage1_output", {}).get("path", "outputs/stage1/scored_rows.parquet")
    filename = Path(configured_path).name
    outputs.scored_rows.to_parquet(output_dir / filename, index=False)
