# Fairlight Distress Risk Model Spec

## Purpose

Stage 4 adds one forward-looking ML signal to the Stage 1-3 decision stack:

- a `distress_prob` score estimating whether an organization will trip Fairlight's urgency rule in the next fiscal year
- a `distress_tier` enum (`High` / `Medium` / `Low`) for direct use in the app and deck

This model is additive only. It does not replace Stage 3 action labels, recovery analogs, or memo logic.

## Canonical Data Sources

- Raw national panel: `Data/panel_990_extended_v4.parquet`
- Scoring target output: `outputs/stage2/scored_rows_enriched.parquet`

`panel_990_extended_v4.parquet` is read-only. All feature engineering happens in memory or in new Stage 4 outputs.

## Target Variable

Binary target at `(ein, fiscal_year = T)`:

- `target = 1` if the same EIN has a filing at `T+1` and Fairlight's urgency rule fires at `T+1`
- `target = 0` if the same EIN has a filing at `T+1` and the urgency rule does not fire at `T+1`

Urgency rule at `T+1` is locked to the Stage 1 / Stage 2 definition:

- `urgency_flag_{T+1} = (shock_absorption_months_{T+1} < 3) AND (operating_margin_{T+1} < 0)`

Derived field formulas must exactly match `config/checkpoint1_contract.json`:

- `operating_margin = (total_revenue - total_expenses) / total_revenue`
- `shock_absorption_months = (cash_non_interest_bearing + savings_temporary_investments) / (total_expenses / 12)`
- `revenue_diversification_index = 1 - (pct_contributions^2 + pct_program_revenue^2 + pct_investment_income^2 + pct_other_revenue^2)`

## Training Population

Source universe:

- all states in `panel_990_extended_v4.parquet`

Row eligibility:

- EIN has at least 5 unique fiscal years in the raw panel
- current-year raw fields required for feature engineering are present
- same EIN has a filing at `T+1` so the target can be observed

Observed panel counts from the locked v4 file after deduping `(ein, fiscal_year)` to the latest `tax_period_end`:

- raw panel rows: `3,838,909`
- raw panel unique EINs: `476,208`
- EINs with at least 5 fiscal years: `324,927`
- eligible `(ein, T)` rows with observed `T+1` target: `2,910,044`

Time split:

- train: `fiscal_year <= 2020`
- test: `fiscal_year >= 2021`
- no random shuffle across the time boundary

Observed split counts:

- train rows: `2,216,714`
- test rows: `693,330`
- train positive rate: `19.08%`
- test positive rate: `18.16%`

## Feature Set

The first pass uses Path A only: raw panel features plus derived ratios and lagged / YoY fields computed directly from the panel. No Stage 1 benchmark features or Stage 2 enrichments are used for model training.

### Current-year numeric levels

- `total_revenue`
- `total_expenses`
- `net_assets_eoy`
- `cash_non_interest_bearing`
- `savings_temporary_investments`
- `contributions_grants`
- `program_service_revenue`
- `investment_income`
- `other_revenue`

### Current-year derived ratios

- `operating_margin`
- `shock_absorption_months`
- `cash_to_expenses`
- `revenue_to_expenses`
- `net_assets_to_expenses`
- `revenue_diversification_index`

Definitions:

- `cash_to_expenses = (cash_non_interest_bearing + savings_temporary_investments) / total_expenses`
- `revenue_to_expenses = total_revenue / total_expenses`
- `net_assets_to_expenses = net_assets_eoy / total_expenses`

### Revenue composition

- `pct_contributions`
- `pct_program_revenue`
- `pct_investment_income`
- `pct_other_revenue`

### Lagged features (`T-1`)

- `operating_margin_lagged_1y`
- `total_revenue_lagged_1y`
- `shock_absorption_months_lagged_1y`

### Year-over-year change features

- `revenue_growth_yoy`
- `expense_growth_yoy`
- `margin_change_yoy`

Definitions:

- `revenue_growth_yoy = (total_revenue - total_revenue_lagged_1y) / total_revenue_lagged_1y`
- `expense_growth_yoy = (total_expenses - total_expenses_lagged_1y) / total_expenses_lagged_1y`
- `margin_change_yoy = operating_margin - operating_margin_lagged_1y`

### Categorical features

- `size_bucket`
- `ntee_major_category`
- `state`

`size_bucket` uses the Stage 1 contract cutoffs:

- `<500K`
- `500K-2M`
- `2M-10M`
- `>10M`

### Explicit exclusions

Excluded from the first pass:

- Stage 1 benchmark gaps and resilience scores
- Stage 2 stress severities, analog fields, and urgency fields
- `org_name`, mission text, or any free text
- `years_of_data` as a direct feature

These exclusions are intentional so the model remains a raw-panel foresight model rather than a learned copy of the existing rule engine.

## Missing-Value Policy

Model implementation uses median imputation for numeric features and most-frequent imputation for categorical features before one-hot encoding.

Rationale:

- current-year raw financial levels are largely complete
- some reserve / investment fields are structurally sparse
- logistic regression requires dense numeric inputs after preprocessing
- imputation keeps the training population large without introducing a second model-specific missingness logic

## Model Choice

First-pass model:

- stochastic logistic regression via `SGDClassifier(loss="log_loss")`

Configuration:

- `class_weight='balanced'`
- `max_iter=1000`

Why logistic regression:

- fast enough to train on the filtered national panel in hackathon time
- easy to calibrate and explain
- produces coefficient-based feature importance that is deck-friendly
- avoids the extra tuning and dependency complexity of gradient boosting for the first pass
- uses the logistic objective directly while scaling better than a full-batch solver on the 2M+ row training split

## Evaluation

Primary metric:

- ROC-AUC

Secondary metrics:

- precision
- recall
- F1
- average precision / PR-AUC

Thresholding:

- a probability threshold is selected on the training split to maximize F1
- the chosen threshold is then applied unchanged to the test split

Calibration:

- include a calibration curve artifact for the deck / appendix
- UI should display both tier and baseline anchor, not naked probability alone

## Output Artifacts

### Model predictions

Write:

- `outputs/stage4/distress_predictions.parquet`

Columns:

- `ein`
- `fiscal_year`
- `distress_prob`
- `distress_tier`

Scoring scope:

- every row in `outputs/stage2/scored_rows_enriched.parquet`

Tier mapping:

- `High`: probability >= high-risk cutoff
- `Medium`: probability >= medium-risk cutoff and < high-risk cutoff
- `Low`: probability < medium-risk cutoff

The exact numeric cutoffs are chosen after test-set calibration and documented in the training summary.

### Deck assets

Generate:

- one coefficient-based feature-importance chart
- one ROC or PR curve
- one calibration plot
- one baseline-vs-high-risk lift statement

## Implementation Notes

- keep the modeling code in a dedicated Stage 4 module under `scoring/`
- write tests for target construction, feature engineering, and Stage 2 scoring output shape before implementation
- do not mutate the raw panel on disk
- do not write intermediate derived columns back into Stage 2 outputs

## Success Criteria

The first pass is complete when:

- the model trains end-to-end on the national panel with the locked time split
- `outputs/stage4/distress_predictions.parquet` exists and covers all Stage 2 rows
- the test metrics and tier thresholds are reported
- the feature-importance and curve artifacts exist for deck use
