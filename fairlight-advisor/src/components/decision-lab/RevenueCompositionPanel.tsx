import type { DecisionLabModel } from "../../lib/decisionLabModel";
import type { DecisionLabDetail } from "./ChartPrimitives";
import { Legend, PanelShell, RevenueMixTrendGrid } from "./ChartPrimitives";

export function RevenueCompositionPanel({
  model,
  onOpenDetail,
}: {
  model: DecisionLabModel;
  onOpenDetail: (detail: DecisionLabDetail) => void;
}) {
  const mixSeries = [
    { label: "Program", color: "#4f7664", values: model.revenueComposition.map((point) => point.programPct) },
    { label: "Contributions", color: "#c89648", values: model.revenueComposition.map((point) => point.contributionsPct) },
    { label: "Investment", color: "#6f87a2", values: model.revenueComposition.map((point) => point.investmentPct) },
    { label: "Other", color: "#b5c0cf", values: model.revenueComposition.map((point) => point.otherPct) },
  ];

  function openSeriesDetail(seriesLabel: string) {
    const activeSeries = mixSeries.find((item) => item.label === seriesLabel);
    if (!activeSeries) {
      return;
    }

    onOpenDetail({
      title: `${activeSeries.label} share over time`,
      subtitle: `A closer read on how ${activeSeries.label.toLowerCase()} contributed to the revenue base across filing years.`,
      guideTitle: "How to read this chart",
      guideBullets: [
        "Each bar shows the share of total revenue coming from this stream in that filing year.",
        "The labeled points show how the stream started, where it sat mid-history, and where it ended most recently.",
        "A stream becoming dominant means the organization is leaning harder on that source over time.",
      ],
      content: (
        <ExpandedMixChart
          labels={model.revenueComposition.map((point) => `FY${point.fiscalYear}`)}
          color={activeSeries.color}
          values={activeSeries.values}
        />
      ),
    });
  }

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
      bodyMode="auto"
    >
      <Legend
        items={[
          { label: "Program", color: "#4f7664" },
          { label: "Contributions", color: "#c89648" },
          { label: "Investment", color: "#6f87a2" },
          { label: "Other", color: "#b5c0cf" },
        ]}
      />
      <RevenueMixTrendGrid series={mixSeries} onOpenDetail={openSeriesDetail} />
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
  const width = 1320;
  const height = 640;
  const plotLeft = 132;
  const plotTop = 26;
  const plotBottom = 116;
  const max = Math.max(...values, 100);
  const min = 0;
  const span = Math.max(1, max - min);
  const barWidth = width / values.length - 10;
  const keyLabelIndexes = [0, Math.floor((labels.length - 1) / 3), Math.floor((2 * (labels.length - 1)) / 3), labels.length - 1];
  const keyPointIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), labels.length - 1])];
  const yTicks = [max, Math.round(max / 2), 0];
  const summaries = keyPointIndexes.map((index) => ({
    label: labels[index],
    value: `${Math.round(values[index])}%`,
  }));

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]" data-testid="expanded-mix-chart">
      <div className="min-h-[30rem] overflow-hidden rounded-[1.8rem] border border-black/6 bg-[rgba(247,243,235,0.78)] p-4">
        <svg viewBox={`0 0 ${width + plotLeft + 8} ${height + plotTop + plotBottom}`} className="h-full min-h-[28rem] w-full">
          {yTicks.map((tick) => {
            const y = plotTop + height - ((tick - min) / span) * height;
            return (
              <g key={tick}>
                <line
                  x1={plotLeft}
                  y1={y}
                  x2={width + plotLeft}
                  y2={y}
                  stroke="rgba(67, 82, 97, 0.22)"
                  strokeWidth="1.6"
                  strokeDasharray="6 8"
                />
                <text x="0" y={y + 8} fill="#435261" fontSize="28" fontWeight="700" letterSpacing="0.35">
                  {`${Math.round(tick)}%`}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${plotLeft} ${plotTop})`}>
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
                  <circle cx={x} cy={y} r="8.5" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="2.8" />
                  <text x={x} y={Math.max(26, y - 18)} textAnchor="middle" fill="#334155" fontSize="22" fontWeight="700" letterSpacing="0.2">
                    {`${Math.round(value)}%`}
                  </text>
                </g>
              );
            })}
          </g>
          {keyLabelIndexes.map((index) => (
            <text
              key={labels[index]}
              x={plotLeft + index * (barWidth + 10) + barWidth / 2}
              y={height + plotTop + 52}
              textAnchor="middle"
              fill="#435261"
              fontSize="22"
              fontWeight="700"
              letterSpacing="0.5"
            >
              {labels[index]}
            </text>
          ))}
        </svg>
      </div>
      <div className="grid gap-3 lg:grid-rows-[repeat(3,minmax(0,1fr))]">
        {summaries.map((summary) => (
          <div key={`mix-summary-${summary.label}`} className="rounded-[1.2rem] border border-black/6 bg-white/82 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{summary.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{summary.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
