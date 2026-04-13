import { ArrowUpRight } from "@phosphor-icons/react";
import { motion } from "framer-motion";

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

  return (
    <motion.article
      layout
      layoutId={`organization-shell-${organization.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.002 }}
      className={`rounded-[2.15rem] border border-black/6 bg-[rgba(255,252,246,0.88)] p-1.5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.18)] ${
        isSelected ? "shadow-[0_28px_60px_-36px_rgba(48,72,62,0.24)]" : ""
      }`}
    >
      <div
        className={`rounded-[calc(2.15rem-0.4rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.92))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] ${
          isSelected ? "ring-1 ring-[#30483e]/12" : ""
        }`}
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.35fr)_repeat(5,minmax(114px,0.78fr))_minmax(156px,0.88fr)]">
          <div className="min-w-0 space-y-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
                {organization.state} portfolio
              </p>
              <h3 className={`mt-2 max-w-[34rem] text-slate-950 ${isGallery ? "text-[1.65rem]" : "text-[1.5rem]"} font-semibold leading-[1.08] tracking-[-0.035em]`}>
                {inboxCopy.displayName}
              </h3>
              <div className="mt-3 inline-flex rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                FY{organization.fiscalYear}
              </div>
            </div>
          </div>

          <MetricColumn
            label="Revenue"
            value={inboxCopy.revenueLabel}
            description="Most recent yearly revenue reported in the filing."
            detail=""
            align="center"
          />
          <MetricColumn
            label="Risk next year"
            value={inboxCopy.riskLine}
            description="Chance this organization falls into financial stress next year."
            detail=""
            align="center"
          />
          <MetricColumn
            label="Confidence"
            value={inboxCopy.confidenceLine}
            description="How dependable this read looks based on the available filing data."
            detail=""
            align="center"
          />
          <MetricColumn
            label="Stability index"
            value={`${inboxCopy.stabilityIndex}`}
            description="Blended read of operating results, cash room, and funding mix."
            detail=""
            align="center"
            emphasize
          />
          <MetricColumn
            label="Northstar score"
            value={`${inboxCopy.northstarScore}`}
            description="Northstar's overall strength score. Higher is better."
            detail=""
            align="center"
            emphasize
            tone="score"
          />

          <div className="flex self-center xl:justify-center">
            <SoftActionButton
              aria-label={`Open X-Ray for ${organization.orgName}`}
              className="w-full min-w-[9rem]"
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
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Advisor note</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{inboxCopy.whyNow}</p>
            </div>
            <div className="rounded-[1.35rem] border border-black/6 bg-[rgba(246,241,232,0.9)] px-4 py-3 text-sm text-slate-700">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Next step</p>
              <p className="mt-1 font-medium tracking-[-0.02em] text-slate-900">{inboxCopy.nextMove}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function MetricColumn({
  align = "start",
  description,
  detail,
  emphasize = false,
  label,
  tone = "default",
  value,
}: {
  align?: "start" | "center";
  description: string;
  detail: string;
  emphasize?: boolean;
  label: string;
  tone?: "default" | "score";
  value: string;
}) {
  return (
    <div
      className={`group relative flex h-[9.1rem] flex-col items-center rounded-[1.7rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${
        tone === "score"
          ? "justify-center border-[#30483e]/16 bg-[rgba(232,241,236,0.96)] shadow-[0_20px_44px_-34px_rgba(48,72,62,0.26),inset_0_1px_0_rgba(255,255,255,0.84)]"
          : "justify-center border-black/6 bg-white/84"
      } ${align === "center" ? "text-center" : ""}`}
      tabIndex={0}
    >
      <p className={`text-[11px] font-medium uppercase tracking-[0.12em] ${tone === "score" ? "text-[#36574a]" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-2 leading-tight ${tone === "score" ? "text-[#1c3128]" : "text-slate-950"} ${emphasize ? "text-[1.85rem] font-semibold tracking-[-0.05em]" : "text-[1.1rem] font-medium tracking-[-0.03em]"}`}>
        {value}
      </p>
      {detail ? <p className={`mt-auto text-[13px] leading-snug ${tone === "score" ? "text-[#456457]" : "text-slate-600"}`}>{detail}</p> : null}
      <div className="pointer-events-none absolute top-[calc(100%+0.7rem)] left-1/2 z-10 w-[13rem] -translate-x-1/2 rounded-[1rem] border border-black/6 bg-[rgba(21,28,35,0.94)] px-3 py-2 text-[12px] leading-[1.35] text-white opacity-0 shadow-[0_22px_42px_-24px_rgba(15,23,42,0.5)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        {description}
      </div>
    </div>
  );
}
