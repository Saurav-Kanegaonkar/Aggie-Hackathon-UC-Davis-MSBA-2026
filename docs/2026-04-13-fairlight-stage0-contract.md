# Fairlight Stage 0 Shared Contract

Stage 0 exists to lock the non-negotiables before anyone builds Stage 1 independently.

## Files

- `config/checkpoint1_contract.json`
  - fixed CA + WA scope
  - `submitted_on` must be null
  - `(ein, fiscal_year)` dedupe contract
  - fixed size buckets
  - fixed cohort fallback order
  - fixed benchmark fallback order
  - fixed shared-sample selection rule
- `analysis/build_stage0_contract.py`
  - reproducible CLI for generating the Stage 0 artifacts
- `outputs/stage0/checkpoint1_shared_samples.csv`
  - the fixed shared checkpoint sample set for branch comparisons
- `outputs/stage0/checkpoint1_stage0_summary.md`
  - summary of the real-data Stage 0 run

## Rebuild Command

```bash
PYTHONPATH=/private/tmp/fairlight-pydeps python3 analysis/build_stage0_contract.py \
  --input "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/data/panel_990_extended_v3.parquet" \
  --contract config/checkpoint1_contract.json \
  --output-dir outputs/stage0
```

## Contract Intent

Every builder should begin Stage 1 from the same rules and the same shared comparison nonprofits.

That means:

- no branch should change the scope filters
- no branch should change the size buckets
- no branch should change the cohort or benchmark fallback order
- checkpoint comparisons should use `outputs/stage0/checkpoint1_shared_samples.csv`
