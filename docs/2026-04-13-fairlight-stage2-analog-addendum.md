# Fairlight Stage 2 Analog Addendum

This addendum pins the underspecified parts of the recovery analog methodology in the Stage 2 contract (`docs/2026-04-13-fairlight-stage2-contract.md`). It does not replace that contract. It supplements the "Recovery Analog Methodology" section only.

**Scope of this addendum:** recovery analog component only. Stress test, urgency, constraint identification, and largest-source determination are unchanged and must not be re-implemented.

## Why This Addendum Exists

The first Stage 2 build cycle produced three independent analog implementations with effectively zero overlap on shared sample EINs. Constraint identification was 100% converged across all three builds, but pool construction and selection diverged completely. The root cause was four underspecified points in the original contract. This addendum pins each of them.

## What Stays The Same

The following from the original Stage 2 contract is unchanged and authoritative:

- Source pool is national, not CA+WA-only
- Strict cohort is `ntee_major_category + size_bucket`; fallback to `size_bucket` only
- Up to 3 analogs returned per eligible row
- Pre-window FY2014–2019, post-window FY2020–2024
- Constraint label mapping from most-negative Stage 1 gap
- Selection order: strict cohort > fallback cohort, same-state preference, smallest revenue-ratio difference, most recent recovery year, lowest EIN as final tiebreak
- Eligibility rules: `not_scoreable` and `insufficient_resilient_refs` rows get `recovery_analog_status = not_applicable`
- Evidence struct fields (EIN, org name, state, pre-window year, post-window year, matched metric name, matched metric pre value, matched metric post value)
- Output field names and `recovery_analog_status` vocabulary

## Pinned Decisions

### 1. Quartile Scope

Quartile thresholds (Q25 for "bottom quartile" and Q75 for "top quartile") are computed **globally per fiscal_year across the full national panel**, not per cohort.

For each fiscal year in the panel:
- Compute Q25 and Q75 of `operating_margin` across all panel rows in that year nationally
- Compute Q25 and Q75 of `operating_runway_proxy_months` across all panel rows in that year nationally
- Compute Q25 and Q75 of `revenue_diversification_index` across all panel rows in that year nationally

These per-year national thresholds are the reference for "bottom quartile" and "top quartile" in the recovery definition. Cohort filtering happens at the **selection** step, not the threshold step.

**Rationale:** Per-cohort-year quartiles produce sparse reference cells for rare NTEE+size combinations, which would force constant fallback. The contract already specifies a national source pool; computing thresholds against the same national pool is consistent.

### 2. Five-Year Panel Requirement

An analog candidate EIN must have **at least 5 unique fiscal years** of panel data. The 5 years do **not** need to be consecutive.

Implementation: `df.groupby('ein')['fiscal_year'].nunique() >= 5`

**Rationale:** The contract says "at least 5 total years of panel data" without specifying consecutiveness. Permissive read avoids excluding orgs with one missing filing year, which is common.

### 3. Pool Construction Order

The analog pool is constructed **once nationally before per-row selection**, not per-target-row. The pipeline is:

1. **Once per Stage 2 run:** Build three national candidate pools — one per constraint metric (margin, runway, diversification). For each metric, find every EIN in the national panel that has at least one pre-window year (FY2014–2019) where it sits at or below the per-year national Q25 on that metric, AND at least one post-window year (FY2020–2024) where it sits at or above the per-year national Q75 on that metric, AND has 5+ unique fiscal years of panel data. Store the matched pre-window year, post-window year, and metric values per candidate EIN per metric.

2. **Per scored row eligible for analog retrieval:** Look up the constraint metric for that row, query the corresponding pre-built national pool, filter by the strict cohort (`ntee_major_category + size_bucket`), then apply the selection order from the contract (same-state preference, smallest revenue-ratio difference, most recent recovery year, lowest EIN). If the strict cohort yields zero matches, fall back to `size_bucket` only and reapply the selection order.

3. Return up to 3 analogs per row, with the full evidence struct populated from the pre-stored pre/post year values.

**Rationale:** Building the pool once amortizes the expensive cross-window computation. Building per-row would force re-computation against the full national panel for every one of the ~60K eligible rows, which is wasteful and would likely cause builders to take shortcuts that introduce silent divergences.

### 4. "Bottom Quartile" And "Top Quartile" Reference

A candidate EIN's pre-window value on the constraint metric is compared to the **national Q25 for that fiscal year**. A candidate EIN's post-window value is compared to the **national Q75 for that fiscal year**. The reference set is the national panel for that year, not the candidate's own historical distribution and not the candidate's cohort.

For metrics where higher is better (margin, runway, diversification):
- "Bottom quartile" means the value is at or below the year's national Q25
- "Top quartile" means the value is at or above the year's national Q75

All three constraint metrics in this contract are higher-is-better. There is no inversion needed.

## Output Format

All three builders must serialize analog outputs identically to enable comparison and downstream consumption:

- `recovery_analog_eins`: JSON-serializable list of strings, e.g. `["731709601", "680455378", "421574635"]`. Not a comma-separated string. Not a numpy array. A Python list of string EINs that survives `json.dumps()` cleanly.
- `recovery_analog_evidence`: JSON-serializable list of dicts, one per analog EIN, each containing the fields enumerated in the original contract. Survives `json.dumps()` cleanly.
- `recovery_analog_count`: integer, length of `recovery_analog_eins`.
- `recovery_analog_constraint`: string, one of the contract's constraint labels.
- `recovery_analog_status`: string, one of `found` / `none_in_cohort` / `not_applicable`.

Empty lists must be empty lists `[]`, not `None`, not `null`, not `np.array([])`.

## Worked Example

For shared sample EIN `201384250` (one of the 11 checkpoint EINs):

Suppose this org's Stage 1 per-metric gaps are:
- `operating_margin_gap` = -0.42
- `operating_runway_gap` = -0.18
- `revenue_diversification_gap` = -0.05

Most negative gap is `operating_margin_gap`. Constraint label is `low_margin`.

The analog search queries the pre-built national margin pool. That pool contains every EIN in the national panel that:
- Had at least one year in FY2014–2019 where their `operating_margin` was at or below the national Q25 for that year
- Had at least one year in FY2020–2024 where their `operating_margin` was at or above the national Q75 for that year
- Has at least 5 unique fiscal years of panel data

From that national pool, filter to candidates whose `ntee_major_category` and `size_bucket` match `201384250`'s. If that yields fewer than 1 candidate, fall back to `size_bucket` only.

Apply selection order: same state as `201384250` first, then smallest difference in `total_revenue` ratio, then most recent post-window year, then lowest EIN.

Return up to 3 candidates as `recovery_analog_eins`. Build the evidence struct for each, populating `pre_window_year`, `post_window_year`, `pre_value`, `post_value` from the stored pool data.

If the strict cohort + fallback both return zero candidates: `recovery_analog_status = none_in_cohort`, `recovery_analog_eins = []`, `recovery_analog_count = 0`, `recovery_analog_evidence = []`.

There may be more than one valid set of 3 analogs depending on tie resolution edge cases, but the selection order should converge in the vast majority of cases. If two builders disagree on a sample EIN's analogs after this addendum, that disagreement should trace to a specific selection-order step, not to pool construction.

## Diagnostic Harness

Before submitting their re-built analog block, each builder runs the following diagnostic and includes the output in their submission report:

```python
import pandas as pd
import json

df = pd.read_parquet('<path to your stage 2 parquet>')

# Status distribution
print('--- Analog status distribution ---')
print(df['recovery_analog_status'].value_counts())

# Yield among 'found' rows
found = df[df['recovery_analog_status'] == 'found']
print(f'\nFound rows: {len(found)}')
print(f'Found rows with count > 0: {(found["recovery_analog_count"] > 0).sum()}')
print(f'Found rows with empty analog list: {(found["recovery_analog_count"] == 0).sum()}')

# Constraint distribution among found rows
print('\n--- Constraint label among found rows ---')
print(found['recovery_analog_constraint'].value_counts())

# Format check
print('\n--- Format check ---')
sample_row = found.iloc[0]
print(f'recovery_analog_eins type: {type(sample_row["recovery_analog_eins"])}')
print(f'recovery_analog_eins sample: {sample_row["recovery_analog_eins"]}')
print(f'JSON serializable: ', end='')
try:
    json.dumps(list(sample_row['recovery_analog_eins']))
    print('yes')
except Exception as e:
    print(f'NO — {e}')

# Shared sample dump
samples = ['204374795','237071436','203812932','201384250','061652679',
           '042800910','237102713','020549032','160470118','141843628','956125213']
sub = df[df['ein'].isin(samples)][[
    'ein','fiscal_year','recovery_analog_status','recovery_analog_constraint',
    'recovery_analog_count','recovery_analog_eins'
]]
print('\n--- Shared sample dump ---')
print(sub.to_string())
```

The output of this script is the artifact the team will diff across the three rebuilds.

## What This Addendum Does Not Touch

The following components from the original Stage 2 contract and the existing builds are **out of scope for the redo and must not be modified**:

- Stress test (all 10 stress fields, both scenarios, severity buckets, computability gate)
- Urgency (all 3 urgency fields)
- Constraint identification logic (the determination of which Stage 1 gap is the primary constraint)
- Largest revenue source determination
- Government dependency field
- All Stage 1 fields (preserved untouched)
- Schema field names and types
- Row universe and `(ein, fiscal_year)` identity

Builders must reuse their existing Stage 2 build for every component listed above. Only the analog block (pool construction, selection, output serialization) is being re-implemented.

---

**End of addendum.**

---