# Decision Lab Rehaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `Decision Lab` into a chart-first, consultant-grade case room that prioritizes comparative judgment, historical evidence, and expandable recommendation mechanics while preserving the established Northstar design language.

**Architecture:** Extend the export pipeline so each organization record carries defensible historical series, peer context, and score-driver metadata directly into the frontend dataset. Then replace the current prose-heavy `DecisionLab.tsx` with a compositional chart surface built from small SVG-based React components, keeping the first screen and overall Northstar shell intact.

**Tech Stack:** Python (`pandas`, JSON export), React 19, TypeScript, Framer Motion, Vitest, Testing Library, Vite

---

## File Structure

### Data and model layer

- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/analysis/export_fairlight_advisor_dataset.py`
  - Extend the app dataset with historical financial series, revenue composition history, peer operating-margin history, and explicit score-driver values.
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/tests/test_export_fairlight_advisor_dataset.py`
  - Lock the new dataset contract in a Python regression test.
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/types.ts`
  - Add typed interfaces for the new history and driver structures.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/lib/decisionLabModel.ts`
  - Convert raw organization payloads into chart-ready series, driver labels, and judgement status strings.

### Decision Lab UI layer

- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/DecisionLab.tsx`
  - Replace the current prose-card layout with the new orchestration shell.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/CasePositionStrip.tsx`
  - Compact top decision strip.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/PeerPositionPanel.tsx`
  - Current-vs-peer benchmark panel.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/FinancialTrajectoryPanel.tsx`
  - Multi-series revenue/expenses/net-assets line chart.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/OperatingQualityPanel.tsx`
  - Operating-margin-over-time chart with peer band.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/RevenueCompositionPanel.tsx`
  - Stacked composition chart.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/ScoreDriversPanel.tsx`
  - Visual decomposition of the Northstar score.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/RecoveryAnalogsPanel.tsx`
  - Recovery evidence cards with mini movement visuals.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/RecommendationFold.tsx`
  - Collapsed-by-default recommendation/scenario region.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/ChartPrimitives.tsx`
  - Reusable SVG chart helpers for line, band, stacked bars, and contribution bars.

### Styling and app integration

- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/index.css`
  - Add only the extra decision-lab-specific utility classes needed for chart polish while preserving the current background and inbox styling.
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/App.test.tsx`
  - Replace the old “What Fairlight sees” assertions with chart-first lab assertions.
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/DecisionLab.test.tsx`
  - Focused rendering test for the rehauled lab.

## Task 1: Extend the dataset with defensible Decision Lab evidence

**Files:**
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/tests/test_export_fairlight_advisor_dataset.py`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/analysis/export_fairlight_advisor_dataset.py`

- [ ] **Step 1: Write the failing export test for historical series and score drivers**

```python
import json
import tempfile
import unittest
from pathlib import Path

from analysis.export_fairlight_advisor_dataset import export_dataset


class ExportFairlightAdvisorDatasetTests(unittest.TestCase):
    def test_export_dataset_writes_joined_records_and_summary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "advisor.json"

            payload = export_dataset(output_path=output_path)

            self.assertTrue(output_path.exists())
            self.assertEqual(payload["summary"]["totalOrganizations"], len(payload["organizations"]))
            self.assertGreater(len(payload["organizations"]), 100)
            self.assertIn("distressBaselineRate", payload["summary"])

            first = payload["organizations"][0]
            for key in [
                "historicalFinancials",
                "peerOperatingMarginHistory",
                "revenueCompositionHistory",
                "scoreDrivers",
            ]:
                self.assertIn(key, first)

            self.assertGreaterEqual(len(first["historicalFinancials"]), 5)
            self.assertGreaterEqual(len(first["peerOperatingMarginHistory"]), 3)
            self.assertEqual(
                {"distressProtection", "operatingMargin", "revenueMix", "evidenceQuality"},
                set(first["scoreDrivers"].keys()),
            )

            reloaded = json.loads(output_path.read_text())
            self.assertEqual(reloaded["summary"]["totalOrganizations"], payload["summary"]["totalOrganizations"])
```

- [ ] **Step 2: Run the export test to verify it fails**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && python3 -m unittest tests.test_export_fairlight_advisor_dataset -v
```

Expected:

```text
FAIL: 'historicalFinancials' not found in ...
```

- [ ] **Step 3: Implement historical series, peer margin history, and score drivers in the export**

```python
def _historical_series(raw_panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    panel = raw_panel.copy()
    panel["operating_margin"] = (
        (panel["total_revenue"] - panel["total_expenses"])
        / panel["total_revenue"].where(panel["total_revenue"].abs() > 1e-9)
    )
    panel["liquid_reserves"] = panel["cash_non_interest_bearing"].fillna(0) + panel["savings_temporary_investments"].fillna(0)

    history = panel.groupby("ein", as_index=False).apply(
        lambda group: [
            {
                "fiscalYear": int(row.fiscal_year),
                "revenue": float(row.total_revenue or 0),
                "expenses": float(row.total_expenses or 0),
                "netAssets": float(row.net_assets_eoy or 0),
                "liquidReserves": float(row.liquid_reserves or 0),
                "operatingMargin": round(float((row.operating_margin or 0) * 100), 1),
            }
            for row in group.sort_values("fiscal_year").itertuples()
        ]
    ).rename(columns={None: "historicalFinancials"})

    peer_history = (
        panel.dropna(subset=["operating_margin"])
        .groupby(["state", "ntee_major_category", "fiscal_year"], as_index=False)
        .agg(
            peerMarginQ25=("operating_margin", lambda values: round(float(values.quantile(0.25) * 100), 1)),
            peerMarginMedian=("operating_margin", lambda values: round(float(values.quantile(0.50) * 100), 1)),
            peerMarginQ75=("operating_margin", lambda values: round(float(values.quantile(0.75) * 100), 1)),
        )
    )

    return history, peer_history


def _score_drivers(row: pd.Series) -> dict[str, float]:
    distress_protection = round(max(0.0, 100.0 - float(row["distress_prob"])), 1)
    operating_margin = round(_optional_float(row.get("operating_margin")) * 100.0, 1)
    revenue_mix = round(_optional_float(row.get("revenue_diversification_index")), 2)
    evidence_quality = {"High": 95.0, "Medium": 75.0, "Low": 52.0}[_optional_str(row.get("checkpoint1_confidence_tier"), "Medium")]

    return {
        "distressProtection": distress_protection,
        "operatingMargin": operating_margin,
        "revenueMix": revenue_mix,
        "evidenceQuality": evidence_quality,
    }
```

```python
record = {
    # existing fields...
    "historicalFinancials": history_lookup.get(row["ein"], []),
    "peerOperatingMarginHistory": peer_lookup.get((row["state"], row["ntee_major_category"]), []),
    "revenueCompositionHistory": composition_lookup.get(row["ein"], []),
    "scoreDrivers": _score_drivers(row),
}
```

- [ ] **Step 4: Re-run the export test and regenerate the frontend dataset**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && python3 -m unittest tests.test_export_fairlight_advisor_dataset -v
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run prepare:data
```

Expected:

```text
OK
```

```text
... wrote fairlight-advisor/src/data/fairlight-advisor.json
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && git add tests/test_export_fairlight_advisor_dataset.py analysis/export_fairlight_advisor_dataset.py fairlight-advisor/src/data/fairlight-advisor.json && git commit -m "feat: export decision lab history and drivers"
```

## Task 2: Add typed Decision Lab view models

**Files:**
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/types.ts`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/lib/decisionLabModel.ts`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/lib/decisionLabModel.test.ts`

- [ ] **Step 1: Write the failing model test**

```ts
import { describe, expect, it } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "./decisionLabModel";

describe("buildDecisionLabModel", () => {
  it("returns chart-ready series and a compact decision status", () => {
    const model = buildDecisionLabModel(dataset.organizations[0]);

    expect(model.financialTrajectory.length).toBeGreaterThan(4);
    expect(model.revenueComposition.length).toBe(model.financialTrajectory.length);
    expect(model.peerPosition.length).toBe(3);
    expect(model.statusTone).toMatch(/Strong|Mixed|Fragile/);
    expect(model.scoreDrivers.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/lib/decisionLabModel.test.ts
```

Expected:

```text
FAIL  Cannot find module './decisionLabModel'
```

- [ ] **Step 3: Add the new TypeScript interfaces and model builder**

```ts
export interface HistoricalFinancialPoint {
  fiscalYear: number;
  revenue: number;
  expenses: number;
  netAssets: number;
  liquidReserves: number;
  operatingMargin: number;
}

export interface PeerOperatingMarginPoint {
  fiscalYear: number;
  peerMarginQ25: number;
  peerMarginMedian: number;
  peerMarginQ75: number;
}

export interface RevenueCompositionPoint {
  fiscalYear: number;
  contributionsPct: number;
  programPct: number;
  investmentPct: number;
  otherPct: number;
}

export interface ScoreDrivers {
  distressProtection: number;
  operatingMargin: number;
  revenueMix: number;
  evidenceQuality: number;
}
```

```ts
export function buildDecisionLabModel(organization: OrganizationRecord) {
  const northstarScore = computeNorthstarScore(organization);

  return {
    organizationName: formatOrganizationName(organization.orgName),
    statusTone: northstarScore >= 75 ? "Strong" : northstarScore >= 45 ? "Mixed" : "Fragile",
    financialTrajectory: organization.historicalFinancials,
    revenueComposition: organization.revenueCompositionHistory,
    peerMarginHistory: organization.peerOperatingMarginHistory,
    scoreDrivers: [
      { label: "Distress protection", value: organization.scoreDrivers.distressProtection },
      { label: "Operating margin", value: organization.scoreDrivers.operatingMargin },
      { label: "Revenue mix", value: organization.scoreDrivers.revenueMix },
      { label: "Evidence quality", value: organization.scoreDrivers.evidenceQuality },
    ],
    peerPosition: [
      { label: "Operating margin", current: organization.operatingMargin, benchmark: parseFloat(organization.benchmark.operatingMarginGap) + organization.operatingMargin },
      { label: "Revenue mix", current: organization.revenueDiversificationIndex, benchmark: 0.5 },
      { label: "Risk next year", current: organization.distress.probability, benchmark: organization.distress.baseline },
    ],
  };
}
```

- [ ] **Step 4: Run the model test**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/lib/decisionLabModel.test.ts
```

Expected:

```text
✓ buildDecisionLabModel returns chart-ready series and a compact decision status
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && git add fairlight-advisor/src/types.ts fairlight-advisor/src/lib/decisionLabModel.ts fairlight-advisor/src/lib/decisionLabModel.test.ts && git commit -m "feat: add decision lab view model"
```

## Task 3: Build reusable chart primitives and panel components

**Files:**
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/ChartPrimitives.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/PeerPositionPanel.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/FinancialTrajectoryPanel.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/OperatingQualityPanel.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/RevenueCompositionPanel.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/ScoreDriversPanel.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/RecoveryAnalogsPanel.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/DecisionLab.test.tsx`

- [ ] **Step 1: Write the failing component test**

```ts
import { render, screen } from "@testing-library/react";

import dataset from "../../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "../../lib/decisionLabModel";
import { FinancialTrajectoryPanel } from "./FinancialTrajectoryPanel";
import { RevenueCompositionPanel } from "./RevenueCompositionPanel";

describe("Decision Lab visual panels", () => {
  it("renders real chart headings and axes labels", () => {
    const model = buildDecisionLabModel(dataset.organizations[0]);

    render(
      <>
        <FinancialTrajectoryPanel model={model} />
        <RevenueCompositionPanel model={model} />
      </>,
    );

    expect(screen.getByRole("heading", { name: /financial trajectory/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /revenue composition/i })).toBeInTheDocument();
    expect(screen.getByText(/revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/program/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/components/decision-lab/DecisionLab.test.tsx
```

Expected:

```text
FAIL  Cannot find module './FinancialTrajectoryPanel'
```

- [ ] **Step 3: Build SVG chart primitives and the evidence panels**

```tsx
export function LineChart({
  series,
  width = 560,
  height = 240,
}: {
  series: Array<{ label: string; color: string; values: number[] }>;
  width?: number;
  height?: number;
}) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
      <rect x="0" y="0" width={width} height={height} rx="24" fill="transparent" />
      {series.map((item) => (
        <path key={item.label} d={buildLinePath(item.values, width, height)} fill="none" stroke={item.color} strokeWidth="3" />
      ))}
    </svg>
  );
}
```

```tsx
export function FinancialTrajectoryPanel({ model }: { model: DecisionLabModel }) {
  return (
    <PanelShell eyebrow="Historical story" title="Financial trajectory">
      <Legend items={[{ label: "Revenue", color: "#466859" }, { label: "Expenses", color: "#b68a48" }, { label: "Net assets", color: "#111720" }]} />
      <LineChart
        series={[
          { label: "Revenue", color: "#466859", values: model.financialTrajectory.map((point) => point.revenue) },
          { label: "Expenses", color: "#b68a48", values: model.financialTrajectory.map((point) => point.expenses) },
          { label: "Net assets", color: "#111720", values: model.financialTrajectory.map((point) => point.netAssets) },
        ]}
      />
    </PanelShell>
  );
}
```

```tsx
export function ScoreDriversPanel({ model }: { model: DecisionLabModel }) {
  return (
    <PanelShell eyebrow="Interpretation" title="Northstar score drivers">
      <div className="grid gap-3">
        {model.scoreDrivers.map((driver) => (
          <div key={driver.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3">
            <span className="text-sm text-slate-600">{driver.label}</span>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[var(--northstar-accent)]" style={{ width: `${driver.value}%` }} />
            </div>
            <span className="text-sm font-medium text-slate-900">{Math.round(driver.value)}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
```

- [ ] **Step 4: Run the panel test**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/components/decision-lab/DecisionLab.test.tsx
```

Expected:

```text
✓ Decision Lab visual panels renders real chart headings and axes labels
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && git add fairlight-advisor/src/components/decision-lab fairlight-advisor/src/components/decision-lab/DecisionLab.test.tsx && git commit -m "feat: add decision lab chart panels"
```

## Task 4: Recompose `DecisionLab` into a chart-first case room

**Files:**
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/DecisionLab.tsx`
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/CasePositionStrip.tsx`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/App.test.tsx`

- [ ] **Step 1: Write the failing app-level test for the new Decision Lab structure**

```ts
it("opens a chart-first decision lab instead of the old text card layout", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

  expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /financial trajectory/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /peer position/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /operating quality over time/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /revenue composition over time/i })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /what fairlight sees/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the app test to verify it fails**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/App.test.tsx
```

Expected:

```text
FAIL  Unable to find role "heading" with name /financial trajectory/i
```

- [ ] **Step 3: Replace the old prose-card Decision Lab with the new evidence layout**

```tsx
export function DecisionLab({ onPrepareRecommendation, onReturnToPortfolio, organization }: Props) {
  const model = buildDecisionLabModel(organization);

  return (
    <motion.section layout className="rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.74)] p-2 shadow-[0_34px_94px_-56px_rgba(15,23,42,0.28)]">
      <div className="rounded-[calc(2.8rem-0.5rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.88))] px-6 pb-6 pt-5">
        <DecisionLabHeader organization={organization} onReturnToPortfolio={onReturnToPortfolio} onPrepareRecommendation={onPrepareRecommendation} />
        <CasePositionStrip model={model} organization={organization} />
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <PeerPositionPanel model={model} />
          <FinancialTrajectoryPanel model={model} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <OperatingQualityPanel model={model} />
          <RevenueCompositionPanel model={model} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ScoreDriversPanel model={model} />
          <RecoveryAnalogsPanel organization={organization} />
        </div>
        <RecommendationFold organization={organization} onPrepareRecommendation={onPrepareRecommendation} />
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 4: Run the app test**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/App.test.tsx
```

Expected:

```text
✓ opens a chart-first decision lab instead of the old text card layout
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && git add fairlight-advisor/src/components/DecisionLab.tsx fairlight-advisor/src/components/decision-lab fairlight-advisor/src/App.test.tsx && git commit -m "feat: rebuild decision lab layout"
```

## Task 5: Add the collapsed recommendation region and keep funding workflow intact

**Files:**
- Create: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/RecommendationFold.tsx`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/FundingDecisionPanel.tsx`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/DecisionLab.tsx`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/App.test.tsx`

- [ ] **Step 1: Write the failing test for collapsed recommendation behavior**

```ts
it("keeps recommendation content collapsed until the user expands it", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

  expect(screen.queryByText(/scenario outlook/i)).not.toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: /show recommendation/i }));

  expect(await screen.findByText(/scenario outlook/i)).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /prepare recommendation/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/App.test.tsx
```

Expected:

```text
FAIL  Unable to find role "button" with name /show recommendation/i
```

- [ ] **Step 3: Implement the fold-down recommendation region**

```tsx
export function RecommendationFold({ organization, onPrepareRecommendation }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-5 rounded-[2rem] border border-black/6 bg-[rgba(248,244,236,0.72)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Recommendation</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">Expand for scenarios and rationale</h3>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="cursor-pointer rounded-full border border-black/6 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700">
          {open ? "Hide recommendation" : "Show recommendation"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.92fr]">
          <ScenarioCards organization={organization} />
          <RecommendationSummary organization={organization} onPrepareRecommendation={onPrepareRecommendation} />
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/App.test.tsx
```

Expected:

```text
✓ keeps recommendation content collapsed until the user expands it
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && git add fairlight-advisor/src/components/decision-lab/RecommendationFold.tsx fairlight-advisor/src/components/DecisionLab.tsx fairlight-advisor/src/components/FundingDecisionPanel.tsx fairlight-advisor/src/App.test.tsx && git commit -m "feat: add collapsible decision lab recommendation"
```

## Task 6: Final visual polish and full verification

**Files:**
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/index.css`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/DecisionLab.tsx`
- Modify: `/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor/src/components/decision-lab/*.tsx`

- [ ] **Step 1: Add only the decision-lab-specific polish classes**

```css
.decision-chart-surface {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(250, 246, 240, 0.9));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 26px 64px -46px rgba(15, 23, 42, 0.18);
}

.decision-gridline {
  stroke: rgba(17, 23, 32, 0.08);
  stroke-dasharray: 2 8;
}

.decision-series-label {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 11px;
  color: rgb(100 116 139);
}
```

- [ ] **Step 2: Run the focused tests**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run -- src/lib/decisionLabModel.test.ts src/components/decision-lab/DecisionLab.test.tsx src/App.test.tsx
```

Expected:

```text
3 passed
```

- [ ] **Step 3: Run the full frontend suite and production build**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run test:run
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run build
```

Expected:

```text
Test Files  ... passed
```

```text
✓ built in ...
```

- [ ] **Step 4: Regenerate the app dataset one final time and re-run the Python export test**

Run:

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026/fairlight-advisor" && npm run prepare:data
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && python3 -m unittest tests.test_export_fairlight_advisor_dataset -v
```

Expected:

```text
OK
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/amlfarhad/Desktop/MSBA Hackathon/Aggie-Hackathon-UC-Davis-MSBA-2026" && git add fairlight-advisor/src/index.css fairlight-advisor/src/components/DecisionLab.tsx fairlight-advisor/src/components/decision-lab fairlight-advisor/src/App.test.tsx fairlight-advisor/src/lib/decisionLabModel.test.ts analysis/export_fairlight_advisor_dataset.py tests/test_export_fairlight_advisor_dataset.py fairlight-advisor/src/data/fairlight-advisor.json fairlight-advisor/src/types.ts && git commit -m "feat: deliver chart-first decision lab"
```

## Self-Review

### 1. Spec coverage

- Header band: covered in Task 4 via `DecisionLab.tsx` orchestration and retained header actions.
- Case position strip: covered in Task 4 with `CasePositionStrip.tsx`.
- Primary evidence row: covered in Task 3 and Task 4 via `PeerPositionPanel.tsx` and `FinancialTrajectoryPanel.tsx`.
- Secondary evidence row: covered in Task 3 and Task 4 via `OperatingQualityPanel.tsx` and `RevenueCompositionPanel.tsx`.
- Interpretation row: covered in Task 3 and Task 4 via `ScoreDriversPanel.tsx` and `RecoveryAnalogsPanel.tsx`.
- Expandable recommendation region: covered in Task 5 with `RecommendationFold.tsx`.
- Northstar design-language inheritance: covered in Task 6 polish rules and the explicit use of existing shells and palette.

No uncovered spec requirements remain.

### 2. Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task contains exact file paths, test commands, expected failures, and concrete target code.
- No task refers to “similar to Task N” or leaves undefined interfaces.

### 3. Type consistency

- `historicalFinancials`, `peerOperatingMarginHistory`, `revenueCompositionHistory`, and `scoreDrivers` are introduced in Task 1 and typed in Task 2 before being consumed in Tasks 3 and 4.
- `buildDecisionLabModel()` is defined in Task 2 before downstream panel tasks rely on it.
- `RecommendationFold` is introduced in Task 5 before the final integration and verification task.

