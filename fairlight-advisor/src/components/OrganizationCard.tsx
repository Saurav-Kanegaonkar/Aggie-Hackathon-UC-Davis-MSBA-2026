import { ArrowUpRight } from "@phosphor-icons/react";

import { SoftActionButton } from "./SoftActionButton";
import { getInboxCopy } from "../lib/advisorLanguage";
import type { OrganizationRecord } from "../types";

export function OrganizationCard({
  isSelected,
  layoutMode,
  onSelect,
  organization,
}: {
  isSelected: boolean;
  layoutMode: "gallery" | "rail";
  onSelect: (organization: OrganizationRecord) => void;
  organization: OrganizationRecord;
}) {
  const isGallery = layoutMode === "gallery";
  const inboxCopy = getInboxCopy(organization);
  const scoreTone = getScoreTone(inboxCopy.northstarScore);

  return (
    <article
      className={`cursor-pointer rounded-[2.15rem] border border-black/6 bg-[rgba(255,252,246,0.88)] p-1.5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.18)] ${
        isSelected ? "shadow-[0_28px_60px_-36px_rgba(48,72,62,0.24)]" : ""
      }`}
    >
      <div
        className={`rounded-[calc(2.15rem-0.4rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.92))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] ${
          isSelected ? "ring-1 ring-[#30483e]/12" : ""
        }`}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.18fr)_repeat(4,minmax(112px,0.64fr))_minmax(150px,0.78fr)_minmax(156px,0.88fr)]">
          <div className="min-w-0 space-y-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
                {organization.state} portfolio
              </p>
              <h3 className={`mt-2 max-w-[32rem] text-slate-950 ${isGallery ? "text-[1.62rem]" : "text-[1.46rem]"} font-semibold leading-[1.06] tracking-[-0.04em]`}>
                {inboxCopy.displayName}
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  FY{organization.fiscalYear}
                </span>
              </div>
            </div>
          </div>

          <MetricColumn
            label="Revenue"
            value={inboxCopy.revenueLabel}
            description="Most recent yearly revenue reported in the filing."
          />
          <MetricColumn
            label="Operating margin"
            value={inboxCopy.operatingMarginLabel}
            description="Operating surplus or deficit as a share of revenue. Positive is healthier."
          />
          <MetricColumn
            label="Revenue mix"
            value={formatRevenueMix(organization.revenueDiversificationIndex)}
            description="How spread out revenue is across sources. Higher means less dependence on a single stream."
          />
          <MetricColumn
            label="Risk next year"
            value={inboxCopy.riskLine}
            description="Chance this organization falls into financial stress next year."
          />
          <MetricColumn
            label="Northstar Score"
            value={`${inboxCopy.northstarScore}`}
            description="Composite fundability score built from next-year risk, operating margin, revenue mix, and evidence quality. Higher is better."
            tone={scoreTone}
          />

          <div className="flex h-[5.5rem] items-center justify-center self-start xl:justify-center">
            <SoftActionButton
              aria-label={`Open X-Ray for ${organization.orgName}`}
              className="min-w-[11rem] cursor-pointer"
              motionMode="still"
              onClick={() => onSelect(organization)}
            >
              Open X-Ray
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/16 text-current">
                <ArrowUpRight size={15} weight="bold" />
              </span>
            </SoftActionButton>
          </div>
        </div>

        <div className="mt-3 rounded-[1.7rem] border border-black/6 bg-white/82 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px] md:items-center">
            <div className="max-w-[48rem]">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Advisory note</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{inboxCopy.whyNow}</p>
            </div>
            <div className="rounded-[1.35rem] border border-black/6 bg-[rgba(246,241,232,0.9)] px-4 py-3 text-sm text-slate-700">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Action</p>
              <p className="mt-1 font-medium tracking-[-0.02em] text-slate-900">{organization.actionLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function MetricColumn({
  description,
  label,
  tone = "default",
  value,
}: {
  description: string;
  label: string;
  tone?: "default" | "score-good" | "score-mid" | "score-low";
  value: string;
}) {
  const toneClasses =
    tone === "score-good"
      ? {
          panel: "border-emerald-900/10 bg-[rgba(231,243,237,0.96)] shadow-[0_20px_44px_-34px_rgba(48,72,62,0.26),inset_0_1px_0_rgba(255,255,255,0.84)]",
          label: "text-[#46695b]",
          value: "text-[#1f392f]",
        }
      : tone === "score-mid"
        ? {
            panel: "border-amber-900/10 bg-[rgba(247,239,221,0.96)] shadow-[0_20px_44px_-34px_rgba(136,100,43,0.22),inset_0_1px_0_rgba(255,255,255,0.84)]",
            label: "text-[#8c6b2f]",
            value: "text-[#5e4718]",
          }
        : tone === "score-low"
          ? {
              panel: "border-rose-900/10 bg-[rgba(245,232,229,0.96)] shadow-[0_20px_44px_-34px_rgba(143,83,75,0.22),inset_0_1px_0_rgba(255,255,255,0.84)]",
              label: "text-[#99625c]",
              value: "text-[#6a3732]",
            }
          : {
              panel: "border-black/6 bg-white/84",
              label: "text-slate-500",
              value: "text-slate-950",
            };

  return (
    <div
      className={`group relative flex h-[5.5rem] flex-col items-center justify-center rounded-[1.55rem] border px-3 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${
        toneClasses.panel
      }`}
      tabIndex={0}
      aria-label={`${label}: ${value}. ${description}`}
    >
      <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${toneClasses.label}`}>{label}</p>
      <p className={`mt-2 leading-none ${toneClasses.value} ${tone.startsWith("score-") ? "text-[1.8rem] font-semibold tracking-[-0.05em]" : "text-[1.1rem] font-medium tracking-[-0.03em]"}`}>
        {value}
      </p>
      <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.55rem)] z-10 w-[13rem] -translate-x-1/2 rounded-[1rem] border border-black/6 bg-[rgba(21,28,35,0.94)] px-3 py-2 text-[12px] leading-[1.35] text-white opacity-0 shadow-[0_22px_42px_-24px_rgba(15,23,42,0.5)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        {description}
      </div>
    </div>
  );
}

function getScoreTone(score: number): "score-good" | "score-mid" | "score-low" {
  if (score >= 75) {
    return "score-good";
  }
  if (score >= 45) {
    return "score-mid";
  }
  return "score-low";
}

function formatRevenueMix(value: number) {
  return value.toFixed(2);
}
