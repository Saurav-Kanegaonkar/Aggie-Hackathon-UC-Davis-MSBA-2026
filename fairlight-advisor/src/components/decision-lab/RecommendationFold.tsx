import { useState } from "react";

import { buildDecisionFrame } from "../../lib/decisionLabText";
import type { OrganizationRecord } from "../../types";

export function RecommendationFold({
  organization,
}: {
  organization: OrganizationRecord;
}) {
  const [open, setOpen] = useState(false);
  const frame = buildDecisionFrame(organization);

  return (
    <section className="mt-5 rounded-[2rem] border border-black/6 bg-[rgba(248,244,236,0.72)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Decision frame</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Open this when you want the actual recommendation call and the conditions behind it.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="cursor-pointer rounded-full border border-black/6 bg-white/82 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white"
        >
          {open ? "Hide decision frame" : "Show decision frame"}
        </button>
      </div>

      {open ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[1.6rem] border border-black/6 bg-white/78 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Current recommendation</p>
            <p className="mt-3 text-[2.15rem] font-semibold tracking-[-0.05em] text-slate-950">{frame.headline}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">{frame.eyebrow}</p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{frame.summary}</p>

            <div className="mt-5 rounded-[1.35rem] border border-black/6 bg-[rgba(246,241,232,0.74)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Why this call holds</p>
              <ul className="mt-3 space-y-3">
                {frame.supportPoints.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#375246]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.6rem] border border-black/6 bg-white/78 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">What would improve the case</p>
              <ul className="mt-3 space-y-3">
                {frame.strengthenPoints.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#8b6f45]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.6rem] border border-black/6 bg-white/78 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">What would reverse the call</p>
              <ul className="mt-3 space-y-3">
                {frame.changePoints.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#7a5549]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
