# Decision Lab Complete Rehaul Design

## Purpose

Redesign `Decision Lab` so it feels like a consultant-grade case room rather than a prose-heavy AI dashboard.

The new lab should optimize for:

- comparative judgment first
- historical story second
- recommendation third

This means the page should help a Fairlight advisor answer:

1. Where does this case stand right now?
2. What evidence explains that position?
3. What would change the recommendation?
4. Only after that, what should we recommend?

## Design Guardrail

This redesign must inherit the Northstar design language documented in:

- `docs/superpowers/specs/2026-04-13-northstar-design-language.md`

That means:

- same warm-neutral palette
- same premium but readable typography
- same soft-shell container language
- same anti-jargon discipline
- same restrained use of semantic color
- same rule that visuals should interpret rather than overwhelm

The `Decision Lab` may become denser than the inbox, but it must still feel like the same product.

## Product Positioning

The current `Decision Lab` misses the mark because it behaves like a textual explanation layer.

The redesigned `Decision Lab` should behave like:

- an investment-committee case room
- an advisor evidence board
- a visual judgment surface

It should not behave like:

- a sequence of AI summary cards
- a generic analytics dashboard
- a prose-first readout

## Experience Model

When a consultant clicks `Open X-Ray`, the lab should immediately show a strong judgment-oriented visual hierarchy.

The page should feel like:

- top: current case position
- middle: evidence and trajectories
- lower: proof and scenarios
- bottom or collapsed region: recommendation mechanics

The user should not need to read a paragraph before understanding the case.

## Page Structure

### 1. Header Band

This remains concise and premium.

Include:

- organization name
- state
- category
- filing coverage summary
- return path to inbox
- `Prepare recommendation` action

This is not the main analysis zone. It is the setup frame.

### 2. Case Position Strip

This is the first analytical surface the consultant sees.

It should answer:

- what is the current position of this case?

Recommended elements:

- `Northstar Score`
- `Risk next year`
- `Portfolio baseline`
- `Action`
- one plain-English status marker such as:
  - `Strong`
  - `Mixed`
  - `Fragile`

Rules:

- mostly numeric
- very little prose
- visually tight and easy to scan
- should feel more like a decision strip than a card cluster

### 3. Primary Evidence Row

This is the highest-value part of the page.

#### Left: Peer Position

Purpose:

- show where this organization sits relative to peers right now

Recommended visual:

- a benchmark comparison panel using compact bars, dots, or bullet-style comparisons

Show:

- operating margin versus peer benchmark
- revenue mix versus peer benchmark
- risk versus portfolio baseline

Optional:

- percentile-like labeling if we can compute it defensibly

Why this matters:

- the consultant immediately understands whether the case is above, at, or below fair comparison norms

#### Right: Financial Trajectory

Purpose:

- show how the organization evolved over time

Recommended visual:

- a multi-series line chart over filing years

Series:

- revenue
- expenses
- net assets

Why this matters:

- it explains the financial story without text
- it turns the case from static snapshot into business narrative

## 4. Secondary Evidence Row

This row explains the case shape over time.

### Left: Operating Quality Over Time

Purpose:

- show whether operating performance is stable, improving, or deteriorating

Recommended visual:

- operating margin line over time
- peer benchmark overlay or band where possible

Why this matters:

- more diagnostic than a single-year metric
- supports comparative judgment and historical story simultaneously

### Right: Revenue Composition Over Time

Purpose:

- show how dependent the organization is on different revenue streams

Recommended visual:

- stacked area or stacked bars by year

Series:

- contributions
- program revenue
- investment income
- other revenue

Why this matters:

- this is one of the strongest underused assets in the current data
- much better than a single abstract diversification number

## 5. Interpretation Row

This row should make the judgment defensible.

### Left: Northstar Score Drivers

Purpose:

- explain the score visually

Recommended visual:

- contribution bars or segmented driver strip

Drivers to show:

- distress protection
- operating margin strength
- revenue mix strength
- evidence quality

Rules:

- not a paragraph
- no formula dump in the main panel
- clear visual sense of what is helping vs hurting

### Right: Recovery Analogs

Purpose:

- prove that the recommendation has historical precedent

Recommended visual:

- analog mini-cards with before/after movement
- small slope or delta visual

Show:

- analog organization name
- state
- matched metric
- pre value
- post value
- recovery window

Why this matters:

- this is one of the most distinctive pieces of evidence we have
- it separates Northstar from generic analytics tools

## 6. Expandable Recommendation Region

This should remain collapsed by default.

Expansion reveals:

- scenario cards
- recommendation rationale
- caveats
- intervention type
- decision composer or funding-decision launch

Why:

- recommendation text is important, but it should not dominate the first read
- the consultant should earn the narrative by first seeing the evidence

## Data We Can Defensibly Use

### Current Snapshot Signals

From current app dataset:

- `actionLabel`
- `distress.probability`
- `distress.baseline`
- `operatingMargin`
- `revenueDiversificationIndex`
- `confidenceTier`
- analogs
- scenario cards

### Historical Signals

From `panel_990_extended_v4.parquet`:

- revenue by year
- expenses by year
- net assets by year
- liquid reserve components
- revenue-source composition by year
- filing depth by year

### Coverage Strength

For the shortlisted set:

- revenue: effectively complete
- expenses: effectively complete
- net assets: effectively complete
- operating margin: defensible and complete
- revenue composition: strong enough for visual history
- analog coverage: strong
- scenario coverage: complete

### Signals to Avoid as Hero Visuals

- raw runway duration
- unstable or mostly unavailable stress metrics as the first panel
- long AI-generated narrative summaries

These may still appear in secondary or expanded sections, but should not define the page.

## Content Rules

### Text Minimization

The redesigned lab should be chart-first.

Rules:

- use text only where it sharpens interpretation
- prose should be short and high-value
- every chart should have a clear title and one sharp implication line
- paragraphs should not carry the main analytical burden

### Labeling

All labels must stay in plain English.

Examples:

- `Risk next year`
- `Operating quality`
- `Revenue composition`
- `Peer position`
- `Northstar Score drivers`

Avoid:

- internal feature names
- benchmark jargon
- model language leaking into the UI

## Motion Rules

Motion must remain subtle.

Allowed:

- gentle load-in of major panels
- quiet expand/collapse for recommendation region
- hover emphasis on interactive evidence elements

Avoid:

- animated chart theatrics
- reflow-heavy transitions
- decorative motion that competes with reading

## Visual Rules

### Charts

Charts should look premium, not default library output.

Rules:

- clean axis treatment
- few gridlines
- high signal contrast
- restrained annotations
- muted palette with one green accent and measured supporting tones

### Panels

Panels should not all look identical.

Use hierarchy through:

- size
- density
- prominence

The hero evidence row should feel clearly more important than the lower sections.

## Recommended Implementation Sequence

1. Rebuild the `DecisionLab` structure and hierarchy
2. Add historical data loading for selected organization
3. Build the financial trajectory chart
4. Build the peer-position panel
5. Build operating-margin history
6. Build revenue composition history
7. Build score-driver breakdown
8. Rework analogs visually
9. Collapse recommendation into expandable lower section
10. Final polish and copy reduction

## Success Criteria

The redesign succeeds if a consultant can open the lab and, within seconds, understand:

- whether the case is attractive or concerning
- how it has evolved over time
- how it compares to relevant norms
- what evidence supports the eventual recommendation

And if the page feels:

- premium
- evidence-driven
- defensible
- not like AI slop

