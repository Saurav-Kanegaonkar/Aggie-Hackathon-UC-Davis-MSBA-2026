# Northstar Design Language

## Purpose

This document captures the design rules established in the `Northstar` inbox work so the `Decision Lab` can be rebuilt in the same product language rather than drifting into a different UI system.

The goal is continuity:

- the inbox and lab should feel like two stages of the same product
- the app should feel premium without becoming abstract or hard to read
- visual polish should always support consultant trust and interpretability

## Core Product Feeling

Northstar should feel:

- premium
- calm
- editorial
- advisor-facing
- readable at first glance

Northstar should not feel:

- like a generic SaaS dashboard
- like an AI-generated card wall
- like a technical analytics console
- flashy for the sake of flashy
- overly decorative at the cost of legibility

## Design Principles

### 1. Readability Beats Cleverness

Every screen should be immediately understandable to a Fairlight consultant.

Rules:

- prefer plain English over internal jargon
- do not expose model-thinking language in the UI
- do not repeat visible tile values in nearby prose
- summaries should interpret, not restate
- if a label sounds clever but not instantly clear, rewrite it

Examples:

- say `Cases for Review`, not an internal workflow label
- say `Risk next year`, not a model-specific risk name
- say `Operating margin`, not a benchmark-gap phrase

### 2. Premium, But Not Precious

The interface should feel expensive and intentional, but never delicate or hard to use.

Rules:

- large typography is good when hierarchy is clear
- spacing should feel controlled, not empty
- subtle texture is allowed only when it stays behind content
- surfaces should feel layered and soft, not loud
- motion should feel elegant, not animated for its own sake

### 3. Consultant Logic Over Data Exhaust

The first screen is for triage and trust, not complete analysis.

Rules:

- show only metrics that are stable, interpretable, and present for all rows
- hide metrics that are noisy, incomplete, or too easy to misread
- advisory notes should synthesize metrics into judgment
- deep diagnostics belong in the lab, not in the inbox

## Typography Rules

### Product Title

`Northstar` is the hero mark of the app.

Rules:

- use the display face, not the body face
- keep the title visually dominant
- title should feel like a product wordmark, not a page heading
- heavy weight and tight tracking are fine for the title itself

### Section Titles

Section titles should be readable and premium, but not as tight as the wordmark.

Rules:

- maintain strong hierarchy
- avoid overly compressed tracking on multi-word headings
- for example, `Cases for Review` should breathe slightly

### Labels

Small labels should be:

- uppercase
- lightly tracked
- calm in tone
- secondary to values

They should never overpower the content they label.

## Color Rules

### Base Palette

The palette is warm-neutral with a restrained green accent.

Rules:

- background stays warm and light
- dark text should remain deep navy/ink, not pure black
- green is the primary accent
- color should be used sparingly and with intent

### Score Color

`Northstar Score` is the only metric tile that should carry strong semantic color.

Rules:

- green for strong
- amber for mixed
- red for weak
- the tone should stay muted and premium, never saturated

### Texture and Atmosphere

Texture is allowed only as a background atmosphere layer.

Rules:

- it must sit behind the app, never on top of cards or tiles
- it should feel intentional and compositional
- it should not reduce readability
- it must be easy to remove independently of the layout

The current approved experiment is a subtle halftone-inspired background treatment, isolated to the global background layer.

## Layout Rules

### General

Rules:

- use broad rounded containers
- preserve large outer shells with softer inner surfaces
- keep the page centered in a wide but controlled frame
- each area should feel composed, not mathematically packed

### Inbox Row Structure

The inbox row is a compact advisor review strip.

Rules:

- organization identity lives on the left
- key metrics stay in one top strip
- `Northstar Score` and `Open X-Ray` stay in that top strip
- supporting interpretation sits beneath in a quieter note area
- action stays secondary, not louder than the score

### Header Summary Tiles

The top-right summary tiles are supporting portfolio context, not the main event.

Rules:

- keep them compact
- keep them visually quieter than the hero title
- they may reveal extra explanation, but must never feel gimmicky
- any detail affordance should stay inside the tile

## Interaction Rules

### Clickability

Anything clickable should feel clickable.

Rules:

- clickable items use the hand cursor
- buttons should have consistent hover behavior
- avoid inconsistent animation patterns across filters and controls

### Motion

Motion should be present only when it improves perception.

Rules:

- no warping, bouncing, or surprising layout movement
- filter interactions should feel stable
- hover states should be light and controlled
- if a motion pattern becomes noticeable before it becomes useful, remove it

### Tooltips

Tooltips should be:

- single-source only
- short
- legible
- non-overlapping

Avoid native browser tooltips if a custom tooltip is already present.

## Content Rules

### Metrics

Metrics on the inbox must satisfy all of the following:

- already in our data
- interpretable to a consultant
- available for every shortlisted organization
- appropriate for first-screen comparison

Current approved inbox metrics:

- Revenue
- Operating margin
- Revenue mix
- Risk next year
- Northstar Score

Metrics rejected from the inbox:

- raw runway duration
- largest source percentage
- confidence as a primary displayed metric

These may still exist elsewhere in the product where context is richer.

### Advisory Note

The note should read like consultant judgment.

Rules:

- begin with filing-history grounding when helpful
- use the visible metrics as evidence
- avoid copying the metric values verbatim unless needed
- translate numbers into business interpretation
- state what the case means for a funding or advisory decision

Bad note pattern:

- repeating every tile in sentence form

Good note pattern:

- using the filing-history depth plus a few interpreted signals to explain why the case should move forward, pause, or be reviewed more deeply

## Northstar Score Rules

`Northstar Score` is a fundability score, not just a risk score.

Current logic:

- combines forward distress risk with operating quality, revenue mix, and evidence quality
- uses caps so high-risk cases cannot still look artificially strong

Presentation rules:

- score tile is visually emphasized
- score should sit in the main metric strip
- tooltip may explain how it is built
- the score should feel important, but not mysterious

## What Decision Lab Must Inherit

The `Decision Lab` is a different screen, but it should inherit these same rules:

- same warm-neutral palette
- same typography hierarchy
- same rounded shell language
- same premium but readable spacing
- same anti-jargon discipline
- same emphasis on consultant interpretation over raw model phrasing
- same restrained use of semantic color
- same rule that texture stays behind content

What can change in the lab:

- denser information hierarchy
- deeper explanations
- more evidence panels
- time-series and scenario views
- more explicit numbers where they improve trust

What must not change:

- readability
- tone
- product identity
- sense that this is one coherent advisor workflow

## Decision Lab Rehaul Guidance

When redesigning `Decision Lab`, use this filter:

1. Is this element easier to understand than the inbox equivalent, not just more detailed?
2. Does it interpret evidence, rather than dumping it?
3. Does it still feel like Northstar?
4. Would a Fairlight consultant feel more confident presenting this to a board?

If any answer is no, the design should be revised.

