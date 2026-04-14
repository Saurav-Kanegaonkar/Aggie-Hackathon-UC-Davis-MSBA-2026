import { useState } from "react";

import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { compactCurrency } from "../../lib/decisionLabText";
import { ChartDetailModal, PanelShell, TrendSparkCard } from "./ChartPrimitives";

function formatChange(current: number, prior: number) {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || Math.abs(prior) < 1e-9) {
    return "stable read";
  }

  const deltaPct = ((current - prior) / Math.abs(prior)) * 100;
  if (Math.abs(deltaPct) < 2) {
    return "roughly flat";
  }
  return `${deltaPct >= 0 ? "+" : ""}${Math.round(deltaPct)}% vs start`;
}

export function FinancialTrajectoryPanel({ model }: { model: DecisionLabModel }) {
  const first = model.financialTrajectory[0];
  const last = model.financialTrajectory.at(-1);
  const [activeSeries, setActiveSeries] = useState<"Revenue" | "Expenses" | "Net assets" | null>(null);
  const labels = model.financialTrajectory.map((point) => `FY${point.fiscalYear}`);

  const seriesMap = {
    Revenue: {
      color: "#466859",
      subtitle: "Revenue over filing years, shown at full width so the shape and inflection points are easier to read.",
      values: model.financialTrajectory.map((point) => point.revenue),
    },
    Expenses: {
      color: "#b68a48",
      subtitle: "Expenses over filing years, expanded so cost pressure and regime shifts are visible at a glance.",
      values: model.financialTrajectory.map((point) => point.expenses),
    },
    "Net assets": {
      color: "#7f95ad",
      subtitle: "Net assets over filing years, expanded so balance-sheet accumulation can be read without compression.",
      values: model.financialTrajectory.map((point) => point.netAssets),
    },
  } as const;

  return (
    <PanelShell
      title="Financial trajectory"
      guideTitle="How to read this panel"
      guideBullets={[
        "Each card isolates one financial series so the pattern stays readable instead of being flattened into a single plot.",
        "Read the number as the latest filing value and the badge as the shift from the first observed year.",
        "Use the three cards together to see whether the organization is scaling, tightening, or building balance-sheet strength over time.",
      ]}
      guideMode="none"
      headerHint="Open a card for detail"
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <TrendSparkCard
          label="Revenue"
          value={compactCurrency(last?.revenue ?? 0)}
          delta={formatChange(last?.revenue ?? 0, first?.revenue ?? 0)}
          values={model.financialTrajectory.map((point) => point.revenue)}
          color="#466859"
          tint="rgba(70,104,89,0.10)"
          onOpenDetail={() => setActiveSeries("Revenue")}
        />
        <TrendSparkCard
          label="Expenses"
          value={compactCurrency(last?.expenses ?? 0)}
          delta={formatChange(last?.expenses ?? 0, first?.expenses ?? 0)}
          values={model.financialTrajectory.map((point) => point.expenses)}
          color="#b68a48"
          tint="rgba(182,138,72,0.12)"
          onOpenDetail={() => setActiveSeries("Expenses")}
        />
        <TrendSparkCard
          label="Net assets"
          value={compactCurrency(last?.netAssets ?? 0)}
          delta={formatChange(last?.netAssets ?? 0, first?.netAssets ?? 0)}
          values={model.financialTrajectory.map((point) => point.netAssets)}
          color="#7f95ad"
          tint="rgba(127,149,173,0.14)"
          onOpenDetail={() => setActiveSeries("Net assets")}
        />
      </div>
      {activeSeries ? (
        <ChartDetailModal
          title={`${activeSeries} over time`}
          subtitle={seriesMap[activeSeries].subtitle}
          guideTitle="How to read this chart"
          guideBullets={[
            "The large line shows the full multi-year pattern, with start, midpoint, and latest years marked directly on the series.",
            "Use the callouts to understand where the series inflected, not just where it ended.",
            "Read this together with the other two series to see whether growth, cost pressure, or balance-sheet strength is shaping the case.",
          ]}
          onClose={() => setActiveSeries(null)}
        >
          <ExpandedSeriesChart
            labels={labels}
            color={seriesMap[activeSeries].color}
            values={seriesMap[activeSeries].values}
          />
        </ChartDetailModal>
      ) : null}
    </PanelShell>
  );
}

function ExpandedSeriesChart({
  labels,
  color,
  values,
}: {
  labels: string[];
  color: string;
  values: number[];
}) {
  const width = 920;
  const height = 320;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const stepX = values.length > 1 ? width / (values.length - 1) : width / 2;
  const path = values
    .map((value, index) => {
      const x = stepX * index;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  const keyLabelIndexes = [0, Math.floor((labels.length - 1) / 3), Math.floor((2 * (labels.length - 1)) / 3), labels.length - 1];
  const keyPointIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), labels.length - 1])];
  const yTicks = [max, min + span * 0.5, min];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[1.8rem] border border-black/6 bg-[rgba(247,243,235,0.78)] p-5">
        <svg viewBox={`0 0 ${width + 60} ${height + 40}`} className="w-full">
          {yTicks.map((tick) => {
            const y = 20 + height - ((tick - min) / span) * height;
            return (
              <g key={tick}>
                <line x1="52" y1={y} x2={width + 52} y2={y} className="decision-gridline" />
                <text x="0" y={y + 4} className="fill-slate-400 text-[11px] tracking-[0.12em] uppercase">
                  {compactCurrency(tick)}
                </text>
              </g>
            );
          })}
          <g transform="translate(52 20)">
            <path d={area} fill={color} fillOpacity="0.12" />
            <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {keyPointIndexes.map((index) => {
              const value = values[index];
              const x = stepX * index;
              const y = height - ((value - min) / span) * height;
              return (
                <g key={`point-${index}`}>
                  <circle cx={x} cy={y} r="5.5" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="2.5" />
                  <text x={x} y={Math.max(14, y - 12)} textAnchor="middle" className="fill-slate-500 text-[11px] tracking-[0.08em] uppercase">
                    {compactCurrency(value)}
                  </text>
                </g>
              );
            })}
          </g>
          {keyLabelIndexes.map((index) => (
            <text
              key={labels[index]}
              x={52 + stepX * index}
              y={height + 52}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] tracking-[0.12em] uppercase"
            >
              {labels[index]}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
