# Fairlight Stage 2 Contract

Stage 2 extends the ratified merged Stage 1 output with deterministic enrichment fields for stress testing, recovery analog retrieval, and urgency signaling.

## Purpose

Stage 2 adds a second-pass enrichment layer to the canonical merged Stage 1 output so the team can compare:

- how sensitive an organization is to loss of its largest revenue source
- whether similar organizations historically recovered from the same primary weakness
- whether an organization should be surfaced as urgent

Stage 2 is an extension layer only. It does not revisit or reinterpret Stage 1 scoring.

## Non-goals

Stage 2 does not:

- recompute Stage 1 benchmark logic
- recompute Stage 1 cohort assignment
- change Stage 1 confidence tiers
- change Stage 1 benchmark status
- change the row universe or authoritative `(ein, fiscal_year)` identity
- assign Stage 3 action labels
- generate memos
- define portfolio-view presentation behavior except where needed to pin data semantics
- relitigate whether diversification should have been treated differently in Stage 1

## Canonical Input And Source Of Truth

The authoritative Stage 2 input is the merged `main` branch Stage 1 parquet:

- `outputs/stage1/scored_rows.parquet`

This file is the source of truth for:

- row universe
- authoritative `(ein, fiscal_year)` identity
- all Stage 1 fields and judgments

Stage 2 must preserve the exact same row set as the canonical Stage 1 parquet.

Because the Stage 1 parquet does not itself contain all raw financial inputs needed for Stage 2 stress testing and analog retrieval, Stage 2 may deterministically join back to the canonical merged scoring base used to produce the `main` branch Stage 1 parquet.

That raw-input hydration rule is constrained:

- it is for raw-input retrieval only
- it may not change which `(ein, fiscal_year)` row is authoritative
- it may not change row count
- it may not substitute a different filing for the canonical merged Stage 1 row

## Output Grain And Path

Stage 2 output grain is identical to canonical Stage 1 output:

- one authoritative row per `(ein, fiscal_year)` already present in `outputs/stage1/scored_rows.parquet`

Stage 2 output path:

- `outputs/stage2/scored_rows_enriched.parquet`

`not_scoreable` rows remain in the Stage 2 output and are not filtered out.

## Required Schema Additions

### Stress Test Fields

- `largest_revenue_source`
- `largest_revenue_source_pct`
- `gov_dependency_pct`
- `stress_25pct_post_shock_revenue`
- `stress_25pct_burn_months`
- `stress_25pct_severity`
- `stress_50pct_post_shock_revenue`
- `stress_50pct_burn_months`
- `stress_50pct_severity`
- `stress_test_status`

### Recovery Analog Fields

- `recovery_analog_eins`
- `recovery_analog_count`
- `recovery_analog_evidence`
- `recovery_analog_constraint`
- `recovery_analog_status`

### Urgency Fields

- `urgency_flag`
- `urgency_severity`
- `urgency_reason`

## Stress Test Methodology

### Scenarios

Stage 2 computes exactly two largest-source shock scenarios for every row where raw inputs are sufficient:

- 25 percent reduction of the largest revenue source
- 50 percent reduction of the largest revenue source

Both scenarios are required outputs.

The largest-source scenario is the universal stress test because it applies to the full Stage 2 row set. Government dependency is required metadata, not the universal primary shock scenario.

### Largest Revenue Source Rule

Determine the largest revenue source from exactly these four buckets:

- contributions
- program_revenue
- investment_income
- other_revenue

Use a fixed deterministic tie-break order matching that same sequence:

- contributions
- program_revenue
- investment_income
- other_revenue

`largest_revenue_source_pct` is the share of total revenue represented by the winning bucket.

No extra source categories are introduced in Stage 2.

### Shock Formulas

For each scenario:

- `largest_source_amount = largest_revenue_source_pct * total_revenue`
- `post_shock_revenue = total_revenue - (largest_source_amount * shock_magnitude)`
- `liquid_reserves = cash_non_interest_bearing + savings_temporary_investments`

Expenses are held constant.

If `post_shock_revenue < total_expenses`, then:

- `burn_months = liquid_reserves / ((total_expenses - post_shock_revenue) / 12)`

If `post_shock_revenue >= total_expenses`, then:

- `burn_months = null`
- severity = `none`

Stage 2 does not write infinity values to parquet.

### Severity Buckets

The same severity labels apply to both scenarios:

- `none`: `post_shock_revenue >= total_expenses`
- `mild`: `burn_months > 24`
- `moderate`: `burn_months > 6 and <= 24`
- `severe`: `burn_months >= 1 and <= 6`
- `critical`: `burn_months < 1` or current net assets are negative or `post_shock_revenue < 0`

### Stress Status Semantics

`stress_test_status` takes one of:

- `computed`: all required raw fields present and both scenario outputs computed
- `not_applicable`: required raw fields insufficient for stress computation

Stage 2 does not use `not_scoreable` as a stress-test status because that label already belongs to Stage 1 benchmark status.

### Government Dependency

`gov_dependency_pct` is required metadata where the upstream government-grants field exists.

Rules:

- use the canonical government-grants raw field already used in Stage 1 diagnostic work
- do not invent a new proxy definition in Stage 2
- if the upstream government-grants field is unavailable for a row, set `gov_dependency_pct = null`

## Recovery Analog Methodology

### Source Pool And Fallback

Recovery analog retrieval preserves the already-ratified Stage 0 analog sourcing rule:

- source pool is national, not CA+WA-only
- strict cohort is same `ntee_major_category + size_bucket`
- if strict cohort yields zero analogs, relax to `size_bucket` only
- state is not a hard filter

Same-state is a ranking preference only.

Stage 2 returns up to 3 analogs per eligible row.

Stage 2 does not widen beyond the ratified fallback above.

### Eligibility

Rows are eligible for recovery analog retrieval only if Stage 1 produced usable benchmark and per-metric gap context.

Status handling:

- `benchmark_status = not_scoreable` -> `recovery_analog_status = not_applicable`
- `benchmark_status = insufficient_resilient_refs` -> `recovery_analog_status = not_applicable`

### Primary Constraint Rule

Determine the primary constraint from the three Stage 1 per-metric gaps:

- `operating_margin_gap`
- `operating_runway_gap`
- `revenue_diversification_gap`

Choose the most negative non-null gap.

If multiple gaps are tied, apply this fixed tie-break order:

- `operating_margin_gap`
- `operating_runway_gap`
- `revenue_diversification_gap`

Constraint label mapping:

- `operating_margin_gap` -> `low_margin`
- `operating_runway_gap` -> `low_runway`
- `revenue_diversification_gap` -> `high_concentration_in_volatile_source`

The ratified Stage 2 contract does not include a `balanced` constraint label.

### Recovery Definition

An analog is an EIN that satisfies all of the following:

- a pre-window year in FY2014-FY2019 where it is bottom quartile on the matched constraint metric
- a post-window year in FY2020-FY2024 where it is top quartile on that same metric
- both years are within the same EIN's filing history
- it has at least 5 total years of panel data

The Stage 2 contract does not use a broader historical pre-window.

### Selection Order

Select up to 3 analogs using this deterministic order:

1. strict cohort before fallback cohort
2. same state preferred when available
3. smallest revenue-ratio difference
4. most recent recovery year
5. lowest EIN in ascending order as final tie-break

### Recovery Evidence

`recovery_analog_evidence` is a JSON-serializable list of up to 3 small structs.

Each struct must include:

- EIN
- org name
- state
- pre-window year
- post-recovery year
- matched metric name
- matched metric pre value
- matched metric post value

A similarity score may be included as non-load-bearing metadata. It does not affect analog selection unless it is explicitly added to the ranking rule in a future contract revision.

### Recovery Status Semantics

`recovery_analog_status` takes one of:

- `found`: at least 1 analog found
- `none_in_cohort`: no analog found after the ratified fallback
- `not_applicable`: row not eligible for analog retrieval

## Urgency Outputs

### Binary Urgency Rule

Stage 2 preserves the ratified Stage 1 binary urgency rule exactly:

- `urgency_flag = shock_absorption_months < 3 and operating_margin < 0`

This remains the load-bearing urgency definition.

### Urgency Severity

`urgency_severity` is a secondary display tier only. It does not replace or redefine the binary urgency rule.

Allowed values:

- `none`
- `flagged`
- `acute`

Severity mapping:

- `none`: `urgency_flag = false`
- `flagged`: `urgency_flag = true`
- `acute`: `shock_absorption_months < 1 and operating_margin < -0.10`

Any row meeting the `acute` rule is still urgent under the same binary rule.

### Urgency Reason

`urgency_reason` is machine-readable, not prose.

Allowed values:

- `none`
- `negative_margin_and_lt3m_shock_absorption`
- `negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct`

## Stage 1 Status Edge Cases

### `benchmark_status = not_scoreable`

Keep the row in the Stage 2 output.

Set:

- `stress_test_status = not_applicable`
- `recovery_analog_status = not_applicable`
- `urgency_flag = false`
- `urgency_severity = none`
- `urgency_reason = none`

### `benchmark_status = insufficient_resilient_refs`

Keep the row in the Stage 2 output.

Rules:

- stress test may still compute if raw inputs are sufficient
- `recovery_analog_status = not_applicable`
- urgency may still compute from Stage 1 fields if present

## Checkpoint Comparison Rule

Carry forward the same 11 shared sample EINs from Stage 1.

Stage 2 checkpoint diffs compare only the newly added Stage 2 fields on those shared samples.

The Stage 2 contract does not change the shared sample set.

If the team later wants extra Stage 2 edge-case EINs, that is an operational follow-up decision and not part of this ratified contract.

## Out Of Scope

This contract does not define:

- Stage 3 memo framing
- UI display caps
- builder assignment or compete-vs-single-owner process
- timing and sequencing
- any reinterpretation of Stage 1 diversification logic
