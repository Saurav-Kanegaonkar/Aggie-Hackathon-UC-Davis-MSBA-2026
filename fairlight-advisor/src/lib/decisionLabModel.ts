import {
  formatOrganizationName,
  getInboxCopy,
  getNorthstarComponentBreakdown,
  type NorthstarComponentDetail,
} from "./advisorLanguage";
import type { OrganizationRecord } from "../types";

function parseGap(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function benchmarkOperatingMargin(organization: OrganizationRecord): number {
  return organization.operatingMargin - parseGap(organization.benchmark.operatingMarginGap) * 100;
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
  scoreDrivers: Array<{
    key: string;
    label: string;
    value: number;
    max: number;
    signed?: boolean;
    details?: NorthstarComponentDetail[];
  }>;
}

export function buildDecisionLabModel(organization: OrganizationRecord): DecisionLabModel {
  const inboxCopy = getInboxCopy(organization);
  const scoreDrivers = getNorthstarComponentBreakdown(organization);

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
    scoreDrivers: scoreDrivers.map((driver) => ({
      key: driver.key,
      label: driver.label,
      value: Number(driver.value.toFixed(1)),
      max: driver.max,
      signed: driver.signed,
      details: driver.details,
    })),
  };
}
