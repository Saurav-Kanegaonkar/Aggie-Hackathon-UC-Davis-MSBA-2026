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
      return "This looks stronger than most cases in the queue.";
    case "Stabilize":
      return "This could move forward if support comes with guardrails.";
    case "Diversify":
      return "This could work, but too much depends on one source of money.";
    case "Deep Review":
      return "This needs a closer check before anyone commits capital.";
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
      return "The evidence is strong and easy to explain.";
    case "Medium":
      return "The evidence is useful, but someone should still check the filings.";
    case "Low":
      return "The evidence is thin, so this needs hands-on review before any call.";
  }
}

function simplifySurfacedReason(organization: OrganizationRecord): string {
  if (organization.actionLabel === "Deep Review") {
    return "There is too much uncertainty to move straight to a recommendation.";
  }
  if (organization.actionLabel === "Diversify") {
    return "The organization may be workable, but relying too much on one source still makes the case hard to defend.";
  }
  if (organization.actionLabel === "Stabilize") {
    return "The case is workable if Fairlight is willing to protect the weak spots.";
  }
  return "This case looks stronger than most and may justify faster action.";
}

function buildPressurePoints(organization: OrganizationRecord): string[] {
  const points: string[] = [];
  const marginGap = parseNumber(organization.benchmark.operatingMarginGap);
  const runwayGap = parseNumber(organization.benchmark.operatingRunwayGap);
  const diversificationGap = parseNumber(organization.benchmark.diversificationGap);

  if (marginGap !== null && marginGap < -0.15) {
    points.push("Operating performance looks weaker than similar organizations.");
  }

  if (runwayGap !== null && runwayGap < -6) {
    points.push("The organization has less room for a setback than similar organizations.");
  }

  if (diversificationGap !== null && diversificationGap < -0.08) {
    points.push("Too much of the budget appears to depend on one funding source.");
  }

  if (organization.stress.largestSourcePct <= 0 || organization.stress.severity25 === "Unavailable") {
    points.push("The filing does not give enough funding detail for a full stress check.");
  } else if (organization.stress.burnMonths50 !== null && organization.stress.burnMonths50 <= 6) {
    points.push(`A large funding loss could create pressure within ${organization.stress.burnMonths50.toFixed(1)} months.`);
  }

  if (organization.trendDirection.toLowerCase().includes("declin")) {
    points.push("The recent direction looks softer rather than stronger.");
  }

  return points.length
    ? points.slice(0, 4)
    : ["Nothing stands out as an immediate red flag, but it still deserves a normal review."];
}

function buildSupportSignals(organization: OrganizationRecord): string[] {
  const items: string[] = [];

  if (organization.analogs.length > 0) {
    items.push("Fairlight has seen similar organizations recover from this kind of pressure.");
  }

  if (organization.scenarioCards.some((card) => card.id === "reserve-support")) {
    items.push("Short-term support could buy the organization time.");
  }

  if (organization.scenarioCards.some((card) => card.id === "diversification-improvement")) {
    items.push("Bringing in more than one strong funding source would help a lot.");
  }

  if (organization.confidenceTier === "High") {
    items.push("The evidence is strong enough to explain clearly in a board conversation.");
  }

  return items.length
    ? items.slice(0, 3)
    : ["There may still be a support path here, but it needs a closer look than a straightforward case."];
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

const LOWERCASE_CONNECTORS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "de",
  "del",
  "du",
  "for",
  "in",
  "la",
  "le",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

const FORCE_UPPERCASE_TOKENS = new Set([
  "CBCC",
  "CCH",
  "EAH",
  "KAIST",
  "MP",
  "RHF",
  "UB",
  "UFCW",
  "US",
  "VEBA",
]);

const TITLECASE_SUFFIXES = new Set([
  "ASSOCIATION",
  "CENTER",
  "CENTRE",
  "CORP",
  "CORPORATION",
  "COUNCIL",
  "FOUNDATION",
  "FUND",
  "GROUP",
  "HOUSING",
  "INC",
  "INSTITUTE",
  "TRUST",
  "UNIVERSITY",
]);

function titleCaseWord(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatSimpleNameToken(token: string, isFirstWord: boolean): string {
  if (token === "&") {
    return token;
  }

  const lettersOnly = token.replace(/[^A-Za-z]/g, "");
  if (!lettersOnly) {
    return token;
  }

  const upper = lettersOnly.toUpperCase();
  const lower = lettersOnly.toLowerCase();

  if (FORCE_UPPERCASE_TOKENS.has(upper)) {
    return upper;
  }

  if (/^[IVXLCDM]+$/.test(upper) && upper.length <= 5) {
    return upper;
  }

  if (lettersOnly.length === 1) {
    return upper;
  }

  if (LOWERCASE_CONNECTORS.has(lower) && !isFirstWord) {
    return lower;
  }

  if (/^[A-Z]{2}$/.test(lettersOnly) && !TITLECASE_SUFFIXES.has(upper)) {
    return upper;
  }

  return token.replace(/[A-Za-z]+/, (match) => titleCaseWord(match));
}

function formatCompositeNameToken(token: string, isFirstWord: boolean): string {
  return token
    .split(/([-/])/)
    .map((part, index) => {
      if (part === "-" || part === "/") {
        return part;
      }

      return formatSimpleNameToken(part, isFirstWord && index === 0);
    })
    .join("");
}

export function formatOrganizationName(value: string): string {
  return value
    .split(/\s+/)
    .map((part, index) => formatCompositeNameToken(part, index === 0))
    .join(" ");
}

function formatLargestSource(organization: OrganizationRecord): string {
  if (organization.stress.largestSourcePct <= 0) {
    return "Awaiting detail";
  }

  return `${organization.stress.largestSourcePct.toFixed(0)}% of income`;
}

function formatShockWindow(organization: OrganizationRecord): string {
  if (organization.stress.burnMonths25 === null) {
    return "Awaiting detail";
  }

  if (organization.stress.burnMonths25 < 1) {
    return "Less than 1 month";
  }

  return `${organization.stress.burnMonths25.toFixed(1)} months`;
}

function formatTrendDirection(direction: string): string | null {
  const normalized = direction.toLowerCase();

  if (normalized.includes("declin")) {
    return "Recent direction: softening";
  }
  if (normalized.includes("improv")) {
    return "Recent direction: improving";
  }
  if (normalized.includes("stabl")) {
    return "Recent direction: steady";
  }

  return "Recent direction: unclear";
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

function formatRiskChance(probability: number): string {
  if (probability < 1) {
    return "Below 1%";
  }

  return `${probability.toFixed(1)}%`;
}

export function getInboxCopy(organization: OrganizationRecord) {
  const pressurePoint = buildPressurePoints(organization)[0];
  const stabilityIndex = computeStabilityIndex(organization);
  const northstarScore = computeNorthstarScore(organization);

  return {
    displayName: formatOrganizationName(organization.orgName),
    nextMove: nextMoveLabel(organization.actionLabel),
    riskLine: formatRiskChance(organization.distress.probability),
    riskBadge: `${riskLevel(organization.distress.probability)} risk`,
    confidenceLine: organization.confidenceTier,
    overview: organization.decisionReason,
    whyNow: pressurePoint,
    supportNote: confidenceSummary(organization.confidenceTier),
    revenueLabel: organization.revenueDisplay,
    shockWindowLabel: formatShockWindow(organization),
    concentrationLabel: formatLargestSource(organization),
    stabilityIndex,
    northstarScore,
    trendLabel: formatTrendDirection(organization.trendDirection) ?? "Recent direction: unclear",
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
    riskLine: `${organization.distress.probability.toFixed(1)}% chance of trouble next year`,
    riskDetail: `${organization.distress.probability.toFixed(1)}% chance of financial stress next year versus ${organization.distress.baseline.toFixed(1)}% across the portfolio`,
    confidenceLine: `${organization.confidenceTier} confidence`,
    confidenceDetail: confidenceSummary(organization.confidenceTier),
    caseTagline: buildCaseTagline(organization),
    summaryBody: actionSummary(organization.actionLabel),
    pressurePoints: buildPressurePoints(organization),
    supportSignals: buildSupportSignals(organization),
    peerRead:
      marginGapLabel && runwayGapLabel
        ? `Compared with similar organizations, margins are ${marginGapLabel} and cash buffer is ${runwayGapLabel}.`
        : "Compared with similar organizations, this case looks weaker on operating strength and cash buffer.",
    stressRead:
      organization.stress.severity25 === "Unavailable"
        ? "We cannot fully test a downturn because the funding-source data is too thin."
        : `If the biggest funding source drops by 25%, pressure would show up within ${inboxCopy.shockWindowLabel.toLowerCase()}.`,
    scenarios: organization.scenarioCards.map(mapScenarioCard),
    analogsHeadline:
      organization.analogs.length > 0 ? "Real organizations that improved from similar pressure." : "",
    factCards: [
      { label: "Northstar score", value: `${inboxCopy.northstarScore}`, detail: "Main summary score" },
      { label: "Stability index", value: `${inboxCopy.stabilityIndex}`, detail: "Blend of cash, margins, and funding mix" },
      { label: "Next-year risk", value: `${organization.distress.probability.toFixed(1)}%`, detail: "Chance of financial stress next year" },
      { label: "Portfolio baseline", value: `${organization.distress.baseline.toFixed(1)}%`, detail: "Typical risk in this portfolio" },
      { label: "Cash buffer", value: inboxCopy.shockWindowLabel, detail: "Time before pressure builds" },
      { label: "Biggest source", value: inboxCopy.concentrationLabel, detail: "How much income depends on one source" },
      { label: "Fiscal year", value: `FY${organization.fiscalYear}`, detail: "Latest filing used" },
      { label: "Recent direction", value: formatTrendDirection(organization.trendDirection) ?? "Not enough data", detail: "Simple read on recent movement" },
    ],
    caveatNotes: organization.recommendation.caveats.map((caveat) => {
      if (caveat.toLowerCase().includes("medium confidence")) {
        return "Confidence is medium. Review filings before final approval.";
      }
      if (caveat.toLowerCase().includes("low confidence")) {
        return "Confidence is low. Use direct diligence before making a call.";
      }
      if (caveat.toLowerCase().includes("stress posture")) {
        return "Funding-source data is too thin to fully test a downturn.";
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
