import type { ActionLabel, OrganizationRecord } from "../types";

export function compactCurrency(value: number): string {
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

function formatRisk(probability: number): string {
  if (probability < 1) {
    return "below 1%";
  }

  return `${probability.toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function historyLine(organization: OrganizationRecord): string {
  const years = organization.filingYearsObserved;
  const label = years === 1 ? "1 filing year" : `${years} filing years`;
  return `Using ${label} through FY${organization.latestFilingYear}`;
}

function mixRead(value: number): string {
  if (value >= 0.45) {
    return "broad";
  }
  if (value >= 0.3) {
    return "reasonably broad";
  }
  if (value >= 0.15) {
    return "somewhat concentrated";
  }
  return "highly concentrated";
}

function callHeadline(action: ActionLabel): string {
  switch (action) {
    case "Underinvested Asset Base":
      return "Move forward";
    case "Weak Financial Foundation":
      return "Support with guardrails";
    case "Revenue Concentration Risk":
      return "Support with diversification conditions";
    case "Needs Data Diligence":
      return "Hold pending diligence";
  }
}

function supportApproach(action: ActionLabel): string {
  switch (action) {
    case "Underinvested Asset Base":
      return "Growth-aligned support";
    case "Weak Financial Foundation":
      return "Bridge or reserve support";
    case "Revenue Concentration Risk":
      return "Diversification-linked support";
    case "Needs Data Diligence":
      return "Diligence-first support";
  }
}

function supportApproachDetail(action: ActionLabel): string {
  switch (action) {
    case "Underinvested Asset Base":
      return "Best when the case already looks healthy and support can accelerate execution rather than repair weakness.";
    case "Weak Financial Foundation":
      return "Best when the core model is viable but the organization still needs tighter guardrails or short-term breathing room.";
    case "Revenue Concentration Risk":
      return "Best when the organization is workable but the funding base is still too narrow for comfort.";
    case "Needs Data Diligence":
      return "Best when the case may be supportable, but the evidence still needs one more diligence pass before capital is committed.";
  }
}

function recommendationSummary(organization: OrganizationRecord): string {
  const risk = organization.distress.probability;
  const baseline = organization.distress.baseline;
  const margin = organization.operatingMargin;
  const mix = organization.revenueDiversificationIndex;

  switch (organization.actionLabel) {
    case "Underinvested Asset Base":
      return `The operating profile looks strong, projected risk sits ${formatRisk(risk)}, and the funding base reads ${mixRead(mix)}. This is the clearest case for moving forward.`;
    case "Weak Financial Foundation":
      return `The case is workable, but it is not yet a clean green light. Projected risk sits ${formatRisk(risk)} versus a ${baseline.toFixed(1)}% portfolio baseline, so support should come with clear guardrails.`;
    case "Revenue Concentration Risk":
      return `The core model looks supportable, but the funding base still reads ${mixRead(mix)}. This should be backed only if the support is tied to broadening revenue sources.`;
    case "Needs Data Diligence":
      return `The current evidence is not strong enough for a clean capital recommendation. With operating margin at ${formatSignedPercent(margin)} and projected risk at ${formatRisk(risk)}, this still needs diligence before a call is made.`;
  }
}

function supportPoints(organization: OrganizationRecord): string[] {
  const points = [
    `${historyLine(organization)}, so this read is grounded in a sustained filing pattern rather than a single-year spike.`,
  ];

  if (organization.operatingMargin >= 8) {
    points.push(`Operating margin is ${formatSignedPercent(organization.operatingMargin)}, which suggests the core model is generating real surplus.`);
  } else if (organization.operatingMargin >= 0) {
    points.push(`Operating margin is ${formatSignedPercent(organization.operatingMargin)}, which keeps the case above break-even but leaves less room for error.`);
  } else {
    points.push(`Operating margin is ${formatSignedPercent(organization.operatingMargin)}, which means the core model is still running below break-even.`);
  }

  if (organization.distress.probability <= organization.distress.baseline) {
    points.push(`Projected next-year risk sits at ${formatRisk(organization.distress.probability)}, below the ${organization.distress.baseline.toFixed(1)}% portfolio baseline.`);
  } else {
    points.push(`Projected next-year risk sits at ${formatRisk(organization.distress.probability)}, above the ${organization.distress.baseline.toFixed(1)}% portfolio baseline and worth treating carefully.`);
  }

  return points;
}

function strengthenPoints(organization: OrganizationRecord): string[] {
  const points: string[] = [];

  if (organization.revenueDiversificationIndex < 0.45) {
    points.push("A broader revenue base would make the case easier to defend and reduce dependence on a narrow set of streams.");
  }

  if (organization.operatingMargin < 10) {
    points.push("A steadier operating surplus would improve confidence that this performance can hold through a weaker year.");
  }

  if (organization.distress.probability > organization.distress.baseline) {
    points.push("A lower projected next-year risk, closer to portfolio baseline, would materially improve the case.");
  }

  if (points.length === 0) {
    points.push("The strongest improvement now is simply preserving the current operating discipline rather than chasing a rescue-style intervention.");
  }

  return points.slice(0, 3);
}

function changePoints(organization: OrganizationRecord): string[] {
  switch (organization.actionLabel) {
    case "Underinvested Asset Base":
      return [
        "If projected risk rises materially from here, this should move out of an amplify stance.",
        "If operating margin compresses back toward break-even, the case becomes less about growth and more about protection.",
      ];
    case "Weak Financial Foundation":
      return [
        "If operating performance weakens further, this should shift from guardrailed support to pause-and-review.",
        "If projected risk drops and margin holds, the case can graduate into a cleaner support call.",
      ];
    case "Revenue Concentration Risk":
      return [
        "If the revenue base stays narrow, support should remain conditional rather than open-ended.",
        "If revenue mix broadens meaningfully, the case becomes much easier to back from strength.",
      ];
    case "Needs Data Diligence":
      return [
        "If fresh diligence confirms durable operating performance, this can move into a support case.",
        "If additional diligence reveals weaker fundamentals than filings suggest, the case should be paused rather than funded.",
      ];
  }
}

export function buildDecisionFrame(organization: OrganizationRecord) {
  return {
    eyebrow: historyLine(organization),
    headline: callHeadline(organization.actionLabel),
    summary: recommendationSummary(organization),
    supportPoints: supportPoints(organization),
    strengthenPoints: strengthenPoints(organization),
    changePoints: changePoints(organization),
    supportApproach: supportApproach(organization.actionLabel),
    supportApproachDetail: supportApproachDetail(organization.actionLabel),
  };
}
