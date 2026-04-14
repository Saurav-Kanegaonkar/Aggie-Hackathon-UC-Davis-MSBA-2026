import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { BandChart, Legend, PanelShell } from "./ChartPrimitives";

export function OperatingQualityPanel({ model }: { model: DecisionLabModel }) {
  const hasPeerHistory = model.peerMarginHistory.length > 0;
  const labels = model.peerMarginHistory.map((point) => String(point.fiscalYear));
  const orgSeries = model.financialTrajectory
    .filter((point) => labels.includes(String(point.fiscalYear)))
    .map((point) => point.operatingMargin);

  const normalizedMargins = model.financialTrajectory.map((point) => normalizeMarginPercent(point.operatingMargin));
  const latestMargin = normalizedMargins.at(-1) ?? 0;
  const latestYear = model.financialTrajectory.at(-1)?.fiscalYear ?? null;
  const firstMargin = normalizedMargins[0] ?? 0;
  const marginDelta = latestMargin - firstMargin;
  const trendRead = describeMarginPattern(normalizedMargins);

  return (
    <PanelShell
      title="Margin vs peers"
      guideTitle="How to read this panel"
      guideBullets={[
        "The dark teal line is this organization’s operating margin over time.",
        "The soft sage band shows where comparable organizations usually land, with the dashed line marking the peer midpoint.",
        "If the line is above the band, the organization is outperforming peers. If it sits below the band, the case is weaker than peer norms.",
      ]}
      bodyMode={hasPeerHistory ? "fixed" : "auto"}
    >
      {hasPeerHistory ? (
        <>
          <Legend
            items={[
              { label: "Organization", color: "#375e67" },
              { label: "Peer median", color: "#728f7f" },
              { label: "Peer range", color: "#d6e1d9" },
            ]}
          />
          <BandChart
            labels={labels}
            organization={orgSeries}
            median={model.peerMarginHistory.map((point) => point.peerMarginMedian)}
            lowerBand={model.peerMarginHistory.map((point) => point.peerMarginQ25)}
            upperBand={model.peerMarginHistory.map((point) => point.peerMarginQ75)}
            primaryColor="#375e67"
            secondaryColor="#728f7f"
          />
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16.5rem,0.65fr)]">
          <div className="rounded-[1.6rem] border border-black/6 bg-white/78 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Internal read</p>
                <p className="mt-2 text-[1.35rem] font-semibold tracking-[-0.045em] text-slate-950">
                  Margin read from filing history
                </p>
              </div>
              <span className="rounded-full border border-[#d5e7de] bg-[rgba(230,242,236,0.78)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[#46695b]">
                Peer band unavailable
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
              Peer benchmark coverage is thin, so this read leans on the organization’s own filing pattern instead of a weak comparison set.
            </p>
            <div className="mt-5 rounded-[1.35rem] border border-black/6 bg-[rgba(246,241,232,0.76)] p-4">
              <FallbackMarginSpark years={model.financialTrajectory.map((point) => point.fiscalYear)} values={normalizedMargins} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.15rem] border border-black/6 bg-[rgba(246,241,232,0.76)] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Latest reported margin</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{formatSignedPercent(latestMargin)}</p>
              </div>
              <div className="rounded-[1.15rem] border border-black/6 bg-[rgba(246,241,232,0.76)] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Filing coverage</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{`${model.financialTrajectory.length} years`}</p>
              </div>
              <div className="rounded-[1.15rem] border border-black/6 bg-[rgba(230,242,236,0.72)] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Pattern read</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{trendRead.label}</p>
                <p className="mt-1 text-[11px] text-slate-500">{trendRead.detail}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.72)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Analyst note</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-[1.15rem] border border-black/6 bg-white/76 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Use with confidence</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  The filing trail is long enough to support a directional margin read.
                </p>
              </div>
              <div className="rounded-[1.15rem] border border-black/6 bg-white/76 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Best companion panel</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  Pair this with financial trajectory to judge whether the latest margin looks durable.
                </p>
              </div>
              <div className="rounded-[1.15rem] border border-black/6 bg-white/76 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">What is missing</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  Add a manual benchmark only if peer context is essential to the final call.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-[1.2rem] border border-[#d5e7de] bg-[rgba(230,242,236,0.72)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Change since first filing</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{formatSignedPercent(marginDelta)}</p>
              <p className="mt-1 text-[11px] text-slate-500">{latestYear ? `Read through FY${latestYear}` : "Read through latest filing"}</p>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function normalizeMarginPercent(value: number) {
  return Math.abs(value) > 2 ? value : value * 100;
}

function formatSignedPercent(value: number) {
  const normalized = normalizeMarginPercent(value);
  const capped = Math.max(-999, Math.min(999, normalized));
  return `${capped >= 0 ? "+" : ""}${capped.toFixed(1)}%`;
}

function describeMarginPattern(values: number[]) {
  const latest = values.at(-1) ?? 0;
  const earliest = values[0] ?? 0;
  const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;

  if (spread > 120) {
    return { label: "Variable", detail: "Large year-to-year swings" };
  }
  if (latest - earliest > 8) {
    return { label: "Improving", detail: "Margin is stronger than the starting point" };
  }
  if (latest - earliest < -8) {
    return { label: "Softer", detail: "Margin is below the starting point" };
  }
  return { label: "Steady", detail: "Margin has held within a relatively tight band" };
}

function FallbackMarginSpark({
  years,
  values,
}: {
  years: number[];
  values: number[];
}) {
  const width = 520;
  const height = 156;
  const transform = (value: number) => Math.sign(value) * Math.sqrt(Math.abs(value));
  const projectedValues = values.map(transform);
  const min = Math.min(...projectedValues, transform(0));
  const max = Math.max(...projectedValues, transform(0));
  const span = Math.max(1, max - min);
  const stepX = values.length > 1 ? width / (values.length - 1) : width / 2;
  const path = values
    .map((value, index) => {
      const x = values.length > 1 ? stepX * index : width / 2;
      const ratio = (transform(value) - min) / span;
      const y = height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  const pointIndexes = [...new Set([0, Math.round((values.length - 1) / 2), values.length - 1])];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[1.1rem] bg-[rgba(230,242,236,0.5)] p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full">
          <path d={area} fill="rgba(70,104,89,0.12)" />
          <path d={path} fill="none" stroke="#466859" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          {pointIndexes.map((index) => {
            const value = values[index];
            const ratio = (transform(value) - min) / span;
            const x = values.length > 1 ? stepX * index : width / 2;
            const y = height - ratio * height;
            return (
              <g key={`fallback-point-${years[index]}-${index}`}>
                <circle cx={x} cy={y} r="4.2" fill="#466859" stroke="rgba(255,255,255,0.95)" strokeWidth="1.8" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1rem] border border-black/6 bg-white/82 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Starting point</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-slate-950">{formatSignedPercent(values[0] ?? 0)}</p>
          <p className="mt-1 text-[11px] text-slate-500">{years[0] ? `FY${years[0]}` : "First filing"}</p>
        </div>
        <div className="rounded-[1rem] border border-black/6 bg-white/82 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Latest point</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-slate-950">{formatSignedPercent(values.at(-1) ?? 0)}</p>
          <p className="mt-1 text-[11px] text-slate-500">{years.at(-1) ? `FY${years.at(-1)}` : "Latest filing"}</p>
        </div>
      </div>
    </div>
  );
}
