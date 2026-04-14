import type { OrganizationRecord, ScenarioCard } from "../types";

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactCurrency(value: number): string {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (absolute >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (absolute >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatSigned(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function readableMarginGap(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  if (Math.abs(value) <= 2) {
    return `${formatSigned(value * 100)} pts`;
  }

  return null;
}

function readableRunwayGap(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  if (Math.abs(value) <= 24) {
    return `${formatSigned(value)} mo`;
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function riskLevel(probability: number): string {
  if (probability >= 70) {
    return "High";
  }
  if (probability >= 40) {
    return "Elevated";
  }
  if (probability >= 20) {
    return "Moderate";
  }
  return "Lower";
}

function actionSummary(actionLabel: OrganizationRecord["actionLabel"]): string {
  switch (actionLabel) {
    case "Amplify":
      return "Stronger than most current cases.";
    case "Stabilize":
      return "Supportable with guardrails.";
    case "Diversify":
      return "Viable, but too concentrated.";
    case "Deep Review":
      return "Pause for diligence.";
  }
}

function nextMoveLabel(actionLabel: OrganizationRecord["actionLabel"]): string {
  switch (actionLabel) {
    case "Amplify":
      return "Move forward";
    case "Stabilize":
      return "Support with guardrails";
    case "Diversify":
      return "Support, but widen the base";
    case "Deep Review":
      return "Pause and verify";
  }
}

function confidenceSummary(confidenceTier: OrganizationRecord["confidenceTier"]): string {
  switch (confidenceTier) {
    case "High":
      return "Strong evidence behind the recommendation.";
    case "Medium":
      return "Usable evidence, but it still needs some human checking.";
    case "Low":
      return "Thin evidence, so advisor judgment should lead.";
  }
}

function simplifySurfacedReason(organization: OrganizationRecord): string {
  if (organization.actionLabel === "Deep Review") {
    return "The case is too exposed to move straight to a funding recommendation.";
  }
  if (organization.actionLabel === "Diversify") {
    return "The organization may be viable, but concentration risk still makes the story harder to defend.";
  }
  if (organization.actionLabel === "Stabilize") {
    return "The case is workable if Fairlight is willing to protect the weak spots.";
  }
  return "The case looks stronger than most peers and may justify faster action.";
}

function buildPressurePoints(organization: OrganizationRecord): string[] {
  const points: string[] = [];
  const marginGap = parseNumber(organization.benchmark.operatingMarginGap);
  const runwayGap = parseNumber(organization.benchmark.operatingRunwayGap);
  const diversificationGap = parseNumber(organization.benchmark.diversificationGap);

  if (marginGap !== null && marginGap < -0.15) {
    points.push("Operating results are weaker than peers.");
  }

  if (runwayGap !== null && runwayGap < -6) {
    points.push("Operating runway is weaker than peers.");
  }

  if (diversificationGap !== null && diversificationGap < -0.08) {
    points.push("Revenue base is too concentrated.");
  }

  if (organization.stress.largestSourcePct <= 0 || organization.stress.severity25 === "Unavailable") {
    points.push("Source concentration data is incomplete, so the downside test is only partial.");
  } else if (organization.stress.burnMonths50 !== null && organization.stress.burnMonths50 <= 6) {
    points.push(`A 50% source shock would compress runway to ${organization.stress.burnMonths50.toFixed(1)} months.`);
  }

  if (organization.trendDirection.toLowerCase().includes("declin")) {
    points.push("Recent trend direction is negative.");
  }

  return points.length
    ? points.slice(0, 4)
    : ["No single structural issue dominates the case, but it still deserves normal diligence."];
}

function buildSupportSignals(organization: OrganizationRecord): string[] {
  const items: string[] = [];

  if (organization.analogs.length > 0) {
    items.push("Comparable organizations have recovered from a similar position.");
  }

  if (organization.scenarioCards.some((card) => card.id === "reserve-support")) {
    items.push("Short-term bridge support looks like the most realistic near-term lever.");
  }

  if (organization.scenarioCards.some((card) => card.id === "diversification-improvement")) {
    items.push("A broader revenue base would materially improve the case.");
  }

  if (organization.confidenceTier === "High") {
    items.push("The current evidence is strong enough to defend in a board conversation.");
  }

  return items.length
    ? items.slice(0, 3)
    : ["There is still a support path here, but it requires tighter diligence than a straightforward case."];
}

function mapScenarioCard(card: ScenarioCard): { title: string; summary: string; effect: string } {
  if (card.id === "downside-shock") {
    return {
      title: "If revenue slips again",
      summary: "A fresh hit to the main funding source would likely make the case much harder to support.",
      effect: "The case weakens",
    };
  }

  if (card.id === "reserve-support") {
    return {
      title: "If Fairlight provides bridge support",
      summary: "Short-term support could buy time and reduce immediate pressure.",
      effect: "The case stabilizes",
    };
  }

  if (card.id === "diversification-improvement") {
    return {
      title: "If the revenue base broadens",
      summary: "Less concentration would make the organization easier to defend over the next year.",
      effect: "The case becomes easier",
    };
  }

  return {
    title: card.title,
    summary: card.thesis,
    effect: card.effectOnRisk,
  };
}

function buildCaseTagline(organization: OrganizationRecord): string {
  return `${riskLevel(organization.distress.probability)} next-year risk, ${organization.confidenceTier.toLowerCase()} confidence.`;
}

export function formatOrganizationName(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function formatLargestSource(organization: OrganizationRecord): string {
  if (organization.stress.largestSourcePct <= 0) {
    return "Not available";
  }

  return `${organization.stress.largestSourcePct.toFixed(0)}% of revenue`;
}

function formatShockWindow(organization: OrganizationRecord): string {
  if (organization.stress.burnMonths25 === null) {
    return "Not available";
  }

  if (organization.stress.burnMonths25 < 1) {
    return "<1 month";
  }

  return `${organization.stress.burnMonths25.toFixed(1)} months`;
}

function computeStabilityIndex(organization: OrganizationRecord): number {
  const marginGap = parseNumber(organization.benchmark.operatingMarginGap) ?? 0;
  const runwayGap = parseNumber(organization.benchmark.operatingRunwayGap) ?? 0;
  const diversificationGap = parseNumber(organization.benchmark.diversificationGap) ?? 0;

  const marginScore = clamp(50 + marginGap * 120, 0, 100);
  const runwayScore = clamp(50 + runwayGap * 2.2, 0, 100);
  const diversificationScore = clamp(50 + diversificationGap * 80, 0, 100);

  return Math.round(marginScore * 0.4 + runwayScore * 0.35 + diversificationScore * 0.25);
}

function computeNorthstarScore(organization: OrganizationRecord): number {
  return Math.round(clamp(100 - organization.distress.probability, 0, 100));
}

export function getInboxCopy(organization: OrganizationRecord) {
  const pressurePoint = buildPressurePoints(organization)[0];
  const stabilityIndex = computeStabilityIndex(organization);
  const northstarScore = computeNorthstarScore(organization);

  return {
    displayName: formatOrganizationName(organization.orgName),
    nextMove: nextMoveLabel(organization.actionLabel),
    riskLine: `${riskLevel(organization.distress.probability)} risk next year`,
    confidenceLine: `${organization.confidenceTier} confidence`,
    overview: organization.decisionReason,
    whyNow: pressurePoint,
    supportNote: confidenceSummary(organization.confidenceTier),
    revenueLabel: organization.revenueDisplay,
    shockWindowLabel: formatShockWindow(organization),
    concentrationLabel: formatLargestSource(organization),
    stabilityIndex,
    northstarScore,
  };
}

export function getDecisionLabCopy(organization: OrganizationRecord) {
  const marginGap = parseNumber(organization.benchmark.operatingMarginGap);
  const runwayGap = parseNumber(organization.benchmark.operatingRunwayGap);
  const inboxCopy = getInboxCopy(organization);
  const marginGapLabel = readableMarginGap(marginGap);
  const runwayGapLabel = readableRunwayGap(runwayGap);

  return {
    titleLine: actionSummary(organization.actionLabel),
    thesis: organization.decisionReason,
    surfacedReason: simplifySurfacedReason(organization),
    nextMove: nextMoveLabel(organization.actionLabel),
    riskLine: `${organization.distress.probability.toFixed(1)}% next-year risk`,
    riskDetail: `${organization.distress.probability.toFixed(1)}% risk versus ${organization.distress.baseline.toFixed(1)}% portfolio baseline`,
    confidenceLine: `${organization.confidenceTier} confidence`,
    confidenceDetail: confidenceSummary(organization.confidenceTier),
    caseTagline: buildCaseTagline(organization),
    summaryBody: actionSummary(organization.actionLabel),
    pressurePoints: buildPressurePoints(organization),
    supportSignals: buildSupportSignals(organization),
    peerRead:
      marginGapLabel && runwayGapLabel
        ? `Peer view: margin ${marginGapLabel}, runway ${runwayGapLabel}.`
        : "Peer view: weaker than similar organizations.",
    stressRead:
      organization.stress.severity25 === "Unavailable"
        ? "Stress view: 25% source-shock coverage is incomplete."
        : `Stress view: 25% source shock leaves ${inboxCopy.shockWindowLabel} of burn window.`,
    scenarios: organization.scenarioCards.map(mapScenarioCard),
    analogsHeadline:
      organization.analogs.length > 0 ? "Real organizations that improved from similar pressure." : "",
    factCards: [
      { label: "Northstar score", value: `${inboxCopy.northstarScore}`, detail: "Higher is healthier" },
      { label: "Stability index", value: `${inboxCopy.stabilityIndex}`, detail: "Derived resilience metric" },
      { label: "Next-year risk", value: `${organization.distress.probability.toFixed(1)}%`, detail: "Forward distress model" },
      { label: "Portfolio baseline", value: `${organization.distress.baseline.toFixed(1)}%`, detail: "Reference level" },
      { label: "25% shock window", value: inboxCopy.shockWindowLabel, detail: "Time before pressure builds" },
      { label: "Largest source", value: inboxCopy.concentrationLabel, detail: "Revenue concentration" },
      { label: "Fiscal year", value: `FY${organization.fiscalYear}`, detail: "Latest filing used" },
      { label: "Trend", value: organization.trendDirection, detail: "Recent direction" },
    ],
    caveatNotes: organization.recommendation.caveats.map((caveat) => {
      if (caveat.toLowerCase().includes("medium confidence")) {
        return "Confidence is medium. Review filings before final approval.";
      }
      if (caveat.toLowerCase().includes("low confidence")) {
        return "Confidence is low. Use direct diligence before making a call.";
      }
      if (caveat.toLowerCase().includes("stress posture")) {
        return "Stress-test coverage is incomplete for this case.";
      }
      return caveat;
    }),
  };
}

export function getFundingDecisionCopy(organization: OrganizationRecord) {
  const decisionLab = getDecisionLabCopy(organization);

  return {
    recommendationLabel: nextMoveLabel(organization.actionLabel),
    rationale: organization.recommendation.rationale,
    caveats: decisionLab.caveatNotes,
    boardSummary: `${formatOrganizationName(organization.orgName)} is a ${organization.actionLabel.toLowerCase()} case. ${decisionLab.riskDetail}.`,
    supportType: organization.recommendation.interventionType,
    exportTitle: `${formatOrganizationName(organization.orgName)}: ${nextMoveLabel(organization.actionLabel)}`,
    oneLineExport:
      organization.distress.probability >= 70
        ? `${formatOrganizationName(organization.orgName)} should not move forward without a tighter diligence pass and a near-term risk reduction plan.`
        : `${formatOrganizationName(organization.orgName)} can move forward if Fairlight is comfortable with the remaining risk and the stated caveats.`,
  };
}

export function formatAnalogValue(value: number): string {
  return Math.abs(value) >= 1000 ? compactCurrency(value) : value.toFixed(2);
}
