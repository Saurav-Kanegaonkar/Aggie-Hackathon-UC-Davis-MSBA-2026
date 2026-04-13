# Fairlight Rule Engine Backtest — Methodology and Results

## Purpose

Validate that the Stage 3 action label rules correspond to meaningfully different real-world financial outcomes. Specifically: do organizations the engine labels as Deep Review in a pre-COVID year actually deteriorate at a higher rate during the COVID stress event than organizations labeled Amplify?

This is an empirical validation of the rule engine's discriminative power, not a causal claim.

## Method

### Data source

- `panel_990_extended_v4.parquet` (national, 3.8M rows, FY2007–2026)
- FY2019 used as the labeling year (pre-COVID, most complete pre-stress year)
- FY2020 and FY2021 used as outcome years (COVID stress event)

### Why this is not "running the engine on FY2019 data"

The Stage 1 scoring pipeline only produced scored outputs for FY2023 and FY2024. There are no Stage 1 resilience gaps, cohort benchmarks, or confidence tiers for FY2019 rows in the canonical output. The backtest therefore applies a **proxied version of the Stage 3 label rules** directly to raw FY2019 panel data using national-level quartile thresholds rather than cohort-level benchmarks.

This is a deliberate simplification. The full engine uses cohort-specific benchmarks; the backtest uses national Q75 values as the comparison threshold. The labeling is directionally equivalent but not identical to what the full pipeline would produce for FY2019.

### FY2019 national Q75 thresholds used

| metric | FY2019 national Q75 |
|---|---|
| operating_margin | 0.1662 |
| operating_runway_proxy_months | 38.42 |
| revenue_diversification_index | 0.4112 |

### Label assignment rules (simplified proxy)

Applied as a deterministic if/elif/else chain, same precedence as Stage 3 contract:

1. **Deep Review**: no valid revenue data OR `operating_margin_gap < -2.0` (structural outlier, proxy for resilience_gap > 2.0)
2. **Amplify**: all three gaps >= 0 (above national Q75 on all three metrics)
3. **Diversify**: `rdi_gap <= -0.30` AND `margin_gap >= -0.30`
4. **Stabilize**: all remaining rows

Note: confidence tier and urgency-severity conditions from the full Stage 3 Deep Review rule are not available for historical panel rows. The structural outlier proxy (`margin_gap < -2.0`) captures the most extreme cases.

### Derived metrics computed from panel

All metrics computed from raw panel fields using canonical formulas from `config/checkpoint1_contract.json`:

- `operating_margin = (total_revenue - total_expenses) / total_revenue`
- `operating_runway_proxy_months = net_assets_eoy / (total_expenses / 12)`
- `shock_absorption_months = (cash_non_interest_bearing + savings_temporary_investments) / (total_expenses / 12)`
- `revenue_diversification_index = 1 - HHI` where HHI is computed from pct_* share columns

### Outcome variable

```
urgency_fired = (shock_absorption_months < 3) AND (operating_margin < 0)
```

This is the same urgency rule used in Stage 2 and locked in `config/checkpoint1_contract.json`. Applied separately to FY2020 and FY2021 rows for each EIN that also appeared in FY2019.

### Join logic

- FY2019 labeled orgs inner-joined to FY2020 and FY2021 on `ein`
- Only EINs present in both the labeling year and the outcome year contribute to the distress rate

## Results

### FY2019 label distribution (proxy rules, national Q75 thresholds)

| Label | N (FY2019) | % of total |
|---|---|---|
| Stabilize | 159,493 | 56.0% |
| Diversify | 103,590 | 36.4% |
| Amplify | 12,351 | 4.3% |
| Deep Review | 9,181 | 3.2% |

Note: Diversify is higher here (36.4%) than in the production Stage 3 output (12.28%) because this backtest uses national Q75 thresholds rather than cohort-specific benchmarks. Orgs that are above their local cohort benchmark on diversification but below the national Q75 are classified as Diversify here but would be Amplify or Stabilize in the full engine. This is an expected artifact of the national-quartile simplification.

### Distress rates in FY2020 and FY2021 by FY2019 label

| Label | Distress rate 2020 | Distress rate 2021 | Lift vs Amplify (2020) | Lift vs Amplify (2021) |
|---|---|---|---|---|
| Amplify | 4.0% | 3.9% | 1.0x (baseline) | 1.0x (baseline) |
| Diversify | 13.0% | 13.4% | 3.2x | 3.4x |
| Stabilize | 13.3% | 13.2% | 3.3x | 3.4x |
| Deep Review | 16.6% | 15.9% | **4.1x** | **4.1x** |

### Pass/fail result

**PASS.** Deep Review organizations show a 4.1x distress rate lift over Amplify organizations in both COVID outcome years. The directional ordering holds: `Amplify < Diversify ≈ Stabilize < Deep Review`.

## Deck paragraph

> We applied our action label rules to FY2019 national panel data — the last full filing year before COVID — and tracked whether each organization hit financial distress in FY2020 and FY2021. Organizations the engine flagged as **Deep Review** in FY2019 entered the COVID stress event at a **16.6% distress rate**, compared to **4.0%** for **Amplify**-labeled organizations — a **4.1× lift**. The ordering holds consistently across both pandemic years: orgs labeled as needing intervention in 2019 experienced meaningfully worse outcomes in 2020 and 2021 than orgs the engine assessed as financially resilient. This is not a prediction claim — it is a retrospective validation that the engine's labels correspond to real differences in financial vulnerability.

## Limitations and honest caveats

1. **National vs cohort thresholds:** The backtest uses national Q75 benchmarks, not the cohort-specific benchmarks the production engine uses. This makes the backtest labeling a coarser proxy. The actual production engine would likely show sharper discrimination because cohort benchmarks are more precise comparators.

2. **Confidence tier not available:** FY2019 rows have no `checkpoint1_confidence_tier` field. The Deep Review condition for Low confidence cannot be applied. The backtest Deep Review rate (3.2%) is therefore an undercount relative to what the production engine would label as Deep Review for a historical year.

3. **Survival bias:** EINs that stopped filing before FY2019 are not in the panel. Organizations that already closed before 2019 are excluded, which likely understates the true distress signal.

4. **Correlation, not causation:** The label rules are built on the same financial metrics that predict distress. The backtest confirms the rules identify a vulnerable subpopulation but does not prove that labeling causes or prevents distress outcomes.

## Output files

- `outputs/stage4/backtest_results.parquet` — full summary table with distress rates, lift values, and label counts
- This document: `docs/2026-04-13-fairlight-backtest-methodology.md`
