import type { OrganizationRecord } from "../../types";
import { PanelShell } from "./ChartPrimitives";

export function RecoveryAnalogsPanel({ organization }: { organization: OrganizationRecord }) {
  return (
    <PanelShell
      title="Recovery analogs"
      guideTitle="How to read this panel"
      guideBullets={[
        "Each card shows a real organization that improved on the same kind of weak spot this case has.",
        "The metric shown is the recovery signal itself: funding mix, runway, or operating margin, depending on the analog.",
        "Use these as evidence that the pressure can improve over time, not as a promise that this organization will follow the same path.",
      ]}
      bodyMode="auto"
    >
      <div className="grid gap-3">
        {organization.analogs.map((analog) => (
          <div key={`${analog.orgName}-${analog.recoveryWindow}`} className="rounded-[1.4rem] border border-black/6 bg-white/76 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium tracking-[-0.03em] text-slate-900">{analog.orgName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  {analog.state} • {recoveryConstraintLabel(analog.metricName)}
                </p>
              </div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{analog.recoveryWindow}</p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{recoveryNarrative(analog.metricName)}</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="rounded-[1rem] bg-[rgba(246,241,232,0.82)] px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Before</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatRecoveryValue(analog.metricName, analog.preValue)}</p>
                <p className="mt-1 text-[11px] text-slate-500">{recoveryValueNote(analog.metricName, analog.preValue, "before")}</p>
              </div>
              <div className="h-[2px] bg-[var(--northstar-accent)]" />
              <div className="rounded-[1rem] bg-[rgba(230,242,236,0.92)] px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">After</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatRecoveryValue(analog.metricName, analog.postValue)}</p>
                <p className="mt-1 text-[11px] text-slate-500">{recoveryValueNote(analog.metricName, analog.postValue, "after")}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function recoveryConstraintLabel(metricName: string) {
  switch (metricName) {
    case "revenue diversification index":
      return "Recovered from funding concentration";
    case "operating runway proxy months":
      return "Recovered from short runway";
    case "operating margin":
      return "Recovered from operating losses";
    default:
      return `Recovered on ${metricName}`;
  }
}

function recoveryNarrative(metricName: string) {
  switch (metricName) {
    case "revenue diversification index":
      return "This analog became less dependent on a single source of money over time.";
    case "operating runway proxy months":
      return "This analog built enough financial cushion to withstand a setback for longer.";
    case "operating margin":
      return "This analog moved from losing money on operations to running a healthier surplus.";
    default:
      return "This analog improved on the matched recovery signal over time.";
  }
}

function formatRecoveryValue(metricName: string, value: number) {
  switch (metricName) {
    case "revenue diversification index":
      return `${Math.max(0, value).toFixed(2)} mix score`;
    case "operating runway proxy months":
      return `${value.toFixed(1)} months`;
    case "operating margin":
      return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
    default:
      return value.toFixed(2);
  }
}

function recoveryValueNote(metricName: string, value: number, phase: "before" | "after") {
  switch (metricName) {
    case "revenue diversification index":
      return phase === "before" ? revenueMixNote(value, true) : revenueMixNote(value, false);
    case "operating runway proxy months":
      return phase === "before" ? "little room for a funding shock" : "more room to absorb a setback";
    case "operating margin":
      return phase === "before" ? "operations were under pressure" : "operations improved materially";
    default:
      return phase === "before" ? "starting point" : "recovery point";
  }
}

function revenueMixNote(value: number, before: boolean) {
  const safeValue = Math.max(0, value);
  if (safeValue >= 0.45) {
    return before ? "already fairly balanced" : "more balanced across sources";
  }
  if (safeValue >= 0.25) {
    return before ? "somewhat dependent on a few sources" : "less dependent on a single source";
  }
  return before ? "highly dependent on one source" : "still narrow, but broader than before";
}
