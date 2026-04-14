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
    case "Distress readiness":
      return value >= 75
        ? "Projected stress risk is low enough that Fairlight can prioritize the case without leading with repair."
        : value >= 45
          ? "Projected stress risk is manageable, but it still limits how aggressively the case should move."
          : "Projected stress risk is still materially holding the case back.";
    case "Operating margin":
      return value >= 75
        ? "The operating profile gives Fairlight room to work on structure rather than immediate damage control."
        : value >= 45
          ? "Operating performance is workable, but still needs careful guardrails."
          : "Operating performance is too thin to comfortably support a first-call recommendation.";
    case "Diversification opportunity":
      return value >= 75
        ? "Revenue is concentrated enough that diversification support could create clear advisory value."
        : value >= 45
          ? "Revenue concentration is present, but not severe enough to dominate the call order by itself."
          : "Funding is already relatively spread out, so diversification is not the main reason to call first.";
    case "Evidence quality":
      return value >= 75
        ? "The filing record is strong enough to support a clean read."
      : value >= 45
          ? "The filing history is usable, but not airtight."
          : "The evidence base is too thin to treat this as a confident call.";
    case "Priority lane":
      return value >= 75
        ? "This lands in Fairlight's highest-priority recommendation lane."
        : value >= 45
          ? "This sits in a workable middle lane, but it is not the first call out of the deck."
          : "This recommendation lane is intentionally lower-priority for outreach.";
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
        "This is an outreach-priority read, so concentrated but viable diversify cases can score well on purpose.",
      ]}
      bodyMode="auto"
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
