import { ArrowUpRight } from "@phosphor-icons/react";

import { SoftActionButton } from "./SoftActionButton";
import { getInboxCopy, getYieldOpportunityEstimate } from "../lib/advisorLanguage";
import { compactCurrency } from "../lib/decisionLabText";
import type { OrganizationRecord } from "../types";

type CardMode = "uab" | "rcr" | "wff" | "ndd";
type MetricTone = "neutral" | "green" | "yellow" | "red";

function getCardMode(actionLabel: OrganizationRecord["actionLabel"]): CardMode {
  switch (actionLabel) {
    case "Underinvested Asset Base":
      return "uab";
    case "Revenue Concentration Risk":
      return "rcr";
    case "Weak Financial Foundation":
      return "wff";
    case "Needs Data Diligence":
      return "ndd";
  }
}

function northstarTone(score: number): MetricTone {
  if (score >= 75) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

export function OrganizationCard({
  isSelected,
  layoutMode,
  onSelect,
  organization,
  showBucketBadge = false,
}: {
  isSelected: boolean;
  layoutMode: "gallery" | "rail";
  onSelect: (organization: OrganizationRecord) => void;
  organization: OrganizationRecord;
  showBucketBadge?: boolean;
}) {
  const mode = getCardMode(organization.actionLabel);
  const inboxCopy = getInboxCopy(organization);
  const isNdd = mode === "ndd";

  return (
    <article
      className={`rounded-[2.15rem] border p-1.5 transition-shadow duration-200 ${
        isNdd
          ? "border-black/5 bg-[rgba(248,246,241,0.7)] opacity-85 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.12)]"
          : "border-black/6 bg-[rgba(255,252,246,0.88)] shadow-[0_24px_50px_-40px_rgba(15,23,42,0.18)] hover:shadow-[0_28px_60px_-36px_rgba(15,23,42,0.22)]"
      } ${isSelected ? "shadow-[0_28px_60px_-36px_rgba(48,72,62,0.24)]" : ""}`}
    >
      <div
        className={`rounded-[calc(2.15rem-0.4rem)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] ${
          isNdd
            ? "bg-[linear-gradient(180deg,rgba(250,248,243,0.88),rgba(244,241,234,0.84))]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.92))]"
        } ${isSelected ? "ring-1 ring-[#30483e]/12" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                {organization.state}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                FY{organization.fiscalYear}
              </span>
              {showBucketBadge ? <BucketBadge mode={mode} /> : null}
            </div>
            <h3
              className={`mt-2 text-slate-950 ${
                layoutMode === "gallery" ? "text-[1.58rem]" : "text-[1.42rem]"
              } font-semibold leading-[1.06] tracking-[-0.04em]`}
            >
              {inboxCopy.displayName}
            </h3>
          </div>

          <div className="flex shrink-0 items-center pt-0.5">
            <SoftActionButton
              aria-label={isNdd ? `Review ${organization.orgName}` : `Open case for ${organization.orgName}`}
              className="cursor-pointer whitespace-nowrap"
              motionMode="still"
              onClick={() => onSelect(organization)}
            >
              {isNdd ? "Review" : "Open case"}
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/16 text-current">
                <ArrowUpRight size={14} weight="bold" />
              </span>
            </SoftActionButton>
          </div>
        </div>

        <div className="mt-4">
          {mode === "uab" ? <UabMetrics organization={organization} inboxCopy={inboxCopy} /> : null}
          {mode === "rcr" ? <RcrMetrics organization={organization} inboxCopy={inboxCopy} /> : null}
          {mode === "wff" ? <WffMetrics organization={organization} inboxCopy={inboxCopy} /> : null}
          {mode === "ndd" ? <NddMetrics organization={organization} inboxCopy={inboxCopy} /> : null}
        </div>

        <div className="mt-3 rounded-[1.7rem] border border-black/6 bg-white/82 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-700">
            {isNdd ? "Diligence note" : "Advisory note"}
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-slate-900">{inboxCopy.whyNow}</p>
        </div>
      </div>
    </article>
  );
}

function BucketBadge({ mode }: { mode: CardMode }) {
  const configs: Record<CardMode, { label: string; classes: string }> = {
    uab: {
      label: "Portfolio Growth",
      classes: "border-emerald-900/10 bg-[rgba(231,243,237,0.9)] text-[#2a6644]",
    },
    rcr: {
      label: "Strategic Advisory",
      classes: "border-blue-900/8 bg-[rgba(224,234,248,0.9)] text-[#2c4a80]",
    },
    wff: {
      label: "Financial Infrastructure",
      classes: "border-amber-900/10 bg-[rgba(247,239,221,0.9)] text-[#7a5920]",
    },
    ndd: {
      label: "Needs Diligence",
      classes: "border-slate-200/70 bg-[rgba(240,238,233,0.9)] text-slate-500",
    },
  };
  const config = configs[mode];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function MetricBox({
  description,
  label,
  subtext,
  tone = "neutral",
  value,
}: {
  description?: string;
  label: string;
  subtext?: string;
  tone?: MetricTone;
  value: string;
}) {
  const toneClasses: Record<MetricTone, { wrapper: string; label: string; value: string }> = {
    neutral: {
      wrapper: "border-black/6 bg-white/84",
      label: "text-slate-900",
      value: "text-slate-950",
    },
    green: {
      wrapper: "border-emerald-900/10 bg-[rgba(231,243,237,0.96)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
      label: "text-[#0f2e22]",
      value: "text-[#1f392f]",
    },
    yellow: {
      wrapper: "border-amber-900/10 bg-[rgba(247,239,221,0.96)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
      label: "text-[#3d2800]",
      value: "text-[#5e4718]",
    },
    red: {
      wrapper: "border-rose-900/10 bg-[rgba(245,232,229,0.96)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
      label: "text-[#4a1a17]",
      value: "text-[#6a3732]",
    },
  };
  const toneClass = toneClasses[tone];

  return (
    <div
      className={`flex h-[5.5rem] flex-col items-center justify-center rounded-[1.55rem] border px-3 py-3 text-center ${toneClass.wrapper}`}
      aria-label={description ? `${label}: ${value}. ${description}` : undefined}
      tabIndex={description ? 0 : undefined}
    >
      <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${toneClass.label}`}>{label}</p>
      <p className={`mt-1.5 text-[1.3rem] font-bold leading-tight tracking-[-0.03em] ${toneClass.value}`}>
        {value}
      </p>
      {subtext ? <p className={`text-[11px] font-medium ${toneClass.label}`}>{subtext}</p> : null}
    </div>
  );
}

function HeroMetricBox({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex h-[5.5rem] flex-col justify-center rounded-[1.55rem] border border-black/6 bg-white/92 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">{label}</p>
      <p className="mt-1 text-[1.4rem] font-bold leading-none tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-1 text-[12px] text-slate-700">{caption}</p>
    </div>
  );
}

function SweetSpotHeroBox({ organization }: { organization: OrganizationRecord }) {
  const assets = organization.netAssetsEoy;
  const inSweetSpot = assets !== null && assets >= 1_000_000 && assets <= 20_000_000;
  const lowReserves = organization.operatingRunwayMonths < 6 ? 1 : 0;
  const marginRepair = organization.operatingMargin < 0 ? 1 : 0;
  const gapScore = (inSweetSpot ? 1 : 0) + lowReserves + marginRepair;
  const gapLabel = gapScore >= 2 ? "High" : gapScore === 1 ? "Moderate" : "Low";

  return (
    <div
      className={`flex h-[5.5rem] flex-col justify-center rounded-[1.55rem] border px-4 py-3 ${
        inSweetSpot
          ? "border-emerald-900/10 bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
          : "border-amber-900/10 bg-[rgba(247,239,221,0.96)]"
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${inSweetSpot ? "text-[#0f2e22]" : "text-[#3d2800]"}`}>
        Sweet Spot
      </p>
      <p className={`mt-1 text-[1.1rem] font-bold leading-tight tracking-[-0.03em] ${inSweetSpot ? "text-[#1f392f]" : "text-[#5e4718]"}`}>
        {inSweetSpot ? "In range ($1M–$20M)" : "Outside range"}
      </p>
      <p className={`mt-0.5 text-[12px] font-medium ${inSweetSpot ? "text-[#355548]" : "text-[#7a5920]"}`}>
        Infra gap: {gapLabel}
      </p>
    </div>
  );
}

function NddHeroBox({ organization }: { organization: OrganizationRecord }) {
  const score = organization.dataCompletenessScore;
  const maxScore = 5;
  const filled = Math.min(maxScore, Math.round(score));
  const missing = maxScore - filled;
  const label = missing === 0 ? "Data complete" : missing === 1 ? "1 field missing" : `${missing} fields missing`;

  return (
    <div className="flex h-[5.5rem] flex-col justify-center rounded-[1.55rem] border border-black/6 bg-[rgba(240,238,234,0.92)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Data Gaps</p>
      <div className="mt-1.5 flex items-center gap-1">
        {Array.from({ length: maxScore }).map((_, index) => (
          <div
            key={index}
            className={`h-2 flex-1 rounded-full ${index < filled ? "bg-[#30483e]/60" : "bg-slate-300/70"}`}
          />
        ))}
      </div>
      <p className="mt-1 text-[12px] font-medium text-slate-700">{label}</p>
    </div>
  );
}

function UabMetrics({
  organization,
  inboxCopy,
}: {
  organization: OrganizationRecord;
  inboxCopy: ReturnType<typeof getInboxCopy>;
}) {
  const yieldPct = organization.investmentYield;
  const netAssets = organization.netAssetsEoy;
  const yieldOpportunity = getYieldOpportunityEstimate(organization);
  const yieldTone: MetricTone = yieldPct < 2 ? "red" : yieldPct < 4 ? "yellow" : "green";
  const track = organization.consecutiveYearsWithInvestmentIncome;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      <MetricBox label="Net Assets" value={netAssets !== null ? compactCurrency(netAssets) : "—"} />
      <MetricBox
        label="Total Revenue"
        value={organization.revenueAmount !== null ? compactCurrency(organization.revenueAmount) : "—"}
      />
      <MetricBox label="Current Yield" value={`${yieldPct.toFixed(1)}%`} tone={yieldTone} subtext="annual" />
      <MetricBox
        label="Investment Track"
        value={track === 0 ? "No history" : `${track} yr${track !== 1 ? "s" : ""}`}
        subtext={track > 0 ? "consecutive" : undefined}
      />
      <HeroMetricBox
        label={yieldOpportunity.isUpperBound ? "Upper-Bound Yield Opportunity" : "Estimated Yield Opportunity"}
        value={
          yieldOpportunity.annualAmount === null
            ? "—"
            : yieldOpportunity.annualAmount > 0
              ? compactCurrency(yieldOpportunity.annualAmount)
              : "At benchmark"
        }
        caption={
          yieldOpportunity.basis === "liquid-reserves"
            ? "liquid-reserve proxy vs 5%"
            : yieldOpportunity.basis === "net-assets"
              ? "net assets basis; verify liquidity"
              : "basis unavailable"
        }
      />
      <MetricBox
        label="Northstar Score"
        value={`${inboxCopy.northstarScore}`}
        tone={northstarTone(inboxCopy.northstarScore)}
        subtext="priority"
        description="Composite outreach-priority score built from next-year risk, diversification need, operating margin, evidence quality, and recommendation lane. Higher means stronger reason to call first."
      />
    </div>
  );
}

function RcrMetrics({
  organization,
  inboxCopy,
}: {
  organization: OrganizationRecord;
  inboxCopy: ReturnType<typeof getInboxCopy>;
}) {
  const netAssets = organization.netAssetsEoy;
  const { pct: largestPct, name: largestName } = getLargestRevenueCategory(organization);
  const margin = organization.operatingMargin;
  const largestTone: MetricTone = largestPct > 70 ? "red" : largestPct > 50 ? "yellow" : "neutral";
  const marginTone: MetricTone =
    margin >= 0 && margin <= 5 ? "green" : margin >= -10 && margin < 0 ? "yellow" : margin < -10 ? "red" : "neutral";

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      <MetricBox label="Net Assets" value={netAssets !== null ? compactCurrency(netAssets) : "—"} />
      <MetricBox
        label="Total Revenue"
        value={organization.revenueAmount !== null ? compactCurrency(organization.revenueAmount) : "—"}
      />
      <MetricBox
        label="Largest Revenue Category"
        value={`${largestPct.toFixed(0)}%`}
        tone={largestTone}
        subtext={largestName}
        description="Share of revenue in the largest reported Form 990 category. This is an aggregate category, not an individual source."
      />
      <MetricBox
        label="Operating Margin"
        value={`${margin >= 0 ? "+" : ""}${margin.toFixed(1)}%`}
        tone={marginTone}
        description="Operating margin = (revenue - expenses) / revenue. Positive means revenue is covering expenses."
      />
      <RevenueCagrHero organization={organization} />
      <MetricBox
        label="Northstar Score"
        value={`${inboxCopy.northstarScore}`}
        tone={northstarTone(inboxCopy.northstarScore)}
        subtext="priority"
        description="Composite outreach-priority score built from next-year risk, diversification need, operating margin, evidence quality, and recommendation lane. Higher means stronger reason to call first."
      />
    </div>
  );
}

function WffMetrics({
  organization,
  inboxCopy,
}: {
  organization: OrganizationRecord;
  inboxCopy: ReturnType<typeof getInboxCopy>;
}) {
  const netAssets = organization.netAssetsEoy;
  const runway = organization.operatingRunwayMonths;
  const margin = organization.operatingMargin;
  const runwayTone: MetricTone = runway > 120 ? "neutral" : runway < 3 ? "red" : runway < 6 ? "yellow" : "neutral";
  const marginTone: MetricTone =
    margin >= 0 && margin <= 5 ? "green" : margin >= -10 && margin < 0 ? "yellow" : margin < -10 ? "red" : "neutral";

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      <MetricBox label="Net Assets" value={netAssets !== null ? compactCurrency(netAssets) : "—"} />
      <MetricBox
        label="Revenue"
        value={inboxCopy.revenueLabel}
        description="Most recent yearly revenue reported in the filing."
      />
      <MetricBox label="Risk next year" value={inboxCopy.riskLine} tone={runwayTone} subtext="stress odds" />
      <MetricBox
        label="Operating Margin"
        value={`${margin >= 0 ? "+" : ""}${margin.toFixed(1)}%`}
        tone={marginTone}
        description="Operating margin = (revenue - expenses) / revenue. Positive means revenue is covering expenses."
      />
      <SweetSpotHeroBox organization={organization} />
      <MetricBox
        label="Northstar Score"
        value={`${inboxCopy.northstarScore}`}
        tone={northstarTone(inboxCopy.northstarScore)}
        subtext="priority"
        description="Composite outreach-priority score built from next-year risk, diversification need, operating margin, evidence quality, and recommendation lane. Higher means stronger reason to call first."
      />
    </div>
  );
}

function NddMetrics({
  organization,
  inboxCopy,
}: {
  organization: OrganizationRecord;
  inboxCopy: ReturnType<typeof getInboxCopy>;
}) {
  const score = organization.dataCompletenessScore;
  const scoreTone: MetricTone = score >= 4 ? "neutral" : score >= 2.5 ? "yellow" : "red";

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricBox label="Data Completeness" value={`${score.toFixed(1)} / 5`} tone={scoreTone} subtext="fields complete" />
      <MetricBox
        label="Latest Filing"
        value={`FY${organization.latestFilingYear}`}
        subtext={`${organization.filingYearsObserved} yr${organization.filingYearsObserved !== 1 ? "s" : ""} observed`}
      />
      <NddHeroBox organization={organization} />
      <MetricBox
        label="Northstar Score"
        value={`${inboxCopy.northstarScore}`}
        tone={northstarTone(inboxCopy.northstarScore)}
        subtext="priority"
        description="Composite outreach-priority score built from next-year risk, diversification need, operating margin, evidence quality, and recommendation lane. Higher means stronger reason to call first."
      />
    </div>
  );
}

function RevenueCagrHero({ organization }: { organization: OrganizationRecord }) {
  const history = organization.historicalFinancials;
  const sorted = [...history].sort((left, right) => left.fiscalYear - right.fiscalYear);
  const first = sorted.find((point) => point.revenue > 0);
  const last = [...sorted].reverse().find((point) => point.revenue > 0);

  if (!first || !last || first === last) {
    return <HeroMetricBox label="Revenue Trend" value="—" caption="insufficient history" />;
  }

  const years = last.fiscalYear - first.fiscalYear;
  const cagr = (Math.pow(last.revenue / first.revenue, 1 / years) - 1) * 100;
  const sign = cagr >= 0 ? "+" : "";

  return (
    <HeroMetricBox
      label={`Rev. CAGR · ${years} yr${years !== 1 ? "s" : ""}`}
      value={`${sign}${cagr.toFixed(1)}%`}
      caption={`FY${first.fiscalYear} → FY${last.fiscalYear}`}
    />
  );
}

function getLargestRevenueCategory(organization: OrganizationRecord): { pct: number; name: string } {
  const latest = organization.revenueCompositionHistory.at(-1);
  if (!latest) return { pct: 0, name: "unknown" };

  const categories = [
    { pct: latest.contributionsPct, name: "Contributions" },
    { pct: latest.programPct, name: "Program Revenue" },
    { pct: latest.investmentPct, name: "Investment Income" },
    { pct: latest.otherPct, name: "Other" },
  ];

  return categories.reduce(
    (maximum, category) => (category.pct > maximum.pct ? category : maximum),
    categories[0],
  );
}
