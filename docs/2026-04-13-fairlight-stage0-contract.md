# Fairlight Stage 0 Shared Contract

Stage 0 exists to lock the non-negotiables before anyone builds Stage 1 independently.

## Files

- `config/checkpoint1_contract.json`
  - fixed CA + WA scope
  - `submitted_on` filter: `include_all` (both GT and IRS-sourced rows are first-class)
  - `(ein, fiscal_year)` dedupe contract
  - fixed size buckets
  - fixed cohort fallback order
  - fixed benchmark fallback order
  - fixed rolling 7-year benchmark window per EIN (`[Y-6 ... Y]`), scoring years 2023 and 2024
  - fixed metric formulas for operating runway, operating margin, diversification, and shock absorption
  - revenue diversification null-handling: zero-fill nulls in pct_ columns; all-null rows yield null index
  - fixed confidence tiers, action-label definitions, urgency rule, and recovery-analog sourcing rule
  - fixed output schema contracts for scored rows (28 fields), portfolio views, and capital stewardship memos
  - curated 11-EIN shared sample set for checkpoint diffing
- `analysis/build_stage0_contract.py`
  - reproducible CLI for generating the Stage 0 artifacts
- `outputs/stage0/checkpoint1_shared_samples.csv`
  - the fixed shared checkpoint sample set for branch comparisons
- `outputs/stage0/checkpoint1_stage0_summary.md`
  - summary of the real-data Stage 0 run

## Rebuild Command

```bash
PYTHONPATH=/private/tmp/fairlight-pydeps python3 analysis/build_stage0_contract.py \
  --input data/panel_990_extended_v4.parquet \
  --contract config/checkpoint1_contract.json \
  --output-dir outputs/stage0
```

## Contract Intent

Every builder should begin Stage 1 from the same rules and the same shared comparison nonprofits.

That means:

- no branch should change the scope filters
- no branch should change the size buckets
- no branch should change the cohort or benchmark fallback order
- no branch should reinterpret the benchmark window, core formulas, confidence tiers, or recommendation vocabulary
- NTEE strengthens cohort precision when present, but it is not a hard gate on scoreability
- checkpoint comparisons should use `outputs/stage0/checkpoint1_shared_samples.csv` (11 curated EINs)
- revenue diversification null handling is locked: zero-fill pct_ nulls, all-null rows yield null index, shadow `_renormalized` variant carried for sensitivity
- Stage 1 output path: `outputs/stage1/scored_rows.parquet` on each builder's branch
