import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { ComparisonRows, PanelShell } from "./ChartPrimitives";

function formatValue(value: number, format: "percent" | "ratio") {
  if (format === "ratio") {
    return value.toFixed(2);
  }
  if (value < 1 && value > 0) {
    return "Below 1%";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function toMeterRatios(
  current: number,
  benchmark: number,
  format: "percent" | "ratio",
  label: string,
) {
  if (label === "Risk next year") {
    const domainMax = Math.max(current, benchmark, 40);
    return {
      currentRatio: 1 - current / domainMax,
      benchmarkRatio: 1 - benchmark / domainMax,
    };
  }

  const domainMax = format === "ratio" ? Math.max(current, benchmark, 0.8) : Math.max(current, benchmark, 25);
  return {
    currentRatio: current / domainMax,
    benchmarkRatio: benchmark / domainMax,
  };
}

export function PeerPositionPanel({ model }: { model: DecisionLabModel }) {
  return (
    <PanelShell
      title="How this compares"
      guideTitle="How to read this panel"
      guideBullets={[
        "Each row compares this organization against the peer benchmark for the same signal.",
        "The filled marker shows the organization. The small hollow marker shows the peer benchmark.",
        "Use this as a fast read on where the case looks stronger than peers, roughly in line, or worth watching more closely.",
      ]}
    >
      <ComparisonRows
        rows={model.peerPosition.map((row) => ({
          label: row.label,
          currentLabel: formatValue(row.current, row.format),
          benchmarkLabel: formatValue(row.benchmark, row.format),
          tone:
            row.label === "Risk next year"
              ? row.current < row.benchmark
                ? "stronger"
                : row.current <= row.benchmark * 1.1
                  ? "aligned"
                  : "watch"
              : row.current > row.benchmark
                ? "stronger"
                : row.current >= row.benchmark * 0.9
                  ? "aligned"
                  : "watch",
          verdict:
            row.label === "Risk next year"
              ? row.current < row.benchmark
                ? "Lower risk"
                : row.current <= row.benchmark * 1.1
                  ? "Near peers"
                  : "Higher risk"
              : row.current > row.benchmark
                ? "Above peers"
                : row.current >= row.benchmark * 0.9
                  ? "Near peers"
                  : "Below peers",
          ...toMeterRatios(row.current, row.benchmark, row.format, row.label),
        }))}
      />
    </PanelShell>
  );
}
