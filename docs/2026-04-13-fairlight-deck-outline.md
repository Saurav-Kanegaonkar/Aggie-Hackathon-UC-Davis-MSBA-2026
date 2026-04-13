# Fairlight Deck Outline — Revised

**Format:** 11 slides + appendix. Lead with findings, explain method after.
**Narrative structure:** Situation → Complication → Key findings → Evidence → How → Product → Call to action
**Rule:** Every slide title is the conclusion of that slide, not the topic.

**Audience:**
- **Fairlight Advisors** — the client. This was built for them. Every slide should feel like it's talking to them.
- **Prof Naik (round 1 judge)** — advanced stats, MSBA founder. Needs to believe the methodology is rigorous and the backtest is honest. Will push on benchmark construction, train/test validity, and whether the rules are defensible. Plain language on slides, full depth in appendix.
- **Jo (round 1 judge, MSBA alumni)** — practitioner lens. Needs to believe a Fairlight advisor would actually use this. Will push on clarity, usability, and whether the output is something you can hand to a client.

**The tension:** What impresses Naik (technical honesty, caveats, methodology detail) could confuse Jo if not framed right. Solution: one plain-English sentence per caveat on the main slide. Full technical detail in the appendix. Never hide limitations — just translate them.

---

## Slide 1 — Opening statement (not a question, a fact)

**Title:** "22,291 nonprofits in California and Washington need Fairlight's attention. Right now, there is no way to know which ones to call first."

- One number dominates the slide: 22,291 (Deep Review + urgency flagged count from Stage 3 — pull exact)
- Sub-line: "We analyzed every 990 filing in CA and WA. Here is what we found."
- No bullets. No methodology. No "we built something."
- Visual: the number large, in red or amber, state outline of CA+WA

**For Naik:** The number is grounded in our data — it will be questioned. Be ready to say exactly how it is defined (Deep Review label = benchmark_status ok but structurally weak OR low confidence, plus urgency-flagged rows). Have the definition one click away in the appendix.
**For Jo:** This is the emotional hook. A Fairlight advisor has been manually trying to answer this question for years. The slide says: we have an answer.

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
- **Critically: add one line per label showing what a Fairlight advisor does next**
  - Amplify → approach about reserve or endowment management
  - Stabilize → offer fractional CFO support, cash flow planning
  - Diversify → strategic advisory on revenue restructuring
  - Deep Review → hold, request more information, do not deploy capital yet
- The advisor implication: the engine has already triaged 67,406 orgs — Fairlight opens the inbox and sees their shortlist

**For Naik:** Each label maps to a deterministic rule — not a score, not a weighted average. The appendix has the exact field comparisons and precedence order.
**For Jo:** This is the slide where she thinks "I could explain this to a nonprofit board in 60 seconds." The label names and the action lines have to be plain enough for that. If she'd need to explain what "Deep Review" means, the language is still too technical.

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
- Four layers, each one line with a plain English example:
  1. **Peer benchmark** — "We compare each org only to nonprofits of similar size, in the same sector, in the same state. Not to the average of all 476,000 orgs nationally."
  2. **Resilience gap** — "We measure how far below the top performers in that peer group this org sits — on operating margin, financial runway, and revenue diversification."
  3. **Stress test** — "We simulate: if this org's largest revenue source drops 25%, how many months before it runs out of cash?"
  4. **Recovery analogs** — "We find peer orgs that were in the same position and recovered. We show Fairlight those orgs by name."
- Visual: four-step left-to-right pipeline
- Key message: every label traces to a rule you can read out loud. No black box. Advisor can defend any recommendation in a client meeting.

**For Naik:** The benchmark uses a resilient reference set — top quartile on all three metrics for 5 of 7 years — with a documented fallback hierarchy if the cohort is too sparse. Appendix A2 has the full rule chain.
**For Jo:** The "recovery analogs" point is the one she'll respond to most. "We show you an org by name that was in the same position and got out of it." That is a concrete, human thing an advisor can say to a nonprofit client.

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

## Slide 10 — "Fairlight can use this to triage 67,406 nonprofits in the time it currently takes to review one"

**Title:** "67,406 CA+WA nonprofits are already scored. Fairlight can open the inbox today and begin their first data-driven advisory triage."

- Three things that are true right now:
  1. **Every org is scored:** action label, distress risk tier, stress test result, recovery analogs — all pre-computed
  2. **Every recommendation is defensible:** peer benchmark, gap, stress scenario, and historical analog behind every label
  3. **Scales without limits:** same pipeline runs on any state's 990 data — same methodology, new geography, no rebuilding required
- One honest note on what this is and isn't: "This is a decision support system. It surfaces the right orgs and the right questions. Fairlight's advisors make the final call."
- One V2 line: annual refresh cadence + external nonprofit-facing version with softer language
- Close: **"Fairlight already runs the X-Ray. We built the version that runs at scale."**

**For Naik:** The "defensible" point is the close anchor for him. Every label traces to an auditable rule. No black box. No model required to explain the recommendation.
**For Jo:** "Fairlight's advisors make the final call" is the close anchor for her. She needs to hear this is a tool, not an autopilot. The product respects advisor judgment.

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
