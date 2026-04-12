# Fairlight Opportunity OS

## One-line Thesis

Build a sponsor-native product that helps Fairlight:
- discover overlooked nonprofits worth attention
- prioritize where limited capital and advisory time should go
- recommend the highest-leverage intervention for a specific nonprofit

This combines three ideas into one workflow:
- Hidden Gem Pipeline
- Capital Committee
- Advisory Desk

## Why This Is the Right Direction

The official materials point toward a sponsor-facing decision product, not a generic dashboard and not a purely academic model.

The written problem statement asks for:
- resilience prediction
- peer benchmarking
- funding risk simulation
- high-impact discovery

The judging criteria reward:
- business insight
- usefulness to Fairlight
- clear peer methodology
- simple, transparent, decision-ready outputs

Fairlight's own website and Resilience X-Ray suggest they care about:
- financial resilience
- reserve strength
- fundraising diversity
- staffing stability
- practical intervention decisions

So the right product is not:
- "who has the highest score?"

It is:
- "who deserves Fairlight's attention?"
- "what kind of attention should they receive?"
- "what intervention is most likely to improve resilience?"

## Product Concept

### Core Product Name

`Fairlight Opportunity OS`

### Product Promise

Turn seven years of Form 990 data into a decision engine that tells Fairlight:
- which nonprofits are worth attention
- why they matter
- what risk they carry
- what intervention would help most

## User Journey

The product has three connected layers, not three separate apps.

### 1. Hidden Gem Pipeline

Purpose:
- scan a broad nonprofit universe
- surface nonprofits that are overlooked, promising, fragile, or highly resilient

Main user question:
- "Which organizations should we even look at?"

Outputs:
- ranked nonprofit list
- classification tags
- summary rationale for why each nonprofit surfaced

Example tags:
- Hidden Gem
- Shock Exposed
- Durable Anchor
- Advisory Candidate
- Monitor
- Avoid

### 2. Capital Committee

Purpose:
- prioritize limited resources across surfaced nonprofits

Main user question:
- "If Fairlight can only spend limited attention this quarter, where should we focus?"

This is where scarcity becomes real.

Scarce resources may include:
- donor capital
- advisory bandwidth
- board education time
- relationship capital / introductions

Outputs:
- prioritized short list
- recommended engagement type
- rationale for tradeoffs

Example recommendations:
- fund now
- advise now
- monitor closely
- avoid for now

### 3. Advisory Desk

Purpose:
- open one nonprofit and turn analysis into action

Main user question:
- "What should Fairlight actually do for this nonprofit?"

Outputs:
- peer comparison
- core risk drivers
- funding shock analysis
- intervention scenarios
- recommended next action

Example interventions:
- unrestricted growth capital
- reserve-building recommendation
- donor diversification priority
- reduce concentration risk
- governance / policy support
- no intervention / monitor only

## What Makes This Different

Most teams will likely build one or more of:
- a resilience score
- a peer comparison
- a risk dashboard
- a generic predictive model

This concept is different because it treats Fairlight as a real operator with limited attention, not just a passive observer.

The product does not stop at diagnosis.

It goes:
- discovery
- prioritization
- intervention

That makes it feel like an actual Fairlight operating system.

## Engine Overview

Under the hood, this should be one intelligence engine reused across all three product layers.

### Module 1: Data Foundation

Input sources from hackathon docs:
- IRS Form 990 / 990-EZ
- TEOS status files
- NCCS / Urban standardized variables
- FAC / Single Audit data where available

Base entity:
- one EIN

Time structure:
- rolling 7-year panel per EIN

Key design rule:
- build a clean longitudinal nonprofit record before scoring anything

Core derived tables:
- yearly financial snapshot
- revenue mix by source
- expense structure
- asset / liquidity structure
- peer group assignment
- year-over-year trend features

### Module 2: Peer Group Builder

This is critical because judges explicitly care about peer logic.

Peers should not be "all nonprofits."

Primary peer dimensions:
- mission / subsector
- size
- geography

Possible implementation:
- mission: NTEE category or mission text mapping
- size: expense / revenue bands
- geography: state or region

Goal:
- compare each nonprofit against meaningful peers, not arbitrary averages

### Module 3: Resilience Core

This is the baseline financial durability engine.

Possible dimensions:
- budget health
- emergency reserves
- fundraising diversity
- staffing stability proxy
- operating stage / maturity

Example proxies:
- average operating surplus / deficit
- liquid runway
- revenue concentration
- government grant dependence
- volatility of major revenue streams
- payroll or staffing trend stability

Outputs:
- peer-adjusted resilience score
- resilience tier

### Module 4: Shock Simulator

This is where the product becomes more sponsor-native and more memorable.

Shock events to simulate:
- loss of dominant revenue source
- reduction in government grants
- donor decline
- program revenue decline

Potential outputs:
- post-shock runway
- post-shock resilience tier
- shock elasticity
- distress probability shift

Signature metric:
- `Shock Absorption Months`
  - how many months of runway remain after a defined funding shock

### Module 5: Hidden Gem Detector

This answers the "who deserves attention?" part of the prompt.

A hidden gem is not just a small nonprofit.

Working definition:
- stronger than peers on resilience or efficiency
- not already the most capitalized or obvious organization
- likely to convert new support into durable impact

Signals may include:
- above-peer resilience
- moderate but not excessive reserves
- improving trajectory
- diversified enough to scale
- meaningful resilience lift from additional support

### Module 6: Intervention Recommender

This is the bridge from analytics to Fairlight action.

For each nonprofit, recommend one of:
- Fund
- Advise
- Monitor
- Avoid

Optional sub-recommendations:
- reserve building
- diversify fundraising
- reduce grant concentration
- strengthen liquidity policy
- improve financial planning / governance

The recommendation logic should be interpretable.

Example:
- strong mission + moderate fragility + high lift from donor capital -> Fund
- high concentration + thin reserves + viable underlying model -> Advise
- severe fragility + low intervention lift -> Avoid or Monitor

### Module 7: Attention Allocation Layer

This is the Capital Committee logic.

Fairlight's scarce asset is not just money. It is attention.

So we should optimize:
- where capital should go
- where advisory time should go
- where Fairlight should spend its next unit of strategic attention

Signature concept:
- `Attention Allocation`

This can be more sponsor-native than plain capital allocation.

## Signature Metrics

These should feel intuitive, sponsor-specific, and slightly more original than standard ratios.

### 1. Peer-Adjusted Resilience

How resilient is the nonprofit relative to comparable peers?

### 2. Shock Absorption Months

How much runway remains after a defined funding shock?

### 3. Funding Fragility Score

How risky is the funding stack?

Possible drivers:
- concentration
- volatility
- policy exposure
- government grant dependence

### 4. Intervention Lift Potential

How much stronger could this nonprofit become under a realistic Fairlight-style intervention?

### 5. Hidden Gem Multiplier

How much more resilience or growth can a marginal dollar create here relative to more obvious peers?

### 6. Attention Priority Score

How worthy is this nonprofit of Fairlight's scarce attention right now?

Possible drivers:
- current fragility
- upside if supported
- advisory tractability
- mission / peer context

## Recommendation Logic

At a high level:

### Fund

Use when:
- nonprofit is viable
- shock-exposed but not broken
- likely to convert capital into durable resilience or growth

### Advise

Use when:
- nonprofit has a structurally improvable financial model
- reserve, diversification, or governance issues are the main blockers
- advisory support may matter more than immediate capital

### Monitor

Use when:
- nonprofit is interesting but not urgent
- resilience is acceptable
- no clear high-leverage move yet

### Avoid

Use when:
- fragility is extreme
- intervention lift appears low
- funding alone would likely only delay distress

## Example Product Flow

### Step 1: Pipeline View

Fairlight sees a ranked universe with:
- name
- geography
- mission
- resilience tier
- hidden gem signal
- shock exposure
- recommended next action

### Step 2: Committee View

Fairlight filters to a shortlist and asks:
- If we can only engage 10 nonprofits this quarter, which 10?
- How many should receive donor capital vs advisory support?
- Are there mission or geography tradeoffs?

### Step 3: Advisory Desk

Fairlight opens one nonprofit and sees:
- why it surfaced
- how it compares to peers
- where its risk comes from
- how it behaves under a shock
- what intervention is recommended
- expected resilience lift

## Why This Could Win

### 1. Highly aligned with sponsor context

This feels like a Fairlight operating product, not a student exercise.

### 2. Covers the full written prompt

It naturally includes:
- resilience prediction
- peer benchmarking
- funding risk simulation
- high-impact discovery

### 3. Business insight first

This is a decision product with clear actions, which aligns well with the 40% business-insight weight.

### 4. Strong storytelling

The presentation arc is built in:
- we do not just score nonprofits
- we identify who deserves attention
- we show where attention should go
- we recommend what Fairlight should do next

### 5. Transparent and interpretable

The metrics and recommendations can remain simple enough to defend.

## Risks and Constraints

### 1. Proxy limits

Not all Fairlight concepts are perfectly observable in 990 data.

Examples:
- staffing turnover
- internal governance quality
- exact restriction details on every asset

### 2. Overbuilding

The product should feel ambitious, but the MVP should stay tight.

### 3. Simulation assumptions

Shock and intervention scenarios must be explainable, not arbitrary.

## MVP Recommendation

If time is short, build the smallest version that still expresses the whole concept.

### Must-have
- pipeline list of surfaced nonprofits
- committee-style prioritization with clear labels
- one detailed advisory desk page
- interpretable metrics and one or two shock scenarios

### Nice-to-have
- more advanced optimization
- multi-scenario intervention comparison
- richer portfolio constraints

## Suggested Team Split

### 1. Intelligence / data layer
- peer construction
- resilience metrics
- shock simulation
- recommendation logic

### 2. Product / UX layer
- pipeline experience
- committee prioritization
- advisory desk narrative

### 3. Story / validation layer
- business framing
- Fairlight alignment
- metric justification
- presentation storyline

## Presentation Story Arc

### Slide 1

Fairlight does not just need to know which nonprofits are healthy.
It needs to know where limited capital and advisory attention can create the most durable value.

### Slide 2

Static financial ratios are not enough.
Fairlight needs a workflow:
- discover
- prioritize
- intervene

### Slide 3

Introduce Fairlight Opportunity OS.

### Slide 4

Show Hidden Gem Pipeline.

### Slide 5

Show Capital Committee prioritization.

### Slide 6

Show one nonprofit in Advisory Desk.

### Slide 7

Walk through a funding shock and intervention recommendation.

### Slide 8

End with business value:
- better donor targeting
- better advisory triage
- more transparent nonprofit decision-making

## Bottom-line Positioning

This is not a dashboard.

This is a sponsor-native decision engine for allocating capital, advisory bandwidth, and strategic attention across nonprofits.

## Current Recommendation

If we pursue this concept, the product should be framed as:

`Fairlight Opportunity OS: a hidden-gem discovery, capital-prioritization, and intervention recommendation engine for nonprofit resilience.`
