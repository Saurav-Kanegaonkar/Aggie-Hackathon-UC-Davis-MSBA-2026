from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import pandas as pd


DEFAULT_INPUT_CANDIDATES = [
    Path("data/panel_990_extended_v3.parquet"),
    Path("data/processed/panel_990_extended_v3.parquet"),
]


def load_contract(path: str | Path) -> dict:
    with Path(path).open() as handle:
        return json.load(handle)


def load_panel(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".parquet":
        try:
            return pd.read_parquet(path)
        except Exception as exc:  # pragma: no cover - exercised in real-data runs
            raise RuntimeError(
                "Parquet input requires a parquet engine such as pyarrow. "
                "Install pyarrow or provide a CSV input for local dry runs."
            ) from exc
    raise ValueError(f"Unsupported input format: {path}")


def resolve_input_path(explicit_path: str | None) -> Path:
    if explicit_path:
        return Path(explicit_path)
    for candidate in DEFAULT_INPUT_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No default checkpoint input found under data/ or data/processed/.")


def normalize_panel(df: pd.DataFrame) -> pd.DataFrame:
    normalized = df.copy()
    normalized["ein"] = normalized["ein"].astype(str)
    normalized["state"] = normalized["state"].astype(str).str.upper()
    normalized["return_type"] = normalized.get("return_type", "990").astype(str)
    normalized["tax_period_end"] = normalized["tax_period_end"].astype(str)
    normalized["fiscal_year"] = pd.to_numeric(normalized["fiscal_year"], errors="coerce").astype("Int64")
    normalized["ntee_major_category"] = normalized.get("ntee_major_category", "").fillna("").astype(str).str.strip()
    normalized["submitted_on"] = normalized.get("submitted_on", "").fillna("").astype(str).str.strip()
    numeric_cols = [
        "total_revenue",
        "total_expenses",
        "cash_non_interest_bearing",
        "savings_temporary_investments",
        "contributions_grants",
        "program_service_revenue",
        "investment_income",
    ]
    for column in numeric_cols:
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")
    return normalized


def filter_stage0_panel(df: pd.DataFrame, contract: dict) -> pd.DataFrame:
    filtered = normalize_panel(df)
    filtered = filtered[filtered["state"].isin(contract["states"])].copy()
    if contract.get("submitted_on_must_be_null", True):
        filtered = filtered[filtered["submitted_on"].eq("")].copy()
    filtered = filtered.dropna(subset=["ein", "fiscal_year"])
    return filtered


def dedupe_panel(df: pd.DataFrame, key_fields: Iterable[str]) -> pd.DataFrame:
    deduped = df.copy()
    deduped["_null_score"] = deduped[list(key_fields)].isna().sum(axis=1)
    deduped = deduped.sort_values(
        ["ein", "fiscal_year", "tax_period_end", "_null_score"],
        ascending=[True, True, False, True],
        kind="mergesort",
    )
    deduped = deduped.drop_duplicates(subset=["ein", "fiscal_year"], keep="first")
    return deduped.drop(columns=["_null_score"])


def latest_row_per_ein(df: pd.DataFrame) -> pd.DataFrame:
    latest = df.sort_values(
        ["ein", "fiscal_year", "tax_period_end"],
        ascending=[True, False, False],
        kind="mergesort",
    )
    return latest.drop_duplicates(subset=["ein"], keep="first").copy()


def assign_size_bucket(revenue: float, buckets: list[dict]) -> str | None:
    if pd.isna(revenue):
        return None
    for bucket in buckets:
        lower = bucket["min"]
        upper = bucket["max"]
        if lower is None and revenue < upper:
            return bucket["label"]
        if upper is None and revenue >= lower:
            return bucket["label"]
        if lower is not None and upper is not None and lower <= revenue < upper:
            return bucket["label"]
    return None


def prepare_latest_panel(df: pd.DataFrame, contract: dict) -> pd.DataFrame:
    latest = latest_row_per_ein(df)
    latest["size_bucket"] = latest["total_revenue"].apply(assign_size_bucket, buckets=contract["size_buckets"])
    latest["ntee_present"] = latest["ntee_major_category"].ne("")
    return latest.sort_values(["state", "ntee_present", "total_revenue", "ein"], kind="mergesort").reset_index(drop=True)


def _choose_quantile_positions(frame: pd.DataFrame, quantiles: list[float]) -> list[int]:
    if frame.empty:
        return []
    count = len(frame)
    max_index = count - 1
    chosen: list[int] = []
    for quantile in quantiles:
        candidate = int(quantile * count)
        candidate = min(max(candidate, 0), max_index)
        while candidate in chosen and candidate < max_index:
            candidate += 1
        while candidate in chosen and candidate > 0:
            candidate -= 1
        if candidate not in chosen:
            chosen.append(candidate)
    return chosen


def select_shared_samples(latest: pd.DataFrame, contract: dict) -> pd.DataFrame:
    quantiles = contract["shared_sample_selection"]["quantiles"]
    selected_frames: list[pd.DataFrame] = []

    for state in contract["states"]:
        for ntee_present in (True, False):
            stratum = latest[(latest["state"] == state) & (latest["ntee_present"] == ntee_present)].copy()
            fallback = latest[(latest["state"] == state) & (latest["ntee_present"] != ntee_present)].copy()
            stratum = stratum.sort_values(["total_revenue", "ein"], kind="mergesort").reset_index(drop=True)
            fallback = fallback.sort_values(["total_revenue", "ein"], kind="mergesort").reset_index(drop=True)

            positions = _choose_quantile_positions(stratum, quantiles)
            picked = stratum.iloc[positions].copy() if positions else stratum.iloc[0:0].copy()

            if len(picked) < len(quantiles):
                fallback_positions = _choose_quantile_positions(fallback, quantiles)
                fallback_candidates = fallback.iloc[fallback_positions].copy() if fallback_positions else fallback.iloc[0:0].copy()
                fallback_candidates = fallback_candidates[~fallback_candidates["ein"].isin(picked["ein"])]
                needed = len(quantiles) - len(picked)
                picked = pd.concat([picked, fallback_candidates.head(needed)], ignore_index=True)

            picked["sample_state"] = state
            picked["sample_ntee_present"] = ntee_present
            selected_frames.append(picked)

    shared = pd.concat(selected_frames, ignore_index=True)
    shared = shared.sort_values(
        ["sample_state", "sample_ntee_present", "total_revenue", "ein"],
        ascending=[True, False, True, True],
        kind="mergesort",
    ).reset_index(drop=True)
    return shared


def build_stage0_artifacts(df: pd.DataFrame, contract: dict) -> dict[str, pd.DataFrame | str]:
    filtered = filter_stage0_panel(df, contract)
    deduped = dedupe_panel(
        filtered,
        key_fields=[
            "total_revenue",
            "total_expenses",
            "cash_non_interest_bearing",
            "savings_temporary_investments",
            "contributions_grants",
            "program_service_revenue",
            "investment_income",
        ],
    )
    latest = prepare_latest_panel(deduped, contract)
    shared_samples = select_shared_samples(latest, contract)

    summary = "\n".join(
        [
            "# Fairlight Stage 0 Shared Contract",
            "",
            f"- Filtered rows: {len(filtered):,}",
            f"- Deduped EIN-year rows: {len(deduped):,}",
            f"- Latest EIN rows considered for sampling: {len(latest):,}",
            f"- Shared checkpoint samples selected: {len(shared_samples):,}",
            "- Contract rules locked: CA+WA scope, submitted_on null, ein+fiscal_year dedupe, fixed size buckets, fixed cohort fallback order, fixed benchmark fallback order, fixed benchmark window, fixed core formulas, fixed confidence tiers, fixed action labels, fixed urgency rule, and fixed recovery-analog sourcing.",
        ]
    )
    return {"shared_samples": shared_samples, "summary_markdown": summary}


def write_stage0_artifacts(artifacts: dict[str, pd.DataFrame | str], output_dir: str | Path, contract: dict) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_files = contract["output_files"]
    artifacts["shared_samples"].to_csv(output_dir / output_files["shared_samples"], index=False)
    (output_dir / output_files["summary_markdown"]).write_text(artifacts["summary_markdown"])
