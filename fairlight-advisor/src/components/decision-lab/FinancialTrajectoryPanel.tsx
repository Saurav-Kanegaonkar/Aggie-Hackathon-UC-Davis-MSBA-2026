import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { compactCurrency } from "../../lib/decisionLabText";
import type { DecisionLabDetail } from "./ChartPrimitives";
import { PanelShell, TrendSparkCard } from "./ChartPrimitives";

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

export function FinancialTrajectoryPanel({
  model,
  onOpenDetail,
}: {
  model: DecisionLabModel;
  onOpenDetail: (detail: DecisionLabDetail) => void;
}) {
  const first = model.financialTrajectory[0];
  const last = model.financialTrajectory.at(-1);
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

  function openSeriesDetail(seriesLabel: keyof typeof seriesMap) {
    onOpenDetail({
      title: `${seriesLabel} over time`,
      subtitle: seriesMap[seriesLabel].subtitle,
      guideTitle: "How to read this chart",
      guideBullets: [
        "The large line shows the full multi-year pattern, with start, midpoint, and latest years marked directly on the series.",
        "Use the callouts to understand where the series inflected, not just where it ended.",
        "Read this together with the other two series to see whether growth, cost pressure, or balance-sheet strength is shaping the case.",
      ],
      content: (
        <ExpandedSeriesChart
          labels={labels}
          color={seriesMap[seriesLabel].color}
          values={seriesMap[seriesLabel].values}
        />
      ),
    });
  }

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
      bodyMode="auto"
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <TrendSparkCard
          label="Revenue"
          value={compactCurrency(last?.revenue ?? 0)}
          delta={formatChange(last?.revenue ?? 0, first?.revenue ?? 0)}
          values={model.financialTrajectory.map((point) => point.revenue)}
          color="#466859"
          tint="rgba(70,104,89,0.10)"
          guideBullets={[
            "This card isolates one financial series so the shape is easy to read without competing with the other lines.",
            "The headline number is the latest filing value, while the small badge compares today against the first observed year.",
            "Open the full detail view when you want the larger chart and year-by-year callouts.",
          ]}
          onOpenDetail={() => openSeriesDetail("Revenue")}
        />
        <TrendSparkCard
          label="Expenses"
          value={compactCurrency(last?.expenses ?? 0)}
          delta={formatChange(last?.expenses ?? 0, first?.expenses ?? 0)}
          values={model.financialTrajectory.map((point) => point.expenses)}
          color="#b68a48"
          tint="rgba(182,138,72,0.12)"
          guideBullets={[
            "This card tracks cost pressure over time, separate from revenue, so rising expenses are easy to spot.",
            "Read the badge as the change from the first filing year, not as a quarter-over-quarter signal.",
            "Open the large chart when you want the detailed path and labeled inflection points.",
          ]}
          onOpenDetail={() => openSeriesDetail("Expenses")}
        />
        <TrendSparkCard
          label="Net assets"
          value={compactCurrency(last?.netAssets ?? 0)}
          delta={formatChange(last?.netAssets ?? 0, first?.netAssets ?? 0)}
          values={model.financialTrajectory.map((point) => point.netAssets)}
          color="#7f95ad"
          tint="rgba(127,149,173,0.14)"
          guideBullets={[
            "This card shows how the balance-sheet cushion has changed across the filing history.",
            "Rising net assets usually mean the organization is building more flexibility; falling net assets mean that cushion is thinning.",
            "Open the larger chart when you need the full path instead of the quick summary read.",
          ]}
          onOpenDetail={() => openSeriesDetail("Net assets")}
        />
      </div>
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
  const width = 1320;
  const height = 640;
  const plotLeft = 132;
  const plotTop = 26;
  const plotBottom = 116;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const positiveValues = values.filter((value) => value > 0);
  const smallestPositive = positiveValues.length ? Math.min(...positiveValues) : 1;
  const usesCompressedScale = max / Math.max(smallestPositive, 1) > 12;
  const scaleExponent = usesCompressedScale ? 0.58 : 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width / 2;
  const projectY = (value: number) => {
    const ratio = (value - min) / span;
    const scaledRatio = scaleExponent === 1 ? ratio : Math.pow(Math.max(0, ratio), scaleExponent);
    return height - scaledRatio * height;
  };
  const path = values
    .map((value, index) => {
      const x = stepX * index;
      const y = projectY(value);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  const keyLabelIndexes = [0, Math.floor((labels.length - 1) / 3), Math.floor((2 * (labels.length - 1)) / 3), labels.length - 1];
  const keyPointIndexes = [...new Set([0, Math.round((labels.length - 1) / 2), labels.length - 1])];
  const yTicks = [max, min + span * 0.5, min];
  const summaries = keyPointIndexes.map((index) => ({
    label: labels[index],
    value: compactCurrency(values[index]),
  }));

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]" data-testid="expanded-series-chart">
      <div className="min-h-[30rem] overflow-hidden rounded-[1.8rem] border border-black/6 bg-[rgba(247,243,235,0.78)] p-4">
        <svg viewBox={`0 0 ${width + plotLeft + 8} ${height + plotTop + plotBottom}`} className="h-full min-h-[28rem] w-full">
          {yTicks.map((tick) => {
            const y = plotTop + projectY(tick);
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
                  {compactCurrency(tick)}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${plotLeft} ${plotTop})`}>
            <path d={area} fill={color} fillOpacity="0.12" />
            <path d={path} fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            {keyPointIndexes.map((index) => {
              const value = values[index];
              const x = stepX * index;
              const y = projectY(value);
              return (
                <g key={`point-${index}`}>
                  <circle cx={x} cy={y} r="8.5" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="2.8" />
                  <text x={x} y={Math.max(26, y - 18)} textAnchor="middle" fill="#334155" fontSize="22" fontWeight="700" letterSpacing="0.2">
                    {compactCurrency(value)}
                  </text>
                </g>
              );
            })}
          </g>
          {keyLabelIndexes.map((index) => (
            <text
              key={labels[index]}
              x={plotLeft + stepX * index}
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
          <div key={`summary-${summary.label}`} className="rounded-[1.2rem] border border-black/6 bg-white/82 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{summary.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{summary.value}</p>
          </div>
        ))}
        {usesCompressedScale ? (
          <div className="rounded-[1.2rem] border border-dashed border-black/8 bg-[rgba(246,241,232,0.78)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Readability note</p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-700">
              The vertical scale is gently compressed so the spike and the typical years can both be read without flattening the line.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
