import type { DecisionLabModel, ScoreComponentV2 } from "../../lib/decisionLabModel";
import { PanelShell } from "./ChartPrimitives";

// ── V1 helpers (legacy) ────────────────────────────────────────────────────

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
        ? "This lands in Fairlight's highest-priority bucket (RCR or UAB) — the strongest leads for outreach."
        : value >= 45
          ? "This sits in a mid-priority bucket (WFF) — workable engagement but not the first call."
          : "This org is in the NDD bucket — needs data diligence before any outreach.";
    default:
      return "This factor is one of the inputs shaping the final score.";
  }
}

// ── V2 helpers ─────────────────────────────────────────────────────────────

function v2ComponentNote(key: string, label: string): string {
  switch (key) {
    case "opportunity":
      return "Asset scale (log-scaled up to $50M) plus yield gap to the 5% benchmark. Measures the fee revenue and value creation at stake for Fairlight.";
    case "structural":
      if (label === "Asset Sophistication")
        return "UAB-specific signal: asset scale, investment track record (consecutive years of income), and yield gap depth. For UAB orgs the asset opportunity is both the signal and the pitch.";
      if (label === "Financial Foundation")
        return "WFF-specific signal: asset band fit ($1M–$20M sweet spot), margin repair potential (mild issues score highest), and low liquid reserves. Surfaces the orgs where Fairlight's infrastructure-build pitch lands best.";
      return "Weighted blend of diversification need, stress vulnerability, operating support, and evidence strength — measures how strong the advisory conversation is for this org.";
    case "confidence":
      return "Filing history depth plus data completeness across key financial fields. Reflects how much Fairlight can trust this read before making a call.";
    case "fairlightFit":
      return "Explicit bonus for profiles matching Fairlight's known service-line sweet spots — UAB with low yield, RCR with real assets, WFF in the $1M–$20M band.";
    case "distressAdj":
      return "Soft penalty when the distress model flags elevated fragility. A high-opportunity org can still surface but takes a meaningful point hit if the org is too fragile to be a reliable client.";
    default:
      return "One of the inputs shaping the final Northstar score.";
  }
}

function v2ToneForComponent(component: ScoreComponentV2) {
  if (component.isDeduction) {
    const penalty = Math.abs(component.value);
    if (penalty <= 3) {
      return { chip: "Minimal", chipClass: "border-emerald-200/75 bg-emerald-50 text-emerald-900", fillClass: "bg-[#47695c]" };
    }
    if (penalty <= 9) {
      return { chip: "Moderate", chipClass: "border-amber-200/80 bg-amber-50 text-amber-900", fillClass: "bg-[#b98548]" };
    }
    return { chip: "Heavy", chipClass: "border-rose-200/80 bg-rose-50 text-rose-900", fillClass: "bg-rose-500" };
  }

  const pct = component.max > 0 ? (component.value / component.max) * 100 : 0;
  if (pct >= 70) {
    return { chip: "Strong", chipClass: "border-emerald-200/75 bg-emerald-50 text-emerald-900", fillClass: "bg-[#47695c]" };
  }
  if (pct >= 40) {
    return { chip: "Moderate", chipClass: "border-stone-200/80 bg-stone-50 text-stone-700", fillClass: "bg-[#8ea39a]" };
  }
  return { chip: "Low", chipClass: "border-amber-200/80 bg-amber-50 text-amber-900", fillClass: "bg-[#b98548]" };
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function ScoreDriversPanel({ model }: { model: DecisionLabModel }) {
  if (model.scoreComponentsV2) {
    return <ScoreBreakdownV2 components={model.scoreComponentsV2} />;
  }

  return <ScoreBreakdownV1 model={model} />;
}

function ScoreBreakdownV1({ model }: { model: DecisionLabModel }) {
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

function ScoreBreakdownV2({ components }: { components: ScoreComponentV2[] }) {
  const positive = components.filter((c) => !c.isDeduction);
  const deductions = components.filter((c) => c.isDeduction);
  const positiveTotal = positive.reduce((sum, c) => sum + c.value, 0);
  const positiveMax = positive.reduce((sum, c) => sum + c.max, 0);
  const deductionTotal = deductions.reduce((sum, c) => sum + Math.abs(c.value), 0);

  return (
    <PanelShell
      title="Score breakdown"
      guideTitle="How to read this panel"
      guideBullets={[
        "The Northstar score is built from five components — four earn points, one applies a risk deduction.",
        "Opportunity and Structural each contribute up to 40 points. Confidence adds up to 20. Fairlight Fit adds up to 10.",
        "The Distress Adjustment is a negative penalty (−0 to −15) when projected risk is elevated.",
      ]}
      bodyMode="auto"
    >
      <div className="grid gap-3 overflow-hidden">
        {/* Score bar overview */}
        <div className="rounded-[1.35rem] border border-black/6 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-slate-400">Components</p>
            <p className="text-[13px] font-semibold text-slate-700">
              {positiveTotal}<span className="text-slate-400">/{positiveMax}</span>
              {deductionTotal > 0 && <span className="ml-1.5 text-rose-600">−{deductionTotal}</span>}
            </p>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {positive.map((c) => {
              const tone = v2ToneForComponent(c);
              const widthPct = positiveMax > 0 ? (c.value / positiveMax) * (100 - (deductionTotal / (positiveMax + 15)) * 100) : 0;
              return (
                <div
                  key={c.key}
                  className={`h-full first:rounded-l-full ${tone.fillClass}`}
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                  title={`${c.label}: ${c.value}/${c.max}`}
                />
              );
            })}
            {deductionTotal > 0 && (
              <div
                className="h-full rounded-r-full bg-rose-400"
                style={{ width: `${Math.min(20, (deductionTotal / (positiveMax + 15)) * 100)}%` }}
                title={`Distress deduction: −${deductionTotal}`}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {positive.map((c) => (
              <span key={c.key} className="text-[11px] text-slate-500">{c.label} {c.value}/{c.max}</span>
            ))}
            {deductionTotal > 0 && (
              <span className="text-[11px] text-rose-500">Distress −{deductionTotal}</span>
            )}
          </div>
        </div>

        {/* Individual component cards */}
        {components.map((component) => {
          const tone = v2ToneForComponent(component);
          const displayValue = component.isDeduction
            ? `−${Math.abs(component.value)}`
            : `${component.value}/${component.max}`;
          const barPct = component.isDeduction
            ? Math.min(100, (Math.abs(component.value) / 15) * 100)
            : component.max > 0 ? Math.min(100, (component.value / component.max) * 100) : 0;

          return (
            <article key={component.key} className="rounded-[1.35rem] border border-black/6 bg-white/76 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-medium tracking-[-0.03em] text-slate-900">{component.label}</p>
                    {component.isDeduction && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600 border border-rose-200/60">
                        Deduction
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-[36rem] text-sm leading-relaxed text-slate-600">
                    {v2ComponentNote(component.key, component.label)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${tone.chipClass}`}>
                    {tone.chip}
                  </span>
                  <span className={`text-sm font-semibold ${component.isDeduction ? "text-rose-600" : "text-slate-900"}`}>
                    {displayValue}
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${component.isDeduction ? "bg-rose-400" : tone.fillClass}`}
                  style={{ width: `${Math.max(4, barPct)}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </PanelShell>
  );
}
