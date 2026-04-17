import { beforeEach, describe, expect, it } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import type { OrganizationRecord } from "../types";
import {
  getInboxCopy,
  getNorthstarComponentBreakdown,
  resetNorthstarScoreCache,
} from "./advisorLanguage";

function makeOrganization(overrides: Partial<OrganizationRecord>): OrganizationRecord {
  const base = structuredClone(dataset.organizations[0]) as OrganizationRecord;
  const distressProbability = overrides.distressProbability ?? overrides.distress?.probability;

  return {
    ...base,
    ...overrides,
    distress:
      distressProbability === undefined
        ? (overrides.distress ?? base.distress)
        : {
            ...base.distress,
            ...overrides.distress,
            probability: distressProbability,
          },
  };
}

describe("Northstar v2.2 scoring", () => {
  beforeEach(() => {
    resetNorthstarScoreCache();
  });

  it("uses bucket-specific middle-component labels", () => {
    expect(getNorthstarComponentBreakdown(makeOrganization({ actionLabel: "Underinvested Asset Base" }))[1]?.label).toBe(
      "Asset Sophistication",
    );
    expect(getNorthstarComponentBreakdown(makeOrganization({ actionLabel: "Weak Financial Foundation" }))[1]?.label).toBe(
      "Financial Foundation",
    );
    expect(getNorthstarComponentBreakdown(makeOrganization({ actionLabel: "Revenue Concentration Risk" }))[1]?.label).toBe(
      "Structural",
    );
    expect(getNorthstarComponentBreakdown(makeOrganization({ actionLabel: "Needs Data Diligence" }))[1]?.label).toBe(
      "Structural",
    );
  });

  it("rewards deeper yield gaps inside underinvested asset base cases", () => {
    const stronger = getInboxCopy(
      makeOrganization({
        actionLabel: "Underinvested Asset Base",
        netAssetsEoy: 22_000_000,
        investmentYield: 0.4,
        consecutiveYearsWithInvestmentIncome: 8,
        dataCompletenessScore: 4.8,
      }),
    ).northstarScore;

    const weaker = getInboxCopy(
      makeOrganization({
        actionLabel: "Underinvested Asset Base",
        netAssetsEoy: 22_000_000,
        investmentYield: 4.9,
        consecutiveYearsWithInvestmentIncome: 1,
        dataCompletenessScore: 4.8,
      }),
    ).northstarScore;

    expect(stronger).toBeGreaterThan(weaker);
  });

  it("rewards stronger diversification need inside revenue concentration risk cases", () => {
    const concentrated = getInboxCopy(
      makeOrganization({
        actionLabel: "Revenue Concentration Risk",
        distressProbability: 24,
        operatingMargin: 9,
        revenueDiversificationIndex: 0.04,
        stress: {
          ...makeOrganization({}).stress,
          largestSourcePct: 94,
          severity25: "Moderate",
          burnMonths25: 7,
        },
      }),
    ).northstarScore;

    const broader = getInboxCopy(
      makeOrganization({
        actionLabel: "Revenue Concentration Risk",
        distressProbability: 24,
        operatingMargin: 9,
        revenueDiversificationIndex: 0.54,
        stress: {
          ...makeOrganization({}).stress,
          largestSourcePct: 51,
          severity25: "Moderate",
          burnMonths25: 7,
        },
      }),
    ).northstarScore;

    expect(concentrated).toBeGreaterThan(broader);
  });

  it("rewards the sweet-spot weak financial foundation profile", () => {
    const sweetSpot = getInboxCopy(
      makeOrganization({
        actionLabel: "Weak Financial Foundation",
        netAssetsEoy: 5_000_000,
        operatingMargin: -4,
        operatingRunwayMonths: 2.8,
        distressProbability: 42,
      }),
    ).northstarScore;

    const poorFit = getInboxCopy(
      makeOrganization({
        actionLabel: "Weak Financial Foundation",
        netAssetsEoy: 85_000_000,
        operatingMargin: 22,
        operatingRunwayMonths: 48,
        distressProbability: 42,
      }),
    ).northstarScore;

    expect(sweetSpot).toBeGreaterThan(poorFit);
  });

  it("reduces the confidence component when needs-data-diligence evidence is thin", () => {
    const clearer = makeOrganization({
      id: "ndd-clearer",
      actionLabel: "Needs Data Diligence",
      dataCompletenessScore: 4.8,
      distressProbability: 18,
      confidenceTier: "High",
      filingYearsObserved: 5,
    });
    const thinner = makeOrganization({
      id: "ndd-thinner",
      actionLabel: "Needs Data Diligence",
      dataCompletenessScore: 2.1,
      distressProbability: 18,
      confidenceTier: "Low",
      filingYearsObserved: 1,
    });

    const clearConfidence = getNorthstarComponentBreakdown(clearer).find((component) => component.key === "confidence")?.value ?? 0;
    const thinConfidence = getNorthstarComponentBreakdown(thinner).find((component) => component.key === "confidence")?.value ?? 0;

    expect(clearConfidence).toBeGreaterThan(thinConfidence);
  });
});
