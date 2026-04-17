import { formatOrganizationName, getInboxCopy, getNorthstarScoreDrivers } from "./advisorLanguage";
import type { OrganizationRecord } from "../types";

function parseGap(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function benchmarkOperatingMargin(organization: OrganizationRecord): number {
  return organization.operatingMargin - parseGap(organization.benchmark.operatingMarginGap);
}

function statusTone(score: number, risk: number): "Strong" | "Mixed" | "Fragile" {
  if (score >= 75 && risk < 25) {
    return "Strong";
  }
  if (score >= 45 && risk < 60) {
    return "Mixed";
  }
  return "Fragile";
}

export interface ScoreComponentV2 {
  key: string;
  label: string;
  value: number;
  max: number;
  /** negative components (e.g. distress adjustment) */
  isDeduction?: boolean;
}

export interface DecisionLabModel {
  organizationName: string;
  northstarScore: number;
  statusTone: "Strong" | "Mixed" | "Fragile";
  financialTrajectory: OrganizationRecord["historicalFinancials"];
  revenueComposition: OrganizationRecord["revenueCompositionHistory"];
  peerMarginHistory: OrganizationRecord["peerOperatingMarginHistory"];
  peerPosition: Array<{
    label: string;
    current: number;
    benchmark: number;
    format: "percent" | "ratio";
  }>;
  /** v1 score drivers — kept for backward compat, use scoreComponentsV2 when available */
  scoreDrivers: Array<{
    key: keyof ReturnType<typeof getNorthstarScoreDrivers>;
    label: string;
    value: number;
  }>;
  /** v2 score components — populated when new data fields are present */
  scoreComponentsV2: ScoreComponentV2[] | null;
}

// V2 score field names expected from Saurav's new data export
type OrgWithV2Scores = OrganizationRecord & {
  opportunityScore?: number;
  structuralScore?: number;
  confidenceScore?: number;
  fairlightFitBonus?: number;
  distressAdjustment?: number;
};

function structuralComponentLabel(actionLabel: OrganizationRecord["actionLabel"]): string {
  switch (actionLabel) {
    case "Underinvested Asset Base": return "Asset Sophistication";
    case "Weak Financial Foundation": return "Financial Foundation";
    default: return "Structural";
  }
}

function buildScoreComponentsV2(organization: OrgWithV2Scores): ScoreComponentV2[] | null {
  const { opportunityScore, structuralScore, confidenceScore, fairlightFitBonus, distressAdjustment } = organization;

  if (
    opportunityScore === undefined ||
    structuralScore === undefined ||
    confidenceScore === undefined ||
    fairlightFitBonus === undefined ||
    distressAdjustment === undefined
  ) {
    return null;
  }

  return [
    { key: "opportunity", label: "Opportunity", value: opportunityScore, max: 40 },
    { key: "structural", label: structuralComponentLabel(organization.actionLabel), value: structuralScore, max: 40 },
    { key: "confidence", label: "Confidence", value: confidenceScore, max: 20 },
    { key: "fairlightFit", label: "Fairlight Fit", value: fairlightFitBonus, max: 10 },
    { key: "distressAdj", label: "Distress Adjustment", value: distressAdjustment, max: 0, isDeduction: true },
  ];
}

export function buildDecisionLabModel(organization: OrganizationRecord): DecisionLabModel {
  const inboxCopy = getInboxCopy(organization);
  const scoreDrivers = getNorthstarScoreDrivers(organization);

  return {
    organizationName: formatOrganizationName(organization.orgName),
    northstarScore: inboxCopy.northstarScore,
    statusTone: statusTone(inboxCopy.northstarScore, organization.distress.probability),
    financialTrajectory: organization.historicalFinancials,
    revenueComposition: organization.revenueCompositionHistory,
    peerMarginHistory: organization.peerOperatingMarginHistory,
    peerPosition: [
      {
        label: "Operating margin",
        current: organization.operatingMargin,
        benchmark: benchmarkOperatingMargin(organization),
        format: "percent",
      },
      {
        label: "Revenue mix",
        current: organization.revenueDiversificationIndex,
        benchmark: 0.5,
        format: "ratio",
      },
      {
        label: "Risk next year",
        current: organization.distress.probability,
        benchmark: organization.distress.baseline,
        format: "percent",
      },
    ],
    scoreDrivers: [
      { key: "distressProtection", label: "Distress readiness", value: scoreDrivers.distressProtection },
      { key: "operatingMargin", label: "Operating margin", value: scoreDrivers.operatingMargin },
      { key: "revenueMix", label: "Diversification opportunity", value: scoreDrivers.revenueMix },
      { key: "evidenceQuality", label: "Evidence quality", value: scoreDrivers.evidenceQuality },
      { key: "recommendationPriority", label: "Priority lane", value: scoreDrivers.recommendationPriority },
    ],
    scoreComponentsV2: buildScoreComponentsV2(organization as OrgWithV2Scores),
  };
}
