# Fairlight Deck Outline

**Format:** ~14 slides. Amal owns narrative polish and final copy.
**Audience split:** Naik (methodology, defensibility) | Jyothika (usability, sponsor fit)
**Primary arc:** Problem → Engine → Validation → Demo → Trust

---

## Section 1: Setup (slides 1–3)

### Slide 1 — Hook
- Lead with the current context: federal funding cuts, nonprofit sector under stress
- One stat: number of CA+WA nonprofits at risk (surface from our data — urgency count or Deep Review count)
- One question: "Fairlight has limited advisory bandwidth. Where should they act first?"
- *Naik:* sets up the business problem. *Jyothika:* emotionally relevant opener.

### Slide 2 — What Fairlight does and what they need
- Fairlight's X-Ray Assessment: a manual org-by-org financial health review
- The gap: 67,406 nonprofits in CA+WA. Manual review doesn't scale.
- The ask: automated, defensible, advisor-native assessment + forward-looking signal
- Keep this tight — one slide, no bullets > 10 words

### Slide 3 — Our solution in one sentence
- **"We automated Fairlight's X-Ray Assessment and added forward-looking distress prediction."**
- Three-layer summary: rules engine (recommendation) + ML model (distress foresight) + advisor UX (trust)
- Do not show architecture detail here — that's slide 5

---

## Section 2: How it works (slides 4–6)

### Slide 4 — Data and scope
- National 990 panel: 3.8M rows, FY2007–2026, 476K unique EINs
- Scored population: 67,406 CA+WA nonprofits across FY2023–2024
- One visual: funnel from national panel → CA+WA scored rows → shortlist inbox
- *Naik anchor:* establishes data scale and scope before methodology

### Slide 5 — The engine: four analytical layers
- **Peer benchmark:** cohort Q75 from similar-size, same-sector, same-state orgs
- **Resilience gap:** how far each org sits from its resilient peer reference set
- **Stress test:** what happens if the largest revenue source weakens 25% or 50%
- **Recovery analogs:** orgs in the same cohort that recovered from a comparable position
- Visual: four-step pipeline, left to right
- Key message: rule-based, interpretable, each layer explainable in one sentence
- *Naik anchor:* benchmark definition, comparability, observable analogs

### Slide 6 — Action labels and distribution
- Four labels: Amplify (3.4%) | Diversify (12.3%) | Stabilize (51.3%) | Deep Review (33.1%)
- One-line definition per label — no prose, just the rule logic in plain English
- Urgency flag shown as a separate overlay (orthogonal to label)
- *Jyothika anchor:* sponsor-native labels, advisor can explain any of these to a client in 10 seconds

---

## Section 3: Validation (slides 7–8)

### Slide 7 — Rule engine backtest: did the labels predict COVID-era outcomes?
- Method: applied label rules to FY2019 national panel data (pre-COVID), tracked FY2020–2021 outcomes
- **Chart:** distress rate by label, two grouped bars (2020, 2021), four label groups
- **Headline stat:** Deep Review orgs hit 16.6% distress rate in FY2020 vs 4.0% for Amplify — 4.1× lift
- One caveat sentence: "national quartile proxy, not full cohort engine — directional validation only"
- *Naik anchor:* empirical validation, COVID as natural stress test, honest methodology caveats
- **This is the methodology credibility slide. Give it room.**

### Slide 8 — Distress risk model
- *[Amal fills this slide when model is ready]*
- Target: urgency flag fires at T+1 (shock absorption < 3 months AND margin < 0)
- Train on raw panel FY2014–2020, test on FY2021–2023 (time-based split)
- Key metrics: AUC, precision/recall, feature importance top 5
- UI output: "High distress risk (67% vs 8% baseline)"
- One-sentence lift statement: "High-risk orgs hit distress at Nx the rate of low-risk orgs in the test window"
- Slot for: feature importance chart OR precision-recall curve (one asset, Amal's call)

---

## Section 4: Demo (slides 9–12)

### Slide 9 — Product overview: guided advisor decision support
- Three views, one sentence each: Portfolio Inbox → Decision Lab → Funding Decision
- Product principle: "The machine narrows and simulates. The advisor decides."
- Screenshot or mockup of Portfolio Inbox as the visual anchor
- *Jyothika anchor:* usable immediately, advisor stays in control

### Slide 10 — Demo: Portfolio Inbox
- *[Live demo or screenshot sequence]*
- What the advisor sees: org name, label (color-coded), urgency badge, distress risk tier, trend direction
- Sorting: by urgency, then distress risk
- Click row → goes to Decision Lab
- *Demo beat:* "Here are the 15 orgs Fairlight should look at this quarter."

### Slide 11 — Demo: Decision Lab (the hero view)
- *[Live demo or screenshot sequence]*
- Sections: peer benchmark | resilience profile | stress test | recovery analogs | distress risk | action label
- Highlight the analog evidence: name of peer org, state, pre/post metric values
- Highlight the scenario card: reserve injection → label changes from Stabilize to Amplify
- *Demo beat:* "Fairlight can see things this org wouldn't see about itself."

### Slide 12 — Demo: Funding Decision
- *[Live demo or screenshot sequence]*
- Selected orgs, recommended engagement type per label, rationale, export
- *Demo beat:* "The advisor makes the final call. This is what they hand to the board."

---

## Section 5: Close (slides 13–14)

### Slide 13 — Why this is trustworthy
- **Interpretable:** every label traces to an explicit rule, not a black box
- **Validated:** 4.1× lift on COVID outcomes confirms the engine identifies real vulnerability
- **Human-in-the-loop:** advisor makes the final funding call, machine supports not replaces
- **Evidence-based recoverability:** recovery analogs are direct historical observations, not predictions
- *Naik + Jyothika dual-purpose slide: methodology integrity AND sponsor credibility*

### Slide 14 — What Fairlight can do with this
- Deploy today: 67,406 CA+WA nonprofits scored, shortlist ready
- Scales nationally: same pipeline works for any state with 990 data
- V2 roadmap (one bullet each, no detail): portfolio allocation sandbox | auto-refreshed annual scoring | external org-facing version with softer language
- Close line: "Fairlight already runs the X-Ray. We built the version that runs at scale."

---

## Asset dependencies

| Slide | Owner | Dependency |
|---|---|---|
| 7 (backtest chart) | Vedant | Done — backtest_results.parquet on feat/task-04-vedant |
| 8 (distress model) | Amal | Blocked on model training completion |
| 9–12 (demo screenshots) | CC | Blocked on app skeleton completion |
| All others | Amal (narrative) | Unblocked — Stage 1–3 numbers on main |

---

## 90-second demo path (for reference)

1. Open Portfolio Inbox — pre-filtered to 15 demo orgs
2. Say: "Fairlight opens the inbox. Here's what the engine surfaced this quarter."
3. Click one Stabilize+urgent org
4. Decision Lab loads — show resilience gap, stress severity, one analog
5. Click scenario card: reserve injection
6. Show label change: Stabilize → Amplify under intervention
7. Move to Funding Decision — one click to add org to shortlist
8. Show export
9. End: "The advisor made the call. The machine made it defensible."

---

## Framing notes

- Never say "model predicts" — say "the engine flags" or "our analysis shows"
- Never say "we scored 67,000 nonprofits" as the opener — judges don't care about volume, they care about the insight
- The backtest is the methodology credibility anchor for Naik — give it a full slide, don't abbreviate
- For Jyothika: the demo flow is the product. If the demo breaks, slides 10–12 are screenshot fallbacks — have them ready
- Stabilize/Diversify near-tied distress rates (~13% each): if asked, answer is "both are advisory-addressable weakness populations, different weakness types — margin/runway vs concentration. The label tells the advisor which lever to pull, not just that there's a problem."
