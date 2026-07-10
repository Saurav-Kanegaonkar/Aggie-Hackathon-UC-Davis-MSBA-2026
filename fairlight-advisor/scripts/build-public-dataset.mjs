import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "../src/data/fairlight-advisor.json");
const outputPath = resolve(here, "../src/data/fairlight-advisor-public.json");
const dataset = JSON.parse(readFileSync(sourcePath, "utf8"));

const sectorNames = {
  A: "Arts and Culture",
  B: "Education",
  E: "Health Care",
  L: "Housing",
  O: "Youth Development",
  P: "Human Services",
  S: "Community Development",
  T: "Philanthropy",
  W: "Public Benefit",
};

const caseScaleFactors = [0.73, 1.19, 0.84, 1.31, 0.91, 1.14, 0.78, 1.27, 0.88, 1.22];
const runwayFactors = [0.91, 1.08, 0.95, 1.12, 0.89, 1.06, 0.93, 1.09, 0.97, 1.04];

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const sourceOrganizations = [...dataset.organizations].sort(
  (left, right) => stableHash(left.id) - stableHash(right.id),
);
const sourceIndexById = new Map(dataset.organizations.map((organization, index) => [organization.id, index]));
const aliases = new Map(
  sourceOrganizations.map((organization, index) => [
    organization.orgName,
    `${sectorNames[organization.nteeCategory] ?? "Nonprofit"} Case ${String(index + 1).padStart(2, "0")}`,
  ]),
);
const peerAliases = new Map(
  [...new Set(dataset.organizations.flatMap((organization) => organization.analogs.map((analog) => analog.orgName)))]
    .sort((left, right) => stableHash(left) - stableHash(right))
    .map((peerName, index) => [peerName, `Matched Peer ${String(index + 1).padStart(2, "0")}`]),
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const replacements = dataset.organizations
  .flatMap((organization) => [
    [organization.orgName, aliases.get(organization.orgName)],
    [organization.ein, "REDACTED-EIN"],
  ])
  .filter(([from, to]) => from && to)
  .concat([...peerAliases.entries()]);

function scrubString(value) {
  const scrubbed = replacements.reduce(
    (result, [from, to]) => result.replace(new RegExp(escapeRegExp(from), "gi"), to),
    value,
  );

  return scrubbed
    .replace(/largest revenue source/gi, "largest reported revenue category")
    .replace(/25% source shock/gi, "25% reported-category shock")
    .replace(/\bnan\b/gi, "not available");
}

function scrubValue(value) {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubValue(item)]));
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function signed(value, digits = 2) {
  const rounded = round(value, digits);
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function jitter(caseIndex, fiscalYear, channel, maximum = 0.04) {
  const unit = (stableHash(`${caseIndex}:${fiscalYear}:${channel}`) % 2001) / 1000 - 1;
  return 1 + unit * maximum;
}

function transformMoney(value, caseIndex, fiscalYear, channel) {
  if (!Number.isFinite(value)) return value;
  const scale = caseScaleFactors[caseIndex % caseScaleFactors.length];
  return Math.round(value * scale * jitter(caseIndex, fiscalYear, channel));
}

function revenueDisplay(value) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function sizeBucket(value) {
  if (value < 500_000) return "<500K";
  if (value < 2_000_000) return "500K-2M";
  if (value < 10_000_000) return "2M-10M";
  return ">10M";
}

function transformFinancialHistory(organization, caseIndex) {
  const cappedHistory = organization.historicalFinancials.filter(
    (point) => point.fiscalYear <= organization.fiscalYear,
  );
  const sourceHistory = cappedHistory.length ? cappedHistory : organization.historicalFinancials.slice(-1);

  return sourceHistory.map((point) => {
    const revenue = transformMoney(point.revenue, caseIndex, point.fiscalYear, "revenue");
    const expenses = transformMoney(point.expenses, caseIndex, point.fiscalYear, "expenses");
    const netAssets = transformMoney(point.netAssets, caseIndex, point.fiscalYear, "net-assets");
    const liquidReserves = transformMoney(point.liquidReserves, caseIndex, point.fiscalYear, "liquid-reserves");
    const operatingMargin = revenue > 0 ? round(((revenue - expenses) / revenue) * 100, 1) : 0;

    return { ...point, revenue, expenses, netAssets, liquidReserves, operatingMargin };
  });
}

function transformRevenueComposition(organization, caseIndex) {
  const cappedHistory = organization.revenueCompositionHistory.filter(
    (point) => point.fiscalYear <= organization.fiscalYear,
  );
  const sourceHistory = cappedHistory.length ? cappedHistory : organization.revenueCompositionHistory.slice(-1);

  return sourceHistory.map((point) => {
    const mixDelta = ((stableHash(`${caseIndex}:${point.fiscalYear}:mix`) % 61) - 30) / 10;
    const investmentDelta = ((stableHash(`${caseIndex}:${point.fiscalYear}:investment`) % 17) - 8) / 10;
    const rawShares = [
      Math.max(point.contributionsPct + mixDelta, 0),
      Math.max(point.programPct - mixDelta * 0.65, 0),
      Math.max(point.investmentPct + investmentDelta, 0),
      Math.max(point.otherPct - mixDelta * 0.35 - investmentDelta, 0),
    ];
    const totalShare = rawShares.reduce((sum, value) => sum + value, 0) || 1;
    const contributionsPct = Math.floor((rawShares[0] / totalShare) * 1000) / 10;
    const programPct = Math.floor((rawShares[1] / totalShare) * 1000) / 10;
    const investmentPct = Math.floor((rawShares[2] / totalShare) * 1000) / 10;
    const otherPct = round(100 - contributionsPct - programPct - investmentPct, 1);

    return { ...point, contributionsPct, programPct, investmentPct, otherPct };
  });
}

function diversificationIndex(point) {
  if (!point) return 0;
  const positiveShares = [
    point.contributionsPct,
    point.programPct,
    point.investmentPct,
    point.otherPct,
  ].map((value) => Math.max(value, 0));
  const total = positiveShares.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  return round(1 - positiveShares.reduce((sum, value) => sum + (value / total) ** 2, 0), 3);
}

function largestRevenueCategory(point) {
  const categories = [
    ["Contributions & grants", point?.contributionsPct ?? 0],
    ["Program service revenue", point?.programPct ?? 0],
    ["Investment income", point?.investmentPct ?? 0],
    ["Other revenue", point?.otherPct ?? 0],
  ];
  return categories.reduce((largest, current) => (current[1] > largest[1] ? current : largest));
}

function transformAnalog(analog, caseIndex, analogIndex) {
  const metric = analog.metricName.toLowerCase();
  const offset = ((caseIndex + analogIndex) % 5) - 2;
  let preValue = analog.preValue;
  let postValue = analog.postValue;

  if (metric.includes("margin")) {
    preValue = round(clamp(preValue + offset * 0.017, -1, 1), 3);
    postValue = round(clamp(postValue - offset * 0.013, -1, 1), 3);
  } else if (metric.includes("divers")) {
    preValue = round(clamp(preValue + offset * 0.012, 0, 1), 3);
    postValue = round(clamp(postValue - offset * 0.009, 0, 1), 3);
  } else {
    const factor = runwayFactors[(caseIndex + analogIndex) % runwayFactors.length];
    preValue = round(preValue * factor, 2);
    postValue = round(postValue / factor, 2);
  }

  return { ...analog, preValue, postValue };
}

function transformReplay(crisisReplay, caseIndex, riskOffset) {
  if (!crisisReplay) return undefined;

  const trajectory = crisisReplay.trajectory.map((point) => {
    const totalRevenue = transformMoney(point.totalRevenue, caseIndex, point.fiscalYear, "replay-revenue");
    const totalExpenses = transformMoney(point.totalExpenses, caseIndex, point.fiscalYear, "replay-expenses");
    const netAssets = transformMoney(point.netAssets, caseIndex, point.fiscalYear, "replay-assets");
    const operatingMargin = totalRevenue > 0 ? round((totalRevenue - totalExpenses) / totalRevenue, 4) : 0;

    return {
      ...point,
      netAssets,
      totalRevenue,
      totalExpenses,
      operatingMargin,
      cashRunwayMonths:
        point.cashRunwayMonths >= 120
          ? 120
          : round(point.cashRunwayMonths * runwayFactors[caseIndex % runwayFactors.length], 1),
      largestSourcePct: round(clamp(point.largestSourcePct + ((caseIndex % 5) - 2) * 1.3, 0, 100), 1),
      distressProbability:
        point.distressProbability == null
          ? point.distressProbability
          : round(clamp(point.distressProbability + riskOffset, 0.5, 99), 1),
    };
  });
  const callPoint = trajectory.find((point) => point.fiscalYear === crisisReplay.callFiscalYear);

  return {
    ...crisisReplay,
    predictedDistressProbability: round(clamp(crisisReplay.predictedDistressProbability + riskOffset, 0.5, 99), 1),
    predictedDistressProbabilityLogisticV2:
      crisisReplay.predictedDistressProbabilityLogisticV2 == null
        ? crisisReplay.predictedDistressProbabilityLogisticV2
        : round(clamp(crisisReplay.predictedDistressProbabilityLogisticV2 + riskOffset, 0.5, 99), 1),
    predictedDistressProbabilityXgboost:
      crisisReplay.predictedDistressProbabilityXgboost == null
        ? crisisReplay.predictedDistressProbabilityXgboost
        : round(clamp(crisisReplay.predictedDistressProbabilityXgboost + riskOffset, 0.5, 99), 1),
    xgboostShapExplanation: null,
    netAssetsAtCall: callPoint?.netAssets ?? null,
    revenueAtCall: callPoint?.totalRevenue ?? null,
    marginAtCall: callPoint?.operatingMargin ?? null,
    runwayAtCall: callPoint?.cashRunwayMonths ?? null,
    t1OutcomeSummary: "The next observed filing is shown separately from the illustrative intervention scenario.",
    t2OutcomeSummary: "Subsequent observations remain evidence for replay, not proof of intervention impact.",
    trajectory,
  };
}

function transformOrganization(organization, sourceOrganization, caseIndex) {
  const historicalFinancials = transformFinancialHistory(organization, caseIndex);
  const revenueCompositionHistory = transformRevenueComposition(organization, caseIndex);
  const latestFinancial = historicalFinancials.at(-1);
  const latestComposition = revenueCompositionHistory.at(-1);
  const revenueDiversificationIndex = diversificationIndex(latestComposition);
  const [largestSource, largestSourcePct] = largestRevenueCategory(latestComposition);
  const operatingMargin = latestFinancial?.operatingMargin ?? organization.operatingMargin;
  const operatingRunwayMonths = round(
    organization.operatingRunwayMonths * runwayFactors[caseIndex % runwayFactors.length],
    2,
  );
  const riskOffset = ((caseIndex % 7) - 3) * 0.9;
  const distressProbability = round(clamp(organization.distressProbability + riskOffset, 0.5, 99), 1);
  const marginBenchmark =
    sourceOrganization.operatingMargin - Number.parseFloat(sourceOrganization.benchmark.operatingMarginGap) * 100;
  const runwayBenchmark =
    sourceOrganization.operatingRunwayMonths - Number.parseFloat(sourceOrganization.benchmark.operatingRunwayGap);
  const diversificationBenchmark =
    sourceOrganization.revenueDiversificationIndex - Number.parseFloat(sourceOrganization.benchmark.diversificationGap);
  const peerMarginOffset = ((caseIndex % 5) - 2) * 1.2;
  const transformedPeerHistory = organization.peerOperatingMarginHistory
    .filter((point) => point.fiscalYear <= organization.fiscalYear)
    .map((point) => ({
      ...point,
      peerMarginQ25: round(point.peerMarginQ25 + peerMarginOffset, 1),
      peerMarginMedian: round(point.peerMarginMedian + peerMarginOffset, 1),
      peerMarginQ75: round(point.peerMarginQ75 + peerMarginOffset, 1),
    }));
  const transformedRevenue = latestFinancial?.revenue ?? organization.revenueAmount ?? 0;
  const transformedNetAssets = latestFinancial?.netAssets ?? organization.netAssetsEoy;
  const transformedSizeBucket = sizeBucket(transformedRevenue);
  const publicName = aliases.get(sourceOrganization.orgName);

  return {
    ...organization,
    fiscalYear: sourceOrganization.fiscalYear,
    firstFilingYear: historicalFinancials[0]?.fiscalYear ?? sourceOrganization.fiscalYear,
    latestFilingYear: sourceOrganization.fiscalYear,
    filingYearsObserved: historicalFinancials.length,
    revenueAmount: transformedRevenue,
    revenueDisplay: revenueDisplay(transformedRevenue),
    netAssetsEoy: transformedNetAssets,
    sizeBucket: transformedSizeBucket,
    investmentYield: round(clamp(organization.investmentYield + ((caseIndex % 5) - 2) * 0.09 - 0.02, 0, 20), 3),
    consecutiveYearsWithInvestmentIncome: Math.min(
      organization.consecutiveYearsWithInvestmentIncome,
      historicalFinancials.length,
    ),
    operatingMargin,
    operatingRunwayMonths,
    revenueDiversificationIndex,
    distressProbability,
    distressLabel: `${organization.distressTier} distress risk`,
    decisionReason: "Synthetic decision-support case built from transformed public filing patterns.",
    whySurfaced: `Surfaced for ${organization.actionLabel.toLowerCase()} analysis with ${organization.confidenceTier.toLowerCase()} evidence confidence.`,
    confidenceNote: `${organization.confidenceTier} confidence in the transformed demonstration signals; verify current audited statements before action.`,
    memoText: `${publicName} is a synthetic demonstration case based on transformed public Form 990 patterns. Review peer benchmarks, evidence confidence, and scenario assumptions before drawing conclusions.`,
    historicalFinancials,
    peerOperatingMarginHistory: transformedPeerHistory,
    revenueCompositionHistory,
    scoreDrivers: Object.fromEntries(
      Object.entries(organization.scoreDrivers).map(([key, value], driverIndex) => [
        key,
        round(Math.max(0, value + (((caseIndex + driverIndex) % 5) - 2) * 0.35), 2),
      ]),
    ),
    benchmark: {
      ...organization.benchmark,
      headline: `${organization.actionLabel} vs synthetic peer benchmark`,
      operatingMarginGap: signed((operatingMargin - (marginBenchmark + peerMarginOffset)) / 100),
      operatingRunwayGap: signed(operatingRunwayMonths - runwayBenchmark),
      diversificationGap: signed(revenueDiversificationIndex - diversificationBenchmark),
      peerCohort: `ntee_major_category=${organization.nteeCategory}|size_bucket=${transformedSizeBucket}|state=${organization.state}`,
    },
    stress: {
      ...organization.stress,
      headline: "Synthetic reported-category shock scenario",
      largestSource,
      largestSourcePct,
      burnMonths25:
        organization.stress.burnMonths25 == null
          ? null
          : round(organization.stress.burnMonths25 * runwayFactors[caseIndex % runwayFactors.length], 1),
      burnMonths50:
        organization.stress.burnMonths50 == null
          ? null
          : round(organization.stress.burnMonths50 * runwayFactors[caseIndex % runwayFactors.length], 1),
    },
    distress: {
      ...organization.distress,
      headline: `${distressProbability.toFixed(1)}% modeled next-year distress probability`,
      probability: distressProbability,
    },
    analogs: organization.analogs.map((analog, analogIndex) => transformAnalog(analog, caseIndex, analogIndex)),
    recommendation: {
      ...organization.recommendation,
      rationale: `Use this synthetic ${organization.actionLabel.toLowerCase()} case to demonstrate how Northstar connects financial signals to an advisor workflow.`,
      caveats: [
        "Confirm current audited statements, restrictions, and management context before acting.",
        "Treat peer and scenario deltas as directional decision support, not causal estimates.",
      ],
      exportSummary: `${publicName} is a synthetic ${organization.actionLabel.toLowerCase()} demonstration case.`,
    },
    crisisReplay: transformReplay(organization.crisisReplay, caseIndex, riskOffset),
  };
}

const scrubbedDataset = scrubValue(dataset);
const publicDataset = { ...scrubbedDataset };
publicDataset.organizations = sourceOrganizations.map((sourceOrganization, caseIndex) => {
  const sourceIndex = sourceIndexById.get(sourceOrganization.id);
  const scrubbedOrganization = scrubbedDataset.organizations[sourceIndex];
  const organization = transformOrganization(scrubbedOrganization, sourceOrganization, caseIndex);

  return {
    ...organization,
    id: `demo-case-${String(caseIndex + 1).padStart(2, "0")}`,
    ein: `DEMO-${String(caseIndex + 1).padStart(3, "0")}`,
    orgName: aliases.get(sourceOrganization.orgName),
    analogs: organization.analogs.map((analog, analogIndex) => ({
      ...analog,
      orgName:
        peerAliases.get(sourceOrganization.analogs[analogIndex]?.orgName) ??
        `Matched Peer ${analogIndex + 1}`,
    })),
  };
});
publicDataset.publicDemo = {
  syntheticized: true,
  note: "Synthetic demonstration cases use transformed public IRS Form 990 patterns; names, EINs, exact amounts, and record ordering have been changed.",
};

const serializedDataset = `${JSON.stringify(publicDataset, null, 2)}\n`;
const sensitiveValues = [
  ...dataset.organizations.map((organization) => organization.orgName),
  ...dataset.organizations.map((organization) => organization.ein),
  ...dataset.organizations.flatMap((organization) => organization.analogs.map((analog) => analog.orgName)),
].filter((value) => typeof value === "string" && value.length > 4);

function collectLargeNumberSignatures(value, signatures = new Set()) {
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 100_000) {
    signatures.add(String(Math.round(value)));
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectLargeNumberSignatures(item, signatures));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectLargeNumberSignatures(item, signatures));
  }
  return signatures;
}

const sourceAmountSignatures = [...collectLargeNumberSignatures(dataset)];

const leakedValue = sensitiveValues.find((value) =>
  serializedDataset.toLowerCase().includes(value.toLowerCase()),
);
const leakedAmount = sourceAmountSignatures.find((value) => serializedDataset.includes(value));
const invalidReplayMargin = publicDataset.organizations
  .flatMap((organization) => organization.crisisReplay?.trajectory ?? [])
  .find((point) => Math.abs(point.operatingMargin) > 2);
const invalidRevenueComposition = publicDataset.organizations
  .flatMap((organization) => organization.revenueCompositionHistory)
  .find((point) => {
    const shares = [point.contributionsPct, point.programPct, point.investmentPct, point.otherPct];
    const total = shares.reduce((sum, value) => sum + value, 0);
    return shares.some((value) => value < 0 || value > 100) || Math.abs(total - 100) > 0.11;
  });

if (leakedValue) {
  throw new Error(`Public dataset still contains a source identifier: ${leakedValue}`);
}

if (leakedAmount) {
  throw new Error(`Public dataset still contains an exact source amount: ${leakedAmount}`);
}

if (invalidReplayMargin) {
  throw new Error("Crisis Replay margins must remain decimal ratios, not percentage-point values");
}

if (invalidRevenueComposition) {
  throw new Error("Public revenue-composition shares must be nonnegative and sum to 100%");
}

if (/\bnan\b/i.test(serializedDataset)) {
  throw new Error("Public dataset still contains an unresolved NaN label");
}

writeFileSync(outputPath, serializedDataset);
