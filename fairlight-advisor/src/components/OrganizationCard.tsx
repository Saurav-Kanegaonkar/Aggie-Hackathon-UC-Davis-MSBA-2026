import { ArrowUpRight, TrendDown, TrendUp } from "@phosphor-icons/react";
import { motion } from "framer-motion";

import { SoftActionButton } from "./SoftActionButton";
import { SignalChip } from "./SignalChip";
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
  const trendIsNegative = organization.trendDirection.toLowerCase().includes("declin");

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
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_minmax(180px,1fr)]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
                  {organization.state} portfolio
                </p>
                <h3 className={`mt-2 max-w-[34rem] text-slate-950 ${isGallery ? "text-[1.65rem]" : "text-[1.5rem]"} font-semibold leading-[1.08] tracking-[-0.035em]`}>
                  {inboxCopy.displayName}
                </h3>
              </div>

              <div className="rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                FY{organization.fiscalYear}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <SignalChip accentClassName="text-[#36574a]" label="action">
                {inboxCopy.nextMove}
              </SignalChip>
              <SignalChip accentClassName="text-slate-500" label="confidence">
                {inboxCopy.confidenceLine}
              </SignalChip>
            </div>
          </div>

          <MetricColumn label="Revenue" value={inboxCopy.revenueLabel} detail="Latest" align="center" />
          <MetricColumn label="Shock window" value={inboxCopy.shockWindowLabel} detail="25% source hit" align="center" />
          <MetricColumn label="Largest source" value={inboxCopy.concentrationLabel} detail="Concentration" align="center" />
          <MetricColumn label="Stability index" value={`${inboxCopy.stabilityIndex}`} detail="Derived" align="center" emphasize />

          <div className="grid self-start gap-3 rounded-[1.7rem] border border-black/6 bg-[rgba(246,241,232,0.88)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <MetricColumn label="Northstar score" value={`${inboxCopy.northstarScore}`} detail="Higher is healthier" align="center" emphasize />
            <SoftActionButton
              aria-label={`Open X-Ray for ${organization.orgName}`}
              className="w-full"
              onClick={() => onSelect(organization)}
            >
              Open X-Ray
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/16 text-current">
                <ArrowUpRight size={15} weight="bold" />
              </span>
            </SoftActionButton>
          </div>
        </div>

        <div className="mt-4 rounded-[1.7rem] border border-black/6 bg-white/82 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Why now</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm leading-relaxed text-slate-700">{inboxCopy.whyNow}</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              {trendIsNegative ? <TrendDown size={13} weight="bold" /> : <TrendUp size={13} weight="bold" />}
              {organization.trendDirection} trend
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function MetricColumn({
  align = "start",
  detail,
  emphasize = false,
  label,
  value,
}: {
  align?: "start" | "center";
  detail: string;
  emphasize?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`grid content-start self-start gap-2 rounded-[1.7rem] border border-black/6 bg-white/84 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${align === "center" ? "text-center" : ""}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`leading-tight text-slate-950 ${emphasize ? "text-[1.85rem] font-semibold tracking-[-0.05em]" : "text-base font-medium tracking-[-0.02em]"}`}>
        {value}
      </p>
      <p className="text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}
