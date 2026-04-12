# Fairlight Final Strategy

## Core Thesis

We are building a plain-English advisory decision system for Fairlight that answers one question:

**Where can intervention still change the curve?**

This is not a nonprofit ranking, not a generic dashboard, and not a black-box prediction model. It is a peer-benchmarked way to identify which nonprofits are financially resilient, which are fragile but recoverable, which are overly exposed to funding concentration, and where Fairlight should act first.

## The Real Fairlight Decision

Fairlight is not trying to decide which nonprofits are "best."

Fairlight is trying to decide:

- where to spend limited advisory time
- where bridge support or unrestricted capital could realistically help
- which organizations need diversification or reserve-building
- which cases need a deeper diagnostic review before any recommendation

That is the business problem.

## Product Definition

The product has two outputs:

1. A **portfolio view** for Fairlight to scan California and Washington nonprofits by peer group, resilience gap, stress sensitivity, and recommended action.
2. A **Capital Stewardship Memo** for one nonprofit at a time, written like an advisory brief rather than a dashboard card.

## Analytical Architecture

Use one transparent, rule-based stack:

1. **Peer benchmark**
   Compare each nonprofit only to similar peers.
2. **Resilience gap**
   Measure how far a nonprofit sits from the benchmark set of financially resilient peers.
3. **Funding stress test**
   Estimate what happens if a major revenue source weakens.
4. **Recovery analogs**
   Show whether similar organizations have historically improved after fixing a similar constraint.

That is enough. Do not add clustering, fancy state models, or black-box ML unless everything above is already working.

## Scope And Unit Of Analysis

- Geography: **California + Washington only**
- Structure: **7-year EIN-year panel**
- One row per nonprofit per year
- Mixed filing quality and missingness expected
- Keep a filing-type flag and a confidence flag

## Peer Cohort Logic

Primary cohort:

- broad NTEE sector
- revenue size bucket
- state

Recommended size buckets:

- under `500K`
- `500K-2M`
- `2M-10M`
- above `10M`

Rules:

- benchmark on medians and percentile bands, not means
- if cohorts are too small, relax carefully and flag lower confidence
- peer logic must be explainable in one slide

## Resilient Peer Benchmark

Do not use arbitrary thresholds as the core benchmark.

Within each peer cohort, define the resilient reference set as organizations in the top quartile on:

- operating runway
- operating margin
- revenue diversification

Require that profile to appear consistently across at least `5 of 7 years`.

That benchmark becomes the anchor. Then measure each nonprofit's **resilience gap** from that benchmark using normalized feature distance across those same dimensions.

Use this internally as the technical logic. On slides, explain it in plain English.

## Metrics To Keep

Core metrics:

- operating runway proxy
- operating margin
- margin trend
- revenue diversification index
- government dependency ratio
- government dependency trend
- shock absorption months
- post-shock deficit / burn
- stress persistence across years
- recovery velocity after weak years
- confidence tier based on filing completeness
- recovery analog count

Helpful summary metrics:

- reserve buffer
- margin buffer
- funding concentration risk

## Metrics And Terms To Cut Or Demote

Do not use these as headline language:

- distance to durability
- durable zone
- durability frontier
- unlockability
- hidden gem
- advisability
- cliff risk as the main product frame
- government dependency cliff score as a public label
- donation leverage
- any single weighted super-score

The logic behind some of these can survive. The terminology should not.

## Recommendation Logic

Use four action labels:

- **Amplify**
- **Stabilize**
- **Diversify**
- **Deep Review**

Interpretation:

- **Amplify**: financially resilient relative to peers, healthy under stress, under-scaled or growing from strength
- **Stabilize**: below benchmark but recoverable, with credible analogs and a fixable financial profile
- **Diversify**: operationally okay but overly concentrated in one funding source or revenue stream
- **Deep Review**: structurally weak, low-confidence data, or no clear near-term intervention path

Add an **urgency flag** if needed, but keep it separate from the action label.

## Government Funding Framing

Do not present government funding as inherently bad.

Present it this way:

- concentration risk can come from multiple revenue sources
- in the 2025 context, government dependency is the most vivid current example
- therefore government dependency trend is one important component of funding concentration risk, not the entire framework

That keeps the analytical logic honest while preserving the emotional relevance of the story.

## Capital Stewardship Memo

Each memo should show:

- organization name and peer cohort
- confidence level
- benchmark position vs peers
- resilience gap
- 7-year trend
- biggest financial constraint
- funding concentration profile
- shock absorption months
- one stress-test scenario
- one or two recovery analogs
- final Fairlight recommendation
- one plain-English explanation of why

## Internal Vs External Version

### Internal Fairlight Version

- full metrics
- action label
- confidence flag
- peer cohort details
- recovery analogs
- full recommendation logic

### External / Nonprofit-Facing Version

- softer language
- no blunt classification label if avoidable
- emphasize observed patterns, strengths, and watchpoints
- keep it consultative, not judgmental

Same engine, different presentation layer.

## Validation Plan

Use a restrained validation story:

- rolling backtest within the panel
- pre-COVID window preferred for the main demonstration
- treat later years as a secondary stress check
- validate deterioration / resilience patterns within available data
- do not claim causal proof or future certainty

What we can claim:

- the framework detects financial resilience, concentration risk, stress sensitivity, and approximate recoverability

What we cannot claim:

- true social impact
- donor-level concentration unless directly observed
- causal proof that advisory intervention will succeed
- exact prediction of future outcomes

## Presentation Language

### Use

- peer benchmark
- resilience gap
- financial resilience
- stress sensitivity
- funding concentration risk
- shock absorption months
- recovery analogs
- recoverability
- intervention priority
- Capital Stewardship Memo

### Avoid

- startup-style invented labels
- "best nonprofits"
- "most impactful"
- "save"
- "we know what donation will work"
- jargon that would sound silly in a credit memo

## Judge Framing

### For Naik

Lead with:

- segmentation
- comparability
- benchmark definition
- observable analogs
- rule-based interpretability

### For Jyothika

Lead with:

- a crisp 90-second workflow
- sponsor-ready outputs
- low jargon
- a demo that feels usable immediately

## 90-Second Demo Path

1. Open with the business problem:
   Fairlight has limited time and limited capital, and needs to know where intervention still matters.
2. Show the portfolio view:
   nonprofits grouped by peer benchmark, resilience gap, and recommendation.
3. Click one nonprofit:
   show peer cohort, resilience gap, 7-year trend, and main constraint.
4. Run the stress test:
   show what happens if a major revenue source weakens.
5. Show one recovery analog:
   a similar organization that improved after solving a similar issue.
6. End on the memo:
   recommendation, rationale, and what Fairlight should do next.

## Final Recommendation

Lock the concept now.

The final approach is a **peer-benchmarked advisory decision system** built around:

- comparable peer cohorts
- a resilient peer benchmark
- a plain-English resilience gap
- stress testing
- recovery analogs
- a board-ready Capital Stewardship Memo
- four sponsor-native actions: Amplify, Stabilize, Diversify, Deep Review

This is the cleanest, most defensible, and most sponsor-native version of everything explored so far. The novelty should come from the decision logic, not the terminology.
