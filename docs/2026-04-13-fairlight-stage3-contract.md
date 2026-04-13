# Fairlight Stage 3 Contract

Stage 3 extends the ratified merged Stage 2 output with deterministic action labels and a deterministic Capital Stewardship Memo.

## Purpose

Stage 3 adds the sponsor-facing advisory layer to the canonical Stage 2 output so Fairlight can compare:

- which organizations appear strong enough to back from strength
- which organizations need stabilization before additional capital can work
- which organizations look operationally sound but overly concentrated
- which organizations require deeper diligence before any recommendation

Stage 3 is an extension layer only. It does not revisit or reinterpret Stage 1 scoring or Stage 2 enrichment.

## What Stage 2 Changed For Stage 3

Stage 2 surfaced three operational lessons that are ratified into this contract:

1. **Underspecified English sentences are not acceptable rule definitions.**  
   Action labels must be defined as explicit field comparisons with explicit precedence, not as prose such as "top-quartile resilience profile" or "fixable financial profile."
2. **Shared sample diffing is the convergence mechanism for deterministic fields.**  
   Stage 3 checkpoint comparison uses the same 11 shared sample EINs already carried forward from Stage 1 and Stage 2.
3. **Memos are not diff-able the same way labels are.**  
   Stage 3 uses compete mode for action labels only. Memo generation uses a single ratified deterministic template after label convergence.

## Non-goals

Stage 3 does not:

- recompute Stage 1 benchmark logic
- recompute Stage 1 cohort assignment
- change Stage 1 confidence tiers
- change Stage 2 stress-test outputs
- change Stage 2 recovery analog outputs
- change the row universe or authoritative `(ein, fiscal_year)` identity
- filter to most recent fiscal year per EIN
- define Stage 4 UI display behavior beyond the data semantics needed for implementation
- use an LLM to generate row-level memo text

## Canonical Input And Source Of Truth

The authoritative Stage 3 input is the merged `main` branch Stage 2 parquet:

- `outputs/stage2/scored_rows_enriched.parquet`

This file is the source of truth for:

- row universe
- authoritative `(ein, fiscal_year)` identity
- all Stage 1 fields and judgments
- all Stage 2 enrichment fields and judgments

Stage 3 must preserve the exact same row set as the canonical Stage 2 parquet.

## Output Grain And Path

Stage 3 output grain is identical to canonical Stage 2 output:

- one authoritative row per `(ein, fiscal_year)` already present in `outputs/stage2/scored_rows_enriched.parquet`

Stage 3 output path:

- `outputs/stage3/scored_rows_with_actions.parquet`

The Stage 3 build is additive only. No Stage 1 or Stage 2 fields may be altered in-place.

## Required Schema Additions

Stage 3 adds exactly four new columns:

- `action_label`
- `action_label_rationale`
- `memo_text`
- `trend_direction`

### Column Semantics

#### `action_label`

String enum. Allowed values:

- `Amplify`
- `Stabilize`
- `Diversify`
- `Deep Review`

#### `action_label_rationale`

JSON-serializable list of strings stored in parquet as a list-like column.

Rules:

- values must be machine-readable rule names, not prose
- order must be deterministic
- Deep Review may include more than one trigger if multiple Deep Review conditions fire
- Amplify and Diversify include the fixed rule names that define the label
- Stabilize includes the default terminal rule and the primary-constraint tag

Allowed rule names:

- `deep_review_insufficient_resilient_refs`
- `deep_review_low_confidence`
- `deep_review_acute_and_severe_25pct_stress`
- `deep_review_structural_outlier`
- `amplify_margin_above_benchmark`
- `amplify_runway_above_benchmark`
- `amplify_diversification_above_benchmark`
- `amplify_no_severe_25pct_stress`
- `amplify_no_urgency`
- `diversify_concentration_gap_below_neg_0_30`
- `diversify_margin_at_or_above_neg_0_30`
- `diversify_no_severe_25pct_stress`
- `diversify_no_urgency`
- `stabilize_default_scoreable`
- `stabilize_primary_constraint_low_margin`
- `stabilize_primary_constraint_low_runway`
- `stabilize_primary_constraint_high_concentration_in_volatile_source`

#### `memo_text`

String column containing the deterministic Capital Stewardship Memo generated from the fixed template in this contract.

#### `trend_direction`

String enum. Allowed values:

- `improving`
- `declining`
- `unavailable`

## Schema File

Stage 3 schema file path:

- `config/schemas/stage3_scored_row.schema.json`

## Memo Field Hydration

Three fields referenced in the Stage 3 memo template must be hydrated at Stage 3 build time from the raw panel before memo generation:

- `org_name`
- `total_revenue`
- `ntee_major_category`

Hydration source:

- `panel_990_extended_v4.parquet`

Join keys:

- `(ein, fiscal_year)`

Match rule:

- exact match on `(ein, fiscal_year)`

Fallback rendering rule if no raw-panel row matches a Stage 2 row:

- render `org_name` as `"unknown"`
- render `total_revenue` as `null`
- render `ntee_major_category` as `"unclassified"`

Hydration is a Stage 3 build step only. The canonical Stage 2 parquet is not modified by this requirement.

## Sign Convention Note

Stage 3 uses two different gap systems whose sign conventions are not interchangeable.

### Per-metric gap fields

The per-metric gap fields are raw benchmark differences:

- `operating_margin_gap = operating_margin - benchmark_operating_margin_q75`
- `operating_runway_gap = operating_runway_proxy_months - benchmark_operating_runway_q75`
- `revenue_diversification_gap = revenue_diversification_index - benchmark_revenue_diversification_q75`

For all three per-metric gaps:

- positive = above cohort benchmark = better
- negative = below cohort benchmark = worse

### `resilience_gap`

`resilience_gap` comes from Stage 1 composite scoring and has the opposite directional meaning:

- more negative = better relative to peers
- more positive = worse relative to peers

Stage 3 must not compare or combine per-metric gap thresholds and `resilience_gap` thresholds as if they shared the same sign convention or scale.

## Action Label Methodology

### Required Rule Form

Action labels must be implemented as a single deterministic `if / elif / elif / else` chain in the precedence order defined below.

The label assignment is not a weighted score, not a voting scheme, and not an OR-combination of independent booleans.

### Precedence Order

Evaluate labels in this exact order:

1. `Deep Review`
2. `Amplify`
3. `Diversify`
4. `Stabilize`

`Stabilize` is the unconditional fallthrough for remaining scoreable rows. There is no second Deep Review catch-all.

### Deep Review

Assign `Deep Review` if **any** of the following conditions is true:

- `benchmark_status == 'insufficient_resilient_refs'`
- `checkpoint1_confidence_tier == 'Low'`
- `urgency_severity == 'acute' and stress_25pct_severity in ('severe', 'critical')`
- `resilience_gap > 2.0`

`action_label_rationale` must include each matching Deep Review trigger in this fixed order:

1. `deep_review_insufficient_resilient_refs`
2. `deep_review_low_confidence`
3. `deep_review_acute_and_severe_25pct_stress`
4. `deep_review_structural_outlier`

### Amplify

Assign `Amplify` if the row did not already match `Deep Review` and **all** of the following conditions are true:

- `operating_margin_gap >= 0`
- `operating_runway_gap >= 0`
- `revenue_diversification_gap >= 0`
- `stress_25pct_severity not in ('severe', 'critical')`
- `urgency_severity == 'none'`

Implementation note:

- null `stress_25pct_severity` from `stress_test_status = not_applicable` is treated as "no observed severe stress failure" and does not block `Amplify`

`action_label_rationale` must be exactly:

- `["amplify_margin_above_benchmark", "amplify_runway_above_benchmark", "amplify_diversification_above_benchmark", "amplify_no_severe_25pct_stress", "amplify_no_urgency"]`

### Diversify

Assign `Diversify` if the row did not already match `Deep Review` or `Amplify` and **all** of the following conditions are true:

- `revenue_diversification_gap <= -0.30`
- `operating_margin_gap >= -0.30`
- `stress_25pct_severity not in ('severe', 'critical')`
- `urgency_severity == 'none'`

Implementation note:

- null `stress_25pct_severity` from `stress_test_status = not_applicable` is treated as "no observed severe stress failure" and does not block `Diversify`

`action_label_rationale` must be exactly:

- `["diversify_concentration_gap_below_neg_0_30", "diversify_margin_at_or_above_neg_0_30", "diversify_no_severe_25pct_stress", "diversify_no_urgency"]`

### Stabilize

Assign `Stabilize` to every remaining row that did not already match `Deep Review`, `Amplify`, or `Diversify`.

`Stabilize` is the default label for scoreable rows that are neither clearly top-of-cohort nor clean concentration-risk cases.

For `Stabilize`, determine the primary constraint from the three Stage 1 per-metric gaps:

- `operating_margin_gap`
- `operating_runway_gap`
- `revenue_diversification_gap`

Choose the most negative non-null gap.

If multiple gaps are tied, apply this fixed tie-break order:

1. `operating_margin_gap`
2. `operating_runway_gap`
3. `revenue_diversification_gap`

Constraint label mapping:

- `operating_margin_gap` -> `stabilize_primary_constraint_low_margin`
- `operating_runway_gap` -> `stabilize_primary_constraint_low_runway`
- `revenue_diversification_gap` -> `stabilize_primary_constraint_high_concentration_in_volatile_source`

`action_label_rationale` must be:

- `["stabilize_default_scoreable", "<primary_constraint_rule_name>"]`

Edge case:

- if a row reaches the Stabilize branch with all three per-metric gaps null, the implementation must raise an explicit error rather than silently default
- this case should not occur in practice because rows with all-null per-metric gaps should already be captured by `benchmark_status == 'insufficient_resilient_refs'` and assigned `Deep Review`
- if it does occur, treat it as upstream data corruption and fail the build loudly

## Clarifications On Rejected Rule Paths

The following interpretations are explicitly rejected and must not be reintroduced during implementation:

- do not use `resilience_gap >= 0` as a good-performance threshold
- do not use recovery-analog presence as a label differentiator
- do not use `largest_revenue_source_pct` absolute cutoffs for Diversify
- do not use trend as a hard label-assignment gate
- do not use the 50 percent stress scenario as a hard blocker for Amplify or Diversify

## Why Recovery Analogs Are Memo Evidence, Not Label Logic

After the ratified Stage 2 merge decisions, recovery analog presence does not differentiate scoreable rows:

- `recovery_analog_status = found` for all `benchmark_status == ok` rows in the current merged Stage 2 parquet
- `recovery_analog_status = not_applicable` is driven by `benchmark_status == insufficient_resilient_refs`

Therefore:

- analog presence is not load-bearing for label assignment
- analog evidence remains load-bearing for memo explanation

## Why Diversify Uses Cohort-Relative Diversification Gap

Absolute concentration thresholds are rejected because the current dataset is heavily concentrated at the raw-source-share level.

The load-bearing Diversify signal is:

- `revenue_diversification_gap <= -0.30`

This is cohort-relative and therefore interpretable across different nonprofit funding models.

## Trend Methodology

`trend_direction` is memo support metadata only. It is not a hard gate for any action label.

### Join Rule

Compute trend only for rows where:

- `fiscal_year == 2024`
- the same `ein` also has a `fiscal_year == 2023` row in the canonical Stage 2 parquet

No other year-pairing logic is allowed in Stage 3.

### Mapping Rule

For eligible FY2024 rows:

- `improving` if `resilience_gap_2024 <= resilience_gap_2023 + 0.10`
- `declining` otherwise

For all FY2023 rows and all FY2024 rows without a matching FY2023 row:

- `trend_direction = 'unavailable'`

The `+ 0.10` tolerance deliberately treats small year-over-year deterioration as stable enough to remain in the `improving` bucket for memo framing.

## Confidence Tier Rule

The only confidence field used by Stage 3 action labeling is:

- `checkpoint1_confidence_tier`

Stage 3 must not substitute:

- `data_confidence_tier`
- `cohort_confidence_tier`

`checkpoint1_confidence_tier == 'Low'` forces `Deep Review` unconditionally.

## Benchmark Status Rule

The only Stage 1 benchmark-status enum values Stage 3 relies on are:

- `ok`
- `insufficient_resilient_refs`

Stage 3 must not reference `not_scoreable` in label logic because that is not the current authoritative enum in the merged Stage 2 parquet.

## Stress Interaction Rule

Urgency remains orthogonal to the action label except for the one explicit Deep Review override:

- `urgency_severity == 'acute' and stress_25pct_severity in ('severe', 'critical')`

Outside that override:

- urgent rows may still receive `Stabilize`
- non-urgent rows may still receive any non-Deep-Review label if they meet the other criteria

Stage 3 uses the 25 percent stress scenario only for hard label blocking.

The 50 percent stress scenario remains available for memo narrative but is not a hard gating rule.

## Missing Stress-Test Handling

If `stress_25pct_severity` is null because the Stage 2 stress test was not computable:

- the row does not automatically become `Deep Review`
- null is treated as "no observed severe 25 percent stress failure" for the purposes of the Amplify and Diversify rule checks
- the memo must state that the stress-test scenario was unavailable when `stress_test_status != 'computed'`

This is an explicit contract choice to avoid hidden builder divergence.

## Capital Stewardship Memo Methodology

### Generation Method

`memo_text` must be generated by deterministic template fill in Python or equivalent deterministic string assembly.

Stage 3 must not use an LLM or any stochastic generation system for row-level memo text.

### Memo Length

Maximum length:

- `250` words

This is a validation constraint, not a style suggestion.

### Memo Sections And Order

Every memo must include these sections in this exact order:

1. Org snapshot
2. Cohort context
3. Resilience assessment
4. Stress test results
5. Recovery analog evidence
6. Recommended action
7. Confidence note

The memo may be rendered as compact paragraphs rather than literal section headers, but the information order must remain fixed.

### Required Content By Section

#### Org snapshot

Must include:

- `org_name`
- `state`
- `fiscal_year`
- `size_bucket`
- `total_revenue`

#### Cohort context

Must include:

- `ntee_major_category` when present
- `cohort_size`
- `benchmark_rule`

#### Resilience assessment

Must include the actual metric values and benchmark values for:

- operating margin
- operating runway
- revenue diversification

Each metric statement must cite:

- actual value
- benchmark value
- plain-English phrase from the fixed phrasing dictionary below

#### Stress test results

If `stress_test_status == 'computed'`, this section must include:

- the 25 percent largest-source shock framing
- `stress_25pct_burn_months` when present
- `stress_25pct_severity`

If `stress_test_status != 'computed'`, this section must say:

- stress-test scenario unavailable due to missing raw inputs

#### Recovery analog evidence

This section cites exactly one analog in the memo body:

- the top-ranked analog already returned by Stage 2 ordering

The memo does not inline all three analogs.

#### Recommended action

This section must contain:

- one sentence naming the `action_label`
- one sentence explaining the decisive rule logic in plain English

#### Confidence note

If `checkpoint1_confidence_tier == 'Low'`, the memo must say:

- data confidence is insufficient to support a specific action recommendation and the row should be reviewed directly before action

If `checkpoint1_confidence_tier == 'Medium'`, the memo must include one sentence noting moderate confidence.

If `checkpoint1_confidence_tier == 'High'`, the memo may include a short confirmation sentence and should not add extra caveat language.

### Fixed Phrasing Dictionary

Use this exact mapping for per-metric gap phrasing:

- `gap >= 0` -> `above peer benchmark`
- `-0.3 <= gap < 0` -> `near peer benchmark`
- `-1.0 <= gap < -0.3` -> `below peer benchmark`
- `gap < -1.0` -> `materially behind peer benchmark`

### Citation Discipline

Every quantitative claim in the memo must include the underlying value inline.

Allowed style:

- `Operating runway of -4.0 months versus cohort benchmark of 12.5 months`

Disallowed style:

- qualitative claims with no supporting number
- claims that cite only a direction with no value

### Recovery Analog Sentence Template

The memo must use this exact sentence structure when citing the top-ranked analog:

`{org_name} ({state}) recovered from a similar {constraint_label} position between {pre_window_year} and {post_recovery_year}, improving {matched_metric_name} from {pre_val:.2f} to {post_val:.2f}.`

The memo must not cite analogs by EIN only.

### Recommended Action Sentence Pattern

The recommended-action block must follow this two-sentence structure:

1. `Recommended action: {action_label}.`
2. One sentence explaining the decisive rule logic in sponsor-readable language using the actual field values.

### Low-Confidence Acute-Urgency Language

For rows where:

- `checkpoint1_confidence_tier == 'Low'`
- and `urgency_severity == 'acute'`

the confidence note must include this meaning:

- the available data suggests potential imminent distress, but current filings should be verified directly before any capital decision

## Worked Examples

These examples are explanatory only. They do not replace the rules above.

### Example A: Stabilize

`EIN 042800910` — `RESPONSIBLE HOSPITALITY INSTITUTE INC` — CA — FY2024

Key fields:

- `benchmark_status = ok`
- `checkpoint1_confidence_tier = High`
- `operating_margin_gap = +0.112666`
- `operating_runway_gap = -16.448288`
- `revenue_diversification_gap = +0.187152`
- `stress_25pct_severity = critical`
- `urgency_severity = none`
- `recovery_analog_count = 3`
- `recovery_analog_constraint = low_runway`

Assignment:

- not `Deep Review`
- not `Amplify` because `operating_runway_gap < 0`
- not `Diversify` because `revenue_diversification_gap > -0.30`
- therefore `Stabilize`

`trend_direction = improving` because `resilience_gap_2024 = -0.735061` and `resilience_gap_2023 = -0.244139`.

### Example B: Amplify

`EIN 812793464` — `Global Outreach Fund Inc` — CA — FY2024

Key fields:

- `benchmark_status = ok`
- `checkpoint1_confidence_tier = High`
- `operating_margin_gap = +0.555404`
- `operating_runway_gap = +737.062922`
- `revenue_diversification_gap = +0.390247`
- `stress_25pct_severity = none`
- `urgency_severity = none`

Assignment:

- not `Deep Review`
- matches all five Amplify conditions
- therefore `Amplify`

### Example C: Diversify

`EIN 463711322` — `Friends of Santa Claus Inc` — CA — FY2024

Key fields:

- `benchmark_status = ok`
- `checkpoint1_confidence_tier = Medium`
- `operating_margin_gap = +0.037122`
- `operating_runway_gap = +1.339732`
- `revenue_diversification_gap = -16.499729`
- `stress_25pct_severity = mild`
- `urgency_severity = none`

Assignment:

- not `Deep Review`
- not `Amplify` because `revenue_diversification_gap < 0`
- matches all Diversify conditions
- therefore `Diversify`

### Example D: Deep Review

`EIN 825407158` — `HEALTH ASSURANCE ECONOMY FOUNDATION` — CA — FY2023

Key fields:

- `benchmark_status = insufficient_resilient_refs`
- `checkpoint1_confidence_tier = Medium`
- `resilience_gap = 6.325278`

Assignment:

- `Deep Review` immediately because `benchmark_status == insufficient_resilient_refs`
- `action_label_rationale` must include `deep_review_insufficient_resilient_refs`
- it may also include `deep_review_structural_outlier` because `resilience_gap > 2.0`

## Checkpoint Comparison Rule

Carry forward the same 11 shared sample EINs from Stage 1 and Stage 2.

Stage 3 checkpoint diffs for the compete round compare:

- `action_label`
- `action_label_rationale`
- `trend_direction`

on those shared samples.

The primary shared-sample artifact is:

- an 11-row by 3-build label comparison matrix

The Stage 3 contract does not change the shared sample set.

## Full-Dataset Diagnostic Rule

Builders must also report full-dataset label counts and shares.

These are diagnostics, not quotas.

For the April 13 merged Stage 2 parquet and the ratified Stage 3 rules, the baseline dry-run distribution is approximately:

- `Amplify`: `3.35%`
- `Diversify`: `0.53%`
- `Stabilize`: `63.21%`
- `Deep Review`: `32.91%`

Sanity-check ranges for this rule shape are:

- `Amplify`: `2% - 6%`
- `Diversify`: `0% - 2%`
- `Stabilize`: `55% - 70%`
- `Deep Review`: `25% - 40%`

Outputs far outside these ranges should be investigated before submission, but the ranges are not acceptance criteria by themselves.

## Build Mode And Convergence Rule

Stage 3 uses:

- compete mode for action labels
- single-owner mode for memo generation

Operational branch convention:

- `feat/task-03-a`
- `feat/task-03-b`
- `feat/task-03-c`
- `feat/task-03-memo`

Compete-round builders implement:

- action-label logic
- rationale logic
- trend-direction logic

Single-owner memo work begins only after label convergence is checked.

This split is intentional because:

- labels are deterministic and diff-able
- memos are deterministic but not efficiently comparable through a confusion-matrix workflow

## Out Of Scope

This contract does not define:

- Stage 4 UI filtering to most recent fiscal year per EIN
- UI badge ordering or styling for `urgency_flag`
- any change to Stage 2 analog ranking logic
- any change to Stage 2 stress-test formulas
- any quota target for label shares
- any alternate memo voice or presentation layer beyond the fixed deterministic template
