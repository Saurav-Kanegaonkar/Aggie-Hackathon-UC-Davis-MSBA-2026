# Stage 1 Preflight Cleanup Design

## Goal

Stabilize the Fairlight Stage 0 and Stage 1 baseline on `feat/task-01-c` before Stage 1 implementation starts, so builders compare real methodology differences rather than contract drift, stale tests, or local branch noise.

## Scope

This cleanup covers only the following:

- make Stage 0 rebuildable against the merged curated-sample contract
- make Stage 0 tests validate the merged Stage 0 contract rather than the old quantile contract
- replace the draft Stage 1 implementation files with a clean contract-first baseline
- align the Stage 1 tests to the merged Stage 0 contract, current schema, and Stage 1 canonical output path
- lock diversification null-handling into executable Stage 1 logic and tests

This cleanup explicitly does not add Stage 2 logic such as recovery analog outputs, stress testing, or recommendation logic.

## Design Decision

Use a contract-first reset.

Why:

- the merged contract and schema are now the team source of truth
- the current local Stage 1 files are disposable draft work
- the current Stage 1 tests still target an older CSV-based interface and older column set
- a minimal patch would preserve too many stale assumptions and risk another round of hidden gaps

## Stage 0 Changes

### Shared sample selection

`analysis/stage0_contract.py` must support two sample modes:

- `curated`
- `quantile`

Behavior:

- if `shared_sample_selection.method == "curated"`, build the sample output from the fixed EIN list in the contract
- select the latest available row per EIN using the existing `latest_row_per_ein` logic
- preserve deterministic output ordering by the EIN list order in the contract
- if `method` is missing, fall back to the legacy quantile behavior so old fixture contracts still work

### Stage 0 tests

`tests/test_stage0_contract.py` must validate the merged contract rather than the pre-patch one.

Required checks:

- `submitted_on_filter.rule == "include_all"`
- curated shared sample contract exists and contains 11 EINs
- `stage1_output.path == "outputs/stage1/scored_rows.parquet"`
- diversification null-handling block exists with:
  - zero-fill scoring rule
  - all-null edge case
  - renormalized shadow metric
- rebuilt Stage 0 curated samples match the contract EIN set

## Stage 1 Interface

### Canonical output

Stage 1 must follow the merged contract:

- canonical artifact path: `outputs/stage1/scored_rows.parquet`
- canonical schema: `config/schemas/checkpoint1_scored_row.schema.json`

The Stage 1 implementation may compute helper summaries internally, but the contract-facing deliverable is the parquet scored rows file.

### Required scored-row surface

The reset Stage 1 tests and implementation must include the currently merged review fields:

- `operating_runway_proxy_months`
- `resilience_gap`
- `benchmark_operating_margin_q75`
- `benchmark_operating_runway_q75`
- `benchmark_revenue_diversification_q75`
- `operating_margin_gap`
- `operating_runway_gap`
- `revenue_diversification_gap`
- `revenue_diversification_index_renormalized`
- `confidence_reason`
- `benchmark_fallback_step`
- `is_shared_sample`
- existing checkpoint columns for cohort, benchmark, and confidence output

## Stage 1 Logic Constraints

### Scoring window

Stage 1 scoring must honor the merged rolling benchmark contract:

- rolling 7-year window
- scoring years limited to FY2023 and FY2024
- strict persistence: 5 of 7
- relaxed persistence: 4 of 7

### Diversification handling

Stage 1 must implement diversification exactly as locked in the contract:

- official scoring metric uses zero-fill on null `pct_` revenue-share fields
- if all four `pct_` columns are null, official diversification is null
- renormalized diversification is computed as a shadow metric only
- benchmark construction and resilience gap use the official zero-fill metric, not the shadow metric

### Shared samples

`is_shared_sample` is true when the row EIN appears in the curated Stage 0 sample list.

## Branch Reset Plan

The current untracked Stage 1 draft files are treated as disposable.

Reset behavior:

- replace `analysis/build_checkpoint1.py`
- replace `analysis/checkpoint1.py`
- replace `tests/test_checkpoint1.py`

The new files must be written against the merged contract, not adapted from the old CSV-based scaffold.

## Testing Plan

### Stage 0

- rebuild test passes for curated shared sample mode
- legacy quantile fixture path still passes if exercised by a synthetic fixture
- contract checks cover curated samples, `stage1_output`, and null-handling

### Stage 1

Write tests first and keep them aligned to the merged contract.

Required test coverage:

- canonical parquet output is written at the contract path
- scored rows contain the schema-facing checkpoint fields
- NTEE-missing rows remain scoreable through fallback cohorts
- diversification zero-fill and renormalized shadow metric both compute correctly on fixture rows
- `is_shared_sample` is true for curated sample EINs
- benchmark fallback step is emitted
- per-metric gaps and benchmark Q75 values are emitted

## Risks

- if Stage 0 curated-sample support is not fixed first, builders cannot reliably rebuild the shared checkpoint sample set
- if Stage 1 tests keep the old interface, builders can pass local tests while violating the merged contract
- if zero-fill diversification is not tested explicitly, checkpoint comparisons will drift again through hidden null-handling choices

## Success Criteria

This preflight cleanup is done when:

- Stage 0 rebuilds successfully against the merged curated contract
- Stage 0 tests validate the merged contract, not the old one
- Stage 1 tests target the canonical parquet output and schema-facing fields
- the branch contains no ambiguous draft Stage 1 interface
- Stage 1 implementation can begin from one clean, contract-aligned baseline
