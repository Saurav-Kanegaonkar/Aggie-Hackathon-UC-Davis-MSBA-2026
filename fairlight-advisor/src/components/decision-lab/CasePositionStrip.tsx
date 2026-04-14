import type { DecisionLabModel } from "../../lib/decisionLabModel";
import type { OrganizationRecord } from "../../types";

function formatRisk(value: number) {
  if (value < 1) {
    return "Below 1%";
  }
  return `${value.toFixed(1)}%`;
}

function toneClasses(tone: DecisionLabModel["statusTone"]) {
  switch (tone) {
    case "Strong":
      return "bg-emerald-50 text-emerald-900 border-emerald-200/80";
    case "Mixed":
      return "bg-amber-50 text-amber-900 border-amber-200/80";
    case "Fragile":
      return "bg-rose-50 text-rose-900 border-rose-200/80";
  }
}

export function CasePositionStrip({
  model,
  organization,
}: {
  model: DecisionLabModel;
  organization: OrganizationRecord;
}) {
  return (
    <section className="mt-5 rounded-[2rem] border border-black/6 bg-[rgba(248,244,236,0.74)] p-4 shadow-[0_22px_46px_-38px_rgba(15,23,42,0.16)]">
      <div className="grid gap-3 md:grid-cols-5">
        <StripMetric label="Northstar score" value={`${model.northstarScore}`} />
        <StripMetric label="Risk next year" value={formatRisk(organization.distress.probability)} />
        <StripMetric label="Portfolio baseline" value={`${organization.distress.baseline.toFixed(1)}%`} />
        <StripMetric label="Action" value={organization.actionLabel} />
        <div className={`rounded-[1.4rem] border px-4 py-4 ${toneClasses(model.statusTone)}`}>
          <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Status</p>
          <p className="mt-2 text-[1.4rem] font-semibold tracking-[-0.05em]">{model.statusTone}</p>
        </div>
      </div>
    </section>
  );
}

function StripMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-black/6 bg-white/80 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-[1.35rem] font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
    </div>
  );
}
