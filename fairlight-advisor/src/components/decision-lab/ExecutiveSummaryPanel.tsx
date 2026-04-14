import { buildDecisionFrame } from "../../lib/decisionLabText";
import type { DecisionLabModel } from "../../lib/decisionLabModel";
import type { OrganizationRecord } from "../../types";

function toneClasses(tone: DecisionLabModel["statusTone"]) {
  switch (tone) {
    case "Strong":
      return {
        shell: "border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(250,246,240,0.9))]",
        accent: "bg-emerald-500",
        badge: "border-emerald-200/80 bg-emerald-50 text-emerald-900",
        headline: "text-emerald-950",
      };
    case "Mixed":
      return {
        shell: "border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.96),rgba(250,246,240,0.9))]",
        accent: "bg-amber-500",
        badge: "border-amber-200/80 bg-amber-50 text-amber-900",
        headline: "text-slate-950",
      };
    case "Fragile":
      return {
        shell: "border-rose-200/70 bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(250,246,240,0.9))]",
        accent: "bg-rose-500",
        badge: "border-rose-200/80 bg-rose-50 text-rose-900",
        headline: "text-slate-950",
      };
  }
}

export function ExecutiveSummaryPanel({
  model,
  organization,
}: {
  model: DecisionLabModel;
  organization: OrganizationRecord;
}) {
  const frame = buildDecisionFrame(organization);
  const tone = toneClasses(model.statusTone);
  const rationale = organization.recommendation.rationale || frame.summary;

  return (
    <section className={`mt-5 rounded-[2.2rem] border p-5 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.28)] ${tone.shell}`}>
      <div className="grid gap-4 xl:grid-cols-[1.22fr_0.78fr]">
        <div className="rounded-[1.8rem] border border-white/55 bg-white/74 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className={`h-1.5 w-10 rounded-full ${tone.accent}`} />
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Recommended move</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.badge}`}>
              {organization.recommendation.status}
            </span>
            <span className="inline-flex items-center rounded-full border border-black/6 bg-white/78 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              {frame.supportApproach}
            </span>
          </div>

          <h3 className={`mt-4 text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.065em] sm:text-[3.2rem] ${tone.headline}`}>
            {frame.headline}
          </h3>
          <p className="mt-4 max-w-3xl text-[15px] leading-[1.7] text-slate-600">{rationale}</p>
          <p className="mt-5 rounded-[1.3rem] border border-black/6 bg-[rgba(246,241,232,0.82)] px-4 py-3 text-sm leading-relaxed text-slate-700">
            {frame.supportApproachDetail}
          </p>
        </div>

        <div className="grid gap-4">
          <ExecutiveFactCard label="Type of support" value={organization.recommendation.interventionType} detail={organization.decisionReason} />
          <ExecutiveFactCard label="How sure we are" value={organization.confidenceTier} detail={organization.confidenceNote} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NarrativeCard
          title="Why it showed up"
          body={organization.whySurfaced}
          toneDot={tone.accent}
        />
        <BulletCard
          title="Why this call holds"
          bullets={frame.supportPoints}
          bulletTone="bg-[#47695c]"
        />
        <BulletCard
          title="What to check next"
          bullets={[...frame.strengthenPoints, ...organization.recommendation.caveats].slice(0, 3)}
          bulletTone="bg-[#8b6f45]"
        />
        <BulletCard
          title="What would change our view"
          bullets={frame.changePoints}
          bulletTone="bg-[#7a5549]"
        />
      </div>
    </section>
  );
}

function ExecutiveFactCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.7rem] border border-black/6 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-[1.65rem] font-semibold leading-none tracking-[-0.05em] text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{detail}</p>
    </div>
  );
}

function NarrativeCard({
  title,
  body,
  toneDot,
}: {
  title: string;
  body: string;
  toneDot: string;
}) {
  return (
    <div className="rounded-[1.7rem] border border-black/6 bg-white/78 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${toneDot}`} />
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{title}</p>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">{body}</p>
    </div>
  );
}

function BulletCard({
  title,
  bullets,
  bulletTone,
}: {
  title: string;
  bullets: string[];
  bulletTone: string;
}) {
  return (
    <div className="rounded-[1.7rem] border border-black/6 bg-white/78 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <ul className="mt-4 space-y-3">
        {bullets.slice(0, 3).map((bullet) => (
          <li key={bullet} className="flex gap-3 text-sm leading-relaxed text-slate-700">
            <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${bulletTone}`} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
