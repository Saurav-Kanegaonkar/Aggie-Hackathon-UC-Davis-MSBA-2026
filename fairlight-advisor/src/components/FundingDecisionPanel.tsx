import { CheckCircle, Copy, SealCheck, X } from "@phosphor-icons/react";
import { useState } from "react";

import { SoftActionButton } from "./SoftActionButton";
import { formatOrganizationName, getFundingDecisionCopy } from "../lib/advisorLanguage";
import type { OrganizationRecord } from "../types";

export function FundingDecisionPanel({
  onClose,
  organization,
}: {
  onClose: () => void;
  organization: OrganizationRecord;
}) {
  const [copied, setCopied] = useState(false);
  const copy = getFundingDecisionCopy(organization);

  const handleCopySummary = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(copy.oneLineExport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(245,241,232,0.5)] p-4 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <section className="relative z-[1] w-full max-w-[1080px] rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.94)] p-2 shadow-[0_34px_94px_-40px_rgba(15,23,42,0.22)]">
        <div className="rounded-[calc(2.8rem-0.5rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.92))] px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/6 pb-5">
            <div className="space-y-3">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">Funding Decision</h2>
              <h3 className="text-4xl font-semibold tracking-[-0.07em] text-slate-950 md:text-5xl">Recommended next move</h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98]"
            >
              <X size={14} weight="bold" />
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <div className="grid gap-4">
              <div className="rounded-[2rem] border border-black/6 bg-[rgba(246,241,232,0.92)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-[#36574a]/10 bg-[#e6eee9] p-3 text-[#36574a]">
                    <SealCheck size={20} weight="duotone" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Active file</p>
                    <p className="mt-1 text-lg font-medium tracking-[-0.03em] text-slate-950">{formatOrganizationName(organization.orgName)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">{copy.boardSummary}</p>
              </div>

              <DecisionBlock label="Decision" value={copy.recommendationLabel} />
              <DecisionBlock label="Support type" value={copy.supportType} />
            </div>

            <div className="grid gap-4">
              <DecisionBlock label="Why" value={copy.rationale} />
              <DecisionList label="Watchouts" values={copy.caveats} />
              <div className="rounded-[2rem] border border-black/6 bg-white/88 p-5 shadow-[0_24px_56px_-44px_rgba(15,23,42,0.18)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Export summary</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">{copy.exportTitle}</h3>
                  </div>
                  <SoftActionButton variant="secondary" onClick={() => void handleCopySummary()}>
                    {copied ? <CheckCircle size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                    {copied ? "Copied" : "Copy summary"}
                  </SoftActionButton>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">{copy.oneLineExport}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DecisionBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.9rem] border border-black/6 bg-white/86 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-3 text-base leading-relaxed text-slate-900">{value}</p>
    </div>
  );
}

function DecisionList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-[1.9rem] border border-black/6 bg-white/86 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
        {values.map((value) => (
          <li key={value} className="border-t border-black/6 pt-3 first:border-t-0 first:pt-0">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}
