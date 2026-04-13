# Fairlight Advisor App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Vite + React app that presents Fairlight's automated X-Ray Assessment as a staged advisor workflow with `Portfolio Inbox`, inline `Decision Lab`, and on-demand `Funding Decision`.

**Architecture:** A deterministic preprocessing step joins Stage 3, Stage 4, and raw panel identity fields into app-ready JSON. The frontend is a single-page React workspace with local state controlling staged reveal from inbox to lab to recommendation. Visual treatment uses a soft premium system with restrained color, layered depth, and spring-based layout transitions.

**Tech Stack:** Python, Vite, React, TypeScript, Tailwind CSS, Framer Motion, Vitest, Testing Library

---

### Task 1: Scaffold The New Frontend Workspace

**Files:**
- Create: `fairlight-advisor/package.json`
- Create: `fairlight-advisor/tsconfig.json`
- Create: `fairlight-advisor/vite.config.ts`
- Create: `fairlight-advisor/index.html`
- Create: `fairlight-advisor/src/main.tsx`
- Create: `fairlight-advisor/src/App.tsx`

- [ ] Create the fresh Vite + React app folder with TypeScript and test support.
- [ ] Add Tailwind, Framer Motion, and Phosphor icons to the dependency plan.
- [ ] Add base entry files so the app can render and test.

### Task 2: Build Deterministic App Data

**Files:**
- Create: `analysis/export_fairlight_advisor_dataset.py`
- Create: `fairlight-advisor/src/data/fairlight-advisor.json`
- Create: `tests/test_export_fairlight_advisor_dataset.py`

- [ ] Write a failing Python test for joining Stage 3, Stage 4, and raw panel identity fields into app-ready records.
- [ ] Verify the test fails before implementation.
- [ ] Implement the export script to produce a deterministic JSON dataset for the app.
- [ ] Run the test again and confirm it passes.

### Task 3: Define Frontend State And View Models

**Files:**
- Create: `fairlight-advisor/src/types.ts`
- Create: `fairlight-advisor/src/lib/formatters.ts`
- Create: `fairlight-advisor/src/lib/view-model.ts`
- Create: `fairlight-advisor/src/state/useAdvisorWorkspace.ts`
- Create: `fairlight-advisor/src/lib/view-model.test.ts`

- [ ] Write failing frontend tests for shortlist shaping, label formatting, and staged workspace state.
- [ ] Verify the tests fail.
- [ ] Implement the minimal view-model and state logic to pass.
- [ ] Re-run the tests and confirm green.

### Task 4: Build The Premium Portfolio Inbox

**Files:**
- Create: `fairlight-advisor/src/components/PortfolioInbox.tsx`
- Create: `fairlight-advisor/src/components/InboxHero.tsx`
- Create: `fairlight-advisor/src/components/OrganizationCard.tsx`
- Create: `fairlight-advisor/src/components/RiskChip.tsx`
- Create: `fairlight-advisor/src/components/ConfidenceChip.tsx`
- Create: `fairlight-advisor/src/components/PortfolioInbox.test.tsx`

- [ ] Write failing component tests that prove the app opens in the inbox stage and renders surfaced organization cards.
- [ ] Verify the tests fail.
- [ ] Implement the inbox layout with premium typography, filtering, summary metrics, and tactile card interactions.
- [ ] Re-run the tests and confirm they pass.

### Task 5: Add Inline Decision Lab Reveal

**Files:**
- Create: `fairlight-advisor/src/components/DecisionLab.tsx`
- Create: `fairlight-advisor/src/components/lab/BenchmarkPanel.tsx`
- Create: `fairlight-advisor/src/components/lab/StressPanel.tsx`
- Create: `fairlight-advisor/src/components/lab/AnalogsPanel.tsx`
- Create: `fairlight-advisor/src/components/lab/DistressPanel.tsx`
- Create: `fairlight-advisor/src/components/lab/ScenarioPanel.tsx`
- Create: `fairlight-advisor/src/components/DecisionLab.test.tsx`
- Modify: `fairlight-advisor/src/App.tsx`

- [ ] Write failing tests that prove selecting an organization expands the lab inline instead of navigating away.
- [ ] Verify the tests fail.
- [ ] Implement the expanding workspace transition and the lab evidence modules.
- [ ] Re-run the tests and confirm they pass.

### Task 6: Add Funding Decision Flow

**Files:**
- Create: `fairlight-advisor/src/components/FundingDecisionPanel.tsx`
- Create: `fairlight-advisor/src/components/RecommendationComposer.tsx`
- Create: `fairlight-advisor/src/components/FundingDecisionPanel.test.tsx`
- Modify: `fairlight-advisor/src/App.tsx`
- Modify: `fairlight-advisor/src/state/useAdvisorWorkspace.ts`

- [ ] Write failing tests that prove the recommendation flow is hidden until explicitly opened from the lab.
- [ ] Verify the tests fail.
- [ ] Implement the one-active-decision workflow with rationale, caveats, and export summary copy.
- [ ] Re-run the tests and confirm they pass.

### Task 7: Styling, Motion, And Verification

**Files:**
- Create: `fairlight-advisor/src/index.css`
- Modify: `fairlight-advisor/src/App.tsx`
- Modify: `fairlight-advisor/src/components/**/*.tsx`

- [ ] Apply the final premium visual system, spring motion, and responsive layout collapse.
- [ ] Run frontend tests and build verification.
- [ ] Fix any regressions surfaced by the verification commands.
- [ ] Prepare a short summary of what changed and how to run the app.
