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
    case "Underinvested Asset Base":
      return "This looks stronger than most cases in the queue.";
    case "Weak Financial Foundation":
      return "This could move forward if support comes with guardrails.";
    case "Revenue Concentration Risk":
      return "This could work, but too much depends on one source of money.";
    case "Needs Data Diligence":
      return "This needs a closer check before anyone commits capital.";
  }
}

function nextMoveLabel(actionLabel: OrganizationRecord["actionLabel"]): string {
  switch (actionLabel) {
    case "Underinvested Asset Base":
      return "Move forward";
    case "Weak Financial Foundation":
      return "Support with guardrails";
    case "Revenue Concentration Risk":
      return "Support, but widen the base";
    case "Needs Data Diligence":
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
  if (organization.actionLabel === "Needs Data Diligence") {
    return "There is too much uncertainty to move straight to a recommendation.";
  }
  if (organization.actionLabel === "Revenue Concentration Risk") {
    return "The organization may be workable, but relying too much on one source still makes the case hard to defend.";
  }
  if (organization.actionLabel === "Weak Financial Foundation") {
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

function confidenceScore(confidenceTier: OrganizationRecord["confidenceTier"]): number {
  switch (confidenceTier) {
    case "High":
      return 95;
    case "Medium":
      return 75;
    case "Low":
      return 52;
  }
}

function operatingMarginScore(organization: OrganizationRecord): number {
  const margin = organization.operatingMargin;

  if (margin >= 12) {
    return 92;
  }
  if (margin >= 6) {
    return 80;
  }
  if (margin >= 0) {
    return 64;
  }
  if (margin >= -8) {
    return 40;
  }
  return 18;
}

function diversificationOpportunityScore(organization: OrganizationRecord): number {
  const diversification = organization.revenueDiversificationIndex;

  if (diversification >= 0.5) {
    return 18;
  }
  if (diversification >= 0.35) {
    return 34;
  }
  if (diversification >= 0.2) {
    return 58;
  }
  if (diversification >= 0.05) {
    return 82;
  }
  return 92;
}

function actionPriorityScore(actionLabel: OrganizationRecord["actionLabel"]): number {
  switch (actionLabel) {
    case "Revenue Concentration Risk":
      return 95;
    case "Weak Financial Foundation":
      return 74;
    case "Underinvested Asset Base":
      return 28;
    case "Needs Data Diligence":
      return 22;
  }
}

export function getNorthstarScoreDrivers(organization: OrganizationRecord) {
  return {
    distressProtection: clamp(100 - organization.distress.probability, 0, 100),
    operatingMargin: operatingMarginScore(organization),
    revenueMix: diversificationOpportunityScore(organization),
    evidenceQuality: confidenceScore(organization.confidenceTier),
    recommendationPriority: actionPriorityScore(organization.actionLabel),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NORTHSTAR SCORE v2 — additive five-component model
//
// Components:
//   A  Opportunity       (0–40)   asset size (capped at $50M) + low-yield gap
//   B  Structural        (0–40)   per-bucket weighted blend of sub-signals
//   C  Confidence        (0–20)   evidence strength + data completeness
//   D  Fairlight Fit     ( 0–10)  bucket/size/yield bonus
//   E  Distress penalty  (−15–0)  tiered by distress probability
//
// Final = clamp(A + B + C + D + E, 0, 100) with exclusion caps:
//   net_assets > $500M      → score capped at 30 (too large for Fairlight)
//   net_assets < $500K AND  → score capped at 40 (too small unless Diversify)
//     bucket !== "Revenue Concentration Risk"
//
// v1's band-gating system, risk-priority-blend, and bucket-specific risk
// ceilings have been removed. Distress now influences the score only through
// component E.
// ─────────────────────────────────────────────────────────────────────────────

const northstarScoreCache = new Map<string, number>();

function operatingSupportSignal(organization: OrganizationRecord): number {
  return clamp(((organization.operatingMargin + 20) / 40) * 100, 0, 100);
}

function operatingStressSignal(organization: OrganizationRecord): number {
  return 100 - operatingSupportSignal(organization);
}

function diversificationNeedSignal(organization: OrganizationRecord): number {
  const rdi = clamp(organization.revenueDiversificationIndex, 0, 1);
  const concentrationBase = (1 - rdi) * 100;
  const largestSourcePct =
    organization.stress.largestSourcePct > 0 ? clamp(organization.stress.largestSourcePct, 0, 100) : concentrationBase;
  const diversificationGap = parseNumber(organization.benchmark.diversificationGap);
  const benchmarkPressure =
    diversificationGap === null ? concentrationBase : clamp((Math.max(-diversificationGap, 0) / 0.5) * 100, 0, 100);

  return concentrationBase * 0.45 + largestSourcePct * 0.3 + benchmarkPressure * 0.25;
}

function stressSeveritySignal(severity: string): number {
  switch (severity.toLowerCase()) {
    case "severe":
      return 95;
    case "moderate":
      return 74;
    case "mild":
      return 48;
    case "none":
      return 16;
    default:
      return 36;
  }
}

function stressVulnerabilitySignal(organization: OrganizationRecord): number {
  const severityBase = stressSeveritySignal(organization.stress.severity25);
  const burnMonths = organization.stress.burnMonths25;
  const burnBase =
    burnMonths === null ? severityBase : clamp(((24 - Math.min(burnMonths, 24)) / 24) * 100, 0, 100);

  return severityBase * 0.4 + burnBase * 0.6;
}

function computeNorthstarStructuralSignal(organization: OrganizationRecord): number {
  const { evidenceQuality: evidenceStrength } = getNorthstarScoreDrivers(organization);
  const operatingSupport = operatingSupportSignal(organization);
  const operatingStress = operatingStressSignal(organization);
  const diversificationNeed = diversificationNeedSignal(organization);
  const stressVulnerability = stressVulnerabilitySignal(organization);

  switch (organization.actionLabel) {
    case "Revenue Concentration Risk":
      return (
        diversificationNeed * 0.45 +
        operatingSupport * 0.25 +
        stressVulnerability * 0.1 +
        evidenceStrength * 0.2
      );
    case "Weak Financial Foundation":
      return (
        stressVulnerability * 0.35 +
        operatingStress * 0.2 +
        diversificationNeed * 0.15 +
        evidenceStrength * 0.3
      );
    case "Underinvested Asset Base":
      return (
        diversificationNeed * 0.45 +
        stressVulnerability * 0.2 +
        operatingStress * 0.2 +
        (100 - evidenceStrength) * 0.15
      );
    case "Needs Data Diligence":
      return (
        (100 - evidenceStrength) * 0.6 +
        stressVulnerability * 0.25 +
        diversificationNeed * 0.15
      );
  }

  return 0;
}

// Component A — Opportunity (0–40)
function opportunityComponent(organization: OrganizationRecord): number {
  const netAssets = organization.netAssetsEoy ?? 0;
  let assetScore = 0;
  if (netAssets > 0) {
    const cappedAssets = Math.min(Math.max(netAssets, 1), 50_000_000);
    assetScore = Math.min(Math.log(cappedAssets) / Math.log(50_000_000), 1.0) * 25;
  }
  const yieldGap =
    (Math.max(5.0 - clamp(organization.investmentYield, 0, 100), 0) / 5.0) * 15;
  return assetScore + yieldGap;
}

// Component B — Structural (0–40)
function structuralComponent(organization: OrganizationRecord): number {
  return (computeNorthstarStructuralSignal(organization) / 100) * 40;
}

// Component C — Confidence (0–20)
function confidenceComponent(organization: OrganizationRecord): number {
  const { evidenceQuality: evidenceStrength } = getNorthstarScoreDrivers(organization);
  const evidenceScore = (evidenceStrength / 100) * 12;
  const dataCompleteness = clamp(organization.dataCompletenessScore, 0, 8);
  return evidenceScore + dataCompleteness;
}

// Component D — Fairlight Fit Bonus (0–10)
function fairlightFitBonus(organization: OrganizationRecord): number {
  const netAssets = organization.netAssetsEoy ?? 0;
  const yield_ = organization.investmentYield;
  switch (organization.actionLabel) {
    case "Underinvested Asset Base":
      return netAssets > 1_000_000 && yield_ < 3 ? 10 : 0;
    case "Revenue Concentration Risk":
      return netAssets > 1_000_000 ? 8 : 0;
    case "Weak Financial Foundation":
      return netAssets > 5_000_000 ? 5 : 0;
    case "Needs Data Diligence":
      return 0;
  }
  return 0;
}

// Component E — Distress adjustment (−15 to 0)
function distressAdjustment(organization: OrganizationRecord): number {
  const dp = organization.distress.probability;
  if (dp > 70) return -15;
  if (dp > 50) return -8;
  if (dp > 35) return -3;
  return 0;
}

// Exclusion caps (Step 6)
function applyExclusionCaps(organization: OrganizationRecord, score: number): number {
  const netAssets = organization.netAssetsEoy ?? 0;
  if (netAssets > 500_000_000) {
    return Math.min(score, 30);
  }
  if (netAssets < 500_000 && organization.actionLabel !== "Revenue Concentration Risk") {
    return Math.min(score, 40);
  }
  return score;
}

function computeNorthstarScore(organization: OrganizationRecord): number {
  const raw =
    opportunityComponent(organization) +
    structuralComponent(organization) +
    confidenceComponent(organization) +
    fairlightFitBonus(organization) +
    distressAdjustment(organization);
  const clamped = clamp(raw, 0, 100);
  return Math.round(applyExclusionCaps(organization, clamped));
}

export function resetNorthstarScoreCache(): void {
  northstarScoreCache.clear();
}

// Batch scorer kept for API compatibility. Each org is now scored
// independently (no percentile-based within-bucket ranking), so this just
// loops. Retained in case callers expect the cache to be primed eagerly.
export function primeNorthstarScores(organizations: OrganizationRecord[]): void {
  resetNorthstarScoreCache();
  for (const organization of organizations) {
    northstarScoreCache.set(organization.id, computeNorthstarScore(organization));
  }
}

function formatRiskChance(probability: number): string {
  if (probability < 1) {
    return "Below 1%";
  }

  return `${probability.toFixed(1)}%`;
}

function revenueMixRead(value: number): string {
  if (value >= 0.45) {
    return "well spread";
  }
  if (value >= 0.25) {
    return "reasonably spread";
  }
  if (value >= 0.1) {
    return "fairly concentrated";
  }
  return "highly concentrated";
}

function revenueScaleRead(amount: number | null): string {
  if (amount === null || Number.isNaN(amount)) {
    return "moderate-scale";
  }
  if (amount >= 10_000_000) {
    return "large-scale";
  }
  if (amount >= 2_000_000) {
    return "established";
  }
  if (amount >= 500_000) {
    return "mid-sized";
  }
  return "smaller-scale";
}

function operatingMarginRead(value: number): string {
  if (value >= 12) {
    return "very strong";
  }
  if (value >= 5) {
    return "healthy";
  }
  if (value >= 0) {
    return "positive";
  }
  if (value >= -8) {
    return "thin";
  }
  return "negative";
}

function filingHistoryRead(years: number, latestYear: number): string {
  if (years <= 1) {
    return `Based on 1 year of filings through FY${latestYear}`;
  }
  return `Based on ${years} years of filings through FY${latestYear}`;
}

function buildInboxAdvisoryNote(organization: OrganizationRecord): string {
  const risk = formatRiskChance(organization.distress.probability).toLowerCase();
  const history = filingHistoryRead(organization.filingYearsObserved, organization.latestFilingYear);
  const revenueScale = revenueScaleRead(organization.revenueAmount);
  const marginRead = operatingMarginRead(organization.operatingMargin);
  const mixRead = revenueMixRead(organization.revenueDiversificationIndex);

  switch (organization.actionLabel) {
    case "Underinvested Asset Base":
      return `${history}, this looks like a ${revenueScale} organization with a ${marginRead} operating profile and a ${mixRead} funding base. We project ${risk} risk next year, which supports moving forward rather than treating this as a repair case.`;
    case "Weak Financial Foundation":
      return `${history}, this looks like a ${revenueScale} organization with a ${marginRead} operating profile. We project ${risk} risk next year, so support looks reasonable if it comes with clear guardrails rather than open-ended capital.`;
    case "Revenue Concentration Risk":
      return `${history}, this looks like a ${revenueScale} organization with a ${marginRead} operating profile, but the funding base is still ${mixRead}. We project ${risk} risk next year, so the case is strongest if support is tied to broadening revenue sources.`;
    case "Needs Data Diligence":
      return `${history}, this looks like a ${revenueScale} organization, but the operating profile is ${marginRead} and the funding base is ${mixRead}. We project ${risk} risk next year, so the signals do not line up cleanly enough for a capital recommendation without another diligence pass.`;
  }
}

export function getInboxCopy(organization: OrganizationRecord) {
  const stabilityIndex = computeStabilityIndex(organization);
  const northstarScore = northstarScoreCache.get(organization.id) ?? computeNorthstarScore(organization);

  return {
    displayName: formatOrganizationName(organization.orgName),
    nextMove: nextMoveLabel(organization.actionLabel),
    riskLine: formatRiskChance(organization.distress.probability),
    riskBadge: `${riskLevel(organization.distress.probability)} risk`,
    confidenceLine: organization.confidenceTier,
    overview: organization.decisionReason,
    whyNow: buildInboxAdvisoryNote(organization),
    supportNote: confidenceSummary(organization.confidenceTier),
    revenueLabel: organization.revenueDisplay,
    operatingMarginLabel: `${organization.operatingMargin >= 0 ? "+" : ""}${organization.operatingMargin.toFixed(1)}%`,
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
