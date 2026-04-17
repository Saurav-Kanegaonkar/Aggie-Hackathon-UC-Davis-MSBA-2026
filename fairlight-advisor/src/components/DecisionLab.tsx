import { ArrowArcLeft, ChartLineUp, Compass, Path } from "@phosphor-icons/react";
import { area as d3Area, curveCatmullRom, curveMonotoneX, line as d3Line, max as d3Max, min as d3Min, scaleLinear } from "d3";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { formatOrganizationName } from "../lib/advisorLanguage";
import { buildDecisionLabModel, type DecisionLabModel } from "../lib/decisionLabModel";
import { compactCurrency } from "../lib/decisionLabText";
import type { CrisisReplayTrajectoryPoint, OrganizationRecord } from "../types";
import type { DecisionLabDetail } from "./decision-lab/ChartPrimitives";
import { DecisionLabDetailOverlay } from "./decision-lab/ChartPrimitives";

type DecisionLabMode = "snapshot" | "flight" | "replay";
type FlightSignal = "concentration" | "runway" | "margin";
type FlightLens = "closest" | "fastest" | "strongest";
type PathMetric = "risk" | "margin" | "cushion" | "diversity";

interface FlightRoute {
  id: string;
  orgName: string;
  preValue: number;
  postValue: number;
  durationYears: number;
  recoveryWindow: string;
}

type FlightDeckType = "closest" | "fastest" | "strongest";

interface FlightRouteView extends FlightRoute {
  deckType: FlightDeckType;
  series: number[];
  windowYears: number[];
  startGap: number;
  safetyIndex: number | null;
  safetyYear: number | null;
  timeToSafetyYears: number | null;
  totalChange: number;
}

interface FlightView {
  routes: FlightRouteView[];
  selectedRoute: FlightRouteView;
  chartYears: number[];
  orgComparisonSeries: number[];
  orgMatchedYears: number[];
  orgMatchedStartYear: number;
  selectedIndex: number;
  selectedRouteYear: number;
  orgMatchedYear: number;
  routeValueAtSelection: number;
  orgValueAtSelection: number;
  safetyThreshold: number;
}

interface PathState {
  risk: number;
  diversity: number;
  margin: number;
  cushion: number;
}

interface PathTimelinePoint {
  year: number;
  actual: PathState;
  projected: PathState;
}

interface PathView {
  interventionYear: number;
  observedYear: number;
  windowLabel: string;
  targetSignal: FlightSignal;
  baseline: PathState;
  actual: PathState;
  projected: PathState;
  timeline: PathTimelinePoint[];
  narrative: string;
  rankingLabel: string;
  driversExplanation: string | null;
  deltaRisk: number;
  deltaDiversity: number;
  deltaMargin: number;
  deltaCushion: number;
}

interface ReplaySetup {
  interventionYear: number;
  scenarioId: string;
}

interface SnapshotMetric {
  label: string;
  value: string;
  emphasis?: "hero";
}

interface SnapshotDefinition {
  eyebrow: string;
  title: string;
  pitch: string;
  metrics: SnapshotMetric[];
}

export function DecisionLab({
  onReturnToPortfolio,
  organization,
}: {
  onReturnToPortfolio: () => void;
  organization: OrganizationRecord;
}) {
  const model = buildDecisionLabModel(organization);
  const [activeMode, setActiveMode] = useState<DecisionLabMode>("snapshot");
  const [activeDetail, setActiveDetail] = useState<DecisionLabDetail | null>(null);
  const [recommendationOpen, setRecommendationOpen] = useState(false);

  // Sub-tabs are bucket-aware. Recovery Flight is only meaningful for orgs that
  // need a turnaround (RCR, WFF). Crisis Replay requires a materialized T+1
  // crisis trajectory, which only the D5.1 WFF cohort has.
  const availableModes = useMemo<DecisionLabMode[]>(() => {
    switch (organization.actionLabel) {
      case "Underinvested Asset Base":
        return ["snapshot"];
      case "Revenue Concentration Risk":
        return ["snapshot", "flight"];
      case "Weak Financial Foundation":
        return ["snapshot", "flight", "replay"];
      case "Needs Data Diligence":
        return ["snapshot"];
    }
  }, [organization.actionLabel]);

  const flightSignal = useMemo(() => getPrimaryFlightSignal(organization), [organization]);
  const [flightLens, setFlightLens] = useState<FlightLens>("closest");
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [flightProgress, setFlightProgress] = useState(55);

  const replaySetup = useMemo(() => findBestReplaySetup(organization), [organization]);
  const selectedInterventionYear = replaySetup.interventionYear;
  const [pathStrategyId, setPathStrategyId] = useState(() => replaySetup.scenarioId);
  const [pathMetric, setPathMetric] = useState<PathMetric>("risk");

  useEffect(() => {
    setFlightLens("closest");
    setActiveRouteId(null);
    setFlightProgress(55);
    setRecommendationOpen(false);
    setPathStrategyId(replaySetup.scenarioId);
    setPathMetric("risk");
  }, [organization, replaySetup.scenarioId]);

  // If the active mode is no longer available for this bucket (e.g., user was
  // on Crisis Replay for a WFF org and clicked into a UAB org), snap back to
  // Snapshot so we never render an empty or broken console.
  useEffect(() => {
    if (!availableModes.includes(activeMode)) {
      setActiveMode("snapshot");
    }
  }, [availableModes, activeMode]);

  const pathScenario =
    organization.scenarioCards.find((card) => card.id === pathStrategyId) ?? organization.scenarioCards[0];

  const flightView = useMemo(
    () => buildFlightView(organization, flightSignal, flightLens, flightProgress, activeRouteId),
    [organization, flightSignal, flightLens, flightProgress, activeRouteId],
  );
  const pathView = useMemo(
    () => buildPathView(organization, selectedInterventionYear, pathScenario?.id ?? "default"),
    [organization, pathScenario?.id, selectedInterventionYear],
  );

  const latestRevenueMix = organization.revenueCompositionHistory.at(-1);
  const contextSummary = useMemo(() => {
    if (activeMode === "flight") {
      return `Flight · ${viewWindowLabel(flightView.selectedRoute.recoveryWindow)} · match FY${flightView.orgMatchedStartYear}`;
    }
    if (activeMode === "replay") {
      return `Replay · FY${selectedInterventionYear} · ${pathMetricLabel(pathMetric)}`;
    }
    return `Snapshot · FY${organization.latestFilingYear} · ${latestRevenueMix ? dominantRevenueLabel(latestRevenueMix) : "Largest source unavailable"}`;
  }, [
    activeMode,
    flightView.orgMatchedStartYear,
    flightView.selectedRoute.recoveryWindow,
    latestRevenueMix,
    organization.latestFilingYear,
    pathMetric,
    selectedInterventionYear,
  ]);

  return (
    <section className="relative rounded-[2.2rem] border border-black/6 bg-[rgba(255,253,248,0.72)] p-1.5 shadow-[0_32px_96px_-56px_rgba(15,23,42,0.3)]">
      <h2 className="sr-only">Decision Lab</h2>
      <div className="rounded-[calc(2.2rem-0.375rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,245,239,0.94))] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:px-3">
        <div className="grid gap-3 min-[1080px]:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="grid gap-3">
            <section className="flex h-full flex-col rounded-[1.55rem] border border-black/6 bg-white/88 p-4 shadow-[0_20px_52px_-38px_rgba(15,23,42,0.2)]">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onReturnToPortfolio}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-[#5d7468]/16 bg-[rgba(232,241,235,0.96)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#365046] hover:bg-[rgba(237,245,240,0.98)]"
                >
                  <ArrowArcLeft size={14} weight="bold" />
                  Inbox
                </button>
              </div>

              <h3 className="mt-3 text-[1.75rem] font-semibold leading-[0.92] tracking-[-0.065em] text-slate-950 [text-wrap:balance]">
                {formatOrganizationName(organization.orgName)}
              </h3>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                <span>{organization.state}</span>
                <span aria-hidden="true">•</span>
                <span>{organization.sizeBucket}</span>
                <span aria-hidden="true">•</span>
                <span>{organization.filingYearsObserved} yrs</span>
              </div>

              <div className="mt-4 rounded-[1.2rem] border border-black/6 bg-[rgba(247,242,234,0.86)] px-3.5 py-3.5">
                <div className="grid gap-2">
                  <SidebarMetricRow label="Northstar" value={String(model.northstarScore)} />
                  <SidebarMetricRow label="Action" value={organization.actionLabel} />
                  <SidebarMetricRow label="Next-year risk" value={`${organization.distress.probability.toFixed(1)}%`} />
                </div>
                <div className="mt-3 border-t border-black/6 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{activeModeEyebrow(activeMode)}</p>
                  <p className="mt-1.5 text-[13px] font-medium leading-[1.35] text-slate-800">{contextSummary}</p>
                </div>
              </div>
            </section>
          </aside>

          <div className="space-y-0">
            <ConsoleSwitch activeMode={activeMode} onChange={setActiveMode} availableModes={availableModes} />

            <RecommendationDock
              organization={organization}
              open={recommendationOpen}
              onToggle={() => setRecommendationOpen((value) => !value)}
            />

            {activeMode === "snapshot" ? (
              <SnapshotConsole
                model={model}
                organization={organization}
                onOpenDetail={setActiveDetail}
              />
            ) : null}

            {activeMode === "flight" ? (
              <RecoveryFlightConsole
                organization={organization}
                signal={flightSignal}
                setLens={setFlightLens}
                setActiveRouteId={setActiveRouteId}
                progress={flightProgress}
                setProgress={setFlightProgress}
                view={flightView}
              />
            ) : null}

            {activeMode === "replay" ? (
              <CrisisReplayConsole
                organization={organization}
                selectedInterventionYear={selectedInterventionYear}
                strategyId={pathStrategyId}
                setStrategyId={setPathStrategyId}
                metric={pathMetric}
                setMetric={setPathMetric}
                pathView={pathView}
              />
            ) : null}
          </div>
        </div>
      </div>

      {activeDetail ? <DecisionLabDetailOverlay detail={activeDetail} onClose={() => setActiveDetail(null)} /> : null}
    </section>
  );
}

function ConsoleSwitch({
  activeMode,
  onChange,
  availableModes,
}: {
  activeMode: DecisionLabMode;
  onChange: (mode: DecisionLabMode) => void;
  availableModes: DecisionLabMode[];
}) {
  const allItems: Array<{ mode: DecisionLabMode; label: string; title: string; icon: ReactNode }> = [
    { mode: "snapshot", label: "Full context mode", title: "Case Snapshot", icon: <Compass size={18} /> },
    { mode: "flight", label: "Live strategy mode", title: "Recovery Flight", icon: <ChartLineUp size={18} /> },
    { mode: "replay", label: "Validation mode", title: "Crisis Replay", icon: <Path size={18} /> },
  ];
  const items = allItems.filter((item) => availableModes.includes(item.mode));

  // If only one tab is available there's nothing to switch between — hide the
  // bar entirely so it doesn't read as a broken dropdown.
  if (items.length <= 1) return null;

  const gridCols = items.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  return (
    <nav className={`grid overflow-hidden rounded-[1.45rem_1.45rem_0_0] border border-black/8 bg-[rgba(245,239,231,0.92)] ${gridCols}`}>
      {items.map((item) => {
        const active = item.mode === activeMode;
        return (
          <button
            key={item.mode}
            type="button"
            onClick={() => onChange(item.mode)}
            className={`cursor-pointer border-r border-black/8 px-4 py-3 text-left last:border-r-0 ${
              active
                ? "bg-[linear-gradient(180deg,rgba(22,57,49,0.98),rgba(16,38,33,0.98))] text-white"
                : "bg-[rgba(255,255,255,0.46)] text-slate-700 hover:bg-white/80"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {item.icon}
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${active ? "text-[rgba(239,247,242,0.8)]" : "text-[#6c665b]"}`}>
                  {item.label}
                </p>
                <p className={`mt-0.5 text-[1rem] font-semibold leading-[1.08] tracking-[-0.05em] [text-wrap:balance] ${active ? "text-[rgba(239,247,242,0.98)]" : "text-slate-900"}`}>
                  {item.title}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function SnapshotConsole({
  model,
  organization,
  onOpenDetail,
}: {
  model: DecisionLabModel;
  organization: OrganizationRecord;
  onOpenDetail: (detail: DecisionLabDetail) => void;
}) {
  const latest = organization.historicalFinancials.at(-1);
  const first = organization.historicalFinancials[0];
  const labels = organization.historicalFinancials.map((point) => `FY${point.fiscalYear}`);
  const revenueSeries = organization.historicalFinancials.map((point) => point.revenue);
  const expensesSeries = organization.historicalFinancials.map((point) => point.expenses);
  const assetsSeries = organization.historicalFinancials.map((point) => point.netAssets);
  const snapshotDefinition = useMemo(() => buildSnapshotDefinition(organization, model), [organization, model]);
  const hasStressData = organization.stress.burnMonths25 !== null && organization.stress.burnMonths50 !== null;

  const scoreBreakdownCard = (
    <CardShell eyebrow="Score breakdown">
      <ScoreBreakdownCard model={model} />
    </CardShell>
  );
  const currentPositionCard = (
    <CardShell eyebrow="Current position">
      <CurrentPositionCard organization={organization} />
    </CardShell>
  );
  const peerCompareCard = (
    <CardShell eyebrow="Peer compare">
      <PeerCompareCard model={model} />
    </CardShell>
  );
  const focusCard = (
    <CardShell eyebrow={snapshotFocusEyebrow(organization.actionLabel)}>
      <SnapshotFocusCard organization={organization} model={model} />
    </CardShell>
  );
  const stressScenarioCard = hasStressData ? (
    <CardShell eyebrow="Stress scenario">
      <StressScenarioCard organization={organization} />
    </CardShell>
  ) : null;
  const financialTrajectoryCard = (
    <CardShell eyebrow="Financial trajectory">
      <QuickFinancialEvidence
        labels={labels}
        revenueSeries={revenueSeries}
        expensesSeries={expensesSeries}
        assetsSeries={assetsSeries}
        latest={latest}
        first={first}
        onOpenDetail={onOpenDetail}
      />
    </CardShell>
  );
  const revenueMixCard = (
    <CardShell eyebrow="Revenue mix over time">
      <QuickRevenueMixEvidence
        organization={organization}
        labels={organization.revenueCompositionHistory.map((point) => `FY${point.fiscalYear}`)}
        onOpenDetail={onOpenDetail}
      />
    </CardShell>
  );
  const supportCluster = stressScenarioCard ? (
    <div className="grid gap-4 min-[1180px]:grid-cols-[1.05fr_0.95fr]">
      {focusCard}
      {stressScenarioCard}
    </div>
  ) : (
    focusCard
  );
  const evidenceCluster = (
    <div className="grid gap-4 min-[1180px]:grid-cols-[1.04fr_0.96fr]">
      {financialTrajectoryCard}
      {revenueMixCard}
    </div>
  );
  const reverseEvidenceCluster = (
    <div className="grid gap-4 min-[1180px]:grid-cols-[0.96fr_1.04fr]">
      {revenueMixCard}
      {financialTrajectoryCard}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-[0_0_1.65rem_1.65rem] border border-t-0 border-black/8 bg-[radial-gradient(circle_at_top_right,rgba(125,183,162,0.16),transparent_34%),linear-gradient(180deg,rgba(251,248,242,0.98),rgba(243,235,225,0.98))]">
      <h3 className="sr-only">Case Snapshot</h3>
      <div className="grid gap-4 px-4 pb-4 pt-3">
        <section className="grid gap-3 rounded-[1.4rem] border border-black/7 bg-white/84 p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)] min-[1120px]:grid-cols-[1.05fr_0.95fr] min-[1120px]:items-start">
          <div className="min-w-0 rounded-[1.2rem] border border-[#1f5446]/12 bg-[linear-gradient(180deg,rgba(235,243,239,0.9),rgba(249,245,238,0.92))] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#557062]">{snapshotDefinition.eyebrow}</p>
            <h4 className="mt-2 text-[1.6rem] font-semibold leading-[0.98] tracking-[-0.06em] text-slate-950 [text-wrap:balance]">
              {snapshotDefinition.title}
            </h4>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-[#1f5446]/14 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#26453b]">
                {organization.actionLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-black/7 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                {organization.recommendation.interventionType}
              </span>
            </div>
            <p className="mt-3 text-[1.06rem] font-medium leading-[1.5] tracking-[-0.028em] text-slate-950 [text-wrap:balance]">
              {snapshotDefinition.pitch}
            </p>
            <p className="mt-3 border-t border-black/6 pt-3 text-[14px] leading-[1.5] text-slate-700">
              {organization.whySurfaced}
            </p>
          </div>

          <div
            className={`grid gap-2.5 ${
              snapshotDefinition.metrics.length >= 5 ? "sm:grid-cols-2" : "sm:grid-cols-2"
            }`}
          >
            {snapshotDefinition.metrics.map((metric) => (
              <div
                key={metric.label}
                className={metric.emphasis === "hero" ? "sm:col-span-2" : undefined}
              >
                <SnapshotMetricCard
                  label={metric.label}
                  value={metric.value}
                  compact
                  hero={metric.emphasis === "hero"}
                />
              </div>
            ))}
          </div>
        </section>

        {organization.actionLabel === "Underinvested Asset Base" ? (
          <>
            <div className="grid gap-4 min-[960px]:grid-cols-[0.95fr_1.15fr_0.9fr]">
              {scoreBreakdownCard}
              {currentPositionCard}
              {peerCompareCard}
            </div>
            {supportCluster}
            {evidenceCluster}
          </>
        ) : null}

        {organization.actionLabel === "Revenue Concentration Risk" ? (
          <>
            <div className="grid gap-4 min-[960px]:grid-cols-[0.95fr_1.15fr_0.9fr]">
              {scoreBreakdownCard}
              {currentPositionCard}
              {peerCompareCard}
            </div>
            {supportCluster}
            {reverseEvidenceCluster}
          </>
        ) : null}

        {organization.actionLabel === "Weak Financial Foundation" ? (
          <>
            <div className="grid gap-4 min-[960px]:grid-cols-[0.95fr_1.15fr_0.9fr]">
              {scoreBreakdownCard}
              {currentPositionCard}
              {peerCompareCard}
            </div>
            {supportCluster}
            {evidenceCluster}
          </>
        ) : null}

        {organization.actionLabel === "Needs Data Diligence" ? (
          <>
            <div className="grid gap-4 min-[960px]:grid-cols-[0.95fr_1.15fr_0.9fr]">
              {scoreBreakdownCard}
              {currentPositionCard}
              {peerCompareCard}
            </div>
            {focusCard}
            {evidenceCluster}
            {stressScenarioCard}
          </>
        ) : null}
      </div>
    </section>
  );
}

function RecoveryFlightConsole({
  organization,
  signal,
  setLens,
  setActiveRouteId,
  progress,
  setProgress,
  view,
}: {
  organization: OrganizationRecord;
  signal: FlightSignal;
  setLens: (lens: FlightLens) => void;
  setActiveRouteId: (routeId: string | null) => void;
  progress: number;
  setProgress: (value: number) => void;
  view: FlightView;
}) {
  return (
    <section className="overflow-hidden rounded-[0_0_1.65rem_1.65rem] border border-t-0 border-black/8 bg-[radial-gradient(circle_at_top_right,rgba(125,183,162,0.16),transparent_34%),linear-gradient(180deg,rgba(251,248,242,0.98),rgba(243,235,225,0.98))]">
      <h3 className="sr-only">Recovery Flight Console</h3>
      <div className="grid gap-4 px-4 pb-4 pt-3">
        <FlightSignalStrip
          label={flightSignalTitle(signal)}
          matchedStart={`FY${view.orgMatchedStartYear} · ${formatSignal(view.orgComparisonSeries[0] ?? getCurrentSignalValue(organization, signal), signal)}`}
          safetyLine={formatSignal(view.safetyThreshold, signal)}
        />

        <FlightGlossaryCard signal={signal} safetyThreshold={view.safetyThreshold} />

        <RecoveryFlightChart signal={signal} view={view} />

        <RangeRail
          value={progress}
          min={0}
          max={100}
          step={50}
          onChange={setProgress}
          labels={buildFlightSliderLabels(view.selectedRoute.timeToSafetyYears)}
          ariaLabel="Scrub through recovery route"
          compact={false}
          snapValues={[0, 50, 100]}
        />

        <SelectedRouteSpotlight
          deckType={view.selectedRoute.deckType}
          routeName={view.selectedRoute.orgName}
          recoveryWindow={view.selectedRoute.recoveryWindow}
          matchedStart={`FY${view.orgMatchedStartYear} · ${formatSignal(view.orgComparisonSeries[0] ?? 0, signal)}`}
          peerStart={`FY${view.selectedRoute.windowYears[0] ?? view.selectedRoute.recoveryWindow.slice(0, 4)} · ${formatSignal(view.selectedRoute.preValue, signal)}`}
          selectedRouteYear={view.selectedRouteYear}
          orgMatchedYear={view.orgMatchedYear}
          orgValue={formatSignal(view.orgValueAtSelection, signal)}
          peerValue={formatSignal(view.routeValueAtSelection, signal)}
          endRead={formatSignal(view.selectedRoute.postValue, signal)}
          safetyYear={view.selectedRoute.safetyYear}
        />

        <ClosestMatchDetailCard
          organization={organization}
          signal={signal}
          route={view.selectedRoute}
          totalRoutesConsidered={view.routes.length}
        />
      </div>
    </section>
  );
}

function FlightGlossaryCard({
  signal,
  safetyThreshold,
}: {
  signal: FlightSignal;
  safetyThreshold: number;
}) {
  const [metricTitle, metricBullets]: [string, string[]] =
    signal === "concentration"
      ? [
          "Revenue Diversification Index (RDI)",
          [
            "A 0 to 1 score for how spread out revenue is across sources.",
            "0 = all revenue from a single source (very risky).",
            "0.45+ = diversified enough to absorb a single-funder cut.",
            "Math: Herfindahl-style concentration index, applied to a nonprofit's revenue lines.",
          ],
        ]
      : signal === "runway"
      ? [
          "Cash runway (months)",
          [
            "Months of operating expenses that cash and short-term savings would cover if revenue stopped.",
            "A short-term liquidity and resilience signal, not a long-term health measure.",
          ],
        ]
      : [
          "Operating margin",
          [
            "Revenue minus expenses, as a percentage of revenue.",
            "Positive = the org is running a surplus.",
            "Negative = the org is spending more than it earns.",
          ],
        ];

  const [safetyTitle, safetyBullets]: [string, string[]] =
    signal === "concentration"
      ? [
          `Safety line at RDI ${safetyThreshold.toFixed(2)}`,
          [
            "Threshold for reasonably diversified revenue at this size.",
            "Below the line: materially exposed to a single-funder shock.",
            "Above the line: no single source dominates.",
            "Cutoff reflects practitioner judgment, not a universal industry standard.",
          ],
        ]
      : signal === "runway"
      ? [
          `Safety line at ${Math.round(safetyThreshold)} months`,
          [
            "Minimum prudent cash cushion.",
            "Rating agencies and governance literature treat 3 to 6 months of expense coverage as the stability floor.",
          ],
        ]
      : [
          "Safety line at 0% (break-even)",
          [
            "Where revenue covers expenses.",
            "Above: running a surplus.",
            "Below: running a deficit and burning through reserves.",
          ],
        ];

  return (
    <section className="rounded-[1.25rem] border border-black/7 bg-[rgba(249,245,238,0.92)] px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">How to read this chart</p>
      <div className="mt-1.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <p className="text-[12.5px] font-semibold text-slate-900">{metricTitle}</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-slate-700">
            {metricBullets.map((bullet, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="mt-[7px] inline-block h-[4px] w-[4px] flex-none rounded-full bg-slate-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[12.5px] font-semibold text-slate-900">{safetyTitle}</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-slate-700">
            {safetyBullets.map((bullet, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="mt-[7px] inline-block h-[4px] w-[4px] flex-none rounded-full bg-slate-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ClosestMatchDetailCard({
  organization,
  signal,
  route,
  totalRoutesConsidered,
}: {
  organization: OrganizationRecord;
  signal: FlightSignal;
  route: FlightRouteView;
  totalRoutesConsidered: number;
}) {
  const sectorName = nteeCategoryName(organization.nteeCategory);
  const sizeBand = sizeBucketLabel(organization.sizeBucket);
  const bucketLabel = flightBucketLabel(organization.actionLabel);
  const engagementLabel = bucketLabel.engagement;
  const engagementPlaybook = bucketLabel.playbook;

  const signalLabel = flightSignalTitle(signal);
  const unit = signalUnitLabel(signal);
  const peerName = route.orgName;
  const startValue = formatSignal(route.preValue, signal);
  const endValue = formatSignal(route.postValue, signal);
  const totalChange = formatSignalGap(Math.abs(route.totalChange), signal);
  const windowLabel = viewWindowLabel(route.recoveryWindow);
  const reachedSafety = route.safetyYear !== null;
  const timeToSafety = formatYearsToSafety(route.timeToSafetyYears);

  // Narrative: "Peer's [signal] moved from X to Y between window, [crossing/not reaching]
  //             the safety line[ by FYyyyy]."
  const safetyClause = reachedSafety
    ? ` and crossed the safety line by FY${route.safetyYear}`
    : ", though they had not yet crossed the safety line at window end";
  const peerStory =
    signal === "concentration"
      ? `${peerName}'s Revenue Diversification Index moved from ${startValue} to ${endValue} over ${windowLabel.replace("FY", "FY")}${safetyClause}.`
      : signal === "runway"
      ? `${peerName}'s reserve cushion grew from ${startValue} to ${endValue} across ${windowLabel.replace("FY", "FY")}${safetyClause}.`
      : `${peerName}'s operating margin moved from ${startValue} to ${endValue} across ${windowLabel.replace("FY", "FY")}${safetyClause}.`;

  return (
    <section className="rounded-[1.45rem] border border-[#1f5446]/16 bg-[linear-gradient(180deg,rgba(232,241,235,0.95),rgba(246,249,246,0.9))] px-4 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#557062]">Closest match</p>
          <strong className="mt-1 block text-[1.35rem] leading-[1.05] tracking-[-0.06em] text-slate-950">
            {peerName}
          </strong>
          <p className="mt-1 text-[12px] text-slate-600">
            {sectorName} · {organization.state} · {sizeBand}
          </p>
        </div>
        <div className="rounded-full border border-[#1f5446]/16 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#557062]">
          {windowLabel}
        </div>
      </div>

      {/* Why this match */}
      <div className="mt-3 rounded-[1.1rem] border border-black/7 bg-white/82 px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Why this match</p>
        <ul className="mt-1.5 grid gap-1 text-[13px] text-slate-800 sm:grid-cols-2">
          <li>
            <span className="text-slate-500">Sector:</span> <span className="font-medium text-slate-900">{sectorName}</span>{" "}
            <span className="text-[#2a6644]">same as yours</span>
          </li>
          <li>
            <span className="text-slate-500">State:</span> <span className="font-medium text-slate-900">{organization.state}</span>{" "}
            <span className="text-[#2a6644]">same as yours</span>
          </li>
          <li>
            <span className="text-slate-500">Asset band:</span>{" "}
            <span className="font-medium text-slate-900">{sizeBand}</span>{" "}
            <span className="text-[#2a6644]">same band</span>
          </li>
          <li>
            <span className="text-slate-500">Starting {signalLabel.toLowerCase()}:</span>{" "}
            <span className="font-medium text-slate-900">{startValue}</span>{" "}
            <span className="text-slate-500">
              vs your {formatSignal(getCurrentSignalValue(organization, signal), signal)}
            </span>
          </li>
        </ul>
      </div>

      {/* What they did */}
      <div className="mt-3 rounded-[1.1rem] border border-black/7 bg-white/82 px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">What they did</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-800">{peerStory}</p>
      </div>

      {/* Metric summary */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1rem] border border-black/7 bg-white/82 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Start</p>
          <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{startValue}</p>
        </div>
        <div className="rounded-[1rem] border border-black/7 bg-white/82 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">End</p>
          <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{endValue}</p>
        </div>
        <div className="rounded-[1rem] border border-black/7 bg-white/82 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Change</p>
          <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{`+${totalChange} ${unit}`}</p>
        </div>
        <div className="rounded-[1rem] border border-black/7 bg-white/82 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Time to safety</p>
          <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">
            {reachedSafety ? timeToSafety : "Not reached"}
          </p>
        </div>
      </div>

      {/* Fairlight CTA */}
      <div className="mt-3 rounded-[1.1rem] border border-[#1f5446]/20 bg-[rgba(219,233,224,0.85)] px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2a6644]">Fairlight next step</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-slate-800">
          <span className="font-semibold text-slate-950">{engagementLabel}</span> runs this playbook with you: {engagementPlaybook}.
        </p>
      </div>

      {/* Rigor footnote */}
      <p className="mt-2.5 text-[11px] text-slate-500">
        Matched from {totalRoutesConsidered} peer{totalRoutesConsidered === 1 ? "" : "s"} in the same sector, state, and asset band.
        Selected for closest starting-position alignment.
      </p>
    </section>
  );
}

function flightBucketLabel(actionLabel: OrganizationRecord["actionLabel"]): { engagement: string; playbook: string } {
  switch (actionLabel) {
    case "Revenue Concentration Risk":
      return {
        engagement: "Fairlight's Strategic Advisory engagement",
        playbook: "diversification strategy, funder-pipeline development, and earned-revenue design",
      };
    case "Weak Financial Foundation":
      return {
        engagement: "Fairlight's Financial Infrastructure engagement",
        playbook: "reserve policy, expense-structure review, and multi-year cash forecasting",
      };
    case "Underinvested Asset Base":
      return {
        engagement: "Fairlight's Portfolio Growth engagement",
        playbook: "investment policy, diversified portfolio construction, and yield benchmarking",
      };
    case "Needs Data Diligence":
      return {
        engagement: "Fairlight's Diligence pass",
        playbook: "financial reconciliation, restricted-asset review, and re-scoring",
      };
  }
}

function signalUnitLabel(signal: FlightSignal): string {
  if (signal === "margin") return "pts";
  if (signal === "runway") return "months";
  return "RDI";
}

function sizeBucketLabel(sizeBucket: string): string {
  const labels: Record<string, string> = {
    "<500K": "under $500K",
    "500K-2M": "$500K–$2M",
    "2M-10M": "$2M–$10M",
    ">10M": "$10M+",
  };
  return labels[sizeBucket] ?? sizeBucket;
}

function nteeCategoryName(code: string): string {
  const names: Record<string, string> = {
    A: "Arts, Culture & Humanities",
    B: "Education",
    C: "Environment",
    D: "Animal-Related",
    E: "Health Care",
    F: "Mental Health",
    G: "Diseases & Medical Disciplines",
    H: "Medical Research",
    I: "Crime & Legal",
    J: "Employment",
    K: "Food & Agriculture",
    L: "Housing & Shelter",
    M: "Public Safety",
    N: "Recreation & Sports",
    O: "Youth Development",
    P: "Human Services",
    Q: "International Affairs",
    R: "Civil Rights",
    S: "Community Improvement",
    T: "Philanthropy",
    U: "Science & Technology",
    V: "Social Science",
    W: "Public & Societal Benefit",
    X: "Religion",
    Y: "Mutual Benefit",
    Z: "Unknown",
  };
  return names[code] ?? `Sector ${code}`;
}

function CrisisReplayConsole({
  organization,
  selectedInterventionYear,
  strategyId,
  setStrategyId,
  metric,
  setMetric,
  pathView,
}: {
  organization: OrganizationRecord;
  selectedInterventionYear: number;
  strategyId: string;
  setStrategyId: (value: string) => void;
  metric: PathMetric;
  setMetric: (value: PathMetric) => void;
  pathView: PathView;
}) {
  return (
    <section className="overflow-hidden rounded-[0_0_1.65rem_1.65rem] border border-t-0 border-black/8 bg-[radial-gradient(circle_at_top_right,rgba(125,183,162,0.16),transparent_34%),linear-gradient(180deg,rgba(251,248,242,0.98),rgba(243,235,225,0.98))]">
      <h3 className="sr-only">Crisis Replay Console</h3>
      <div className="grid gap-4 px-4 pb-4 pt-3">
        <ReplaySetupCard
          organization={organization}
          interventionYear={selectedInterventionYear}
          observedYear={pathView.observedYear}
          baseline={pathView.baseline}
          actual={pathView.actual}
          rankingLabel={pathView.rankingLabel}
          driversExplanation={pathView.driversExplanation}
        />

        <PathReplayChart view={pathView} metric={metric} />

        <div className="grid gap-3 min-[1120px]:grid-cols-[0.92fr_1.08fr]">
          <ReplayControlPanel
            strategyId={strategyId}
            setStrategyId={setStrategyId}
            metric={metric}
            setMetric={setMetric}
            scenarios={organization.scenarioCards.slice(0, 3)}
          />

          <ReplayReferenceCard
            interventionYear={selectedInterventionYear}
            observedYear={pathView.observedYear}
            windowLabel={pathView.windowLabel}
            targetSignal={pathView.targetSignal}
            baseline={pathView.baseline}
            rankingLabel={pathView.rankingLabel}
          />
        </div>

        <div className="grid gap-3 min-[960px]:grid-cols-2">
          <StatePanel
            eyebrow={`Observed FY${pathView.observedYear}`}
            title="Actual path"
            stats={[
              { label: "Risk", value: `${pathView.actual.risk.toFixed(1)}%` },
              { label: "Revenue mix", value: pathView.actual.diversity.toFixed(2) },
              { label: "Operating margin", value: `${formatSigned(pathView.actual.margin)}%` },
              { label: "Reserve cushion", value: formatDurationValue(pathView.actual.cushion) },
            ]}
          />
          <StatePanel
            eyebrow={`With Northstar FY${pathView.observedYear}`}
            title="Improved path"
            stats={[
              { label: "Risk", value: `${pathView.projected.risk.toFixed(1)}%` },
              { label: "Revenue mix", value: pathView.projected.diversity.toFixed(2) },
              { label: "Operating margin", value: `${formatSigned(pathView.projected.margin)}%` },
              { label: "Reserve cushion", value: formatDurationValue(pathView.projected.cushion) },
            ]}
            emphasized
          />
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 min-[1120px]:grid-cols-4">
          <SnapshotMetricCard
            label="Risk delta"
            value={`${pathView.deltaRisk >= 0 ? "-" : "+"}${Math.abs(pathView.deltaRisk).toFixed(1)} pts`}
            compact
          />
          <SnapshotMetricCard
            label="Margin delta"
            value={`${pathView.deltaMargin >= 0 ? "+" : ""}${pathView.deltaMargin.toFixed(1)}%`}
            compact
          />
          <SnapshotMetricCard
            label="Cushion delta"
            value={formatDeltaDuration(pathView.deltaCushion)}
            compact
          />
          <SnapshotMetricCard
            label="Revenue mix delta"
            value={`${pathView.deltaDiversity >= 0 ? "+" : ""}${pathView.deltaDiversity.toFixed(2)}`}
            compact
          />
        </div>
      </div>
    </section>
  );
}

function RecommendationDock({
  organization,
  open,
  onToggle,
}: {
  organization: OrganizationRecord;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className={`border border-t-0 border-black/8 bg-[rgba(248,244,236,0.82)] ${open ? "px-3.5 pb-3.5 pt-3" : "px-3.5 py-2.5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex items-baseline gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Full call</p>
          <p className="truncate text-[14px] font-semibold text-slate-800">{organization.recommendation.status}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="cursor-pointer rounded-full border border-black/6 bg-white/84 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-800 hover:bg-white"
        >
          {open ? "Hide full call" : "Show full call"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 min-[1120px]:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.25rem] border border-black/7 bg-white/84 p-4">
            <div className="grid gap-3 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Recommendation</p>
                <h4 className="mt-2 text-[1.45rem] font-semibold leading-[1.02] tracking-[-0.05em] text-slate-950">
                  {organization.recommendation.status}
                </h4>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 min-[960px]:grid-cols-1">
                <SnapshotMetricCard label="Support type" value={organization.recommendation.interventionType} compact />
                <SnapshotMetricCard label="Confidence" value={organization.confidenceTier} compact />
              </div>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-black/7 bg-white/84 p-4">
            <MetricList
              rows={[
                { label: "Surfaced because", value: organization.whySurfaced },
                { label: "Decision reason", value: organization.decisionReason },
                { label: "Watch next", value: organization.recommendation.caveats[0] ?? "No additional watch item" },
              ]}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SidebarMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={`grid gap-3 rounded-[1rem] border border-black/7 bg-white/82 px-3.5 py-2.5 ${
        value.length > 18 ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_auto] items-center"
      }`}
    >
      <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p
        className={`min-w-0 break-words text-[1rem] font-semibold leading-[1.12] tracking-[-0.04em] text-slate-950 ${
          value.length > 18 ? "text-left" : "text-right"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SnapshotMetricCard({
  label,
  value,
  compact = false,
  hero = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
  hero?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-[1.2rem] border ${hero ? "border-[#1f5446]/16 bg-[linear-gradient(180deg,rgba(231,241,236,0.95),rgba(249,245,238,0.88))]" : "border-black/7 bg-white/80"} ${compact ? "px-3.5 py-3" : "px-4 py-3.5"}`}>
      <p className="text-[11px] font-semibold uppercase leading-[1.25] tracking-[0.14em] text-slate-600">{label}</p>
      <p className={`mt-2 break-words font-semibold leading-[1.14] tracking-[-0.05em] text-slate-950 ${hero ? "text-[1.28rem]" : compact ? "text-[1.05rem]" : "text-[1.36rem]"}`}>{value}</p>
    </div>
  );
}

function CardShell({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[1.4rem] border border-black/7 bg-white/82 p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{eyebrow}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ScoreBreakdownCard({ model }: { model: DecisionLabModel }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const drivers = model.scoreDrivers;
  return (
    <div className="grid gap-3">
      {drivers.map((driver, index) => {
        const expanded = expandedKey === driver.key;
        const widthPct = Math.max(0, Math.min(100, (Math.abs(driver.value) / driver.max) * 100));
        const displayValue = driver.signed ? formatSigned(driver.value) : driver.value.toFixed(1);
        const fill =
          index === 0
            ? "linear-gradient(90deg,#d4bc8d,#b78445)"
            : driver.signed
              ? "linear-gradient(90deg,#d3c4aa,#8b6745)"
              : "linear-gradient(90deg,#a8bfb4,#2f6a57)";

        return (
          <button
            key={driver.key}
            type="button"
            onClick={() => setExpandedKey(expanded ? null : driver.key)}
            className="grid gap-1.5 text-left"
          >
            <div className="flex items-start justify-between gap-4 text-[14px] text-slate-700">
              <span className="min-w-0 leading-[1.25]">{driver.label}</span>
              <strong className="shrink-0 text-[16px] tabular-nums text-slate-950">{displayValue}</strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[rgba(15,20,26,0.08)]">
              <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: fill }} />
            </div>
            {expanded && driver.details?.length ? (
              <div className="grid gap-1.5 rounded-[0.95rem] border border-black/6 bg-[rgba(249,245,238,0.92)] px-3.5 py-3">
                {driver.details.map((detail) => (
                  <div key={detail.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-[12px] text-slate-700">
                    <span className="min-w-0 leading-[1.25]">{detail.label}</span>
                    <strong className="shrink-0 text-slate-950">
                      {detail.value.toFixed(1)} / {detail.max}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PeerCompareCard({ model }: { model: DecisionLabModel }) {
  return (
    <div className="grid gap-2">
      {model.peerPosition.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,11rem)] items-start gap-3 border-t border-black/6 pt-2.5 text-[14px] text-slate-700 first:border-t-0 first:pt-0"
        >
          <span className="min-w-0 leading-[1.25]">{item.label}</span>
          <div className="min-w-0 text-right">
            <strong className="block break-words text-[15px] leading-[1.15] text-slate-950">
              {formatCompareValue(item.current, item.format)}
            </strong>
              <span className="mt-0.5 block break-words leading-[1.2] text-[#746d62]">
                vs {formatCompareValue(item.benchmark, item.format)}
              </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CurrentPositionCard({ organization }: { organization: OrganizationRecord }) {
  return (
    <div className="grid gap-3">
      <div>
        <strong className="block text-[1.18rem] leading-[1.12] tracking-[-0.04em] text-slate-950 [text-wrap:balance]">
          {organization.recommendation.status}
        </strong>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <SnapshotMetricCard label="Action" value={organization.actionLabel} compact />
        <SnapshotMetricCard label="Support type" value={organization.recommendation.interventionType} compact />
      </div>
    </div>
  );
}

function SnapshotFocusCard({
  organization,
  model,
}: {
  organization: OrganizationRecord;
  model: DecisionLabModel;
}) {
  const currentRunway = cappedRunwayMonths(organization.operatingRunwayMonths);
  const shock25 = cappedRunwayMonths(organization.stress.burnMonths25 ?? currentRunway);
  const shock50 = cappedRunwayMonths(organization.stress.burnMonths50 ?? shock25);
  const infrastructureGap = model.scoreDrivers.find((driver) => driver.label === "Financial Foundation")?.value ?? 0;
  const completeness = buildCompletenessChecklist(organization);
  const yieldOpportunity = compactCurrency(computeUnrealizedAnnualReturns(organization));
  const assetBandFit =
    organization.netAssetsEoy !== null && organization.netAssetsEoy >= 1_000_000 && organization.netAssetsEoy <= 20_000_000
      ? "In sweet spot"
      : "Outside sweet spot";

  switch (organization.actionLabel) {
    case "Underinvested Asset Base":
      return (
        <MetricList
          rows={[
            { label: "Current yield", value: `${organization.investmentYield.toFixed(2)}%` },
            { label: "5% benchmark", value: "5.00%" },
            { label: "Unrealized annual returns", value: yieldOpportunity },
            { label: "Investing history", value: `${organization.consecutiveYearsWithInvestmentIncome} yrs` },
          ]}
        />
      );
    case "Revenue Concentration Risk":
      return (
        <MetricList
          rows={[
            { label: "Largest source", value: formatLargestSourceName(organization.stress.largestSource) },
            { label: "Largest source %", value: `${organization.stress.largestSourcePct.toFixed(1)}%` },
            { label: "Runway at -25%", value: formatRunwayForCard(shock25) },
            { label: "Runway at -50%", value: formatRunwayForCard(shock50) },
          ]}
        />
      );
    case "Weak Financial Foundation":
      return (
        <MetricList
          rows={[
            { label: "Current runway", value: formatRunwayForCard(currentRunway) },
            { label: "Operating margin", value: `${formatSigned(organization.operatingMargin)}%` },
            { label: "Asset band fit", value: assetBandFit },
            { label: "Foundation score", value: `${infrastructureGap.toFixed(1)} / 40` },
          ]}
        />
      );
    case "Needs Data Diligence":
      return (
        <MetricList
          rows={[
            { label: "Data completeness", value: `${completeness.availableCount} of 5 fields` },
            { label: "Latest filing", value: `FY${organization.latestFilingYear}` },
            { label: "Missing fields", value: completeness.missingSummary },
            { label: "Confidence note", value: organization.confidenceNote },
          ]}
        />
      );
  }
}

function QuickFinancialEvidence({
  labels,
  revenueSeries,
  expensesSeries,
  assetsSeries,
  latest,
  first,
  onOpenDetail,
}: {
  labels: string[];
  revenueSeries: number[];
  expensesSeries: number[];
  assetsSeries: number[];
  latest: OrganizationRecord["historicalFinancials"][number] | undefined;
  first: OrganizationRecord["historicalFinancials"][number] | undefined;
  onOpenDetail: (detail: DecisionLabDetail) => void;
}) {
  return (
    <div className="grid gap-3">
      <MiniMultiSeriesChart
        labels={labels}
        series={[
          { label: "Revenue", color: "#466859", values: revenueSeries },
          { label: "Expenses", color: "#b68a48", values: expensesSeries },
          { label: "Net assets", color: "#7f95ad", values: assetsSeries },
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <QuickActionButton
          label="Revenue"
          value={compactCurrency(latest?.revenue ?? 0)}
          detail={formatDelta(latest?.revenue ?? 0, first?.revenue ?? 0)}
          onClick={() =>
            onOpenDetail(
              buildSeriesDetail({
                title: "Revenue over time",
                subtitle: "Revenue across filing years, expanded so the full pattern is visible at a glance.",
                labels,
                values: revenueSeries,
                color: "#466859",
                valueFormatter: compactCurrency,
              }),
            )
          }
          ariaLabel="Open revenue detail"
        />
        <QuickActionButton
          label="Expenses"
          value={compactCurrency(latest?.expenses ?? 0)}
          detail={formatDelta(latest?.expenses ?? 0, first?.expenses ?? 0)}
          onClick={() =>
            onOpenDetail(
              buildSeriesDetail({
                title: "Expenses over time",
                subtitle: "Expenses across filing years, expanded so cost pressure and step changes are easier to read.",
                labels,
                values: expensesSeries,
                color: "#b68a48",
                valueFormatter: compactCurrency,
              }),
            )
          }
          ariaLabel="Open expenses detail"
        />
        <QuickActionButton
          label="Net assets"
          value={compactCurrency(latest?.netAssets ?? 0)}
          detail={formatDelta(latest?.netAssets ?? 0, first?.netAssets ?? 0)}
          onClick={() =>
            onOpenDetail(
              buildSeriesDetail({
                title: "Net assets over time",
                subtitle: "Net assets across filing years, expanded so balance-sheet accumulation is easier to audit.",
                labels,
                values: assetsSeries,
                color: "#7f95ad",
                valueFormatter: compactCurrency,
              }),
            )
          }
          ariaLabel="Open net assets detail"
        />
      </div>
    </div>
  );
}

function QuickRevenueMixEvidence({
  organization,
  labels,
  onOpenDetail,
}: {
  organization: OrganizationRecord;
  labels: string[];
  onOpenDetail: (detail: DecisionLabDetail) => void;
}) {
  const latest = organization.revenueCompositionHistory.at(-1);
  const streamConfigs = [
    {
      key: "programPct",
      label: "Program",
      color: "#4f7664",
      values: organization.revenueCompositionHistory.map((point) => point.programPct),
    },
    {
      key: "contributionsPct",
      label: "Contributions",
      color: "#c89648",
      values: organization.revenueCompositionHistory.map((point) => point.contributionsPct),
    },
    {
      key: "investmentPct",
      label: "Investment",
      color: "#6f87a2",
      values: organization.revenueCompositionHistory.map((point) => point.investmentPct),
    },
    {
      key: "otherPct",
      label: "Other",
      color: "#c7c0b2",
      values: organization.revenueCompositionHistory.map((point) => point.otherPct),
    },
  ] as const;
  const streams = latest
    ? [
        { label: "Program", value: `${Math.round(latest.programPct)}%` },
        { label: "Contributions", value: `${Math.round(latest.contributionsPct)}%` },
        { label: "Investment", value: `${Math.round(latest.investmentPct)}%` },
        { label: "Other", value: `${Math.round(latest.otherPct)}%` },
      ]
    : [];

  return (
    <div className="grid gap-3">
      <StackedMixPreview
        history={organization.revenueCompositionHistory}
        concentrationSeries={
          organization.actionLabel === "Revenue Concentration Risk"
            ? organization.revenueCompositionHistory.map((point) =>
                Math.max(point.programPct, point.contributionsPct, point.investmentPct, point.otherPct),
              )
            : undefined
        }
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {streams.map((stream, index) => (
          <QuickActionButton
            key={stream.label}
            label={stream.label}
            value={stream.value}
            detail="Open share detail"
            onClick={() =>
              onOpenDetail(
                buildMixDetail({
                  title: `${stream.label} share over time`,
                  subtitle: `A closer read on how ${stream.label.toLowerCase()} shaped the revenue base across filing years.`,
                  labels,
                  values: streamConfigs[index].values,
                  color: streamConfigs[index].color,
                }),
              )
            }
            ariaLabel={`Open ${stream.label.toLowerCase()} detail`}
          />
        ))}
      </div>
    </div>
  );
}

function StressScenarioCard({ organization }: { organization: OrganizationRecord }) {
  const hasStress = organization.stress.burnMonths25 !== null && organization.stress.burnMonths50 !== null;
  const [shockPct, setShockPct] = useState(hasStress ? 25 : 0);
  const currentRunway = cappedRunwayMonths(organization.operatingRunwayMonths);
  const shock25 = cappedRunwayMonths(organization.stress.burnMonths25 ?? currentRunway);
  const shock50 = cappedRunwayMonths(organization.stress.burnMonths50 ?? shock25);
  const shock75 = Math.max(0, shock50 - Math.max(0, shock25 - shock50));
  const projectedRunway = interpolateShockRunway(shockPct, currentRunway, shock25, shock50, shock75);
  const redZone = projectedRunway < 3;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[1.05rem] border border-black/7 bg-[rgba(249,245,238,0.92)] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Largest revenue source</p>
          <p className="mt-1 text-[1rem] font-semibold leading-[1.15] tracking-[-0.04em] text-slate-950">
            {formatLargestSourceLabel(organization)}
          </p>
        </div>
        <div className={`rounded-[1.05rem] border px-3 py-3 ${redZone ? "border-[#b35b49]/24 bg-[rgba(254,239,235,0.96)]" : "border-[#1f5446]/16 bg-[rgba(231,241,236,0.95)]"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Runway after {shockPct}% shock</p>
          <p className="mt-1 text-[1.15rem] font-semibold tracking-[-0.05em] text-slate-950">{formatRunwayForCard(projectedRunway)}</p>
          <p className={`mt-1 text-[12px] font-medium ${redZone ? "text-[#b35b49]" : "text-slate-700"}`}>
            {redZone ? "Below 3-month red zone" : "Still above the red zone"}
          </p>
        </div>
      </div>

      {hasStress ? (
        <>
          <RangeRail
            value={shockPct}
            min={0}
            max={75}
            step={5}
            onChange={setShockPct}
            labels={["0%", "25%", "50%", "75%"]}
            ariaLabel="Adjust stress shock percentage"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <SnapshotMetricCard label="Current runway" value={formatRunwayForCard(currentRunway)} compact />
            <SnapshotMetricCard label="Runway at 25%" value={formatRunwayForCard(shock25)} compact />
            <SnapshotMetricCard label="Runway at 50%" value={formatRunwayForCard(shock50)} compact />
          </div>
        </>
      ) : (
        <div className="rounded-[1.05rem] border border-black/7 bg-[rgba(249,245,238,0.92)] px-3 py-3 text-[12px] text-slate-600">
          Stress inputs are not complete for this filing, so the post-shock runway read is not available yet.
        </div>
      )}
    </div>
  );
}

function buildSnapshotDefinition(organization: OrganizationRecord, model: DecisionLabModel): SnapshotDefinition {
  const netAssets = compactCurrency(organization.netAssetsEoy ?? 0);
  const totalRevenue = organization.revenueDisplay || compactCurrency(organization.revenueAmount ?? 0);
  const currentRunway = cappedRunwayMonths(organization.operatingRunwayMonths);
  const shock25 = cappedRunwayMonths(organization.stress.burnMonths25 ?? currentRunway);
  const infrastructureGap = model.scoreDrivers.find((driver) => driver.label === "Financial Foundation")?.value ?? 0;
  const completeness = buildCompletenessChecklist(organization);

  switch (organization.actionLabel) {
    case "Underinvested Asset Base": {
      const unrealizedReturns = compactCurrency(computeUnrealizedAnnualReturns(organization));
      return {
        eyebrow: "Highest upside",
        title: "Unlock underused assets",
        pitch: `${formatOrganizationName(organization.orgName)} has ${netAssets} invested at ${organization.investmentYield.toFixed(2)}% yield. At the 5% benchmark, that's ${unrealizedReturns}/year they're leaving on the table.`,
        metrics: [
          { label: "Net assets", value: netAssets },
          { label: "Total revenue", value: totalRevenue },
          { label: "Current investment yield", value: `${organization.investmentYield.toFixed(2)}%` },
          { label: "Investment track record", value: `${organization.consecutiveYearsWithInvestmentIncome} years investing` },
          { label: "Unrealized annual returns", value: unrealizedReturns, emphasis: "hero" },
        ],
      };
    }
    case "Revenue Concentration Risk":
      return {
        eyebrow: "Fragility check",
        title: "Reduce single-source dependence",
        pitch: `${formatOrganizationName(organization.orgName)} earns ${organization.stress.largestSourcePct.toFixed(1)}% of revenue from ${formatLargestSourceName(organization.stress.largestSource)}. If that source cuts 25%, they have ${formatRunwayForPitch(shock25)} of cash.`,
        metrics: [
          { label: "Net assets", value: netAssets },
          { label: "Total revenue", value: totalRevenue },
          { label: "Largest source", value: `${formatLargestSourceName(organization.stress.largestSource)} · ${organization.stress.largestSourcePct.toFixed(1)}%` },
          { label: "Current cash runway", value: formatRunwayForCard(currentRunway) },
          { label: "Post-shock runway at -25%", value: formatRunwayForCard(shock25), emphasis: "hero" },
        ],
      };
    case "Weak Financial Foundation":
      return {
        eyebrow: "Foundation gap",
        title: "Build reserve discipline first",
        pitch: `${formatOrganizationName(organization.orgName)} has ${netAssets} in assets and ${formatRunwayForPitch(currentRunway)} of runway. They need a reserve policy before the next funding cycle.`,
        metrics: [
          { label: "Net assets", value: netAssets },
          { label: "Total revenue", value: totalRevenue },
          { label: "Current cash runway", value: formatRunwayForCard(currentRunway) },
          { label: "Operating margin", value: `${formatSigned(organization.operatingMargin)}%` },
          { label: "Infrastructure gap score", value: `${infrastructureGap.toFixed(1)} / 40`, emphasis: "hero" },
        ],
      };
    case "Needs Data Diligence":
      return {
        eyebrow: "Confidence gate",
        title: "Validate the filing before outreach",
        pitch: `${formatOrganizationName(organization.orgName)} has ${completeness.availableCount} of 5 key financial fields populated. Manual review is needed before outreach.`,
        metrics: [
          { label: "Data completeness", value: `${completeness.availableCount} of 5 fields` },
          { label: "Latest filing year", value: `FY${organization.latestFilingYear}` },
          { label: "Missing fields", value: completeness.missingSummary },
        ],
      };
  }
}

function FlightSignalStrip({
  label,
  matchedStart,
  safetyLine,
}: {
  label: string;
  matchedStart: string;
  safetyLine: string;
}) {
  return (
    <section className="rounded-[1.25rem] border border-black/7 bg-[rgba(249,245,238,0.94)] px-4 py-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Weak signal</p>
          <p className="mt-1.5 text-[1.12rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950">{label}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-full border border-black/7 bg-white/84 px-3 py-1.5 text-[12px] font-medium text-slate-700">
            Safety line {safetyLine}
          </div>
          <div className="rounded-full border border-[#1f5446]/18 bg-[rgba(231,241,236,0.9)] px-3 py-1.5 text-[12px] font-medium text-[#173a32]">
            Matched start {matchedStart}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,14rem)] items-start gap-3 border-t border-black/6 pt-2.5 text-[13px] text-slate-700 first:border-t-0 first:pt-0">
          <span className="min-w-0 leading-[1.25]">{row.label}</span>
          <strong className="min-w-0 break-words text-right leading-[1.2] text-slate-950">{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ReplayControlPanel({
  strategyId,
  setStrategyId,
  metric,
  setMetric,
  scenarios,
}: {
  strategyId: string;
  setStrategyId: (value: string) => void;
  metric: PathMetric;
  setMetric: (value: PathMetric) => void;
  scenarios: Array<{ id: string; title: string }>;
}) {
  return (
    <section className="rounded-[1.25rem] border border-black/7 bg-[rgba(249,245,238,0.92)] p-3.5">
      <div className="grid gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Intervention plan</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {scenarios.map((scenario) => {
              const active = scenario.id === strategyId;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setStrategyId(scenario.id)}
                  className={`min-w-0 cursor-pointer rounded-[0.95rem] border px-3 py-3 text-left text-[12px] font-medium leading-[1.25] [text-wrap:balance] ${
                    active
                      ? "border-[#1f5446]/30 bg-[rgba(231,241,236,0.96)] text-[#173a32]"
                      : "border-black/8 bg-white/78 text-slate-700 hover:bg-[rgba(250,246,239,0.9)]"
                  }`}
                >
                  {financialScenarioLabel(scenario)}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Compare view</p>
          <div className="mt-2 grid gap-2 min-[520px]:grid-cols-2 xl:grid-cols-4">
            {[
              { key: "risk", label: "Risk" },
              { key: "margin", label: "Margin" },
              { key: "cushion", label: "Cushion" },
              { key: "diversity", label: "Revenue mix" },
            ].map((option) => {
              const active = option.key === metric;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMetric(option.key as PathMetric)}
                  className={`min-w-0 cursor-pointer rounded-[0.95rem] border px-3 py-2.5 text-[12px] font-medium leading-[1.2] [text-wrap:balance] ${
                    active
                      ? "border-[#1f5446]/30 bg-[rgba(231,241,236,0.96)] text-[#173a32]"
                      : "border-black/8 bg-white/78 text-slate-700 hover:bg-[rgba(250,246,239,0.9)]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function RangeRail({
  value,
  min,
  max,
  step = 1,
  onChange,
  labels,
  ariaLabel,
  compact = true,
  snapValues,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  labels: string[];
  ariaLabel: string;
  compact?: boolean;
  snapValues?: number[];
}) {
  return (
    <div className="grid gap-2">
      <div className={`rounded-[1rem] border border-black/7 bg-white/82 ${compact ? "p-3" : "p-4"}`}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (!snapValues?.length) {
              onChange(nextValue);
              return;
            }

            const snappedValue = snapValues.reduce((closest, candidate) =>
              Math.abs(candidate - nextValue) < Math.abs(closest - nextValue) ? candidate : closest,
            );

            onChange(snappedValue);
          }}
          className="h-2 w-full cursor-pointer accent-[#1f5446]"
          aria-label={ariaLabel}
        />
      </div>
      <div className="grid gap-2 text-[12px] font-semibold text-slate-800" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
        {labels.map((label) => (
          <span key={label} className="min-w-0 break-words text-center leading-[1.2]">{label}</span>
        ))}
      </div>
    </div>
  );
}

function RouteDeckCard({
  label,
  title,
  orgName,
  story,
  window,
  startGap,
  timeToSafety,
  endRead,
  safetyYear,
  active,
  onClick,
}: {
  label: string;
  title: string;
  orgName: string;
  story: string;
  window: string;
  startGap: string;
  timeToSafety: string;
  endRead: string;
  safetyYear: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 cursor-pointer rounded-[1.4rem] border px-4 py-4.5 text-left ${
        active
          ? "border-transparent bg-[linear-gradient(180deg,rgba(22,57,49,0.98),rgba(16,38,33,0.98))] text-[rgba(239,247,242,0.98)]"
          : "border-black/7 bg-[rgba(249,245,238,0.92)] text-slate-950 hover:bg-white/82"
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${active ? "text-[rgba(239,247,242,0.8)]" : "text-slate-600"}`}>{label}</p>
      <strong className="mt-2 block break-words text-[1.15rem] leading-[1.08] tracking-[-0.04em] [text-wrap:balance]">{title}</strong>
      <p className={`mt-2 break-words text-[14px] leading-[1.25] ${active ? "text-[rgba(239,247,242,0.88)]" : "text-slate-700"}`}>{orgName}</p>
      <p className={`mt-2 break-words text-[13px] leading-[1.35] ${active ? "text-[rgba(239,247,242,0.8)]" : "text-slate-600"}`}>{story}</p>
      <div className={`mt-3 grid gap-2 border-t pt-3 text-[13px] ${active ? "border-white/12 text-[rgba(239,247,242,0.88)]" : "border-black/7 text-slate-700"}`}>
        <div className="flex items-center justify-between gap-3">
          <span>Start gap</span>
          <strong className={active ? "text-[rgba(248,252,250,0.98)]" : "text-slate-950"}>{startGap}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Time to safety</span>
          <strong className={active ? "text-[rgba(248,252,250,0.98)]" : "text-slate-950"}>{timeToSafety}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>End read</span>
          <strong className={active ? "text-[rgba(248,252,250,0.98)]" : "text-slate-950"}>{endRead}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Safety reached</span>
          <strong className={active ? "text-[rgba(248,252,250,0.98)]" : "text-slate-950"}>
            {safetyYear ? `FY${safetyYear}` : "Not reached"}
          </strong>
        </div>
      </div>
      <p className={`mt-3 break-words text-[13px] leading-[1.3] ${active ? "text-[rgba(239,247,242,0.84)]" : "text-slate-600"}`}>{window}</p>
    </button>
  );
}

function SelectedRouteSpotlight({
  deckType,
  routeName,
  recoveryWindow,
  matchedStart,
  peerStart,
  selectedRouteYear,
  orgMatchedYear,
  orgValue,
  peerValue,
  endRead,
  safetyYear,
}: {
  deckType: FlightDeckType;
  routeName: string;
  recoveryWindow: string;
  matchedStart: string;
  peerStart: string;
  selectedRouteYear: number;
  orgMatchedYear: number;
  orgValue: string;
  peerValue: string;
  endRead: string;
  safetyYear: number | null;
}) {
  return (
    <section className="rounded-[1.45rem] border border-[#1f5446]/16 bg-[linear-gradient(180deg,rgba(232,241,235,0.95),rgba(246,249,246,0.9))] px-4 py-3.5">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] xl:items-start">
        <div className="min-w-0 rounded-[1.1rem] border border-[#1f5446]/14 bg-white/88 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#557062]">{routeDeckEyebrow(deckType)}</p>
          <strong className="mt-1 block break-words text-[1.28rem] leading-[1.02] tracking-[-0.06em] text-slate-950">
            {routeName}
          </strong>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 rounded-[1rem] border border-black/7 bg-white/78 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Matched start</p>
            <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{matchedStart}</p>
          </div>
          <div className="min-w-0 rounded-[1rem] border border-black/7 bg-white/78 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Peer start</p>
            <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{peerStart}</p>
          </div>
          <div className="min-w-0 rounded-[1rem] border border-black/7 bg-white/78 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">You @ FY{orgMatchedYear}</p>
            <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{orgValue}</p>
          </div>
          <div className="min-w-0 rounded-[1rem] border border-black/7 bg-white/78 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Peer @ FY{selectedRouteYear}</p>
            <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{peerValue}</p>
          </div>
          <div className="min-w-0 rounded-[1rem] border border-black/7 bg-white/78 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Safety reached</p>
            <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">
              {safetyYear ? `FY${safetyYear}` : "Not reached"}
            </p>
          </div>
          <div className="min-w-0 rounded-[1rem] border border-black/7 bg-white/78 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">End read</p>
            <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.04em] text-slate-950">{endRead}</p>
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#557062]">{viewWindowLabel(recoveryWindow)}</p>
    </section>
  );
}

function ReplayReferenceCard({
  interventionYear,
  observedYear,
  windowLabel,
  targetSignal,
  baseline,
  rankingLabel,
}: {
  interventionYear: number;
  observedYear: number;
  windowLabel: string;
  targetSignal: FlightSignal;
  baseline: PathState;
  rankingLabel: string;
}) {
  return (
    <section className="rounded-[1.25rem] border border-black/7 bg-[rgba(249,245,238,0.92)] p-3.5">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <SnapshotMetricCard label="Intervention point" value={`FY${interventionYear}`} compact />
        <SnapshotMetricCard label="Observed next filing" value={`FY${observedYear}`} compact />
        <SnapshotMetricCard label="Replay window" value={windowLabel} compact />
        <SnapshotMetricCard label="Peer logic" value={flightSignalTitle(targetSignal)} compact />
        <SnapshotMetricCard label="Risk signal" value={rankingLabel} compact />
        <SnapshotMetricCard label="Starting margin" value={`${formatSigned(baseline.margin)}%`} compact />
      </div>
    </section>
  );
}

function StatePanel({
  eyebrow,
  title,
  stats,
  emphasized = false,
}: {
  eyebrow: string;
  title: string;
  stats: Array<{ label: string; value: string }>;
  emphasized?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-[1.45rem] border p-4 ${
        emphasized ? "border-[#1f5446]/22 bg-[rgba(231,241,236,0.92)]" : "border-black/7 bg-white/84"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{eyebrow}</p>
      <strong className="mt-2 block break-words text-[1.2rem] leading-[1.12] tracking-[-0.04em] text-slate-950 [text-wrap:balance]">{title}</strong>
      <div className="mt-4 grid gap-2">
        {stats.map((stat) => (
          <SidebarMetricRow key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </section>
  );
}

function QuickActionButton({
  label,
  value,
  detail,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string;
  detail: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="min-w-0 cursor-pointer rounded-[1rem] border border-black/7 bg-[rgba(249,245,238,0.92)] px-3 py-2.5 text-left hover:bg-white/84"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</p>
      <p className="mt-1.5 break-words text-[1rem] font-semibold leading-[1.15] tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-1 break-words text-[12px] leading-[1.25] text-slate-700">{detail}</p>
    </button>
  );
}

function RecoveryFlightChart({
  signal,
  view,
}: {
  signal: FlightSignal;
  view: FlightView;
}) {
  const width = 820;
  const height = 348;
  const margin = { top: 24, right: 24, bottom: 44, left: 78 };
  const chartHeight = height - margin.top - margin.bottom;
  const values = [view.orgComparisonSeries, view.selectedRoute.series].flat();
  const min = d3Min(values) ?? 0;
  const max = d3Max(values) ?? 1;
  const paddedMin = min === max ? min - 1 : min - (max - min) * 0.12;
  const paddedMax = min === max ? max + 1 : max + (max - min) * 0.12;
  const xScale = scaleLinear().domain([0, Math.max(1, view.chartYears.length - 1)]).range([margin.left, width - margin.right]);
  const yScale = scaleLinear().domain([paddedMin, paddedMax]).range([height - margin.bottom, margin.top]);
  const lineGenerator = d3Line<number>()
    .x((_: number, index: number) => xScale(index))
    .y((value: number) => yScale(value))
    .curve(curveCatmullRom.alpha(0.55));
  const areaGenerator = d3Area<number>()
    .x((_: number, index: number) => xScale(index))
    .y0(height - margin.bottom)
    .y1((value: number) => yScale(value))
    .curve(curveCatmullRom.alpha(0.55));
  const yTicks = Array.from({ length: 4 }, (_, index) => paddedMin + ((paddedMax - paddedMin) * index) / 3).reverse();
  const scrubX = xScale(view.selectedIndex);
  const selectedRouteArea = areaGenerator(view.selectedRoute.series) ?? "";
  const selectedCurrentY = yScale(view.orgComparisonSeries[view.selectedIndex] ?? view.orgComparisonSeries.at(-1) ?? 0);
  const selectedRouteY = yScale(view.selectedRoute.series[view.selectedIndex] ?? view.selectedRoute.series.at(-1) ?? 0);
  const thresholdY = yScale(view.safetyThreshold);
  const palette = ["#7da0c8", "#d0a66a", "#72aa8e"];
  const selectedRouteColor = palette[Math.max(0, view.routes.findIndex((route) => route.id === view.selectedRoute.id)) % palette.length];

  return (
    <section className="rounded-[1.45rem] border border-black/7 bg-white/84 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong className="block text-[1.2rem] tracking-[-0.04em] text-slate-950">
          {signal === "concentration" ? "Revenue mix from matched start" : signal === "runway" ? "Reserve cushion from matched start" : "Operating margin from matched start"}
        </strong>
        <div className="rounded-full border border-black/7 bg-[rgba(249,245,238,0.9)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600">
          FY{view.selectedRouteYear}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
          <span className="h-1.5 w-4 rounded-full bg-[rgba(17,21,27,0.9)]" />
          Your observed path · FY{view.orgMatchedYears[0]}-FY{view.orgMatchedYears.at(-1)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
          <span className="h-1.5 w-4 rounded-full" style={{ background: selectedRouteColor }} />
          {routeDeckTitle(view.selectedRoute.deckType)} · FY{view.selectedRoute.windowYears[0]}-FY{view.selectedRoute.windowYears.at(-1)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
          <span className="h-1.5 w-4 border-t-2 border-dashed border-[#2d5a4c]" />
          Safety line
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(249,245,238,0.9)]">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block h-[340px] w-full">
        <defs>
          <clipPath id="flight-progress-clip">
            <rect
              x={margin.left - 6}
              y={margin.top - 8}
              height={chartHeight + 18}
              width={Math.max(12, scrubX - margin.left + 12)}
            />
          </clipPath>
          <linearGradient id="flight-route-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(114,170,142,0.22)" />
            <stop offset="100%" stopColor="rgba(114,170,142,0.02)" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`flight-y-${tick}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="rgba(71,85,105,0.14)" strokeWidth="1.2" />
              <text x="12" y={y + 4} fontSize="10" fill="rgba(71,85,105,0.68)">
                {formatSignal(tick, signal)}
              </text>
            </g>
          );
        })}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="rgba(71,85,105,0.22)" strokeWidth="1.4" />
        <line x1={margin.left} y1={thresholdY} x2={width - margin.right} y2={thresholdY} stroke="rgba(31,84,70,0.28)" strokeWidth="1.4" strokeDasharray="6 6" />
        <text x={width - margin.right} y={thresholdY - 8} textAnchor="end" fontSize="10" fill="rgba(31,84,70,0.72)">
          Safety line
        </text>
        <line x1={scrubX} y1={margin.top} x2={scrubX} y2={height - margin.bottom} stroke="rgba(31,84,70,0.2)" strokeWidth="1.4" strokeDasharray="7 7" />
        <path d={selectedRouteArea} fill="url(#flight-route-fill)" clipPath="url(#flight-progress-clip)" />

        <path
          d={lineGenerator(view.selectedRoute.series) ?? ""}
          fill="none"
          stroke={selectedRouteColor}
          strokeWidth="2.4"
          opacity="0.22"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={lineGenerator(view.selectedRoute.series) ?? ""}
          fill="none"
          stroke={selectedRouteColor}
          clipPath="url(#flight-progress-clip)"
          strokeWidth="4.8"
          opacity="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={xScale(view.selectedIndex)}
          cy={yScale(view.selectedRoute.series[view.selectedIndex] ?? view.selectedRoute.series.at(-1) ?? view.selectedRoute.postValue)}
          r="5.2"
          fill={selectedRouteColor}
        />

        <path
          d={lineGenerator(view.orgComparisonSeries) ?? ""}
          fill="none"
          stroke="rgba(17,21,27,0.18)"
          strokeWidth="3.6"
          strokeDasharray="8 8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={lineGenerator(view.orgComparisonSeries) ?? ""}
          fill="none"
          stroke="rgba(17,21,27,0.92)"
          clipPath="url(#flight-progress-clip)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={scrubX} cy={selectedCurrentY} r="5.4" fill="rgba(17,21,27,0.98)" />
        <circle cx={scrubX} cy={selectedRouteY} r="5.4" fill={selectedRouteColor} stroke="rgba(255,255,255,0.9)" strokeWidth="2" />

        <text x={xScale(0)} y={height - 10} fontSize="11" fill="rgba(71,85,105,0.72)">
          Match start
        </text>
        <text x={xScale(Math.floor((view.chartYears.length - 1) / 2))} y={height - 10} fontSize="11" textAnchor="middle" fill="rgba(71,85,105,0.72)">
          {view.selectedRoute.timeToSafetyYears === null ? "Mid route" : "Safety"}
        </text>
        <text x={xScale(Math.max(0, view.chartYears.length - 1))} y={height - 10} fontSize="11" textAnchor="end" fill="rgba(71,85,105,0.72)">
          Finish
        </text>
        </svg>
      </div>
    </section>
  );
}

function PathReplayChart({ view, metric }: { view: PathView; metric: PathMetric }) {
  const width = 820;
  const height = 348;
  const margin = { top: 24, right: 24, bottom: 44, left: 78 };
  const actualSeries = view.timeline.map((point) => metricValue(point.actual, metric));
  const projectedSeries = view.timeline.map((point) => metricValue(point.projected, metric));
  const replayScale = buildReplayChartScale(metric, [...actualSeries, ...projectedSeries]);
  const xScale = scaleLinear()
    .domain([0, Math.max(1, view.timeline.length - 1)])
    .range([margin.left, width - margin.right]);
  const yScale = scaleLinear().domain([replayScale.min, replayScale.max]).range([height - margin.bottom, margin.top]);
  const lineGenerator = d3Line<number>()
    .x((_: number, index: number) => xScale(index))
    .y((value: number) => yScale(value))
    .curve(curveMonotoneX);
  const yTicks = replayScale.ticks;
  const actualPath = lineGenerator(actualSeries) ?? "";
  const projectedPath = lineGenerator(projectedSeries) ?? "";
  const interventionIndex = view.timeline.findIndex((point) => point.year === view.interventionYear);
  const interventionX = xScale(Math.max(0, interventionIndex));

  return (
    <section className="rounded-[1.45rem] border border-black/7 bg-white/84 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong className="block text-[1.2rem] tracking-[-0.04em] text-slate-950">{pathMetricLabel(metric)} through replay window</strong>
        <div className="rounded-full border border-black/7 bg-[rgba(249,245,238,0.9)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600">
          {view.windowLabel}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
          <span className="h-1.5 w-4 rounded-full bg-[rgba(63,69,67,0.96)]" />
          Actual path
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
          <span className="h-1.5 w-4 rounded-full bg-[rgba(90,139,115,0.98)]" />
          Improved path
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(249,245,238,0.9)]">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block h-[340px] w-full">
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`replay-y-${tick}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="rgba(71,85,105,0.14)" strokeWidth="1.2" />
              <text x="12" y={y + 4} fontSize="10" fill="rgba(71,85,105,0.68)">
                {formatPathMetric(tick, metric)}
              </text>
            </g>
          );
        })}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="rgba(71,85,105,0.22)" strokeWidth="1.4" />
        <line x1={interventionX} y1={margin.top} x2={interventionX} y2={height - margin.bottom} stroke="rgba(71,85,105,0.28)" strokeWidth="1.4" strokeDasharray="7 7" />
        <rect
          x={interventionX}
          y={margin.top}
          width={width - margin.right - interventionX}
          height={height - margin.top - margin.bottom}
          fill="rgba(90,139,115,0.06)"
        />

        <path
          d={actualPath}
          fill="none"
          stroke="rgba(63,69,67,0.96)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={projectedPath}
          fill="none"
          stroke="rgba(90,139,115,0.98)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {view.timeline.map((point, index) => {
          const x = xScale(index);
          const actualValue = actualSeries[index] ?? 0;
          const projectedValue = projectedSeries[index] ?? 0;
          return (
            <g key={`replay-point-${point.year}`}>
              <circle cx={x} cy={yScale(actualValue)} r="5.4" fill="rgba(63,69,67,0.98)" />
              <circle cx={x} cy={yScale(projectedValue)} r="5.4" fill="rgba(90,139,115,0.98)" />
              <text x={x} y={height - 10} fontSize="11" textAnchor="middle" fill="rgba(71,85,105,0.72)">
                FY{point.year}
              </text>
            </g>
          );
        })}
        </svg>
      </div>
    </section>
  );
}

function MiniMultiSeriesChart({
  labels,
  series,
}: {
  labels: string[];
  series: Array<{ label: string; color: string; values: number[] }>;
}) {
  const width = 820;
  const height = 236;
  const margin = { top: 18, right: 26, bottom: 40, left: 74 };
  const values = series.flatMap((item) => item.values);
  const minValue = d3Min(values) ?? 0;
  const maxValue = d3Max(values) ?? 1;
  const paddedMin = minValue === maxValue ? minValue - 1 : minValue - (maxValue - minValue) * 0.12;
  const paddedMax = minValue === maxValue ? maxValue + 1 : maxValue + (maxValue - minValue) * 0.12;
  const xScale = scaleLinear().domain([0, Math.max(1, labels.length - 1)]).range([margin.left, width - margin.right]);
  const yScale = scaleLinear().domain([paddedMin, paddedMax]).range([height - margin.bottom, margin.top]);
  const lineGenerator = d3Line<number>()
    .x((_: number, index: number) => xScale(index))
    .y((value: number) => yScale(value))
    .curve(curveMonotoneX);
  const tickValues = Array.from({ length: 4 }, (_, index) => paddedMin + ((paddedMax - paddedMin) * index) / 3).reverse();
  const labelIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), Math.max(0, labels.length - 1)])];

  return (
    <div className="grid gap-2">
      <div className="overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(249,245,238,0.9)]">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block h-[236px] w-full">
        {tickValues.map((tick) => (
          <g key={`financial-tick-${tick}`}>
            <line
              x1={margin.left}
              y1={yScale(tick)}
              x2={width - margin.right}
              y2={yScale(tick)}
              stroke="rgba(71,85,105,0.14)"
              strokeWidth="1.1"
            />
            <text x={10} y={yScale(tick) + 4} fontSize="10" fill="rgba(71,85,105,0.68)">
              {compactCurrency(tick)}
            </text>
          </g>
        ))}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="rgba(71,85,105,0.24)" strokeWidth="1.2" />
        {series.map((item) => {
          const path = lineGenerator(item.values) ?? "";
          return (
            <path
              key={item.label}
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {labelIndexes.map((index) => (
          <text
            key={`financial-label-${index}`}
            x={xScale(index)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="rgba(71,85,105,0.72)"
          >
            {labels[index] ?? ""}
          </text>
        ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StackedMixPreview({
  history,
  concentrationSeries,
}: {
  history: OrganizationRecord["revenueCompositionHistory"];
  concentrationSeries?: number[];
}) {
  const width = 820;
  const height = 236;
  const margin = { top: 18, right: 22, bottom: 40, left: 64 };
  const palette = {
    contributions: "#c89648",
    program: "#4f7664",
    investment: "#6f87a2",
    other: "#c7c0b2",
  };
  const plotWidth = width - margin.left - margin.right;
  const barGap = 6;
  const barWidth = Math.max(14, plotWidth / Math.max(1, history.length) - barGap);
  const xScale = scaleLinear().domain([0, Math.max(1, history.length - 1)]).range([margin.left, width - margin.right - barWidth]);
  const yScale = scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
  const labelIndexes = [...new Set([0, Math.round((history.length - 1) / 2), Math.max(0, history.length - 1)])];
  const layerOrder: Array<{ key: keyof typeof palette; label: string; color: string }> = [
    { key: "program", label: "Program", color: palette.program },
    { key: "contributions", label: "Contributions", color: palette.contributions },
    { key: "investment", label: "Investment", color: palette.investment },
    { key: "other", label: "Other", color: palette.other },
  ];

  return (
    <div className="grid gap-2">
      <div className="overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(249,245,238,0.9)]">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block h-[236px] w-full">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={`mix-tick-${tick}`}>
            <line
              x1={margin.left}
              y1={yScale(tick)}
              x2={width - margin.right}
              y2={yScale(tick)}
              stroke="rgba(71,85,105,0.12)"
              strokeWidth="1.1"
            />
            <text x={14} y={yScale(tick) + 4} fontSize="10" fill="rgba(71,85,105,0.64)">
              {tick}%
            </text>
          </g>
        ))}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="rgba(71,85,105,0.22)" strokeWidth="1.2" />
        {history.map((point, index) => {
          const segments = [
            { value: point.programPct, color: palette.program },
            { value: point.contributionsPct, color: palette.contributions },
            { value: point.investmentPct, color: palette.investment },
            { value: point.otherPct, color: palette.other },
          ];
          let running = 0;
          return (
            <g key={`mix-bar-${point.fiscalYear}`}>
              {segments.map((segment, segmentIndex) => {
                const segmentTop = yScale(running + segment.value);
                const segmentBottom = yScale(running);
                const segmentHeight = Math.max(0, segmentBottom - segmentTop);
                const y = segmentTop;
                running += segment.value;
                return (
                  <rect
                    key={`mix-segment-${point.fiscalYear}-${segmentIndex}`}
                    x={xScale(index)}
                    y={y}
                    width={barWidth}
                    height={segmentHeight}
                    rx={segmentHeight > 18 ? 8 : 3}
                    fill={segment.color}
                    fillOpacity={0.9}
                  />
                );
              })}
            </g>
          );
        })}
        {concentrationSeries?.length
          ? (() => {
              const concentrationPath = d3Line<number>()
                .x((_: number, index: number) => xScale(index) + barWidth / 2)
                .y((value: number) => yScale(value))
                .curve(curveMonotoneX)(concentrationSeries);

              return concentrationPath ? (
                <g>
                  <path d={concentrationPath} fill="none" stroke="rgba(31,84,70,0.84)" strokeWidth="2.6" strokeLinecap="round" />
                  {concentrationSeries.map((value, index) => (
                    <circle
                      key={`mix-overlay-${history[index]?.fiscalYear ?? index}`}
                      cx={xScale(index) + barWidth / 2}
                      cy={yScale(value)}
                      r="2.8"
                      fill="rgba(31,84,70,0.9)"
                    />
                  ))}
                </g>
              ) : null;
            })()
          : null}
        {labelIndexes.map((index) => (
          <text
            key={`mix-label-${index}`}
            x={xScale(index) + barWidth / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="rgba(71,85,105,0.72)"
          >
            {history[index] ? `FY${history[index].fiscalYear}` : ""}
          </text>
        ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {layerOrder.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        {concentrationSeries?.length ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-black/7 bg-white/84 px-2.5 py-1 text-[11px] text-slate-600">
            <span className="h-1.5 w-4 rounded-full bg-[rgba(31,84,70,0.84)]" />
            Largest source %
          </span>
        ) : null}
      </div>
    </div>
  );
}

function buildSeriesDetail({
  title,
  subtitle,
  labels,
  values,
  color,
  valueFormatter,
}: {
  title: string;
  subtitle: string;
  labels: string[];
  values: number[];
  color: string;
  valueFormatter: (value: number) => string;
}): DecisionLabDetail {
  return {
    title,
    subtitle,
    guideTitle: "How to read this chart",
    guideBullets: [
      "The large line shows the full filing-year pattern, with start, midpoint, and latest values labeled directly on the chart.",
      "Use the inflections in the curve to understand when the financial profile changed, not just where it ended.",
      "Read this alongside the other evidence cards to understand whether growth, cost pressure, or balance-sheet strength is shaping the case.",
    ],
    content: <SeriesDetailChart labels={labels} values={values} color={color} valueFormatter={valueFormatter} />,
  };
}

function buildMixDetail({
  title,
  subtitle,
  labels,
  values,
  color,
}: {
  title: string;
  subtitle: string;
  labels: string[];
  values: number[];
  color: string;
}): DecisionLabDetail {
  return {
    title,
    subtitle,
    guideTitle: "How to read this chart",
    guideBullets: [
      "Each bar shows the share of total revenue coming from this stream in that filing year.",
      "Higher bars mean the organization is leaning harder on that source in that year.",
      "Read this against the other revenue streams to see whether the overall mix is broadening or concentrating.",
    ],
    content: <MixDetailChart labels={labels} values={values} color={color} />,
  };
}

function SeriesDetailChart({
  labels,
  values,
  color,
  valueFormatter,
}: {
  labels: string[];
  values: number[];
  color: string;
  valueFormatter: (value: number) => string;
}) {
  const width = 1320;
  const height = 640;
  const plotLeft = 132;
  const plotTop = 26;
  const plotBottom = 116;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const stepX = values.length > 1 ? width / (values.length - 1) : width / 2;
  const projectY = (value: number) => plotTop + height - ((value - min) / span) * height;
  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${(plotLeft + stepX * index).toFixed(2)} ${projectY(value).toFixed(2)}`)
    .join(" ");
  const area = `${path} L ${plotLeft + width} ${plotTop + height} L ${plotLeft} ${plotTop + height} Z`;
  const keyIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), labels.length - 1])];
  const yTicks = [max, min + span * 0.5, min];

  return (
    <div className="grid h-full min-h-0 gap-4" data-testid="expanded-series-chart">
      <div className="min-h-[24rem] overflow-hidden rounded-[1.8rem] border border-black/6 bg-[rgba(247,243,235,0.78)] p-4">
        <svg viewBox={`0 0 ${width + plotLeft + 8} ${height + plotTop + plotBottom}`} className="h-full min-h-[22rem] w-full">
          {yTicks.map((tick) => {
            const y = projectY(tick);
            return (
              <g key={tick}>
                <line x1={plotLeft} y1={y} x2={width + plotLeft} y2={y} stroke="rgba(67, 82, 97, 0.22)" strokeWidth="1.6" strokeDasharray="6 8" />
                <text x="0" y={y + 8} fill="#435261" fontSize="28" fontWeight="700" letterSpacing="0.35">
                  {valueFormatter(tick)}
                </text>
              </g>
            );
          })}
          <path d={area} fill={color} fillOpacity="0.12" />
          <path d={path} fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          {keyIndexes.map((index) => {
            const x = plotLeft + stepX * index;
            const y = projectY(values[index]);
            return (
              <g key={index}>
                <circle cx={x} cy={y} r="8.5" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="2.8" />
                <text x={x} y={Math.max(26, y - 18)} textAnchor="middle" fill="#334155" fontSize="22" fontWeight="700" letterSpacing="0.2">
                  {valueFormatter(values[index])}
                </text>
              </g>
            );
          })}
          {keyIndexes.map((index) => (
            <text
              key={`${labels[index]}-${index}`}
              x={plotLeft + stepX * index}
              y={height + plotTop + 52}
              textAnchor="middle"
              fill="#435261"
              fontSize="22"
              fontWeight="700"
              letterSpacing="0.5"
            >
              {labels[index]}
            </text>
          ))}
        </svg>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {keyIndexes.map((index) => (
          <div key={`series-summary-${index}`} className="rounded-[1.2rem] border border-black/6 bg-white/82 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{labels[index]}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{valueFormatter(values[index])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MixDetailChart({
  labels,
  values,
  color,
}: {
  labels: string[];
  values: number[];
  color: string;
}) {
  const width = 1320;
  const height = 640;
  const plotLeft = 132;
  const plotTop = 26;
  const plotBottom = 116;
  const max = Math.max(...values, 100);
  const min = 0;
  const span = Math.max(1, max - min);
  const barWidth = width / Math.max(1, values.length) - 10;
  const keyIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), labels.length - 1])];
  const yTicks = [max, Math.round(max / 2), 0];

  return (
    <div className="grid h-full min-h-0 gap-4" data-testid="expanded-mix-chart">
      <div className="min-h-[24rem] overflow-hidden rounded-[1.8rem] border border-black/6 bg-[rgba(247,243,235,0.78)] p-4">
        <svg viewBox={`0 0 ${width + plotLeft + 8} ${height + plotTop + plotBottom}`} className="h-full min-h-[22rem] w-full">
          {yTicks.map((tick) => {
            const y = plotTop + height - ((tick - min) / span) * height;
            return (
              <g key={tick}>
                <line x1={plotLeft} y1={y} x2={width + plotLeft} y2={y} stroke="rgba(67, 82, 97, 0.22)" strokeWidth="1.6" strokeDasharray="6 8" />
                <text x="0" y={y + 8} fill="#435261" fontSize="28" fontWeight="700" letterSpacing="0.35">
                  {`${Math.round(tick)}%`}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${plotLeft} ${plotTop})`}>
            {values.map((value, index) => {
              const x = index * (barWidth + 10);
              const h = ((value - min) / span) * height;
              const y = height - h;
              return <rect key={`${value}-${index}`} x={x} y={y} width={barWidth} height={h} rx="14" fill={color} fillOpacity="0.82" />;
            })}
            {keyIndexes.map((index) => {
              const value = values[index];
              const x = index * (barWidth + 10) + barWidth / 2;
              const h = ((value - min) / span) * height;
              const y = height - h;
              return (
                <g key={`mix-point-${index}`}>
                  <circle cx={x} cy={y} r="8.5" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="2.8" />
                  <text x={x} y={Math.max(26, y - 18)} textAnchor="middle" fill="#334155" fontSize="22" fontWeight="700" letterSpacing="0.2">
                    {`${Math.round(value)}%`}
                  </text>
                </g>
              );
            })}
          </g>
          {keyIndexes.map((index) => (
            <text
              key={`${labels[index]}-${index}`}
              x={plotLeft + index * (barWidth + 10) + barWidth / 2}
              y={height + plotTop + 52}
              textAnchor="middle"
              fill="#435261"
              fontSize="22"
              fontWeight="700"
              letterSpacing="0.5"
            >
              {labels[index]}
            </text>
          ))}
        </svg>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {keyIndexes.map((index) => (
          <div key={`mix-summary-${index}`} className="rounded-[1.2rem] border border-black/6 bg-white/82 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{labels[index]}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{`${Math.round(values[index])}%`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildFlightView(
  organization: OrganizationRecord,
  signal: FlightSignal,
  lens: FlightLens,
  progress: number,
  activeRouteId: string | null,
): FlightView {
  const orgSeries = buildSignalSeries(organization, signal);
  const orgYears = signal === "concentration"
    ? organization.revenueCompositionHistory.map((point) => point.fiscalYear)
    : organization.historicalFinancials.map((point) => point.fiscalYear);
  const currentValue = orgSeries.at(-1) ?? getCurrentSignalValue(organization, signal);
  const safetyThreshold = flightSafetyThreshold(signal);
  const analogRoutes = organization.analogs
    .filter((analog) => signalMatches(analog.metricName, signal))
    .map((analog) => ({
      id: `${analog.orgName}-${analog.recoveryWindow}`,
      orgName: analog.orgName,
      preValue: analog.preValue,
      postValue: analog.postValue,
      durationYears: parseRecoveryWindowYears(analog.recoveryWindow),
      recoveryWindow: analog.recoveryWindow,
    }));

  const fallbackRoute: FlightRoute = {
    id: "fallback",
    orgName: organization.orgName,
    preValue: currentValue,
    postValue: signal === "concentration" ? Math.min(1, currentValue + 0.22) : signal === "runway" ? currentValue + 3 : currentValue + 4,
    durationYears: 4,
    recoveryWindow: `${organization.firstFilingYear}-${organization.latestFilingYear}`,
  };

  const baseRoutes = analogRoutes.length ? analogRoutes : [fallbackRoute];
  const routeViews = baseRoutes.map((route) => ({
    ...route,
    deckType: "closest" as FlightDeckType,
    windowYears: buildWindowYears(route.recoveryWindow),
    series: [] as number[],
    startGap: Math.abs(route.preValue - currentValue),
    safetyIndex: null as number | null,
    safetyYear: null as number | null,
    timeToSafetyYears: null as number | null,
    totalChange: 0,
  })).map((route) => {
    const windowYears = route.windowYears.length ? route.windowYears : buildFallbackWindowYears(organization, route.durationYears);
    const series = buildRouteSeries({
      startValue: route.preValue,
      endValue: route.postValue,
      points: windowYears.length,
      threshold: safetyThreshold,
      signal,
    });
    const safetyIndex = findSafetyIndex(series, signal, safetyThreshold);
    return {
      ...route,
      windowYears,
      series,
      safetyIndex,
      safetyYear: safetyIndex === null ? null : windowYears[safetyIndex] ?? null,
      timeToSafetyYears: safetyIndex === null ? null : Math.max(0, (windowYears[safetyIndex] ?? windowYears[0]) - windowYears[0]),
      totalChange: route.postValue - route.preValue,
    };
  });

  const closest = routeViews.reduce((best, route) =>
    routeSortScore(route, "closest", signal) < routeSortScore(best, "closest", signal) ? route : best,
  );
  const fastest = routeViews.reduce((best, route) =>
    routeSortScore(route, "fastest", signal) < routeSortScore(best, "fastest", signal) ? route : best,
  );
  const strongest = routeViews.reduce((best, route) =>
    routeSortScore(route, "strongest", signal) > routeSortScore(best, "strongest", signal) ? route : best,
  );
  const featuredRoutes = pickFeaturedRoutes(routeViews, { closest, fastest, strongest }, signal);
  const routeFromLens =
    featuredRoutes.find((route) => route.deckType === lens) ??
    featuredRoutes[0] ??
    closest;
  const selectedRoute = featuredRoutes.find((route) => route.id === activeRouteId) ?? routeFromLens;
  const chartYears = selectedRoute.windowYears;
  const orgMatchedStartIndex = findComparableStartIndex(orgSeries, selectedRoute.preValue);
  const orgComparisonSeries = buildComparableSeries(orgSeries, orgMatchedStartIndex, chartYears.length);
  const orgMatchedYears = buildComparableYears(orgYears, orgMatchedStartIndex, chartYears.length);
  const comparisonLength = Math.max(1, chartYears.length);
  const selectedIndex = Math.max(0, Math.min(comparisonLength - 1, Math.round((Math.max(1, comparisonLength - 1) * progress) / 100)));
  const selectedRouteYear = chartYears[selectedIndex] ?? selectedRoute.windowYears.at(-1) ?? organization.latestFilingYear;
  const orgMatchedYear = orgMatchedYears[selectedIndex] ?? orgMatchedYears.at(-1) ?? organization.latestFilingYear;

  const normalizedRoutes = featuredRoutes.map((route) => ({
    ...route,
    series: route.id === selectedRoute.id ? route.series : resampleSeries(route.series, comparisonLength),
  }));
  const selectedNormalizedRoute = normalizedRoutes.find((route) => route.id === selectedRoute.id) ?? normalizedRoutes[0];

  return {
    routes: normalizedRoutes,
    selectedRoute: selectedNormalizedRoute,
    chartYears,
    orgComparisonSeries,
    orgMatchedYears,
    orgMatchedStartYear: orgMatchedYears[0] ?? organization.firstFilingYear,
    selectedIndex,
    selectedRouteYear,
    orgMatchedYear,
    routeValueAtSelection: selectedNormalizedRoute.series[selectedIndex] ?? selectedNormalizedRoute.postValue,
    orgValueAtSelection: orgComparisonSeries[selectedIndex] ?? currentValue,
    safetyThreshold,
  };
}

function buildRouteSeries({
  startValue,
  endValue,
  points,
  threshold,
  signal,
}: {
  startValue: number;
  endValue: number;
  points: number;
  threshold: number;
  signal: FlightSignal;
}) {
  const safePoints = Math.max(2, points);
  const crossesThreshold =
    signal === "margin"
      ? startValue < threshold && endValue >= threshold
      : startValue < threshold && endValue >= threshold;

  if (!crossesThreshold) {
    return Array.from({ length: safePoints }, (_, index) => {
      const ratio = safePoints === 1 ? 1 : index / (safePoints - 1);
      const eased = 1 - (1 - ratio) * (1 - ratio);
      return startValue + (endValue - startValue) * eased;
    });
  }

  const rawThresholdRatio = (threshold - startValue) / Math.max(0.0001, endValue - startValue);
  const thresholdRatio = Math.max(0.04, Math.min(0.88, rawThresholdRatio));
  const safetyIndex = Math.max(1, Math.min(safePoints - 2, Math.ceil(thresholdRatio * (safePoints - 1))));

  return Array.from({ length: safePoints }, (_, index) => {
    if (index <= safetyIndex) {
      const localRatio = safetyIndex === 0 ? 1 : index / safetyIndex;
      const eased = 1 - (1 - localRatio) * (1 - localRatio);
      return startValue + (threshold - startValue) * eased;
    }

    const remaining = safePoints - 1 - safetyIndex;
    const localRatio = remaining <= 0 ? 1 : (index - safetyIndex) / remaining;
    const eased = localRatio * localRatio;
    return threshold + (endValue - threshold) * eased;
  });
}

function pickFeaturedRoutes(
  routes: FlightRouteView[],
  ranked: Record<FlightDeckType, FlightRouteView>,
  signal: FlightSignal,
) {
  const usedIds = new Set<string>();
  const sorters: Record<FlightDeckType, (route: FlightRouteView) => number> = {
    closest: (route) => routeSortScore(route, "closest", signal),
    fastest: (route) => routeSortScore(route, "fastest", signal),
    strongest: (route) => -routeSortScore(route, "strongest", signal),
  };

  return (["closest", "fastest", "strongest"] as FlightDeckType[])
    .map((deckType) => {
      const rankedRoute = ranked[deckType];
      if (rankedRoute && !usedIds.has(rankedRoute.id)) {
        usedIds.add(rankedRoute.id);
        return { ...rankedRoute, deckType };
      }

      const fallback = [...routes]
        .filter((route) => !usedIds.has(route.id))
        .sort((left, right) => sorters[deckType](left) - sorters[deckType](right))[0];

      if (!fallback) {
        return null;
      }

      usedIds.add(fallback.id);
      return { ...fallback, deckType };
    })
    .filter((route): route is FlightRouteView => route !== null);
}

function routeSortScore(route: FlightRouteView, deckType: FlightDeckType, signal: FlightSignal) {
  const movementThreshold = signal === "concentration" ? 0.035 : signal === "runway" ? 1.5 : 1.25;
  const flatPenalty = Math.abs(route.totalChange) < movementThreshold ? 100 : 0;
  const instantSafetyPenalty = route.safetyIndex === 0 ? 20 : 0;

  if (deckType === "fastest") {
    return (route.timeToSafetyYears ?? route.durationYears) + flatPenalty * 0.1;
  }
  if (deckType === "strongest") {
    return route.postValue - flatPenalty * 0.001;
  }
  return route.startGap + flatPenalty + instantSafetyPenalty;
}

function getAvailableFlightSignals(organization: OrganizationRecord): FlightSignal[] {
  const inferredSignals = organization.analogs
    .map((analog) => analogSignal(analog.metricName))
    .filter((signal): signal is FlightSignal => signal !== null);

  if (inferredSignals.length) {
    return Array.from(new Set(inferredSignals));
  }

  if (organization.actionLabel === "Revenue Concentration Risk") {
    return ["concentration"];
  }
  if (organization.actionLabel === "Weak Financial Foundation") {
    return ["runway"];
  }
  return ["margin"];
}

function getPrimaryFlightSignal(organization: OrganizationRecord): FlightSignal {
  return getAvailableFlightSignals(organization)[0] ?? "concentration";
}

function buildSignalSeries(organization: OrganizationRecord, signal: FlightSignal): number[] {
  if (signal === "margin") {
    return organization.historicalFinancials.map((point) => point.operatingMargin * 100);
  }
  if (signal === "runway") {
    return organization.historicalFinancials.map((point) => computeReserveCushion(point.expenses, point.liquidReserves));
  }
  return organization.revenueCompositionHistory.map((point) => computeRevenueDiversity(point));
}

function getCurrentSignalValue(organization: OrganizationRecord, signal: FlightSignal): number {
  if (signal === "margin") {
    return organization.operatingMargin * 100;
  }
  if (signal === "runway") {
    return organization.operatingRunwayMonths;
  }
  return organization.revenueDiversificationIndex;
}

function parseRecoveryWindowYears(window: string) {
  const [start, end] = window.split("-").map((part) => Number.parseInt(part, 10));
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.max(1, end - start);
  }
  return 4;
}

function buildWindowYears(window: string) {
  const [start, end] = window.split("-").map((part) => Number.parseInt(part, 10));
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  return [];
}

function buildFallbackWindowYears(organization: OrganizationRecord, durationYears: number) {
  const end = organization.latestFilingYear;
  const start = end - Math.max(1, durationYears);
  return Array.from({ length: Math.max(2, end - start + 1) }, (_, index) => start + index);
}

function findComparableStartIndex(series: number[], target: number) {
  if (series.length === 0) {
    return 0;
  }

  let bestIndex = 0;
  let bestGap = Math.abs((series[0] ?? 0) - target);
  for (let index = 1; index < series.length; index += 1) {
    const gap = Math.abs((series[index] ?? 0) - target);
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildComparableSeries(series: number[], startIndex: number, length: number) {
  if (series.length === 0) {
    return Array.from({ length: Math.max(2, length) }, () => 0);
  }

  const safeLength = Math.max(2, length);
  const values = Array.from({ length: safeLength }, (_, index) => series[Math.min(series.length - 1, startIndex + index)] ?? series.at(-1) ?? 0);
  return values;
}

function buildComparableYears(years: number[], startIndex: number, length: number) {
  if (years.length === 0) {
    return Array.from({ length: Math.max(2, length) }, (_, index) => 2000 + index);
  }

  const safeLength = Math.max(2, length);
  return Array.from({ length: safeLength }, (_, index) => years[Math.min(years.length - 1, startIndex + index)] ?? years.at(-1) ?? years[0]);
}

function resampleSeries(series: number[], targetLength: number) {
  if (series.length === 0) {
    return Array.from({ length: Math.max(2, targetLength) }, () => 0);
  }
  if (series.length === targetLength) {
    return [...series];
  }

  const safeLength = Math.max(2, targetLength);
  const lastIndex = series.length - 1;
  return Array.from({ length: safeLength }, (_, index) => {
    const ratio = safeLength === 1 ? 0 : index / (safeLength - 1);
    const sourceIndex = ratio * lastIndex;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(lastIndex, Math.ceil(sourceIndex));
    const blend = sourceIndex - lowerIndex;
    const lower = series[lowerIndex] ?? series[0] ?? 0;
    const upper = series[upperIndex] ?? series[lastIndex] ?? lower;
    return lower + (upper - lower) * blend;
  });
}

function signalMatches(metricName: string, signal: FlightSignal) {
  return analogSignal(metricName) === signal;
}

export function buildPathView(organization: OrganizationRecord, interventionYear: number, scenarioId: string): PathView {
  const curatedTrajectory = getCuratedReplayTrajectory(organization);
  const years = curatedTrajectory.length
    ? curatedTrajectory.map((point) => point.fiscalYear).sort((a, b) => a - b)
    : Array.from(new Set(organization.historicalFinancials.map((point) => point.fiscalYear))).sort((a, b) => a - b);
  if (years.length === 0) {
    const fallback: PathState = {
      risk: clamp(organization.distress.probability, 1, 99),
      diversity: clamp(organization.revenueDiversificationIndex, 0, 1),
      margin: organization.operatingMargin * 100,
      cushion: organization.operatingRunwayMonths,
    };
    return {
      interventionYear: organization.latestFilingYear,
      observedYear: organization.latestFilingYear,
      windowLabel: `FY${organization.latestFilingYear}`,
      targetSignal: getPrimaryFlightSignal(organization),
      baseline: fallback,
      actual: fallback,
      projected: fallback,
      timeline: [{ year: organization.latestFilingYear, actual: fallback, projected: fallback }],
      narrative: `${formatOrganizationName(organization.orgName)} does not have enough historical filing depth to replay a clean intervention window yet.`,
      rankingLabel: `${fallback.risk.toFixed(1)}% distress`,
      driversExplanation: null,
      deltaRisk: 0,
      deltaDiversity: 0,
      deltaMargin: 0,
      deltaCushion: 0,
    };
  }

  const preferredInterventionYear = organization.crisisReplay?.callFiscalYear ?? interventionYear;
  const interventionResolvedIndex = findInterventionIndex(years, preferredInterventionYear);
  const interventionYearResolved = years[interventionResolvedIndex];
  const observedIndex = Math.min(interventionResolvedIndex + 1, years.length - 1);
  const observedYear = years[observedIndex];
  const windowStartIndex = Math.max(0, interventionResolvedIndex - 2);
  const windowEndIndex = Math.min(years.length - 1, interventionResolvedIndex + 2);
  const timelineYears = years.slice(windowStartIndex, windowEndIndex + 1);
  const actualTimeline = timelineYears.map((year) => derivePathStateAtYear(organization, year, curatedTrajectory));
  const targetSignal = resolveReplaySignal(organization, scenarioId);
  const replayProbability = getReplayDistressProbability(organization);
  const baselineIndex = timelineYears.findIndex((year) => year === interventionYearResolved);
  if (baselineIndex >= 0 && replayProbability !== null) {
    actualTimeline[baselineIndex] = {
      ...actualTimeline[baselineIndex],
      risk: clamp(replayProbability, 2, 95),
    };
  }
  const projectedTimeline = buildProjectedReplayTimeline(
    organization,
    targetSignal,
    scenarioId,
    timelineYears,
    interventionYearResolved,
    actualTimeline,
  );
  const observedTimelineIndex = timelineYears.findIndex((year) => year === observedYear);
  const baseline = actualTimeline[Math.max(0, baselineIndex)] ?? actualTimeline[0];
  const actual = actualTimeline[Math.max(0, observedTimelineIndex)] ?? actualTimeline.at(-1) ?? baseline;
  const projected = projectedTimeline[Math.max(0, observedTimelineIndex)] ?? projectedTimeline.at(-1) ?? actual;
  const timeline = timelineYears.map((year, index) => ({
    year,
    actual: actualTimeline[index] ?? baseline,
    projected: projectedTimeline[index] ?? actualTimeline[index] ?? baseline,
  }));

  return {
    interventionYear: interventionYearResolved,
    observedYear,
    windowLabel: `FY${timelineYears[0]}-${timelineYears.at(-1)}`,
    targetSignal,
    baseline,
    actual,
    projected,
    timeline,
    narrative: buildReplayNarrative(organization, interventionYearResolved, observedYear, baseline, actual),
    rankingLabel: buildReplayRankingLabel(organization, baseline),
    driversExplanation: buildReplayDriversExplanation(organization),
    deltaRisk: actual.risk - projected.risk,
    deltaDiversity: projected.diversity - actual.diversity,
    deltaMargin: projected.margin - actual.margin,
    deltaCushion: projected.cushion - actual.cushion,
  };
}

function resolveReplaySignal(organization: OrganizationRecord, scenarioId: string): FlightSignal {
  if (/reserve|bridge/i.test(scenarioId)) {
    return "runway";
  }
  if (/diversification/i.test(scenarioId)) {
    return "concentration";
  }
  if (/portfolio|yield/i.test(scenarioId)) {
    return "margin";
  }

  const primary = getPrimaryFlightSignal(organization);
  return primary;
}

function buildProjectedReplayTimeline(
  organization: OrganizationRecord,
  targetSignal: FlightSignal,
  scenarioId: string,
  timelineYears: number[],
  interventionYear: number,
  actualTimeline: PathState[],
) {
  const interventionIndex = Math.max(0, timelineYears.findIndex((year) => year === interventionYear));
  const targetStartValue = signalStateValue(actualTimeline[interventionIndex] ?? actualTimeline[0], targetSignal);
  const postLength = Math.max(2, timelineYears.length - interventionIndex);
  const threshold = flightSafetyThreshold(targetSignal);
  const analogs = selectReplayAnalogs(organization, targetSignal, targetStartValue);
  const projectedSignalSeries = buildMedianSignalTrajectory(analogs, targetSignal, targetStartValue, postLength, threshold);

  return timelineYears.map((_, index) => {
    const actualState = actualTimeline[index] ?? actualTimeline.at(-1) ?? {
      risk: organization.distress.probability,
      diversity: organization.revenueDiversificationIndex,
      margin: organization.operatingMargin,
      cushion: organization.operatingRunwayMonths,
    };

    if (index <= interventionIndex) {
      return actualState;
    }

    const trajectoryIndex = index - interventionIndex;
    const projectedSignalValue = projectedSignalSeries[trajectoryIndex] ?? projectedSignalSeries.at(-1) ?? targetStartValue;
    return projectReplayState(actualState, projectedSignalValue, targetSignal, scenarioId);
  });
}

function selectReplayAnalogs(
  organization: OrganizationRecord,
  signal: FlightSignal,
  targetStartValue: number,
) {
  const exactMatches = organization.analogs.filter((analog) => signalMatches(analog.metricName, signal));
  const fallbackSignal = getPrimaryFlightSignal(organization);
  const fallbackMatches = organization.analogs.filter((analog) => signalMatches(analog.metricName, fallbackSignal));
  const source = exactMatches.length ? exactMatches : fallbackMatches.length ? fallbackMatches : organization.analogs;

  if (source.length) {
    return source;
  }

  return [
    {
      orgName: organization.orgName,
      state: organization.state,
      metricName: signal === "concentration" ? "revenue diversification index" : signal === "runway" ? "operating runway proxy months" : "operating margin",
      preValue: targetStartValue,
      postValue:
        signal === "concentration"
          ? Math.max(targetStartValue, 0.5)
          : signal === "runway"
            ? Math.max(targetStartValue, 6)
            : Math.max(targetStartValue, 2),
      recoveryWindow: `${interventionYearLabel(organization.firstFilingYear)}-${interventionYearLabel(organization.latestFilingYear)}`,
    },
  ];
}

function buildMedianSignalTrajectory(
  analogs: OrganizationRecord["analogs"],
  signal: FlightSignal,
  startValue: number,
  length: number,
  threshold: number,
) {
  const seriesCollection = analogs.map((analog) =>
    buildRouteSeries({
      startValue,
      endValue: normalizeSignalValue(analog.postValue, signal),
      points: length,
      threshold,
      signal,
    }),
  );

  return Array.from({ length }, (_, index) => median(seriesCollection.map((series) => series[index] ?? series.at(-1) ?? startValue)));
}

function projectReplayState(
  actualState: PathState,
  projectedSignalValue: number,
  signal: FlightSignal,
  scenarioId: string,
): PathState {
  const multiplier = /reserve|bridge|diversification|portfolio|yield/i.test(scenarioId) ? 1.12 : 1.0;

  if (signal === "concentration") {
    const delta = Math.max(0, projectedSignalValue - actualState.diversity);
    return {
      risk: clamp(actualState.risk - delta * 42 * multiplier, 2, 95),
      diversity: clamp(projectedSignalValue, 0, 1),
      margin: actualState.margin + delta * 7.5 * multiplier,
      cushion: Math.max(0, actualState.cushion + delta * 13 * multiplier),
    };
  }

  if (signal === "runway") {
    const delta = Math.max(0, projectedSignalValue - actualState.cushion);
    return {
      risk: clamp(actualState.risk - delta * 1.5 * multiplier, 2, 95),
      diversity: clamp(actualState.diversity + delta * 0.01 * multiplier, 0, 1),
      margin: actualState.margin + delta * 0.55 * multiplier,
      cushion: Math.max(0, projectedSignalValue),
    };
  }

  const delta = Math.max(0, projectedSignalValue - actualState.margin);
  return {
    risk: clamp(actualState.risk - delta * 1.15 * multiplier, 2, 95),
    diversity: clamp(actualState.diversity + delta * 0.004 * multiplier, 0, 1),
    margin: projectedSignalValue,
    cushion: Math.max(0, actualState.cushion + delta * 0.18 * multiplier),
  };
}

function signalStateValue(state: PathState, signal: FlightSignal) {
  if (signal === "concentration") {
    return state.diversity;
  }
  if (signal === "runway") {
    return state.cushion;
  }
  return state.margin;
}

function normalizeSignalValue(value: number, signal: FlightSignal) {
  if (signal === "concentration") {
    return clamp(value, 0, 1);
  }
  if (signal === "runway") {
    return Math.max(0, value);
  }
  return value;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  }
  return sorted[middle] ?? 0;
}

export function findBestReplaySetup(organization: OrganizationRecord): ReplaySetup {
  if (organization.crisisReplay?.callFiscalYear) {
    const scenarios = organization.scenarioCards.length
      ? organization.scenarioCards
      : [{ id: "default", title: "Default" }];
    const interventionYear = organization.crisisReplay.callFiscalYear;
    let bestScenarioId = scenarios[0]?.id ?? "default";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const scenario of scenarios) {
      const view = buildPathView(organization, interventionYear, scenario.id);
      const allImproving = view.deltaRisk > 0 && view.deltaMargin > 0 && view.deltaCushion > 0 && view.deltaDiversity > 0;
      const improvementScore =
        view.deltaRisk / 18 +
        view.deltaMargin / 4 +
        view.deltaCushion / 12 +
        view.deltaDiversity / 0.18;
      const score = improvementScore + (allImproving ? 3 : -6);
      if (score > bestScore) {
        bestScore = score;
        bestScenarioId = scenario.id;
      }
    }

    return { interventionYear, scenarioId: bestScenarioId };
  }

  const years = getInterventionYears(organization);
  const scenarios = organization.scenarioCards.length
    ? organization.scenarioCards
    : [{ id: "default", title: "Default" }];
  const fallbackYear = years.at(-1) ?? organization.latestFilingYear;
  let best: ReplaySetup = { interventionYear: fallbackYear, scenarioId: scenarios[0]?.id ?? "default" };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const year of years) {
    for (const scenario of scenarios) {
      const view = buildPathView(organization, year, scenario.id);
      const allImproving = view.deltaRisk > 0 && view.deltaMargin > 0 && view.deltaCushion > 0 && view.deltaDiversity > 0;
      const urgencyBonus =
        view.actual.risk / 100 +
        Math.max(0, -view.actual.margin / 25) +
        (1 - view.actual.diversity) +
        1 / Math.max(1, view.actual.cushion + 1);
      const improvementScore =
        view.deltaRisk / 18 +
        view.deltaMargin / 4 +
        view.deltaCushion / 12 +
        view.deltaDiversity / 0.18;
      const score = improvementScore + urgencyBonus + (allImproving ? 3 : -6);

      if (score > bestScore) {
        bestScore = score;
        best = { interventionYear: year, scenarioId: scenario.id };
      }
    }
  }

  return best;
}

function derivePathStateAtYear(
  organization: OrganizationRecord,
  year: number,
  curatedTrajectory: CrisisReplayTrajectoryPoint[] = [],
): PathState {
  const replayPoint = curatedTrajectory.find((point) => point.fiscalYear === year);
  if (replayPoint) {
    const normalizedMargin = Math.abs(replayPoint.operatingMargin) <= 5 ? replayPoint.operatingMargin * 100 : replayPoint.operatingMargin;
    const diversity = clamp(1 - replayPoint.largestSourcePct / 100, 0, 1);
    return {
      risk: clamp(replayPoint.distressProbability ?? estimateRisk(organization.distress.baseline, normalizedMargin, replayPoint.cashRunwayMonths, diversity), 2, 95),
      diversity,
      margin: normalizedMargin,
      cushion: replayPoint.cashRunwayMonths,
    };
  }

  const financialPoint = organization.historicalFinancials.find((point) => point.fiscalYear === year) ?? organization.historicalFinancials.at(-1);
  const compositionPoint = organization.revenueCompositionHistory.find((point) => point.fiscalYear === year) ?? organization.revenueCompositionHistory.at(-1);
  const margin = (financialPoint?.operatingMargin ?? organization.operatingMargin) * 100;
  const cushion = financialPoint
    ? computeReserveCushion(financialPoint.expenses, financialPoint.liquidReserves)
    : organization.operatingRunwayMonths;
  const diversity = compositionPoint ? computeRevenueDiversity(compositionPoint) : organization.revenueDiversificationIndex;
  return {
    risk: estimateRisk(organization.distress.baseline, margin, cushion, diversity),
    diversity,
    margin,
    cushion,
  };
}

function estimateRisk(portfolioBaseline: number, margin: number, cushion: number, diversity: number) {
  const marginPenalty = margin < 0 ? 18 : margin < 4 ? 8 : -5;
  const cushionPenalty = cushion < 3 ? 20 : cushion < 6 ? 9 : -4;
  const diversityPenalty = diversity < 0.25 ? 12 : diversity < 0.45 ? 5 : -3;
  return clamp(portfolioBaseline + marginPenalty + cushionPenalty + diversityPenalty, 2, 95);
}

function getInterventionYears(organization: OrganizationRecord) {
  const years = Array.from(new Set(organization.historicalFinancials.map((point) => point.fiscalYear))).sort((a, b) => a - b);
  if (years.length <= 1) {
    return years.length ? years : [organization.latestFilingYear];
  }
  return years.slice(0, -1);
}

function findInterventionIndex(years: number[], interventionYear: number) {
  let index = 0;
  for (let cursor = 0; cursor < years.length; cursor += 1) {
    if (years[cursor] <= interventionYear) {
      index = cursor;
    }
  }
  return index;
}

function interventionYearLabel(year: number) {
  return Number.isFinite(year) ? year : 0;
}

function computeReserveCushion(expenses: number, liquidReserves: number) {
  if (expenses <= 0) {
    return 0;
  }
  return Math.max(0, liquidReserves / (expenses / 12));
}

function computeRevenueDiversity(point: OrganizationRecord["revenueCompositionHistory"][number]) {
  const parts = [point.contributionsPct, point.programPct, point.investmentPct, point.otherPct].map((value) => Math.max(0, value) / 100);
  const hhi = parts.reduce((sum, value) => sum + value * value, 0);
  return Math.max(0, Math.min(1, 1 - hhi));
}

function metricValue(state: PathState, metric: PathMetric) {
  if (metric === "risk") {
    return state.risk;
  }
  if (metric === "margin") {
    return state.margin;
  }
  if (metric === "cushion") {
    return state.cushion;
  }
  return state.diversity;
}

function formatPathMetric(value: number, metric: PathMetric) {
  if (metric === "risk") {
    return `${value.toFixed(1)}%`;
  }
  if (metric === "margin") {
    return `${formatSigned(value)}%`;
  }
  if (metric === "cushion") {
    return formatDurationValue(value);
  }
  return value.toFixed(2);
}

function cappedRunwayMonths(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }
  return clamp(value ?? 0, 0, 120);
}

function computeUnrealizedAnnualReturns(organization: OrganizationRecord) {
  const netAssets = organization.netAssetsEoy ?? 0;
  const yieldGap = Math.max(5 - organization.investmentYield, 0) / 100;
  return Math.max(0, netAssets * yieldGap);
}

function buildCompletenessChecklist(organization: OrganizationRecord) {
  const fields = [
    { label: "Net assets", present: (organization.netAssetsEoy ?? 0) > 0 },
    { label: "Revenue", present: (organization.revenueAmount ?? 0) > 0 },
    { label: "Investment yield", present: Number.isFinite(organization.investmentYield) && organization.investmentYield > 0 },
    { label: "Stress inputs", present: organization.stress.burnMonths25 !== null || organization.stress.largestSourcePct > 0 },
    { label: "Multi-year history", present: organization.filingYearsObserved > 1 },
  ];
  const missing = fields.filter((field) => !field.present).map((field) => field.label);
  return {
    availableCount: fields.length - missing.length,
    missingSummary: missing.length ? missing.join(" · ") : "None",
  };
}

function ReplaySetupCard({
  organization,
  interventionYear,
  observedYear,
  baseline,
  actual,
  rankingLabel,
}: {
  organization: OrganizationRecord;
  interventionYear: number;
  observedYear: number;
  baseline: PathState;
  actual: PathState;
  rankingLabel: string;
  driversExplanation: string | null;
}) {
  const name = formatOrganizationName(organization.orgName);
  const baselineHealthy = baseline.margin >= 0 && baseline.cushion >= 3;
  const baselineStatus = baselineHealthy ? "looked healthy" : "already looked fragile";
  const crisisActual =
    actual.margin < 0
      ? "crisis materialized"
      : actual.cushion < 3
        ? "runway collapsed"
        : "risk stayed elevated";
  const warningSignals = buildWarningSignals(organization, baseline);

  return (
    <section className="rounded-[1.4rem] border border-black/7 bg-white/84 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Replay setup</p>

      <p className="mt-2 text-[1.05rem] font-medium leading-[1.35] tracking-[-0.03em] text-slate-950 [text-wrap:balance]">
        Northstar ranked {name} {rankingLabel} in FY{interventionYear}.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[1rem] border border-black/7 bg-[rgba(249,245,238,0.92)] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            FY{interventionYear} · at the call
          </p>
          <p className="mt-1 text-[13.5px] leading-[1.45] text-slate-800">
            {formatSigned(baseline.margin)}% margin · {formatRunwayForPitch(baseline.cushion)} of runway
          </p>
          <p className="text-[11.5px] uppercase tracking-[0.08em] text-slate-500">{baselineStatus}</p>
        </div>
        <div className="rounded-[1rem] border border-[#b35b49]/18 bg-[rgba(254,239,235,0.96)] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            FY{observedYear} · observed
          </p>
          <p className="mt-1 text-[13.5px] leading-[1.45] text-slate-800">
            {formatSigned(actual.margin)}% margin · {formatRunwayForPitch(actual.cushion)} of runway
          </p>
          <p className="text-[11.5px] uppercase tracking-[0.08em] text-[#b35b49]">{crisisActual}</p>
        </div>
      </div>

      {warningSignals.length > 0 ? (
        <div className="mt-3 rounded-[1rem] border border-black/7 bg-white/82 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            Early warning signals at FY{interventionYear}
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-snug text-slate-700">
            {warningSignals.map((signal, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true" className="mt-[7px] inline-block h-[4px] w-[4px] flex-none rounded-full bg-slate-500" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// Derive warning-signal bullets from the org's actual panel attributes at the
// call year. Replaces SHAP-driver output — SHAP for low-absolute-probability
// predictions yields incidental micro-features. Heuristics draw from both
// current-year levels AND peer-relative gaps AND 3-year trajectory.
function buildWarningSignals(organization: OrganizationRecord, baseline: PathState): string[] {
  const signals: string[] = [];

  // 1. Concentration — strongest signal for nearly every Crisis Replay case
  const concentration = organization.stress.largestSourcePct;
  if (concentration >= 90) {
    signals.push(`Revenue concentration at ${concentration.toFixed(0)}% on a single source.`);
  } else if (concentration >= 70) {
    signals.push(`Heavy revenue reliance on one source (${concentration.toFixed(0)}%).`);
  }

  // 2. Low revenue diversification relative to peer benchmark
  const divGap = parseNumber(organization.benchmark.diversificationGap);
  if (divGap !== null && divGap < -0.15) {
    signals.push(`Revenue diversification ${Math.abs(divGap).toFixed(2)} below peer benchmark.`);
  }

  // 3. Margin absolute level
  if (baseline.margin < 0) {
    signals.push(`Operating margin already negative at ${baseline.margin.toFixed(1)}%.`);
  } else if (baseline.margin < 5) {
    signals.push(`Thin operating margin of +${baseline.margin.toFixed(1)}% — little absorption capacity.`);
  }

  // 4. 3-year margin slope — catches "margin has been drifting down" even when
  //    the latest year's margin is still positive.
  const history = organization.historicalFinancials;
  if (history.length >= 3) {
    const recent = history.slice(-3);
    const slope = (recent[2].operatingMargin - recent[0].operatingMargin) / 2;
    if (slope < -2) {
      signals.push(`Margin trending down ${Math.abs(slope).toFixed(1)} pts/year over last 3 filings.`);
    }
  }

  // 5. Expense growth outpacing revenue growth
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const revGrowth = prev.revenue > 0 ? (curr.revenue - prev.revenue) / prev.revenue : 0;
    const expGrowth = prev.expenses > 0 ? (curr.expenses - prev.expenses) / prev.expenses : 0;
    if (expGrowth - revGrowth > 0.08) {
      signals.push(
        `Expenses grew ${(expGrowth * 100).toFixed(0)}% YoY against revenue growth of ${(revGrowth * 100).toFixed(0)}%.`,
      );
    }
  }

  // 6. Runway vs peer benchmark
  const runwayGap = parseNumber(organization.benchmark.operatingRunwayGap);
  if (runwayGap !== null && runwayGap < -3) {
    signals.push(`Cash runway roughly ${Math.abs(runwayGap).toFixed(0)} months below peer median.`);
  }

  // 7. Short absolute runway
  if (baseline.cushion < 6) {
    signals.push(`Reserves cover less than six months of expenses.`);
  } else if (baseline.cushion < 12 && concentration >= 70) {
    signals.push(
      `Reserve cushion (${formatRunwayForPitch(baseline.cushion)}) would not absorb a concentration shock.`,
    );
  }

  // 8. Filing trend direction
  const trend = organization.trendDirection?.toLowerCase() ?? "";
  if (trend.includes("declin")) {
    signals.push(`Multi-year financial trajectory trending downward.`);
  }

  // 9. Low data-confidence tier
  if (organization.confidenceTier === "Low") {
    signals.push(`Low data-confidence tier — integrity gaps warranted extra scrutiny.`);
  }

  // Keep the top 3 bullets. Earlier signals in the list are higher priority.
  return signals.slice(0, 3);
}

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const SHAP_FEATURE_LABELS: Record<string, string> = {
  // raw panel columns
  investment_income: "investment income",
  other_revenue: "other revenue",
  contributions_grants: "contributions and grants",
  program_service_revenue: "program service revenue",
  pct_contributions: "share of contributions",
  pct_program_revenue: "share of program revenue",
  pct_investment_income: "share of investment income",
  pct_other_revenue: "share of other revenue",
  total_revenue: "total revenue",
  total_expenses: "total expenses",
  net_assets_eoy: "net assets",
  net_assets_yoy_delta: "year-over-year change in net assets",
  savings_temporary_investments: "short-term savings",
  cash_non_interest_bearing: "non-interest cash",
  // derived features
  cash_to_expenses: "cash-to-expenses ratio",
  shock_absorption_months: "shock-absorption runway",
  shock_absorption_months_lagged_1y: "prior-year shock-absorption runway",
  operating_margin: "operating margin",
  operating_margin_lagged_1y: "prior-year operating margin",
  margin_change_yoy: "year-over-year margin change",
  margin_yoy_delta: "year-over-year margin drop",
  margin_3yr_trend: "three-year margin trend",
  revenue_to_expenses: "revenue-to-expense coverage",
  revenue_growth_yoy: "year-over-year revenue growth",
  expense_growth_yoy: "year-over-year expense growth",
  revenue_yoy_growth: "year-over-year revenue growth",
  net_assets_to_expenses: "reserves relative to expenses",
  revenue_diversification_index: "revenue diversification",
  concentration_yoy_delta: "change in revenue concentration",
  concentration_x_thin_runway: "concentration combined with thin runway",
  concentration_x_govt_funded: "concentrated government funding",
  margin_x_runway: "combined margin and runway",
  negative_margin_years_x_concentration: "deficit years with concentration",
  small_and_thin: "small and under-reserved profile",
  large_and_negative_margin: "large-org negative-margin profile",
  years_of_consecutive_deficits: "consecutive deficit years",
  is_government_funded: "government funding dependence",
  sector_budget_shock: "sector-wide budget shock exposure",
  covid_era: "COVID-era disruption",
  state_fiscal_stress: "state fiscal stress",
  fiscal_year_bucket: "era-specific baseline risk",
  state: "geographic pattern",
  ntee_major_category: "sector-specific base rate",
  size_bucket: "size-bucket base rate",
};

function humanizeShapExplanation(raw: string | null): string | null {
  if (!raw) return null;
  // Match tokens followed by a signed SHAP value in parens: "foo_bar (+0.12)"
  return raw.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(([+-]?\d[\d.]*)\)/g, (_match, name, value) => {
    const label = SHAP_FEATURE_LABELS[name] ?? name.replace(/_/g, " ");
    return `${label} (${value})`;
  });
}

function buildReplayNarrative(
  organization: OrganizationRecord,
  interventionYear: number,
  observedYear: number,
  baseline: PathState,
  actual: PathState,
) {
  const curatedSummary =
    interventionYear === organization.crisisReplay?.callFiscalYear
      ? organization.crisisReplay.t1OutcomeSummary ?? organization.crisisReplay.t2OutcomeSummary
      : null;
  const rankingLabel = buildReplayRankingLabel(organization, baseline);
  if (curatedSummary) {
    return `Northstar ranked ${formatOrganizationName(organization.orgName)} ${rankingLabel} in FY${interventionYear} — financials ${baseline.margin >= 0 && baseline.cushion >= 3 ? "still looked healthy" : "already looked fragile"} at ${formatSigned(baseline.margin)}% margin and ${formatRunwayForPitch(baseline.cushion)} of runway. By FY${observedYear}, ${curatedSummary}.`;
  }

  const lookedHealthy = baseline.margin >= 0 && baseline.cushion >= 3;
  const outcome =
    actual.margin < 0
      ? `margin fell to ${formatSigned(actual.margin)}%`
      : actual.cushion < 3
        ? `reserve cushion thinned to ${formatRunwayForCard(actual.cushion)}`
        : `risk stayed elevated at ${actual.risk.toFixed(1)}%`;

  return `Northstar ranked ${formatOrganizationName(organization.orgName)} ${rankingLabel} in FY${interventionYear} — financials ${lookedHealthy ? "still looked workable" : "already looked fragile"} at ${formatSigned(baseline.margin)}% margin and ${formatRunwayForPitch(baseline.cushion)} of runway. By FY${observedYear}, ${outcome}.`;
}

function getReplayDistressProbability(organization: OrganizationRecord) {
  if (organization.crisisReplay?.predictedDistressProbabilityXgboost !== null && organization.crisisReplay?.predictedDistressProbabilityXgboost !== undefined) {
    return organization.crisisReplay.predictedDistressProbabilityXgboost;
  }
  if (organization.crisisReplay?.predictedDistressProbability !== null && organization.crisisReplay?.predictedDistressProbability !== undefined) {
    return organization.crisisReplay.predictedDistressProbability;
  }
  return null;
}

function buildReplayRankingLabel(organization: OrganizationRecord, baseline: PathState) {
  const percentileTop = organization.crisisReplay?.riskPercentileTop;
  if (percentileTop !== null && percentileTop !== undefined && Number.isFinite(percentileTop)) {
    return `in the top ${Math.round(percentileTop)}% of distress risk for its cohort`;
  }
  return `at ${baseline.risk.toFixed(1)}% distress`;
}

function buildReplayDriversExplanation(organization: OrganizationRecord) {
  const explanation = organization.crisisReplay?.xgboostShapExplanation?.trim();
  if (!explanation) {
    return null;
  }
  return /[.!?]$/.test(explanation) ? explanation : `${explanation}.`;
}

function interpolateShockRunway(shockPct: number, current: number, at25: number, at50: number, at75: number) {
  if (shockPct <= 25) {
    const ratio = shockPct / 25;
    return current + (at25 - current) * ratio;
  }
  if (shockPct <= 50) {
    const ratio = (shockPct - 25) / 25;
    return at25 + (at50 - at25) * ratio;
  }
  const ratio = (shockPct - 50) / 25;
  return at50 + (at75 - at50) * ratio;
}

function formatLargestSourceName(value: string) {
  // Human-readable labels for any raw panel-column names that leak through.
  const translations: Record<string, string> = {
    contributions_grants: "Contributions & grants",
    contributions: "Contributions & grants",
    program_service_revenue: "Program service revenue",
    program_revenue: "Program service revenue",
    investment_income: "Investment income",
    other_revenue: "Other revenue",
    "largest revenue source": "largest revenue source",
  };
  return translations[value] ?? value;
}

function formatLargestSourceLabel(organization: OrganizationRecord) {
  const amount = organization.revenueAmount ? compactCurrency((organization.revenueAmount * organization.stress.largestSourcePct) / 100) : null;
  return `${formatLargestSourceName(organization.stress.largestSource)} · ${organization.stress.largestSourcePct.toFixed(1)}%${amount ? ` (${amount})` : ""}`;
}

function formatRunwayForPitch(value: number) {
  return value >= 12 ? `${(value / 12).toFixed(1)} years` : `${value.toFixed(1)} months`;
}

function formatRunwayForCard(value: number) {
  return value >= 12 ? `${(value / 12).toFixed(1)} yrs` : `${value.toFixed(1)} mo`;
}

function buildReplayChartScale(metric: PathMetric, values: number[]) {
  const min = d3Min(values) ?? 0;
  const max = d3Max(values) ?? 1;

  if (metric !== "margin") {
    const paddedMin = min === max ? min - 1 : min - (max - min) * 0.12;
    const paddedMax = min === max ? max + 1 : max + (max - min) * 0.12;
    return {
      min: paddedMin,
      max: paddedMax,
      ticks: Array.from({ length: 4 }, (_, index) => paddedMin + ((paddedMax - paddedMin) * index) / 3).reverse(),
    };
  }

  const comparisonSpan = Math.max(4, max - min);
  const baselineGap = Math.max(...values.map((value) => Math.abs(value - min), 0), ...values.map((value) => Math.abs(value - max), 0));
  const shouldZoom = baselineGap > comparisonSpan * 6;

  if (!shouldZoom) {
    const paddedMin = min === max ? min - 1 : min - (max - min) * 0.12;
    const paddedMax = min === max ? max + 1 : max + (max - min) * 0.12;
    return {
      min: paddedMin,
      max: paddedMax,
      ticks: Array.from({ length: 4 }, (_, index) => paddedMin + ((paddedMax - paddedMin) * index) / 3).reverse(),
    };
  }

  const paddedMin = min - comparisonSpan * 1.2;
  const paddedMax = max + comparisonSpan * 1.2;
  return {
    min: paddedMin,
    max: paddedMax,
    ticks: Array.from({ length: 4 }, (_, index) => paddedMin + ((paddedMax - paddedMin) * index) / 3).reverse(),
  };
}

function pathMetricLabel(metric: PathMetric) {
  if (metric === "risk") {
    return "Risk";
  }
  if (metric === "margin") {
    return "Margin";
  }
  if (metric === "cushion") {
    return "Cushion";
  }
  return "Revenue mix";
}

function formatCompareValue(value: number, format: "percent" | "ratio") {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return format === "percent" ? `${formatSigned(value)}%` : value.toFixed(2);
}

function formatSignal(value: number, signal: FlightSignal) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (signal === "margin") {
    return `${formatSigned(value)}%`;
  }
  if (signal === "runway") {
    return formatDurationValue(value);
  }
  return value.toFixed(2);
}

function formatSignalGap(value: number, signal: FlightSignal) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (signal === "margin") {
    return `${value.toFixed(1)} pts`;
  }
  if (signal === "runway") {
    return formatDurationValue(value);
  }
  return value.toFixed(2);
}

function formatDurationValue(value: number) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return Math.abs(value) >= 12 ? `${(value / 12).toFixed(1)} yrs` : `${value.toFixed(1)} mo`;
}

function formatDeltaDuration(value: number) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  return abs >= 12 ? `${sign}${(abs / 12).toFixed(1)} yrs` : `${sign}${abs.toFixed(1)} mo`;
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatDelta(current: number, prior: number) {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || Math.abs(prior) < 1e-9) {
    return "stable read";
  }
  const deltaPct = ((current - prior) / Math.abs(prior)) * 100;
  if (Math.abs(deltaPct) < 2) {
    return "roughly flat";
  }
  return `${deltaPct >= 0 ? "+" : ""}${Math.round(deltaPct)}% vs start`;
}

function dominantRevenueLabel(point: OrganizationRecord["revenueCompositionHistory"][number]) {
  const entries = [
    { label: "Contributions", value: point.contributionsPct },
    { label: "Program", value: point.programPct },
    { label: "Investment", value: point.investmentPct },
    { label: "Other", value: point.otherPct },
  ];
  const top = entries.reduce((best, current) => (current.value > best.value ? current : best));
  return `${top.label} ${Math.round(top.value)}%`;
}

function flightSafetyThreshold(signal: FlightSignal) {
  if (signal === "concentration") {
    return 0.45;
  }
  if (signal === "runway") {
    return 6;
  }
  return 0;
}

function findSafetyIndex(series: number[], signal: FlightSignal, threshold: number) {
  const comparator =
    signal === "margin"
      ? (value: number) => value >= threshold
      : (value: number) => value >= threshold;
  const index = series.findIndex(comparator);
  return index >= 0 ? index : null;
}

function formatYearsToSafety(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Not reached";
  }
  if (value === 0) {
    return "0 yrs";
  }
  return `${value.toFixed(0)} yrs`;
}

function flightSignalTitle(signal: FlightSignal) {
  if (signal === "concentration") {
    return "Revenue mix";
  }
  if (signal === "runway") {
    return "Reserve cushion";
  }
  return "Operating margin";
}

function financialScenarioLabel(scenario: { id: string; title: string }) {
  if (/downside/i.test(scenario.id) || /downside/i.test(scenario.title)) {
    return "Financial Resilience X-Ray";
  }
  if (/reserve|bridge/i.test(scenario.id) || /reserve|bridge/i.test(scenario.title)) {
    return "Reserve Policy Design";
  }
  if (/diversification/i.test(scenario.id) || /diversification/i.test(scenario.title)) {
    return "Revenue Diversification Advisory";
  }
  if (/portfolio|yield/i.test(scenario.id) || /portfolio|yield/i.test(scenario.title)) {
    return "Portfolio Optimization";
  }
  return "Financial Resilience X-Ray";
}

function routeDeckEyebrow(deckType: FlightDeckType) {
  if (deckType === "closest") {
    return "Closest route";
  }
  if (deckType === "fastest") {
    return "Fastest route";
  }
  return "Strongest route";
}

function routeDeckTitle(deckType: FlightDeckType) {
  if (deckType === "closest") {
    return "Closest twin";
  }
  if (deckType === "fastest") {
    return "Fastest safety";
  }
  return "Best finish";
}

function buildRouteStory(route: FlightRouteView, signal: FlightSignal) {
  const years = Math.max(1, route.durationYears);
  const safetyMoment = route.safetyYear ? ` Clear by FY${route.safetyYear}.` : " Safety line not cleared.";

  if (signal === "concentration") {
    return `Broadened revenue mix from ${formatSignal(route.preValue, signal)} to ${formatSignal(route.postValue, signal)} over ${years} yr${years === 1 ? "" : "s"}.${safetyMoment}`;
  }
  if (signal === "runway") {
    return `Built reserve cushion from ${formatSignal(route.preValue, signal)} to ${formatSignal(route.postValue, signal)} over ${years} yr${years === 1 ? "" : "s"}.${safetyMoment}`;
  }
  return `Repaired operating margin from ${formatSignal(route.preValue, signal)} to ${formatSignal(route.postValue, signal)} over ${years} yr${years === 1 ? "" : "s"}.${safetyMoment}`;
}

function getCuratedReplayTrajectory(organization: OrganizationRecord) {
  const trajectory = organization.crisisReplay?.trajectory ?? [];
  return [...trajectory].sort((left, right) => left.fiscalYear - right.fiscalYear);
}

function snapshotFocusEyebrow(actionLabel: OrganizationRecord["actionLabel"]) {
  switch (actionLabel) {
    case "Underinvested Asset Base":
      return "Yield opportunity";
    case "Revenue Concentration Risk":
      return "Concentration profile";
    case "Weak Financial Foundation":
      return "Foundation read";
    case "Needs Data Diligence":
      return "Data completeness";
  }
}

function activeModeEyebrow(mode: DecisionLabMode) {
  if (mode === "flight") {
    return "Recovery Flight";
  }
  if (mode === "replay") {
    return "Crisis Replay";
  }
  return "Case Snapshot";
}

function buildFlightSliderLabels(timeToSafetyYears: number | null) {
  return ["Match start", timeToSafetyYears === null ? "Mid route" : "Safety", "Finish"];
}

function analogSignal(metricName: string): FlightSignal | null {
  const normalized = metricName.toLowerCase();
  if (normalized.includes("diversification")) {
    return "concentration";
  }
  if (normalized.includes("runway")) {
    return "runway";
  }
  if (normalized.includes("margin")) {
    return "margin";
  }
  return null;
}

function viewWindowLabel(window: string) {
  const [start, end] = window.split("-").map((part) => Number.parseInt(part, 10));
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return `FY${start}-${end}`;
  }
  return window;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
