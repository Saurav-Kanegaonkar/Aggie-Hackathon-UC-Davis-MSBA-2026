import type { OrganizationRecord } from "../../types";
import { formatAnalogValue } from "../../lib/advisorLanguage";
import { PanelShell } from "./ChartPrimitives";

export function RecoveryAnalogsPanel({ organization }: { organization: OrganizationRecord }) {
  return (
    <PanelShell
      title="Recovery analogs"
      guideTitle="How to read this panel"
      guideBullets={[
        "These are real organizations from the dataset that improved from similar pressure.",
        "Read them as proof that this type of case can recover, not as a guarantee that this organization will do the same.",
        "The before and after values show the direction of recovery and how long that recovery took.",
      ]}
    >
      <div className="grid gap-3">
        {organization.analogs.map((analog) => (
          <div key={`${analog.orgName}-${analog.recoveryWindow}`} className="rounded-[1.4rem] border border-black/6 bg-white/76 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium tracking-[-0.03em] text-slate-900">{analog.orgName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  {analog.state} • {analog.metricName}
                </p>
              </div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{analog.recoveryWindow}</p>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="rounded-[1rem] bg-[rgba(246,241,232,0.82)] px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Before</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatAnalogValue(analog.preValue)}</p>
              </div>
              <div className="h-[2px] bg-[var(--northstar-accent)]" />
              <div className="rounded-[1rem] bg-[rgba(230,242,236,0.92)] px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">After</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{formatAnalogValue(analog.postValue)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
