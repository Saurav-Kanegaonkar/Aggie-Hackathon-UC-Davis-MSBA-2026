# Fairlight Deck Outline — Revised

**Format:** 11 slides + appendix. Lead with findings, explain method after.
**Narrative structure:** Situation → Complication → Key findings → Evidence → How → Product → Call to action
**Rule:** Every slide title is the conclusion of that slide, not the topic.

---

## Slide 1 — Opening statement (not a question, a fact)

**Title:** "22,291 nonprofits in California and Washington are showing signs of financial distress. Fairlight has the mandate to act — but not the bandwidth to review them manually."

- One number dominates the slide: 22,291 (our Deep Review + urgency count — pull exact from Stage 3 output)
- One sentence below it: the tension between Fairlight's mandate and their capacity
- No bullets. No methodology. No "we built something."
- Visual: the number large, in red or amber, with a map of CA+WA or a simple org count graphic

**Why this works:** A McKinsey partner opens with the client's problem stated as a fact, not a question. Questions feel weak. Facts create urgency. The judge reads this and immediately thinks "okay, what do you have for that?"

---

## Slide 2 — Governing thought (the entire story in one slide)

**Title:** "We automated Fairlight's X-Ray Assessment at scale — and validated it against a real stress event."

Three findings, each one sentence:
1. **The engine works:** Applying our rules to pre-COVID data, organizations labeled Deep Review hit financial distress at **4.1× the rate** of Amplify organizations during 2020–2021
2. **The engine is actionable:** Every recommendation maps to one of four clear advisory actions, grounded in peer-comparable financial data
3. **The engine predicts:** A trained distress model adds one-year forward-looking risk probability on top of the rule-based assessment

This slide is the entire deck compressed. Everything that follows proves one of these three sentences.
*Judges can stop here and know what you built. Everything else is support.*

---

## Slide 3 — The situation Fairlight is in

**Title:** "Fairlight's X-Ray Assessment is the right tool — it just cannot run at the scale the market requires."

- What the X-Ray Assessment is: a manual org-by-org financial health review
- What it costs: each review requires hours of analyst time
- What that means: at current capacity, Fairlight can cover a fraction of the organizations that need attention
- The complication: the nonprofit sector is under acute stress right now (government funding cuts, COVID aftermath, revenue concentration) and the window for intervention is short
- One line at the bottom: "We built the automated version."

*This is NOT about us. It is entirely about Fairlight's situation. The judge should feel the problem before they see the solution.*

---

## Slide 4 — "1 in 3 CA+WA nonprofits requires deep review before any capital deployment"

**Title:** "1 in 3 nonprofits cannot receive a clear action recommendation without deeper diligence — but 1 in 20 is genuinely ready to absorb and scale capital."

- The four label distribution as a FINDING, not a methodology output:
  - **Deep Review 33%** — structurally weak, low data confidence, or no clear path forward
  - **Stabilize 51%** — below benchmark but fixable, historical recovery evidence exists
  - **Diversify 12%** — operationally sound but dangerously concentrated in one funding source
  - **Amplify 3%** — resilient, stress-tested, ready for capital from strength
- Visual: a simple bar or donut chart, color-coded, with the four labels
- The advisor implication: the engine has already triaged 67,406 orgs — Fairlight opens the inbox and sees their shortlist

*Lead with the so-what: what does Fairlight DO with this information, not how we computed it.*

---

## Slide 5 — "Our engine correctly identified the vulnerable population before COVID hit"

**Title:** "Organizations our engine labeled Deep Review in 2019 hit financial distress at 4.1× the rate of Amplify organizations in 2020 — before COVID was a known risk."

- This is the credibility slide. It gets a full slide and full breathing room.
- **The chart:** distress rate by label, FY2020 and FY2021 side by side
  - Amplify: 4.0% / 3.9%
  - Stabilize: 13.3% / 13.2%
  - Diversify: 13.0% / 13.4%
  - Deep Review: 16.6% / 15.9%
- **The headline:** 4.1× lift. Gradient is monotonic. Holds across both years.
- **One honest caveat** (McKinsey always shows this — it builds not undermines trust): "Backtest uses national quartile benchmarks as a proxy for cohort-specific thresholds. Directional validation, not precision prediction."
- One sentence framing: "We ran the engine on 2019 data. COVID ran the stress test."

*This slide wins Naik. Give it space. Do not crowd it with bullets.*

---

## Slide 6 — "A trained model adds one-year forward-looking distress probability on top of the rules"

**Title:** "On top of the rule-based assessment, a trained model flags which organizations are likely to hit distress in the next 12 months — and shows which financial signals drive that risk."

- *[Amal fills when model is ready]*
- Target definition in plain English: "We define distress as: shock absorption under 3 months AND operating margin negative — the same threshold the rule engine uses for urgency flagging"
- Train/test framing: "Trained on FY2014–2020 national panel, tested on FY2021–2023 holdout"
- Key metric + lift statement: AUC + "High-risk orgs hit distress at Nx the rate of baseline in the test window"
- Feature importance: top 3-4 drivers (one visual — bar chart or table)
- UI output: "High distress risk (67% vs 8% baseline)" — not a raw number, always anchored to base rate

*This slide answers: what do you know about the FUTURE that the rules alone can't tell you?*

---

## Slide 7 — "Every recommendation traces to four observable, auditable financial facts"

**Title:** "Every recommendation is grounded in four observable financial facts — so any advisor can explain it to a client or board without referencing a black box."

- Now explain the engine — AFTER the findings have earned the audience's attention
- Four layers, each one line:
  1. **Peer benchmark** — compare to top-quartile orgs in the same size class, sector, and state
  2. **Resilience gap** — how far below that benchmark, measured in the same units across all orgs
  3. **Stress test** — what happens to the org's cash position if its largest revenue source drops 25%
  4. **Recovery analogs** — which similar orgs have historically recovered from the same constraint
- Visual: four-step left-to-right pipeline, each step labeled with the actual field name it produces
- Key message: rules = auditable. Every label can be reproduced by reading the rule. No model required to explain it.

*This is now slide 7, not slide 5. The judge already knows the output works (slide 5 proved it). Now they want to know how.*

---

## Slide 8 — Demo setup: the Fairlight advisor experience in three views

**Title:** "The product gives a Fairlight advisor three things: a curated shortlist, a deep diagnostic on any org, and a decision output they can hand to a client."

- Three views in one visual, left to right:
  - **Portfolio Inbox** — the engine's shortlist, ranked by urgency and distress risk. Advisor opens this Monday morning.
  - **Decision Lab** — one org, full X-Ray: peer benchmark, resilience gap, stress test, analogs, distress risk, recommended action
  - **Funding Decision** — advisor selects orgs, assigns intervention type, exports the rationale summary
- One sentence product principle at the bottom: "The machine narrows and simulates. The advisor decides."
- *This is the setup slide. The demo follows immediately.*

---

## Slide 9 — Demo

**Title:** Live demo — or two screenshot slides if live is not possible

**Demo path (90 seconds):**
1. Open Portfolio Inbox: "Here are the 15 organizations Fairlight should look at this quarter. Ranked by distress risk and urgency."
2. Click one Stabilize + urgent org
3. Decision Lab loads: show resilience gap vs peers, stress test result, one recovery analog (name + state + pre/post values)
4. Click scenario card — reserve injection: label shifts from Stabilize → Amplify. "This is what three months of bridge capital could change."
5. Add to Funding Decision. Show recommended engagement: fractional CFO + cash flow planning.
6. Export. "This is what the advisor hands to the board."

**If live demo, this is one slide (blank or just the product name as background)**
**If screenshots, two slides: Inbox + Decision Lab on one, Scenario + Funding Decision on the other**

---

## Slide 10 — "Fairlight can deploy this against the full CA+WA market today"

**Title:** "67,406 nonprofits are already scored. Fairlight's advisory team can open the inbox, filter by sector or urgency, and begin their first data-driven triage this week."

- Three specific deployment statements (not vague roadmap):
  1. Scored and ready: 67,406 CA+WA orgs across FY2023–2024, labels and distress risk assigned
  2. Scales nationally: the same pipeline runs on any state's 990 data — no methodology changes required
  3. Interpretable to clients: every recommendation the advisor delivers can be traced to a specific peer comparison, a specific stress scenario, and a specific historical analog
- One V2 line only (do not overload): "Next: annual refresh cadence + external nonprofit-facing version with softer language"
- Close line: **"Fairlight already runs the X-Ray. We built the version that runs at scale."**

*This is a call to action, not a summary. The client should feel: this is ready, not "this was a cool project."*

---

## Slide 11 — Appendix cover (one slide, links to backup material)

**Title:** "Appendix: data scope, methodology detail, backtest caveats"

Contents behind the appendix slide (judges who want depth):
- A1: Panel data scope (3.8M rows, 42 columns, FY2007–2026, 476K EINs) — this is where the data slide went
- A2: Full Stage 3 label rule definitions with exact field names and thresholds
- A3: Backtest methodology detail and four honest limitations
- A4: Distress model feature list, train/test split details, calibration plot
- A5: Recovery analog methodology — pool construction, pre/post window definitions, fallback logic

*Appendix exists for Naik. He will ask. Having it ready and labeled wins credibility without cluttering the main deck.*

---

## What changed from the previous version and why

| Old | New | Why |
|---|---|---|
| Slide 1: generic hook about funding cuts | Slide 1: specific number from our data (22,291) | Specificity beats generality. No other team can say this number. |
| No governing thought slide | Slide 2: three findings, entire story in one slide | McKinsey rule: the answer first, the proof second |
| Slide 4: data scope (3.8M rows) | Moved to appendix A1 | Credentials belong in appendix, not the client-facing flow |
| Slide 5: methodology before validation | Slide 7: methodology AFTER findings and backtest | Nobody cares how until they care about the what |
| Slide 6: label distribution as methodology output | Slide 4: label distribution as a FINDING with an implication | "1 in 3 needs deep review" is a finding. "Here's our distribution" is a table. |
| Slide 7: backtest described as methodology check | Slide 5: backtest as the credibility anchor, full slide | The backtest is the most important proof in the deck — it deserves space |
| Slides 10–12: four demo slides | Slides 8–9: one setup + one demo | McKinsey shows products, doesn't narrate screenshots |
| Slide 13: "Why this is trustworthy" | Deleted | Trust is shown by evidence, not asserted |
| Slide 14: passive close | Slide 10: action-oriented, specific, deployment-ready | McKinsey closes with what the client does next, not what was built |

---

## Asset dependencies (unchanged)

| Slide | Owner | Status |
|---|---|---|
| 5 (backtest chart) | Vedant | Done — backtest_results.parquet on feat/task-04-vedant |
| 6 (distress model) | Amal | Blocked on model training |
| 9 (demo) | CC | Blocked on app skeleton |
| All others | Amal (narrative polish) | Unblocked |

---

## Framing rules (for whoever writes the copy)

- Slide titles are conclusions, not topics. If the title could apply to any deck, rewrite it.
- Never say "we built" — say "Fairlight now has" or "the analysis shows." Client-centric, not team-centric.
- Never show a number without its implication. 16.6% distress rate → "1 in 6 Deep Review orgs hit crisis." 4.1× lift → "the engine correctly identified the vulnerable population." Raw numbers do not speak for themselves.
- Never say "model predicts" — say "the engine flags" or "our analysis shows." Prediction language invites precision questions you don't want.
- The backtest caveat is a feature, not a weakness. Showing honest limitations ("national quartile proxy, directional only") is exactly what McKinsey does and exactly what Naik will respect. Own it clearly, don't hide it.
- Stabilize/Diversify near-tied distress rates: if a judge asks, the answer is "both populations carry advisory-addressable weakness — different lever, same urgency. Stabilize needs margin and runway improvement. Diversify needs concentration reduction. The label tells the advisor which conversation to have, not just that there's a problem."
