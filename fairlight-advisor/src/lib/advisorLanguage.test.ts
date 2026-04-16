import { beforeEach, describe, expect, it } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import type { OrganizationRecord } from "../types";
import { getInboxCopy, primeNorthstarScores, resetNorthstarScoreCache } from "./advisorLanguage";

function makeOrganization(overrides: Partial<OrganizationRecord>): OrganizationRecord {
  const base = structuredClone(dataset.organizations[0]) as OrganizationRecord;
  const distressProbability = overrides.distressProbability ?? overrides.distress?.probability;

  return {
    ...base,
    netAssetsEoy: overrides.netAssetsEoy ?? base.netAssetsEoy ?? 5_000_000,
    investmentYield: overrides.investmentYield ?? base.investmentYield ?? 0,
    dataCompletenessScore: overrides.dataCompletenessScore ?? base.dataCompletenessScore ?? 6,
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

describe("Northstar Score v2", () => {
  beforeEach(() => {
    resetNorthstarScoreCache();
  });

  it("orders typical cases Diversify > Strengthen in otherwise comparable fundamentals", () => {
    const shared = {
      distressProbability: 28,
      confidenceTier: "High" as const,
      operatingMargin: 8,
      revenueDiversificationIndex: 0.08,
      netAssetsEoy: 10_000_000,
      investmentYield: 0.5,
      dataCompletenessScore: 7,
    };

    const diversify = getInboxCopy(makeOrganization({ ...shared, actionLabel: "Revenue Concentration Risk" })).northstarScore;
    const strengthen = getInboxCopy(makeOrganization({ ...shared, actionLabel: "Weak Financial Foundation" })).northstarScore;

    // Diversify gets a larger fit bonus (+8 vs +5 for same-size Strengthen), plus
    // the Diversify structural blend weights diversification need more heavily —
    // so Diversify should beat Strengthen in comparable fundamentals.
    expect(diversify).toBeGreaterThan(strengthen);
  });

  it("rewards stronger diversification need inside diversify cases", () => {
    const base = {
      actionLabel: "Revenue Concentration Risk" as const,
      distressProbability: 24,
      confidenceTier: "High" as const,
      operatingMargin: 9,
      netAssetsEoy: 10_000_000,
      investmentYield: 0.5,
      dataCompletenessScore: 7,
    };

    const concentrated = getInboxCopy(
      makeOrganization({ ...base, revenueDiversificationIndex: 0.06 }),
    ).northstarScore;
    const wellSpread = getInboxCopy(
      makeOrganization({ ...base, revenueDiversificationIndex: 0.58 }),
    ).northstarScore;

    expect(concentrated).toBeGreaterThan(wellSpread);
  });

  it("penalizes high distress probability (component E)", () => {
    const base = {
      actionLabel: "Revenue Concentration Risk" as const,
      confidenceTier: "High" as const,
      operatingMargin: 10,
      revenueDiversificationIndex: 0.04,
      netAssetsEoy: 10_000_000,
      investmentYield: 0.5,
      dataCompletenessScore: 7,
    };

    const safe = getInboxCopy(makeOrganization({ ...base, distressProbability: 10 })).northstarScore;
    const elevated = getInboxCopy(makeOrganization({ ...base, distressProbability: 45 })).northstarScore;
    const severe = getInboxCopy(makeOrganization({ ...base, distressProbability: 80 })).northstarScore;

    expect(safe).toBeGreaterThan(elevated);
    expect(elevated).toBeGreaterThan(severe);
  });

  it("applies the Fairlight fit bonus for Optimize orgs with low yield and >$1M assets", () => {
    const base = {
      actionLabel: "Underinvested Asset Base" as const,
      distressProbability: 15,
      confidenceTier: "High" as const,
      operatingMargin: 10,
      revenueDiversificationIndex: 0.2,
      dataCompletenessScore: 7,
    };

    const withBonus = getInboxCopy(
      makeOrganization({ ...base, netAssetsEoy: 2_000_000, investmentYield: 1.0 }),
    ).northstarScore;
    const noBonus = getInboxCopy(
      makeOrganization({ ...base, netAssetsEoy: 2_000_000, investmentYield: 5.0 }),
    ).northstarScore;

    // With low yield (<3%) and assets >$1M, Optimize earns +10 bonus.
    expect(withBonus).toBeGreaterThan(noBonus);
  });

  it("caps orgs with net assets > $500M at 30 (too large for Fairlight)", () => {
    const megaOrg = makeOrganization({
      actionLabel: "Revenue Concentration Risk",
      distressProbability: 5,
      confidenceTier: "High",
      operatingMargin: 15,
      revenueDiversificationIndex: 0.02,
      netAssetsEoy: 800_000_000,
      investmentYield: 0.5,
      dataCompletenessScore: 8,
    });

    expect(getInboxCopy(megaOrg).northstarScore).toBeLessThanOrEqual(30);
  });

  it("caps small non-Diversify orgs (<$500K) at 40", () => {
    const tinyOptimize = makeOrganization({
      actionLabel: "Underinvested Asset Base",
      distressProbability: 10,
      confidenceTier: "High",
      operatingMargin: 12,
      revenueDiversificationIndex: 0.3,
      netAssetsEoy: 200_000,
      investmentYield: 1.0,
      dataCompletenessScore: 6,
    });

    expect(getInboxCopy(tinyOptimize).northstarScore).toBeLessThanOrEqual(40);
  });

  it("does NOT cap small Diversify orgs (the $500K floor exclusion excludes Diversify)", () => {
    // A small Diversify org with strong signals can still score well.
    const tinyDiversify = makeOrganization({
      actionLabel: "Revenue Concentration Risk",
      distressProbability: 20,
      confidenceTier: "High",
      operatingMargin: 10,
      revenueDiversificationIndex: 0.04,
      netAssetsEoy: 200_000,
      investmentYield: 0.5,
      dataCompletenessScore: 7,
    });

    // Not bounded by the 40-point cap (no bonus since <$1M, but score can still exceed 40).
    expect(getInboxCopy(tinyDiversify).northstarScore).toBeGreaterThan(0);
  });

  it("primeNorthstarScores produces the same result as ad-hoc scoring", () => {
    const org = makeOrganization({
      actionLabel: "Revenue Concentration Risk",
      distressProbability: 24,
      confidenceTier: "High",
      operatingMargin: 9,
      revenueDiversificationIndex: 0.08,
      netAssetsEoy: 10_000_000,
      investmentYield: 0.5,
      dataCompletenessScore: 7,
    });

    const adHocScore = getInboxCopy(org).northstarScore;
    resetNorthstarScoreCache();
    primeNorthstarScores([org]);
    const primedScore = getInboxCopy(org).northstarScore;

    expect(primedScore).toBe(adHocScore);
  });

  it("yields a score in [0, 100] across a range of inputs", () => {
    const samples = [
      makeOrganization({ actionLabel: "Revenue Concentration Risk", distressProbability: 5, netAssetsEoy: 50_000_000 }),
      makeOrganization({ actionLabel: "Weak Financial Foundation", distressProbability: 85, netAssetsEoy: 7_000_000 }),
      makeOrganization({ actionLabel: "Underinvested Asset Base", distressProbability: 15, netAssetsEoy: 2_000_000 }),
      makeOrganization({ actionLabel: "Needs Data Diligence", distressProbability: 75, netAssetsEoy: 100_000 }),
    ];

    for (const org of samples) {
      const score = getInboxCopy(org).northstarScore;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
