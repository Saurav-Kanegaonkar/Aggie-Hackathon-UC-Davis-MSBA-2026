import { beforeEach, describe, expect, it } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import type { OrganizationRecord } from "../types";
import { getInboxCopy, primeNorthstarScores, resetNorthstarScoreCache } from "./advisorLanguage";

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

describe("getInboxCopy Northstar score", () => {
  beforeEach(() => {
    resetNorthstarScoreCache();
  });

  it("prioritizes diversify cases over otherwise similar outreach cases", () => {
    const shared = {
      distressProbability: 28,
      confidenceTier: "High" as const,
      operatingMargin: 8,
      revenueDiversificationIndex: 0.08,
    };

    const diversify = getInboxCopy(makeOrganization({ ...shared, actionLabel: "Diversify" })).northstarScore;
    const stabilize = getInboxCopy(makeOrganization({ ...shared, actionLabel: "Stabilize" })).northstarScore;
    const amplify = getInboxCopy(makeOrganization({ ...shared, actionLabel: "Amplify" })).northstarScore;
    const deepReview = getInboxCopy(makeOrganization({ ...shared, actionLabel: "Deep Review" })).northstarScore;

    expect(diversify).toBeGreaterThan(stabilize);
    expect(stabilize).toBeGreaterThan(amplify);
    expect(stabilize).toBeGreaterThan(deepReview);
  });

  it("rewards stronger diversification need inside diversify cases", () => {
    const concentrated = getInboxCopy(
      makeOrganization({
        actionLabel: "Diversify",
        distressProbability: 24,
        confidenceTier: "High",
        operatingMargin: 9,
        revenueDiversificationIndex: 0.06,
      }),
    ).northstarScore;

    const wellSpread = getInboxCopy(
      makeOrganization({
        actionLabel: "Diversify",
        distressProbability: 24,
        confidenceTier: "High",
        operatingMargin: 9,
        revenueDiversificationIndex: 0.58,
      }),
    ).northstarScore;

    expect(concentrated).toBeGreaterThan(wellSpread);
  });

  it("keeps low-priority lanes in clearly lower score bands", () => {
    const amplify = getInboxCopy(
      makeOrganization({
        actionLabel: "Amplify",
        distressProbability: 5,
        confidenceTier: "High",
        operatingMargin: 18,
        revenueDiversificationIndex: 0.62,
      }),
    ).northstarScore;

    const deepReview = getInboxCopy(
      makeOrganization({
        actionLabel: "Deep Review",
        distressProbability: 5,
        confidenceTier: "High",
        operatingMargin: 18,
        revenueDiversificationIndex: 0.04,
      }),
    ).northstarScore;

    expect(amplify).toBeLessThanOrEqual(42);
    expect(deepReview).toBeLessThanOrEqual(28);
    expect(amplify).toBeGreaterThan(deepReview);
  });

  it("spreads scores across a lane once the shortlist is ranked together", () => {
    const low = makeOrganization({
      id: "diversify-low",
      actionLabel: "Diversify",
      distressProbability: 52,
      confidenceTier: "Medium",
      operatingMargin: 3,
      revenueDiversificationIndex: 0.18,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 61,
        severity25: "Moderate",
        burnMonths25: 8,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.18",
      },
    });
    const mid = makeOrganization({
      id: "diversify-mid",
      actionLabel: "Diversify",
      distressProbability: 41,
      confidenceTier: "High",
      operatingMargin: 9,
      revenueDiversificationIndex: 0.08,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 79,
        severity25: "Mild",
        burnMonths25: 14,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.31",
      },
    });
    const high = makeOrganization({
      id: "diversify-high",
      actionLabel: "Diversify",
      distressProbability: 24,
      confidenceTier: "High",
      operatingMargin: 14,
      revenueDiversificationIndex: 0.01,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 96,
        severity25: "None",
        burnMonths25: 24,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.46",
      },
    });

    primeNorthstarScores([low, mid, high]);

    const scores = [getInboxCopy(low).northstarScore, getInboxCopy(mid).northstarScore, getInboxCopy(high).northstarScore];

    expect(new Set(scores).size).toBe(3);
    expect(scores[0]).toBeLessThan(scores[1]);
    expect(scores[1]).toBeLessThan(scores[2]);
  });

  it("makes risk visibly matter inside a lane after ranking is primed", () => {
    const safer = makeOrganization({
      id: "diversify-safer",
      actionLabel: "Diversify",
      distressProbability: 18,
      confidenceTier: "High",
      operatingMargin: 10,
      revenueDiversificationIndex: 0.04,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 88,
        severity25: "Mild",
        burnMonths25: 18,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.36",
      },
    });

    const riskier = makeOrganization({
      id: "diversify-riskier",
      actionLabel: "Diversify",
      distressProbability: 58,
      confidenceTier: "High",
      operatingMargin: 10,
      revenueDiversificationIndex: 0.04,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 88,
        severity25: "Mild",
        burnMonths25: 18,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.36",
      },
    });

    primeNorthstarScores([safer, riskier]);

    expect(getInboxCopy(safer).northstarScore).toBeGreaterThan(getInboxCopy(riskier).northstarScore);
  });

  it("caps high-risk diversify cases so they do not read as top-tier healthy", () => {
    const highRisk = makeOrganization({
      id: "diversify-high-risk",
      actionLabel: "Diversify",
      distressProbability: 67,
      confidenceTier: "High",
      operatingMargin: 14,
      revenueDiversificationIndex: 0.01,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 96,
        severity25: "None",
        burnMonths25: 24,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.46",
      },
    });

    const lowerRisk = makeOrganization({
      id: "diversify-lower-risk",
      actionLabel: "Diversify",
      distressProbability: 34,
      confidenceTier: "High",
      operatingMargin: 14,
      revenueDiversificationIndex: 0.01,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 96,
        severity25: "None",
        burnMonths25: 24,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.46",
      },
    });

    primeNorthstarScores([highRisk, lowerRisk]);

    expect(getInboxCopy(highRisk).northstarScore).toBeLessThanOrEqual(72);
    expect(getInboxCopy(lowerRisk).northstarScore).toBeGreaterThan(getInboxCopy(highRisk).northstarScore);
  });

  it("keeps low-risk stabilize cases from reading like top-priority outreach", () => {
    const lowerRisk = makeOrganization({
      id: "stabilize-lower-risk",
      actionLabel: "Stabilize",
      distressProbability: 12,
      confidenceTier: "High",
      operatingMargin: -2,
      revenueDiversificationIndex: 0.12,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 78,
        severity25: "Moderate",
        burnMonths25: 7,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.24",
      },
    });

    const higherRisk = makeOrganization({
      id: "stabilize-higher-risk",
      actionLabel: "Stabilize",
      distressProbability: 46,
      confidenceTier: "High",
      operatingMargin: -2,
      revenueDiversificationIndex: 0.12,
      stress: {
        ...makeOrganization({}).stress,
        largestSourcePct: 78,
        severity25: "Moderate",
        burnMonths25: 7,
      },
      benchmark: {
        ...makeOrganization({}).benchmark,
        diversificationGap: "-0.24",
      },
    });

    primeNorthstarScores([lowerRisk, higherRisk]);

    expect(getInboxCopy(lowerRisk).northstarScore).toBeLessThanOrEqual(56);
    expect(getInboxCopy(higherRisk).northstarScore).toBeGreaterThan(getInboxCopy(lowerRisk).northstarScore);
  });

  it("suppresses amplify cases once risk is no longer clearly low", () => {
    const safer = makeOrganization({
      id: "amplify-safer",
      actionLabel: "Amplify",
      distressProbability: 8,
      confidenceTier: "High",
      operatingMargin: 16,
      revenueDiversificationIndex: 0.65,
    });

    const riskier = makeOrganization({
      id: "amplify-riskier",
      actionLabel: "Amplify",
      distressProbability: 38,
      confidenceTier: "High",
      operatingMargin: 16,
      revenueDiversificationIndex: 0.65,
    });

    primeNorthstarScores([safer, riskier]);

    expect(getInboxCopy(riskier).northstarScore).toBeLessThanOrEqual(24);
    expect(getInboxCopy(safer).northstarScore).toBeGreaterThan(getInboxCopy(riskier).northstarScore);
  });

  it("keeps deep-review cases low even when projected risk is high", () => {
    const lowerRisk = makeOrganization({
      id: "deep-review-lower-risk",
      actionLabel: "Deep Review",
      distressProbability: 18,
      confidenceTier: "Low",
      operatingMargin: 6,
      revenueDiversificationIndex: 0.06,
    });

    const higherRisk = makeOrganization({
      id: "deep-review-higher-risk",
      actionLabel: "Deep Review",
      distressProbability: 62,
      confidenceTier: "Low",
      operatingMargin: 6,
      revenueDiversificationIndex: 0.06,
    });

    primeNorthstarScores([lowerRisk, higherRisk]);

    expect(getInboxCopy(higherRisk).northstarScore).toBeLessThanOrEqual(16);
    expect(getInboxCopy(lowerRisk).northstarScore).toBeGreaterThanOrEqual(getInboxCopy(higherRisk).northstarScore);
  });
});
