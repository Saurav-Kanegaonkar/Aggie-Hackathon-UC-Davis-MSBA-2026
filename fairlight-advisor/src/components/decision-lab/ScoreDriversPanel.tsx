import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { PanelShell } from "./ChartPrimitives";

function toneForValue(value: number) {
  if (value >= 75) {
    return {
      chip: "Helping",
      chipClass: "border-emerald-200/75 bg-emerald-50 text-emerald-900",
      fillClass: "bg-[#47695c]",
    };
  }

  if (value >= 45) {
    return {
      chip: "Watch",
      chipClass: "border-stone-200/80 bg-stone-50 text-stone-700",
      fillClass: "bg-[#8ea39a]",
    };
  }

  return {
    chip: "Holding back",
    chipClass: "border-amber-200/80 bg-amber-50 text-amber-900",
    fillClass: "bg-[#b98548]",
  };
}

function driverNote(label: string, value: number) {
  switch (label) {
    case "Distress protection":
      return value >= 75
        ? "Projected stress risk is low enough to support the overall call."
        : value >= 45
          ? "Projected stress risk is manageable, but it is not a non-issue."
          : "Projected stress risk is still materially weighing on the case.";
    case "Operating margin":
      return value >= 75
        ? "The operating profile is adding real support to the score."
        : value >= 45
          ? "Operating performance is acceptable, but not a standout strength."
          : "Operating performance is too thin to comfortably support the case.";
    case "Revenue mix":
      return value >= 75
        ? "Funding looks well spread, which improves resilience."
        : value >= 45
          ? "Revenue concentration is workable, but still worth monitoring."
          : "Revenue still depends too heavily on a narrow set of streams.";
    case "Evidence quality":
      return value >= 75
        ? "The filing record is strong enough to support a clean read."
        : value >= 45
          ? "The filing history is usable, but not airtight."
          : "The evidence base is too thin to treat this as a confident call.";
    default:
      return "This factor is one of the inputs shaping the final score.";
  }
}

export function ScoreDriversPanel({ model }: { model: DecisionLabModel }) {
  return (
    <PanelShell
      title="Score breakdown"
      guideTitle="How to read this panel"
      guideBullets={[
        "Each row shows one ingredient feeding the Northstar Score on a 0 to 100 scale.",
        "The status chip tells you whether that ingredient is clearly helping, neutral, or holding the case back.",
        "Use this panel to explain the score in plain language, not as a second recommendation.",
      ]}
    >
      <div className="grid gap-3 overflow-hidden">
        {model.scoreDrivers.map((driver) => {
          const tone = toneForValue(driver.value);

          return (
            <article key={driver.key} className="rounded-[1.35rem] border border-black/6 bg-white/76 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-medium tracking-[-0.03em] text-slate-900">{driver.label}</p>
                  <p className="mt-2 max-w-[36rem] text-sm leading-relaxed text-slate-600">{driverNote(driver.label, driver.value)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${tone.chipClass}`}>
                    {tone.chip}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{Math.round(driver.value)}/100</span>
                </div>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${tone.fillClass}`} style={{ width: `${Math.max(8, Math.round(driver.value))}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </PanelShell>
  );
}
