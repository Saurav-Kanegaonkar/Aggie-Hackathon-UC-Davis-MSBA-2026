import { useState } from "react";

import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { ChartDetailModal, Legend, PanelShell, RevenueMixTrendGrid } from "./ChartPrimitives";

export function RevenueCompositionPanel({ model }: { model: DecisionLabModel }) {
  const [activeSeriesLabel, setActiveSeriesLabel] = useState<string | null>(null);
  const mixSeries = [
    { label: "Program", color: "#4f7664", values: model.revenueComposition.map((point) => point.programPct) },
    { label: "Contributions", color: "#c89648", values: model.revenueComposition.map((point) => point.contributionsPct) },
    { label: "Investment", color: "#6f87a2", values: model.revenueComposition.map((point) => point.investmentPct) },
    { label: "Other", color: "#b5c0cf", values: model.revenueComposition.map((point) => point.otherPct) },
  ];
  const activeSeries = mixSeries.find((item) => item.label === activeSeriesLabel) ?? null;

  return (
    <PanelShell
      title="Revenue mix over time"
      guideTitle="How to read this panel"
      guideBullets={[
        "Each mini-chart tracks one revenue stream over filing years, rather than stacking everything into a single hard-to-read column.",
        "Higher shares mean the organization relies more on that stream in that year.",
        "A healthier mix is usually more balanced across streams, rather than one category crowding out the rest.",
      ]}
      guideMode="none"
      headerHint="Open a card for detail"
    >
      <Legend
        items={[
          { label: "Program", color: "#4f7664" },
          { label: "Contributions", color: "#c89648" },
          { label: "Investment", color: "#6f87a2" },
          { label: "Other", color: "#b5c0cf" },
        ]}
      />
      <RevenueMixTrendGrid series={mixSeries} onOpenDetail={setActiveSeriesLabel} />
      {activeSeries ? (
        <ChartDetailModal
          title={`${activeSeries.label} share over time`}
          subtitle={`A closer read on how ${activeSeries.label.toLowerCase()} contributed to the revenue base across filing years.`}
          guideTitle="How to read this chart"
          guideBullets={[
            "Each bar shows the share of total revenue coming from this stream in that filing year.",
            "The labeled points show how the stream started, where it sat mid-history, and where it ended most recently.",
            "A stream becoming dominant means the organization is leaning harder on that source over time.",
          ]}
          onClose={() => setActiveSeriesLabel(null)}
        >
          <ExpandedMixChart
            labels={model.revenueComposition.map((point) => `FY${point.fiscalYear}`)}
            color={activeSeries.color}
            values={activeSeries.values}
          />
        </ChartDetailModal>
      ) : null}
    </PanelShell>
  );
}

function ExpandedMixChart({
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
  const max = Math.max(...values, 100);
  const min = 0;
  const span = Math.max(1, max - min);
  const barWidth = width / values.length - 10;
  const keyLabelIndexes = [0, Math.floor((labels.length - 1) / 3), Math.floor((2 * (labels.length - 1)) / 3), labels.length - 1];
  const keyPointIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), labels.length - 1])];
  const yTicks = [max, Math.round(max / 2), 0];

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
                  {`${Math.round(tick)}%`}
                </text>
              </g>
            );
          })}
          <g transform="translate(52 20)">
            {values.map((value, index) => {
              const x = index * (barWidth + 10);
              const h = ((value - min) / span) * height;
              const y = height - h;
              return <rect key={`${value}-${index}`} x={x} y={y} width={barWidth} height={h} rx="14" fill={color} fillOpacity="0.82" />;
            })}
            {keyPointIndexes.map((index) => {
              const value = values[index];
              const x = index * (barWidth + 10) + barWidth / 2;
              const h = ((value - min) / span) * height;
              const y = height - h;
              return (
                <g key={`mix-point-${index}`}>
                  <circle cx={x} cy={y} r="5.5" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="2.5" />
                  <text x={x} y={Math.max(14, y - 12)} textAnchor="middle" className="fill-slate-500 text-[11px] tracking-[0.08em] uppercase">
                    {`${Math.round(value)}%`}
                  </text>
                </g>
              );
            })}
          </g>
          {keyLabelIndexes.map((index) => (
            <text
              key={labels[index]}
              x={52 + index * (barWidth + 10) + barWidth / 2}
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
