# Fairlight Resilience Hybrid

## Summary

Build a Fairlight-native nonprofit resilience framework instead of a generic "best nonprofit" model.

The core idea is to combine:
- a Fairlight-style resilience screen
- shock simulations
- donor/advisor action labels
- memorable nonprofit archetypes for storytelling

This should help us score well on business insights and storytelling while still being analytically grounded.

## Why This Angle

The judging weights favor business insight and storytelling more than technical sophistication.

Fairlight also appears to care about resilience, donor usefulness, and advisory triage more than a purely academic prediction task.

So the project should answer:
- Is this nonprofit resilient?
- What is driving its fragility or strength?
- What happens under a funding shock?
- Where would additional capital actually matter?
- Is this a donor opportunity, advisory opportunity, or danger zone?

## Base Framework

Translate Fairlight's own resilience questions into data proxies:
- organizational stage
- budget health
- emergency reserves
- fundraising diversification
- staffing stability

Then extend that with custom metrics that feel more original and decision-ready.

## Candidate Custom Metrics

### 1. Shock Absorption Months

How many months of runway remain after removing the largest funding source.

Possible sketch:
- baseline runway = available liquid assets / average monthly expenses
- post-shock runway = adjusted liquid assets or net coverage after removing largest revenue source

## 2. Funding Fragility Score

Measure how risky the funding stack is based on:
- revenue concentration
- reliance on one source
- government grant dependence
- volatility in major funding categories

## 3. Growth Readiness Score

Estimate whether a nonprofit could productively absorb new funding.

Possible components:
- reserve cushion
- revenue stability
- staffing stability proxy
- evidence of recent healthy growth
- manageable cost structure

## 4. Tipping Point Distance

Estimate how close the nonprofit is to becoming financially stressed.

Possible components:
- recurring deficits
- thin reserves
- concentrated funding
- high fixed-cost burden

## 5. Donation Leverage Score

Estimate whether extra donor capital would create durable resilience instead of just delaying distress.

Key idea:
- some nonprofits are already robust and do not gain much marginal resilience
- some are too distressed and extra funding may not fix the structure
- the best opportunity may be the nonprofits that are viable but exposed

## Government Grant Risk Idea

Treat government grants as a special risk dimension when they dominate total revenue.

Working hypothesis:
- diversified private support is more resilient than heavy dependence on unstable government funding
- government reliance becomes especially dangerous when paired with low reserves and rigid costs

This should be framed carefully as concentration and policy risk, not as "government funding is always bad."

## Possible Archetypes

These would help with storytelling:
- Grant-Rich but Brittle
- Donor-Diverse Grower
- Stable but Stagnant
- Mission Strong, Cash Thin
- One Shock Away
- Quietly Resilient

## Possible End Outputs

For each nonprofit, produce:
- resilience tier
- top risk drivers
- peer-relative position
- shock test result
- recommended action label

Possible action labels:
- strong donor stewardship candidate
- growth opportunity
- advisory opportunity
- high-risk / caution

## Why This Could Win

This feels more sponsor-specific than a generic model.

It aligns with:
- Fairlight's own resilience framing
- the hackathon prompt around resilience, peer benchmarking, and funding shocks
- the judges' emphasis on business insight and creativity

It also gives us a strong presentation arc:
- current health is not enough
- resilience under stress matters more
- the best donation targets are not always the biggest or the weakest

## Risks / Caveats

- We need to avoid hand-wavy simulations.
- Some Fairlight questions, especially staffing stability, may only have weak proxies in 990 data.
- We should keep the framework interpretable and not over-engineer it.

## What To Validate Once Data Arrives

- Whether we can identify funding categories cleanly enough
- Whether we have enough asset/liquidity fields for runway
- Whether staffing proxies exist in a usable form
- Whether peer groups can be formed by mission / organization type
- Whether we can compute shock scenarios consistently across filings

## Current Recommendation

Use a hybrid approach:
- base layer: Fairlight Resilience X-Ray translation
- differentiator: shock simulation
- storytelling layer: nonprofit archetypes

This is probably stronger than choosing only a generic ML model or only a dashboard.

## Assumption

This note captures Amal's current idea based on team discussion so far:
"A nonprofit's current health matters less than its behavior under stress and its ability to turn new capital into resilience."
