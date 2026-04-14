import {
  ArrowArcLeft,
  ArrowLineUpRight,
  CaretDown,
  CaretUp,
  CheckCircle,
  Copy,
  SealCheck,
  TrendDown,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useState, type ReactNode } from "react";

import { SoftActionButton } from "./SoftActionButton";
import {
  formatAnalogValue,
  formatOrganizationName,
  getDecisionLabCopy,
  getFundingDecisionCopy,
} from "../lib/advisorLanguage";
import type { OrganizationRecord } from "../types";

// ─── Animation variants ──────────────────────────────────────────────────────
const stagger: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clampVal(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function riskSeverity(p: number): "rose" | "amber" | "emerald" {
  return p >= 55 ? "rose" : p >= 30 ? "amber" : "emerald";
}

function runwaySeverity(m: number | null): "rose" | "amber" | "emerald" | "slate" {
  if (m === null) return "slate";
  return m < 3 ? "rose" : m < 7 ? "amber" : "emerald";
}

function concSeverity(p: number): "rose" | "amber" | "emerald" | "slate" {
  if (p <= 0) return "slate";
  return p >= 70 ? "rose" : p >= 50 ? "amber" : "emerald";
}

function riskLine(probability: number, baseline: number): string {
  const lift = baseline > 0 ? (probability / baseline) : 1;
  if (probability >= 60)
    return `${lift.toFixed(1)}× more likely to face financial trouble than the average organization we fund. This is a high-risk file.`;
  if (probability >= 40)
    return `${lift.toFixed(1)}× more likely than average to face distress next year — worth watching closely before committing.`;
  if (probability >= 20)
    return `Slightly above average risk. The model sees some concerns but nothing structurally alarming.`;
  return `Below-average risk. This organization looks relatively stable compared to the rest of our portfolio.`;
}

function runwayLine(months: number | null, severity: string): string {
  if (months === null)
    return severity !== "Unavailable"
      ? `Stress severity is rated ${severity.toLowerCase()} — we don't have a precise month estimate for this case.`
      : "We don't have enough revenue data to run this stress simulation.";
  if (months < 3)
    return `Critical. A single major funding cut could push this organization into crisis within weeks, not months.`;
  if (months < 6)
    return `Tight. A large funding disruption would create serious cash pressure before they could adapt.`;
  if (months < 12)
    return `Some buffer — but a major funding loss would still be a serious problem before the year is out.`;
  return `Good resilience. They have meaningful time to adjust if a major funder reduces support.`;
}

function concLine(pct: number, source: string): string {
  if (pct <= 0)
    return "We don't have a detailed revenue breakdown for this organization.";
  if (pct >= 80)
    return `One source controls nearly everything. If ${source || "this funder"} pulls out, this organization cannot survive without emergency support.`;
  if (pct >= 60)
    return `One funder largely determines their fate. A single decision by that entity reshapes their entire financial picture.`;
  if (pct >= 40)
    return `One source is dominant, but there is some fallback if it shrinks. Concentration is still worth addressing.`;
  return `Reasonably spread across multiple sources. No single funder completely controls their finances.`;
}

type Tone = "rose" | "amber" | "emerald" | "slate" | "blue";

const toneStyles: Record<Tone, {
  bg: string; border: string; value: string;
  badge: string; badgeText: string; bar: string; accentBar: string;
}> = {
  emerald: {
    bg: "bg-[linear-gradient(160deg,rgba(5,150,105,0.06),rgba(16,185,129,0.03))]",
    border: "border-emerald-200/60",
    value: "text-emerald-800",
    badge: "bg-emerald-100",
    badgeText: "text-emerald-700",
    bar: "bg-emerald-500",
    accentBar: "bg-emerald-500",
  },
  amber: {
    bg: "bg-[linear-gradient(160deg,rgba(217,119,6,0.07),rgba(245,158,11,0.03))]",
    border: "border-amber-200/60",
    value: "text-amber-800",
    badge: "bg-amber-100",
    badgeText: "text-amber-700",
    bar: "bg-amber-500",
    accentBar: "bg-amber-500",
  },
  rose: {
    bg: "bg-[linear-gradient(160deg,rgba(225,29,72,0.07),rgba(251,113,133,0.03))]",
    border: "border-rose-200/60",
    value: "text-rose-800",
    badge: "bg-rose-100",
    badgeText: "text-rose-700",
    bar: "bg-rose-500",
    accentBar: "bg-rose-500",
  },
  blue: {
    bg: "bg-[linear-gradient(160deg,rgba(59,130,246,0.07),rgba(147,197,253,0.03))]",
    border: "border-blue-200/60",
    value: "text-blue-800",
    badge: "bg-blue-100",
    badgeText: "text-blue-700",
    bar: "bg-blue-500",
    accentBar: "bg-blue-500",
  },
  slate: {
    bg: "bg-white/80",
    border: "border-black/6",
    value: "text-slate-700",
    badge: "bg-slate-100",
    badgeText: "text-slate-600",
    bar: "bg-slate-400",
    accentBar: "bg-slate-400",
  },
};

function verdictFor(actionLabel: OrganizationRecord["actionLabel"]): {
  headline: string; tone: Tone; badge: string; supportTag: string; nextStep: string;
} {
  switch (actionLabel) {
    case "Amplify":
      return { headline: "Fund this organization.", tone: "emerald", badge: "Strong case", supportTag: "Move forward", nextStep: "Approve the funding commitment. Consider whether the grant size reflects their relative strength." };
    case "Stabilize":
      return { headline: "Fund — with conditions.", tone: "amber", badge: "Conditional", supportTag: "Fund with guardrails", nextStep: "Approve with quarterly reporting required and a minimum runway target as a 12-month milestone." };
    case "Diversify":
      return { headline: "Fund — but require a plan.", tone: "amber", badge: "Needs a plan", supportTag: "Fund with requirements", nextStep: "Approve conditional on a written revenue diversification plan within 60 days." };
    case "Deep Review":
      return { headline: "Don't commit yet.", tone: "rose", badge: "Hold for now", supportTag: "Hold for diligence", nextStep: "Request audited financials and a revenue source breakdown before any capital is committed." };
  }
}

function nextStepsFor(actionLabel: OrganizationRecord["actionLabel"]): string[] {
  switch (actionLabel) {
    case "Deep Review": return [
      "Request audited financial statements for the last 3 years.",
      "Ask for a written breakdown of their top 3 revenue sources and whether each is renewable.",
      "Schedule a 30-minute call with their finance director or CFO.",
      "Do not commit any capital until these steps are complete.",
    ];
    case "Stabilize": return [
      "Approve funding with quarterly financial reporting as a required condition.",
      "Set a minimum operating runway target (6+ months) as a 12-month milestone.",
      "Ask for a contingency plan in case their largest funder reduces support.",
      "Consider milestone-based disbursement tied to hitting the runway target.",
    ];
    case "Diversify": return [
      "Approve funding conditional on a revenue diversification plan submitted within 60 days.",
      "Require that no single revenue source exceeds 60% of total revenue within 18 months.",
      "Set a 6-month check-in to review progress on broadening their funding base.",
      "Consider offering technical assistance to help them identify new funders.",
    ];
    case "Amplify": return [
      "Approve the funding commitment — the financial data supports it.",
      "Review whether the grant size reflects their relative strength compared to peers.",
      "This organization may be a strong candidate for multi-year funding given their stability.",
    ];
  }
}

function plainEnglishMeaning(actionLabel: OrganizationRecord["actionLabel"]): string {
  switch (actionLabel) {
    case "Deep Review":
      return "This organization's financials raise enough questions that we can't responsibly recommend funding right now. That doesn't mean they can't be funded — it means we need more information first.";
    case "Stabilize":
      return "This organization can be funded, but there are structural gaps that create risk. The right move is to fund with clear conditions that protect the investment and give them a path to stronger footing.";
    case "Diversify":
      return "The fundamentals are acceptable, but nearly all of their revenue comes from one place. That's a fragile position. A funding commitment should come with a clear expectation to change it.";
    case "Amplify":
      return "This organization is performing well relative to peers. The risk is below average, the financial position is relatively healthy, and the data supports moving forward.";
  }
}

// ─── Verdict Banner ───────────────────────────────────────────────────────────
function VerdictBanner({ organization }: { organization: OrganizationRecord }) {
  const verdict = verdictFor(organization.actionLabel);
  const decisionCopy = getFundingDecisionCopy(organization);
  const t = toneStyles[verdict.tone];

  return (
    <div className={`rounded-[2.2rem] border p-6 ${t.bg} ${t.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className={`h-1 w-10 rounded-full ${t.accentBar}`} />
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
              Fairlight recommendation
            </p>
          </div>
          <h2 className={`text-4xl font-semibold tracking-[-0.05em] md:text-5xl ${t.value}`}>
            {verdict.headline}
          </h2>
          <p className="max-w-2xl text-[15px] leading-[1.65] text-slate-600">
            {decisionCopy.rationale}
          </p>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${t.badge}`}>
            <div className={`h-1.5 w-1.5 rounded-full ${t.accentBar}`} />
            <p className={`text-[12px] font-medium ${t.badgeText}`}>{verdict.nextStep}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 shrink-0">
          <span className={`self-end rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] ${t.badge} ${t.badgeText}`}>
            {verdict.badge}
          </span>
          <div className="rounded-[1.6rem] border border-black/6 bg-white/70 p-4 min-w-[200px]">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400">Support type</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{decisionCopy.supportType}</p>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400">Confidence</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{organization.confidenceTier}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{organization.confidenceNote}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Key Signals ─────────────────────────────────────────────────────────────
function KeySignals({ organization }: { organization: OrganizationRecord }) {
  const { distress, stress } = organization;
  const riskTone = riskSeverity(distress.probability);
  const runTone = runwaySeverity(stress.burnMonths25);
  const concTone = concSeverity(stress.largestSourcePct);

  const hasRunway = stress.burnMonths25 !== null || stress.severity25 !== "Unavailable";
  const hasConc = stress.largestSourcePct > 0;

  return (
    <div className={`grid gap-4 ${hasRunway && hasConc ? "md:grid-cols-3" : hasRunway || hasConc ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
      {/* Signal 1: distress probability — always shown */}
      <SignalCard
        label="Chance of financial trouble"
        sublabel="Next year, based on 5 years of financial filings"
        value={`${distress.probability.toFixed(1)}%`}
        tone={riskTone}
        body={riskLine(distress.probability, distress.baseline)}
        viz={
          <ProgressBar
            fillPct={distress.probability}
            tone={riskTone}
            markerPct={distress.baseline}
            markerLabel={`Portfolio avg: ${distress.baseline.toFixed(1)}%`}
          />
        }
      />

      {/* Signal 2: shock runway — only when data exists */}
      {hasRunway && (
        <SignalCard
          label="Months before a cash crisis"
          sublabel="If their largest funder cuts support by 25%"
          value={
            stress.burnMonths25 !== null
              ? `${stress.burnMonths25.toFixed(1)} mo`
              : stress.severity25
          }
          tone={runTone}
          body={runwayLine(stress.burnMonths25, stress.severity25)}
          viz={
            stress.burnMonths25 !== null ? (
              <ProgressBar
                fillPct={(stress.burnMonths25 / 24) * 100}
                tone={runTone}
                markerPct={(3 / 24) * 100}
                markerLabel="3 months = crisis"
                markerTone="rose"
              />
            ) : null
          }
        />
      )}

      {/* Signal 3: revenue concentration — only when data exists */}
      {hasConc && (
        <SignalCard
          label="Revenue from one source"
          sublabel={stress.largestSource || "Largest single funding source"}
          value={`${stress.largestSourcePct.toFixed(0)}%`}
          tone={concTone}
          body={concLine(stress.largestSourcePct, stress.largestSource)}
          viz={<ConcentrationStack pct={stress.largestSourcePct} tone={concTone} />}
        />
      )}
    </div>
  );
}

function SignalCard({
  label, sublabel, value, tone, body, viz,
}: {
  label: string; sublabel: string; value: string; tone: Tone; body: string; viz?: ReactNode | null;
}) {
  const t = toneStyles[tone];
  return (
    <div className="rounded-[2rem] border border-black/6 bg-white/88 p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{sublabel}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className={`text-[2.6rem] font-bold leading-none tracking-[-0.04em] ${t.value}`}>
          {value}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.badge} ${t.badgeText}`}>
          {tone === "rose" ? "High" : tone === "amber" ? "Moderate" : tone === "emerald" ? "Low" : "—"}
        </span>
      </div>
      {viz && <div className="mt-4">{viz}</div>}
      <p className="mt-3 text-[12px] leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

function ProgressBar({
  fillPct, tone, markerPct, markerLabel, markerTone = "slate",
}: {
  fillPct: number; tone: Tone; markerPct?: number; markerLabel?: string; markerTone?: Tone;
}) {
  const t = toneStyles[tone];
  const mt = toneStyles[markerTone];
  const clampedFill = clampVal(fillPct, 0, 100);
  const clampedMarker = markerPct !== undefined ? clampVal(markerPct, 0, 100) : null;

  return (
    <div className="space-y-1.5">
      <div className="relative h-2 overflow-hidden rounded-full bg-black/8">
        <motion.div
          className={`absolute left-0 top-0 h-2 rounded-full ${t.bar}`}
          style={{ width: `${clampedFill}%`, transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ type: "spring", stiffness: 70, damping: 18 }}
        />
        {clampedMarker !== null && (
          <div
            className={`absolute inset-y-[-2px] z-10 w-0.5 rounded-full ${mt.bar}`}
            style={{ left: `${clampedMarker}%` }}
          />
        )}
      </div>
      {markerLabel && (
        <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-400">{markerLabel}</p>
      )}
    </div>
  );
}

function ConcentrationStack({ pct, tone }: { pct: number; tone: Tone }) {
  const t = toneStyles[tone];
  const fill = clampVal(pct, 0, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-black/8">
        <motion.div
          className={`h-full ${t.bar} shrink-0`}
          style={{ width: `${fill}%`, transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ type: "spring", stiffness: 70, damping: 18 }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-medium uppercase tracking-[0.16em] text-slate-400">
        <span>One source ({fill}%)</span>
        <span>All others ({(100 - fill).toFixed(0)}%)</span>
      </div>
    </div>
  );
}

// ─── Risk Gauge ───────────────────────────────────────────────────────────────
function RiskGauge({
  probability, baseline, tier,
}: {
  probability: number; baseline: number; tier: string;
}) {
  const r = 72;
  const cx = 100;
  const cy = 96;
  const angle = Math.PI + (probability / 100) * Math.PI;
  const baseAngle = Math.PI + (baseline / 100) * Math.PI;
  const ex = cx + r * Math.cos(angle);
  const ey = cy + r * Math.sin(angle);
  const bx = cx + r * Math.cos(baseAngle);
  const by = cy + r * Math.sin(baseAngle);
  const largeArc = probability > 50 ? 1 : 0;
  const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const progressPath =
    probability > 0
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
      : "";
  const arcColor =
    tier === "High" ? "#e11d48" : tier === "Medium" ? "#d97706" : "#059669";
  const tierLabel =
    tier === "High" ? "High risk" : tier === "Medium" ? "Moderate risk" : "Lower risk";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-full max-w-[240px]" aria-hidden="true">
        {/* Track shadow */}
        <path d={trackPath} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="14" strokeLinecap="round" />
        {/* Track */}
        <path d={trackPath} fill="none" stroke="#e2e8f0" strokeWidth="11" strokeLinecap="round" />
        {/* Progress */}
        {probability > 0 && (
          <path d={progressPath} fill="none" stroke={arcColor} strokeWidth="11" strokeLinecap="round" />
        )}
        {/* Baseline marker */}
        <circle cx={bx.toFixed(2)} cy={by.toFixed(2)} r="5" fill="white" stroke={arcColor} strokeWidth="2" opacity="0.65" />
        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fontWeight="800" fill="#0f172a" fontFamily="system-ui,sans-serif">
          {probability.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="system-ui,sans-serif" letterSpacing="2">
          NEXT-YEAR RISK
        </text>
      </svg>
      <div className="mt-1 flex w-full max-w-[240px] items-center justify-between">
        <span className="text-[9px] font-medium text-slate-300">0%</span>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: arcColor }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: arcColor }}>
            {tierLabel}
          </span>
        </div>
        <span className="text-[9px] font-medium text-slate-300">100%</span>
      </div>
      <p className="mt-1 text-center text-[11px] leading-relaxed text-slate-400">
        The dot shows the portfolio average ({baseline.toFixed(1)}%)
      </p>
    </div>
  );
}

// ─── Trend Sparkline ─────────────────────────────────────────────────────────
function TrendSparkline({ trendDirection }: { trendDirection: string }) {
  const trend = trendDirection.toLowerCase();
  const isUp = trend.includes("improv") || trend.includes("grow") || trend.includes("increas");
  const isDown = trend.includes("declin") || trend.includes("worsen") || trend.includes("decreas");
  const bars = isUp
    ? [30, 42, 51, 65, 82]
    : isDown
    ? [82, 66, 54, 42, 30]
    : [54, 62, 57, 60, 56];
  const color = isUp ? "bg-emerald-500" : isDown ? "bg-rose-400" : "bg-slate-300";
  const labelColor = isUp ? "text-emerald-700" : isDown ? "text-rose-600" : "text-slate-500";
  const label = isUp ? "Improving over recent years" : isDown ? "Declining over recent years" : "Roughly stable";

  return (
    <div>
      <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
        Recent financial trend
      </p>
      <div className="flex h-10 items-end gap-[3px]">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className={`flex-1 rounded-t-[3px] ${color}`}
            style={{ height: `${h}%`, transformOrigin: "bottom" }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ type: "spring", stiffness: 90, damping: 18, delay: i * 0.07 }}
          />
        ))}
      </div>
      <p className={`mt-2 text-[12px] font-semibold ${labelColor}`}>{label}</p>
    </div>
  );
}

// ─── Peer Comparison Bars ─────────────────────────────────────────────────────
function divGapQualitative(gap: number): string {
  if (gap <= -0.3) return "Much more concentrated than peers";
  if (gap <= -0.1) return "More concentrated than peers";
  if (gap < 0.1) return "Similar to peers";
  if (gap < 0.3) return "More diversified than peers";
  return "Much more diversified than peers";
}

function PeerGaps({ benchmark }: { benchmark: OrganizationRecord["benchmark"] }) {
  const runwayGap = Number.parseFloat(benchmark.operatingRunwayGap);
  const divGap = Number.parseFloat(benchmark.diversificationGap);
  const marginGap = Number.parseFloat(benchmark.operatingMarginGap);

  type GapBar = { label: string; detail: string; value: number; scale: number; displayValue: string };
  const bars: GapBar[] = [];

  if (Number.isFinite(runwayGap) && Math.abs(runwayGap) <= 24) {
    bars.push({
      label: "How long they can cover expenses",
      detail: "Operating runway vs top-quarter peers",
      value: runwayGap,
      scale: 24,
      displayValue: `${runwayGap >= 0 ? "+" : ""}${runwayGap.toFixed(1)} mo`,
    });
  }
  if (Number.isFinite(divGap)) {
    bars.push({
      label: "How spread out their income is",
      detail: "Revenue diversification vs top-quarter peers",
      value: divGap,
      scale: 0.5,
      displayValue: divGapQualitative(divGap),
    });
  }
  if (Number.isFinite(marginGap) && Math.abs(marginGap) <= 2) {
    bars.push({
      label: "Whether they earn more than they spend",
      detail: "Operating margin vs top-quarter peers",
      value: marginGap,
      scale: 0.5,
      displayValue: `${marginGap >= 0 ? "+" : ""}${(marginGap * 100).toFixed(1)} pts`,
    });
  }

  if (!bars.length) return null;

  return (
    <div className="space-y-5">
      {bars.map((bar) => {
        const pct = clampVal(bar.value / bar.scale, -1, 1) * 50;
        const isPos = bar.value >= 0;
        const tone = isPos ? "emerald" : "rose";
        const t = toneStyles[tone];
        return (
          <div key={bar.label} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-slate-700">{bar.label}</p>
                <p className="text-[10px] text-slate-400">{bar.detail}</p>
              </div>
              <span className={`shrink-0 max-w-[140px] text-right text-[12px] font-bold ${t.value}`}>
                {bar.displayValue}
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="absolute inset-y-0 left-1/2 z-10 w-px bg-slate-300" />
              <motion.div
                className={`absolute top-0 h-2.5 rounded-full ${t.bar}`}
                style={{
                  left: isPos ? "50%" : `calc(50% - ${Math.abs(pct)}%)`,
                  width: `${Math.abs(pct)}%`,
                  transformOrigin: isPos ? "left" : "right",
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ type: "spring", stiffness: 80, damping: 18 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shock Simulation ─────────────────────────────────────────────────────────
function ShockSimulation({ stress }: { stress: OrganizationRecord["stress"] }) {
  const items = [
    {
      label: "If largest funder cuts 25%",
      desc: "Mild shock scenario",
      value: stress.burnMonths25,
      severity: stress.severity25,
    },
    {
      label: "If largest funder cuts 50%",
      desc: "Severe shock scenario",
      value: stress.burnMonths50,
      severity: stress.severity50,
    },
  ];

  const maxVal = Math.max(...[stress.burnMonths25, stress.burnMonths50].filter((v): v is number => v !== null), 18);

  if (!items.some((i) => i.value !== null)) {
    return (
      <p className="rounded-[1.6rem] border border-dashed border-black/10 bg-white/60 p-4 text-[13px] leading-relaxed text-slate-500">
        Not enough revenue data to run stress simulations for this organization.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {items.map((item) => {
        const barColor =
          item.value === null ? "bg-slate-200"
          : item.value < 3 ? "bg-rose-500"
          : item.value < 7 ? "bg-amber-500"
          : "bg-emerald-500";

        const labelColor =
          item.value === null ? "text-slate-400"
          : item.value < 3 ? "text-rose-700"
          : item.value < 7 ? "text-amber-700"
          : "text-emerald-700";

        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[12px] font-medium text-slate-700">{item.label}</p>
                <p className="text-[10px] text-slate-400">{item.desc}</p>
              </div>
              <span className={`shrink-0 text-[14px] font-bold ${labelColor}`}>
                {item.value !== null ? `${item.value.toFixed(1)} mo` : item.severity}
              </span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full bg-slate-100">
              {/* 3-month threshold */}
              <div
                className="absolute inset-y-0 z-10 w-0.5 bg-rose-400/80"
                style={{ left: `${(3 / maxVal) * 100}%` }}
              />
              {item.value !== null && (
                <motion.div
                  className={`absolute left-0 top-0 h-4 rounded-full ${barColor}`}
                  style={{ width: `${(item.value / maxVal) * 100}%`, transformOrigin: "left" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ type: "spring", stiffness: 80, damping: 18 }}
                />
              )}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <div className="w-6 border-t-2 border-dashed border-rose-400/80" />
        <p className="text-[10px] text-rose-500">3-month mark — below this line, the situation becomes critical</p>
      </div>
    </div>
  );
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
function Watchlist({ pressurePoints }: { pressurePoints: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-relaxed text-slate-500">
        Specific issues the model flagged in this case that a funder should know about.
      </p>
      {pressurePoints.map((point, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-[1.4rem] border border-amber-200/60 bg-amber-50/70 px-4 py-3"
        >
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[13px] leading-relaxed text-slate-700">{point}</p>
        </div>
      ))}
    </div>
  );
}

// ─── What Helps Section ───────────────────────────────────────────────────────
function WhatHelps({
  supportSignals,
  scenarios,
}: {
  supportSignals: string[];
  scenarios: { title: string; effect: string; summary: string }[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-slate-500">
        The conditions that would materially improve the funding case.
      </p>
      <div className="space-y-2">
        {supportSignals.map((signal, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-[1.4rem] border border-emerald-200/60 bg-emerald-50/70 px-4 py-3"
          >
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <p className="text-[13px] leading-relaxed text-slate-700">{signal}</p>
          </div>
        ))}
      </div>
      {scenarios.map((s) => (
        <div key={s.title} className="rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.88)] p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">{s.title}</p>
          <p className="mt-1.5 text-[13px] font-semibold text-slate-800">{s.effect}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{s.summary}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Recovery Stories ─────────────────────────────────────────────────────────
function RecoveryStories({ analogs }: { analogs: OrganizationRecord["analogs"] }) {
  if (!analogs.length) return null;

  const maxVal = Math.max(...analogs.flatMap((a) => [Math.abs(a.preValue), Math.abs(a.postValue)]), 1);

  return (
    <Section eyebrow="Evidence it can be done" title="Organizations that were in a similar position">
      <p className="mb-5 text-[13px] leading-relaxed text-slate-500">
        Real nonprofits that were in a similar financial position and recovered. These are the closest matches we found in our dataset of 3.7 million filings.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {analogs.map((analog) => {
          const pre = (Math.abs(analog.preValue) / maxVal) * 100;
          const post = (Math.abs(analog.postValue) / maxVal) * 100;
          const improved = analog.postValue > analog.preValue;

          return (
            <div
              key={`${analog.orgName}-${analog.recoveryWindow}`}
              className="rounded-[1.8rem] border border-black/6 bg-white/86 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{analog.orgName}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    {analog.state} · {analog.metricName.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {improved
                    ? <TrendUp size={14} weight="bold" className="text-emerald-600" />
                    : <TrendDown size={14} weight="bold" className="text-rose-600" />}
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    {analog.recoveryWindow}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                    <span>Before</span>
                    <span className="font-semibold text-rose-600">{formatAnalogValue(analog.preValue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-2 rounded-full bg-rose-400"
                      style={{ width: `${pre}%`, transformOrigin: "left" }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ type: "spring", stiffness: 80, damping: 18 }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                    <span>After recovery</span>
                    <span className="font-semibold text-emerald-600">{formatAnalogValue(analog.postValue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${post}%`, transformOrigin: "left" }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ type: "spring", stiffness: 80, damping: 18 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Recommendation Details ───────────────────────────────────────────────────
function RecommendationDetails({ organization }: { organization: OrganizationRecord }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const decisionCopy = getFundingDecisionCopy(organization);

  const handleCopy = async () => {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(decisionCopy.oneLineExport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-[2.2rem] border border-black/6 bg-white/88 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5"
      >
        <div className="flex items-center gap-4">
          <div className="rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] p-3 text-[var(--northstar-accent)]">
            <SealCheck size={18} weight="duotone" />
          </div>
          <div className="text-left">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
              Full recommendation
            </p>
            <p className="mt-1 text-[1.3rem] font-semibold tracking-[-0.04em] text-slate-950">
              {decisionCopy.recommendationLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-400 sm:block">
            {open ? "Collapse" : "See full details"}
          </span>
          {open ? (
            <CaretUp size={16} weight="bold" className="text-slate-400" />
          ) : (
            <CaretDown size={16} weight="bold" className="text-slate-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className="overflow-hidden"
          >
            <div className="border-t border-black/6 px-6 pb-6 pt-5">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">

                {/* Left — what this means in plain English */}
                <div className="space-y-4">
                  <div className="rounded-[1.8rem] border border-black/6 bg-[rgba(246,241,232,0.92)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
                      What this means
                    </p>
                    <p className="mt-2.5 text-[14px] leading-relaxed text-slate-800">
                      {plainEnglishMeaning(organization.actionLabel)}
                    </p>
                  </div>

                  {/* Copy one-liner */}
                  <div className="rounded-[1.8rem] border border-black/6 bg-white/86 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
                        Copy summary for your records
                      </p>
                      <SoftActionButton variant="secondary" onClick={() => void handleCopy()}>
                        {copied ? (
                          <CheckCircle size={15} weight="bold" />
                        ) : (
                          <Copy size={15} weight="bold" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </SoftActionButton>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed text-slate-600 italic">
                      "{decisionCopy.oneLineExport}"
                    </p>
                  </div>
                </div>

                {/* Right — concrete next steps */}
                <div className="rounded-[1.8rem] border border-black/6 bg-white/86 p-5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
                    What to do next
                  </p>
                  <ol className="mt-4 space-y-3">
                    {nextStepsFor(organization.actionLabel).map((step, i) => (
                      <li key={step} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                          {i + 1}
                        </span>
                        <p className="text-[13px] leading-relaxed text-slate-700">{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailBlock({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-[1.8rem] border p-5 ${
        accent
          ? "border-black/6 bg-[rgba(246,241,232,0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          : "border-black/6 bg-white/86"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-800">{value}</p>
    </div>
  );
}

// ─── NTEE lookup ─────────────────────────────────────────────────────────────
const NTEE_NAMES: Record<string, string> = {
  A: "Arts, Culture & Humanities", B: "Education", C: "Environment & Conservation",
  D: "Animal-Related", E: "Health Care", F: "Mental Health", G: "Medical Research",
  H: "Disease Research", I: "Crime & Legal Services", J: "Employment & Job Training",
  K: "Food, Agriculture & Nutrition", L: "Housing & Shelter", M: "Public Safety",
  N: "Recreation & Sports", O: "Youth Development", P: "Human Services",
  Q: "International & Foreign Affairs", R: "Civil Rights & Social Action",
  S: "Community Improvement", T: "Philanthropy & Grantmaking", U: "Science & Technology",
  V: "Social Science", W: "Public & Societal Benefit", X: "Religion",
  Y: "Mutual Benefit", Z: "Other",
};

const SIZE_LABELS: Record<string, string> = {
  "<500K": "Under $500K/yr", "500K-1M": "$500K–$1M/yr", "1M-5M": "$1M–$5M/yr",
  "5M-10M": "$5M–$10M/yr", "10M+": "Over $10M/yr",
};

const STATE_NAMES: Record<string, string> = {
  CA: "California", WA: "Washington", OR: "Oregon", NY: "New York", TX: "Texas",
  FL: "Florida", IL: "Illinois", PA: "Pennsylvania", OH: "Ohio", GA: "Georgia",
};

function humanizeCohort(raw: string): string {
  if (!raw) return raw;
  const parts: Record<string, string> = {};
  raw.split("|").forEach((p) => {
    const [k, v] = p.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  });
  const ntee = parts["ntee_major_category"];
  const size = parts["size_bucket"];
  const state = parts["state"];
  const label = [
    ntee ? (NTEE_NAMES[ntee] ?? ntee) : null,
    "nonprofits",
    state ? `in ${STATE_NAMES[state] ?? state}` : null,
    size ? `· ${SIZE_LABELS[size] ?? size} budget` : null,
  ].filter(Boolean).join(" ");
  return label || raw;
}

// ─── Quick org facts ──────────────────────────────────────────────────────────
function OrgFacts({ organization }: { organization: OrganizationRecord }) {
  const [open, setOpen] = useState(false);

  const nteeLabel = NTEE_NAMES[organization.nteeCategory] ?? organization.nteeCategory;
  const sizeLabel = SIZE_LABELS[organization.sizeBucket] ?? organization.sizeBucket;
  const stateLabel = STATE_NAMES[organization.state] ?? organization.state;
  const trendLabel = organization.trendDirection.charAt(0).toUpperCase() + organization.trendDirection.slice(1);
  const trendColor = organization.trendDirection.toLowerCase().includes("declin") ? "text-rose-600"
    : organization.trendDirection.toLowerCase().includes("improv") || organization.trendDirection.toLowerCase().includes("grow") ? "text-emerald-600"
    : "text-slate-700";

  const facts: { label: string; value: string; note: string; wide?: boolean }[] = [
    {
      label: "Annual revenue",
      value: organization.revenueDisplay,
      note: `Total revenue reported in their FY ${organization.fiscalYear} IRS filing.`,
    },
    {
      label: "Mission area",
      value: nteeLabel,
      note: "The type of work this organization does, per their nonprofit classification.",
    },
    {
      label: "Annual budget tier",
      value: sizeLabel,
      note: "Which revenue tier this org falls into among all U.S. nonprofits.",
    },
    {
      label: "State",
      value: stateLabel,
      note: "State where this organization is incorporated and primarily operates.",
    },
    {
      label: "Data source",
      value: `FY ${organization.fiscalYear} filing`,
      note: "The most recent IRS Form 990 on file — this is the data our model used.",
    },
    {
      label: "Recent trend",
      value: trendLabel,
      note: "Direction of their key financial metrics over the past 2–3 years.",
    },
    {
      label: "Benchmarked against",
      value: humanizeCohort(organization.benchmark.peerCohort),
      note: "The peer group used to compare their financial health — similar mission, size, and geography.",
      wide: true,
    },
    {
      label: "EIN",
      value: organization.ein,
      note: "Federal employer ID — use this to look up their public IRS filings.",
    },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(246,241,232,0.88)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-colors hover:bg-white"
      >
        {open ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
        {open ? "Hide org details" : "View org details"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className="overflow-hidden"
          >
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {facts.map((f) => (
                <div
                  key={f.label}
                  className={`rounded-[1.6rem] border border-black/6 bg-white/88 p-4 ${f.wide ? "sm:col-span-2" : ""}`}
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
                    {f.label}
                  </p>
                  <p className={`mt-2 text-[15px] font-semibold tracking-[-0.02em] leading-snug ${f.label === "Recent trend" ? trendColor : "text-slate-900"}`}>
                    {f.value}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{f.note}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  children, eyebrow, title, tooltip,
}: {
  children: ReactNode; eyebrow: string; title: string; tooltip?: string;
}) {
  return (
    <div className="rounded-[2.2rem] border border-black/6 bg-white/88 p-6 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
          <h3 className="mt-1.5 text-[1.5rem] font-semibold tracking-[-0.045em] text-slate-950">{title}</h3>
        </div>
        {tooltip && (
          <div className="group relative shrink-0">
            <div className="cursor-default rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] p-2.5 text-[var(--northstar-accent)]">
              <ArrowLineUpRight size={15} weight="duotone" />
            </div>
            <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-56 origin-top-right scale-95 rounded-2xl border border-black/6 bg-white/98 p-3 text-[11px] leading-relaxed text-slate-600 opacity-0 shadow-lg transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function DecisionLab({
  onPrepareRecommendation: _onPrepareRecommendation,
  onReturnToPortfolio,
  organization,
}: {
  onPrepareRecommendation?: () => void;
  onReturnToPortfolio: () => void;
  organization: OrganizationRecord;
}) {
  const copy = getDecisionLabCopy(organization);
  const hasStress = organization.stress.burnMonths25 !== null || organization.stress.burnMonths50 !== null;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {/* ── Compact header ── */}
      <motion.div variants={rise}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-black/6 bg-[rgba(255,253,248,0.82)] px-5 py-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.18)]">
          <button
            type="button"
            onClick={onReturnToPortfolio}
            className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-[background-color,transform] duration-300 hover:bg-white active:scale-[0.98]"
          >
            <ArrowArcLeft size={13} weight="bold" />
            Back
          </button>

          <div className="flex flex-1 flex-col items-center gap-0.5 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Decision Lab
            </p>
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.05em] text-slate-900 leading-tight">
              {formatOrganizationName(organization.orgName)}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                toneStyles[verdictFor(organization.actionLabel).tone].badge
              } ${toneStyles[verdictFor(organization.actionLabel).tone].badgeText}`}
            >
              {verdictFor(organization.actionLabel).supportTag}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── The verdict — THE most important thing ── */}
      <motion.div variants={rise}>
        <VerdictBanner organization={organization} />
      </motion.div>

      {/* ── Quick signals row ── */}
      <motion.div variants={rise}>
        <KeySignals organization={organization} />
      </motion.div>

      {/* ── Main evidence: asymmetric 2-col ── */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">

        {/* Large left: risk gauge + trend sparkline + peer comparison embedded */}
        <motion.div variants={rise}>
          <Section
            eyebrow="How risky is this organization?"
            title="Chance of financial trouble next year"
            tooltip="The model analyzed 5 years of this org's financial filings and compared them to 2.2 million nonprofit records to estimate how likely they are to face financial distress next year."
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-5">
                <RiskGauge
                  probability={organization.distress.probability}
                  baseline={organization.distress.baseline}
                  tier={organization.distress.tier}
                />
                <TrendSparkline trendDirection={organization.trendDirection} />
              </div>
              <div>
                <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
                  vs. similar organizations
                </p>
                <PeerGaps benchmark={organization.benchmark} />
              </div>
            </div>
          </Section>
        </motion.div>

        {/* Smaller right: shock simulation */}
        <motion.div variants={rise}>
          <Section
            eyebrow="What if their main funding drops?"
            title="Stress simulation"
            tooltip="If their largest single revenue source was cut by 25% or 50%, how many months could they keep operating before running out of money?"
          >
            <ShockSimulation stress={organization.stress} />
          </Section>
        </motion.div>

      </div>

      {/* ── What to do next (open by default — most actionable section) ── */}
      <motion.div variants={rise}>
        <RecommendationDetails organization={organization} />
      </motion.div>

      {/* ── Recovery stories (if analogs exist) ── */}
      {organization.analogs.length > 0 && (
        <motion.div variants={rise}>
          <RecoveryStories analogs={organization.analogs} />
        </motion.div>
      )}

      {/* ── Org details (expandable) ── */}
      <motion.div variants={rise}>
        <div className="rounded-[2rem] border border-black/6 bg-[rgba(255,253,248,0.7)] p-5">
          <OrgFacts organization={organization} />
        </div>
      </motion.div>
    </motion.div>
  );
}
