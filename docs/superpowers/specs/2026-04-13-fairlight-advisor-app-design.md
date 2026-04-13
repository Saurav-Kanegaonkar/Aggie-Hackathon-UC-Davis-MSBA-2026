# Fairlight Advisor App Design

## Goal

Build a premium advisor-facing web app on `feat/task-03-c` that presents Fairlight's automated X-Ray Assessment as a guided decision experience rather than a generic nonprofit dashboard.

The app should make a Fairlight advisor feel:

- I can see things this organization would not see itself.
- I can explain this clearly and defensibly to a client or board.
- This helps me make a better funding or advisory decision faster.

## Product Framing

The app is the interactive, productized version of Fairlight's existing X-Ray Assessment with one additional forward-looking distress model layered on top.

The clean business framing is:

- Fairlight already runs an X-Ray Assessment manually.
- This app automates that assessment.
- The app adds forward-looking distress prediction on top.

The product is guided advisor decision support:

- not a raw dashboard
- not a model zoo
- not an autopilot

## In Scope

The first build includes:

- `Portfolio Inbox`
- `Decision Lab`
- `Funding Decision`
- one real ML signal from Stage 4
- recovery analog evidence from Stage 2
- standard pre-computed scenario cards

The first build does not include:

- a capital allocation sandbox
- a free-form scenario simulator
- additional ML models beyond the Stage 4 distress model
- exploratory dashboard behavior that breaks the guided workflow

## Implementation Approach

Create a brand-new frontend app using Vite + React in a fresh sibling folder inside the repository. Do not repurpose `trial-calculator/`.

Why this approach:

- React is the cleanest fit for the staged reveal interaction model.
- Vite keeps setup light enough for hackathon speed.
- A fresh folder avoids contaminating product structure with unrelated demo scaffolding.

## Experience Model

The app is a single-page staged workspace, not a multi-page app and not a three-panel dashboard shown all at once.

The interaction flow is:

1. The user lands in `Portfolio Inbox`.
2. Selecting an organization expands the `Decision Lab` inline on the same page.
3. Preparing a recommendation reveals `Funding Decision` from inside the lab.

This sequence is intentional:

- `Portfolio Inbox` is the scan layer.
- `Decision Lab` is the investigation layer.
- `Funding Decision` is the commitment layer.

The later surfaces should not appear before they are relevant. This avoids empty premium-looking shells that still feel semantically fake.

## Screen Structure

### Portfolio Inbox

This is the complete first-load experience.

It includes:

- a premium hero or header with Fairlight X-Ray framing
- portfolio summary metrics for the current shortlist
- curated organization cards or rows
- filters and sort controls that support triage

Each organization card should surface:

- organization name
- state
- action label
- distress tier
- concise why-surfaced explanation
- confidence or caveat cue

The inbox should feel editorial and curated, not like a crowded dashboard table.

### Decision Lab

This appears only after an organization is selected from the inbox.

The inbox compresses into a supporting rail and the selected case becomes the main canvas.

The lab contains:

- peer benchmark context
- resilience profile
- stress test evidence
- recovery analog evidence
- distress risk summary
- pre-computed standard scenarios
- a concise "what matters most" synthesis

The lab must feel like an advisor brief translated into product form. It should read clearly top-to-bottom and support narrative walkthroughs during a demo.

### Funding Decision

This appears only after the advisor chooses to prepare a recommendation from inside the lab.

The first version supports one active recommendation at a time.

The panel includes:

- final recommendation status
- intervention type
- rationale
- caveats
- confidence note
- exportable summary treatment

This is advisor-supported decision-making. The system prepares the case, but the advisor makes the final call.

## Scenario Layer

The first build uses standard pre-computed scenarios rather than open-ended controls.

Planned scenario cards:

- downside shock
- reserve support or bridge support
- diversification improvement

Each scenario should show how the case changes across recommendation and risk framing without pretending to be a full simulator.

## Intelligence Layer

The app uses four intelligence modes with distinct jobs:

- `Rules` for recommendation
- `ML` for forward prediction
- `Backtest` for validation
- `Analogs` for recoverability evidence

The app-facing ML layer is the Stage 4 distress model only.

The UI should present distress risk as contextualized evidence, not raw probability alone. Preferred phrasing style:

- `High distress risk`
- `67% risk vs. 8% baseline`

Recovery analogs stay as empirical evidence rather than a learned score.

The rule-engine backtest is primarily a credibility and deck asset. It may appear lightly in the product narrative, but it is not required to dominate the core UI.

## Data Architecture

The frontend should build from a small local view-model layer that merges Stage 3 and Stage 4 artifacts into app-ready objects.

Primary source artifacts:

- `outputs/stage3/scored_rows_with_actions.parquet`
- `outputs/stage4/distress_predictions.parquet`

The view-model layer should:

- preserve one row per `(ein, fiscal_year)`
- join Stage 4 distress outputs onto Stage 3 rows
- derive short app-facing labels and summaries
- identify a curated shortlist for the inbox
- normalize fields for risk chips, confidence chips, scenario cards, and recommendation copy

If the web app cannot read parquet directly in-browser, a small preprocessing step should emit JSON tailored to the app. That preprocessing should remain deterministic and local to this branch.

## Component Architecture

Recommended component structure:

- `AppShell`
- `PortfolioInbox`
- `InboxToolbar`
- `OrganizationList`
- `OrganizationCard`
- `DecisionLab`
- `LabHeader`
- `BenchmarkPanel`
- `StressPanel`
- `AnalogsPanel`
- `DistressPanel`
- `ScenarioPanel`
- `FundingDecisionPanel`
- `DecisionComposer`

Supporting modules:

- `data/loadAppDataset`
- `data/buildViewModel`
- `state/useAdvisorWorkspace`
- `utils/formatters`

State model:

- selected organization id
- workspace stage
- prepared recommendation draft
- active filters and sort

This state should remain local to the app unless deeper complexity forces external state tooling.

## Visual Direction

The design language should feel soft, expensive, and deliberate.

Required traits:

- premium typography
- large controlled whitespace
- restrained neutral palette
- singular accent discipline
- depth through layered surfaces, inner borders, and subtle shadows
- smooth spring transitions for staged reveal

Avoid:

- generic SaaS dashboard layouts
- equal three-column card rows
- neon or AI-purple styling
- showing all three workflow surfaces at once
- fake empty states for panels that should not exist yet

The page should feel complete at every stage:

- complete as an inbox before selection
- complete as an investigation workspace after selection
- complete as a recommendation flow after preparation begins

## Motion Model

Motion should support trust and progression.

Use:

- smooth inline expansion from inbox to lab
- gentle compression of the inbox into a rail
- spring-based reveal for recommendation workflow
- subtle stagger for list and panel entry

Do not use:

- decorative motion unrelated to workflow
- heavy cinematic effects that slow comprehension
- full-screen page transitions for a single-page workspace

## Empty, Loading, And Error States

There should be no fake `Decision Lab` or `Funding Decision` shell before the user reaches those stages.

The only first-load surface is the inbox.

State handling:

- `Loading`: skeletons for inbox cards, summary metrics, and lab modules
- `Empty portfolio`: a premium editorial state that explains no organizations match the current filters
- `Data error`: a composed inline notice with retry or fallback messaging
- `No recommendation prepared`: the recommendation panel does not exist yet

Once a stage is activated, its loading and error states should appear inside that stage only.

## Testing

Testing should cover:

- view-model joins and derived fields
- staged workspace state transitions
- organization selection behavior
- inline reveal from inbox to lab
- transition from lab to recommendation panel
- rendering of distress tiers, action labels, and confidence signals

Priority verification:

- app loads with only the inbox visible
- selecting an organization reveals the correct case in the lab
- recommendation panel only appears after explicit preparation action
- stage data shown in the UI matches Stage 3 and Stage 4 artifacts

## Build Order

1. Scaffold a fresh Vite + React app folder.
2. Build the app shell and premium inbox experience using Stage 3 data.
3. Add staged inline reveal for `Decision Lab`.
4. Integrate Stage 4 distress data into the lab and inbox.
5. Add standard scenario cards.
6. Add `Funding Decision` as a third-stage inline workflow.
7. Polish visual treatment, motion, and demo readiness.

## Success Criteria

The build is successful when:

- the app runs from a new dedicated frontend folder on `feat/task-03-c`
- the opening view is a complete premium `Portfolio Inbox`
- the `Decision Lab` appears inline only after selecting an organization
- the `Funding Decision` flow appears only after deliberate progression from the lab
- Stage 4 distress risk is integrated into the advisor workflow
- the app feels like a productized Fairlight X-Ray Assessment rather than a nonprofit analytics dashboard
