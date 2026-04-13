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

### Primary cohort dimensions

- revenue size bucket
- state
- NTEE major category when available

Recommended size buckets:

- under `500K`
- `500K-2M`
- `2M-10M`
- above `10M`

### How NTEE should be treated

NTEE is a **cohort-strengthener, not a hard eligibility gate**.

- If NTEE is present and the cohort is large enough, use `NTEE major category + size bucket + state`
- If NTEE is missing, still score the nonprofit using a broader fallback cohort
- If NTEE is present but the cohort is too sparse, pool upward and lower confidence

The right mental model is: NTEE works like an optional booster for peer comparability. It sharpens the benchmark when available, but the system should still function without it.

### Fallback logic

Use this order:

1. `NTEE major category + size bucket + state`
2. `size bucket + state + filing type`, if filing type helps stabilize the cohort
3. `size bucket + state`

Rules:

- benchmark on medians and percentile bands, not means
- if cohorts are too small, relax carefully and flag lower confidence
- peer logic must be explainable in one slide
- for the live demo, prioritize examples with strong cohort confidence

## Resilient Peer Benchmark

Do not use arbitrary thresholds as the core benchmark.

Within each peer cohort, define the resilient reference set as organizations in the top quartile on:

- operating runway
- operating margin
- revenue diversification

Require that profile to appear consistently across at least `5 of 7 years`.

That benchmark becomes the anchor. Then measure each nonprofit's **resilience gap** from that benchmark using normalized feature distance across those same dimensions.

Use this internally as the technical logic. On slides, explain it in plain English.

### Benchmark fallback hierarchy

The strict benchmark rule is the default, not the only rule.

Use this fallback order:

1. top quartile on all `3` benchmark metrics for `5 of 7` years
2. if fewer than `5` resilient reference organizations remain, relax to top quartile on **any `2 of 3`** benchmark metrics for `5 of 7` years
3. if still fewer than `5`, relax to all `3` benchmark metrics for `4 of 7` years
4. if still too sparse, pool to the next-broader cohort and downgrade confidence

This must be documented in the code, notebook, and presentation so the benchmark never looks hand-wavy.

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

### Explicit mapping rule

The team should not leave recommendation mapping implicit.

Start with this rule set:

- **Amplify** = top-quartile resilience profile within cohort, stable or improving trend, and no severe stress-test failure
- **Stabilize** = below benchmark, but positive recovery analog evidence and a fixable financial profile
- **Diversify** = acceptable current operating health, but elevated concentration risk or stress-test sensitivity
- **Deep Review** = structurally weak profile, very low confidence, or no clear near-term intervention path

Tune thresholds as the team tests the model, but keep the mapping rule explicit from day one.

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

## Implementation Stages

The build should happen in **staged parallel development**, not in one shared stream from the start.

The point is not to split the project into unrelated pieces too early. The point is to let Amal, Saurav, and Vedant each build a serious version of the same core engine up to a controlled comparison stage, then select or merge the best parts with evidence.

### Stage 0: Lock shared rules before anyone builds

All three builders must align on the non-negotiables:

- same filtered dataset
- same CA + WA scope
- same `submitted_on is null` rule
- same `ein + fiscal_year` dedupe rule
- same size buckets
- same benchmark metrics
- same fallback hierarchy for resilient reference cohorts
- same confidence-tier definition
- same action-label definition
- same output contract for portfolio view and memo

This stage exists to prevent fake disagreements caused by inconsistent preprocessing.

### Stage 1: Parallel independent builds

Each person builds on their own branch or worktree.

Up to the comparison checkpoint, every person should implement the same minimum core:

1. cleaned working panel
2. peer-cohort assignment
3. resilient benchmark / resilience-gap logic
4. funding stress-test logic
5. recovery-analog retrieval
6. recommendation mapping
7. one portfolio view and one memo output

Everyone can make different design choices inside that boundary:

- different benchmark implementations
- different fallback logic details
- different memo formatting
- different visualization choices
- different recommendation calibration

But everyone must produce the same category of deliverable so the solutions can be compared fairly.

### Stage 2: Controlled comparison checkpoint

Do not merge to main yet.

At the checkpoint, compare all versions on the same criteria:

- methodological defensibility
- sponsor fit
- peer-comparability quality
- interpretability
- recovery-analog usefulness
- demo clarity
- implementation stability

Use the same sample nonprofits and the same cohort cells when comparing outputs.

### Stage 3: Winner-or-merge decision

There are two acceptable outcomes:

1. **Single-winner path**  
   One version is clearly stronger overall. Promote that implementation to the integration branch.

2. **Best-of-all-worlds path**  
   One version has the best benchmark logic, another has the best memo output, and another has the strongest stress-test or analog retrieval. In that case, merge the strongest components into one final integration branch.

This stage should be evidence-based, not ego-based.

### Stage 4: Final integration branch

Once the winner or merged architecture is chosen:

- create one integration branch
- port in the chosen benchmark logic
- port in the chosen stress-test logic
- port in the chosen analog logic
- port in the chosen memo / portfolio presentation layer
- standardize naming and outputs
- remove redundant code paths

Only after this integration pass should the team prepare the final merge to main.

### Stage 5: Main branch freeze for presentation

Main should represent the final judged system, not an experimental playground.

Before merging to main:

- validate that outputs are reproducible
- confirm the same sample nonprofits appear correctly in deck and demo
- confirm recommendation labels match the documented logic
- confirm low-confidence cases are handled consistently
- confirm the presentation language matches the product language

## What each builder should optimize for

### Amal

- strongest sponsor framing
- strongest memo output
- strongest presentation-ready recommendation logic

### Saurav

- strongest data pipeline and cohort quality
- strongest benchmark implementation
- strongest strategy-validation evidence

### Vedant

- strongest financial logic
- strongest stress-test framing
- strongest recovery / intervention logic

This is not about locking people into silos forever. It is about making comparison more useful when the branches come back together.

## Recovery Analogs Guardrails

Recovery analogs are a centerpiece feature, but only if they are believable.

Rules:

- analogs must come from the same or pooled-compatible peer cohort
- analogs should reflect the same primary constraint where possible
- analogs should be used as evidence of observed paths, not proof of future success
- if analog quality is weak, show fewer analogs rather than weaker analogs

## Confidence Tiers

Use explicit rules:

- **High** = `6-7` years present and fewer than `20%` missing key fields
- **Medium** = `4-5` years present
- **Low** = `3 or fewer` years present, or more than `20%` missing key fields

Low-confidence cases should still be reviewable, but they should never look as certain as high-confidence cases.

## Urgency Flag

Keep urgency separate from the action label.

Default trigger:

- urgent if **shock absorption months < 3** and **current-year operating margin is negative**

That rule can be refined later, but it should be explicit from the first implementation.

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
