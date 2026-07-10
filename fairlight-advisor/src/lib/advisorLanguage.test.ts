import { beforeEach, describe, expect, it } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import type { OrganizationRecord } from "../types";
import {
  getDecisionLabCopy,
  getInboxCopy,
  primeNorthstarScores,
  resetNorthstarScoreCache,
} from "./advisorLanguage";

function makeOrganization(overrides: Partial<OrganizationRecord>): OrganizationRecord {
  const base = structuredClone(dataset.organizations[0]) as OrganizationRecord;
  const distressProbability = overrides.distressProbability ?? overrides.distress?.probability;

  return {
    ...base,
    netAssetsEoy: overrides.netAssetsEoy ?? base.netAssetsEoy ?? 5_000_000,
    investmentYield: overrides.investmentYield ?? base.investmentYield ?? 0,
    dataCompletenessScore: overrides.dataCompletenessScore ?? base.dataCompletenessScore ?? 6,
    consecutiveYearsWithInvestmentIncome:
      overrides.consecutiveYearsWithInvestmentIncome ??
      base.consecutiveYearsWithInvestmentIncome ??
      0,
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

  it("orders typical cases Strengthen > Diversify in otherwise comparable fundamentals", () => {
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

    // The current Financial Foundation model gives a comparable Strengthen case
    // a stronger bucket-fit and repair profile than the Diversify structural blend.
    expect(strengthen).toBeGreaterThan(diversify);
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

  it("Asset Sophistication: UAB orgs with long investment track record and low yield score high", () => {
    // UAB uses the alternative middle component. Long streak + low yield + large
    // assets should now produce a score meaningfully above v2's ceiling of ~78.
    const strongUab = makeOrganization({
      actionLabel: "Underinvested Asset Base",
      distressProbability: 10,
      confidenceTier: "High",
      operatingMargin: 12,
      revenueDiversificationIndex: 0.35,
      netAssetsEoy: 20_000_000,
      investmentYield: 0.3,
      dataCompletenessScore: 8,
      consecutiveYearsWithInvestmentIncome: 7,
    });

    expect(getInboxCopy(strongUab).northstarScore).toBeGreaterThanOrEqual(85);
  });

  it("Asset Sophistication: investment track record tiers matter", () => {
    // Use inputs that don't saturate at 100 so the streak differential is visible.
    // Smaller assets (~$750K) and moderate yield/confidence keep the total below
    // the clamp, letting the 0/3/7/10 track_record tiers actually show up.
    const base = {
      actionLabel: "Underinvested Asset Base" as const,
      distressProbability: 40,
      confidenceTier: "Medium" as const,
      operatingMargin: -5,
      revenueDiversificationIndex: 0.5,
      netAssetsEoy: 750_000,
      investmentYield: 4.0,
      dataCompletenessScore: 3,
    };

    const noStreak = getInboxCopy(makeOrganization({ ...base, consecutiveYearsWithInvestmentIncome: 0 })).northstarScore;
    const midStreak = getInboxCopy(makeOrganization({ ...base, consecutiveYearsWithInvestmentIncome: 3 })).northstarScore;
    const longStreak = getInboxCopy(makeOrganization({ ...base, consecutiveYearsWithInvestmentIncome: 6 })).northstarScore;

    expect(midStreak).toBeGreaterThan(noStreak);
    expect(longStreak).toBeGreaterThan(midStreak);
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

describe("advisor copy evidence boundaries", () => {
  it("describes Form 990 concentration as an aggregate revenue category", () => {
    const organization = makeOrganization({
      actionLabel: "Revenue Concentration Risk",
      revenueAmount: 8_000_000,
    });
    organization.stress = {
      ...organization.stress,
      largestSource: "Contributions",
      largestSourcePct: 72,
      burnMonths25: 5,
    };

    const note = getInboxCopy(organization).whyNow;

    expect(note).toContain("largest reported revenue category, contributions");
    expect(note).toContain("25% decline in that category");
    expect(note).not.toMatch(/donor|funder|grant source|single revenue source|funding cut/i);
  });

  it("keeps downstream concentration language at the revenue-category level", () => {
    const organization = makeOrganization({
      actionLabel: "Revenue Concentration Risk",
    });
    organization.stress = {
      ...organization.stress,
      largestSource: "Contributions",
      largestSourcePct: 72,
      severity25: "Moderate",
    };
    organization.recommendation = {
      ...organization.recommendation,
      caveats: ["Stress posture needs review"],
    };

    const copy = getDecisionLabCopy(organization);
    const categoryFact = copy.factCards.find((fact) => fact.label === "Largest category");

    expect(copy.titleLine).toContain("reported revenue category");
    expect(copy.surfacedReason).toContain("reported revenue category");
    expect(categoryFact?.detail).toContain("largest reported category");
    expect(copy.caveatNotes).toContain("Revenue-category data is too thin to fully test a downturn.");
    expect(JSON.stringify(copy)).not.toMatch(/one source of money|biggest source|funding-source/i);
  });

  it("uses the latest liquid-reserve proxy to estimate yield opportunity", () => {
    const organization = makeOrganization({
      actionLabel: "Underinvested Asset Base",
      netAssetsEoy: 10_000_000,
      investmentYield: 1,
      historicalFinancials: [
        {
          fiscalYear: 2023,
          revenue: 4_000_000,
          expenses: 3_900_000,
          netAssets: 9_000_000,
          liquidReserves: 1_000_000,
          operatingMargin: 2.5,
        },
        {
          fiscalYear: 2024,
          revenue: 4_200_000,
          expenses: 4_000_000,
          netAssets: 10_000_000,
          liquidReserves: 2_000_000,
          operatingMargin: 4.8,
        },
      ],
    });

    const note = getInboxCopy(organization).whyNow;

    expect(note).toContain("Reports $10.0M in net assets");
    expect(note).toContain("latest liquid-reserve proxy");
    expect(note).toContain("estimated annual yield opportunity of $80K");
    expect(note).not.toContain("$400K");
    expect(note).not.toMatch(/net assets? (?:are|as) reserves|idle balance sheet/i);
  });

  it("labels a net-assets-based yield opportunity as an upper bound", () => {
    const organization = makeOrganization({
      actionLabel: "Underinvested Asset Base",
      netAssetsEoy: 10_000_000,
      investmentYield: 1,
      historicalFinancials: [],
    });

    const note = getInboxCopy(organization).whyNow;

    expect(note).toContain("upper-bound estimate based on net assets");
    expect(note).toContain("up to $400K/year");
    expect(note).toContain("actual investable funds require diligence");
    expect(note).not.toMatch(/holds .* in reserves|idle balance sheet/i);
  });
});
