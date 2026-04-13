import { FunnelSimple, MagnifyingGlass, Rows, SquaresFour } from "@phosphor-icons/react";
import { motion } from "framer-motion";

import { OrganizationCard } from "./OrganizationCard";
import type { OrganizationRecord } from "../types";

const ACTION_OPTIONS = ["All", "Stabilize", "Deep Review", "Diversify", "Amplify"];

export function PortfolioInbox({
  actionFilter,
  layoutMode,
  onActionFilterChange,
  onSearchQueryChange,
  onSelectOrganization,
  organizations,
  searchQuery,
  selectedId,
}: {
  actionFilter: string;
  layoutMode: "gallery" | "rail";
  onActionFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectOrganization: (organization: OrganizationRecord) => void;
  organizations: OrganizationRecord[];
  searchQuery: string;
  selectedId: string | null;
}) {
  const isGallery = layoutMode === "gallery";
  const displayedOrganizations = isGallery
    ? organizations
    : [
        ...organizations.filter((organization) => organization.id === selectedId),
        ...organizations.filter((organization) => organization.id !== selectedId).slice(0, 5),
      ];
  const hiddenCount = Math.max(0, organizations.length - displayedOrganizations.length);

  return (
    <motion.section
      layout
      className={`flex min-h-0 flex-1 flex-col rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.72)] p-2 shadow-[0_34px_94px_-56px_rgba(15,23,42,0.28)] ${
        isGallery ? "lg:min-h-[calc(100dvh-11.5rem)]" : "h-full"
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-[calc(2.8rem-0.5rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(251,248,242,0.84))] px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:px-6">
        <h2 className="sr-only">Portfolio Inbox</h2>
        <div className="space-y-5 border-b border-black/6 pb-5">
          <div className={`grid gap-4 ${isGallery ? "xl:grid-cols-[1.04fr_0.96fr]" : ""}`}>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(246,241,232,0.9)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
                {isGallery ? <SquaresFour size={14} weight="bold" /> : <Rows size={14} weight="bold" />}
                Portfolio Inbox
              </div>
              <div className="space-y-2">
                <h2 className={`font-semibold tracking-[-0.06em] text-slate-950 ${isGallery ? "text-4xl md:text-5xl" : "text-3xl"}`}>
                  {isGallery ? "Cases to review" : "Portfolio view"}
                </h2>
              </div>
            </div>

            <div className={`grid gap-3 ${isGallery ? "self-end md:grid-cols-3" : "md:grid-cols-3"}`}>
              <MetaChip label="Showing" value={String(organizations.length)} />
              <MetaChip label="Filter" value={actionFilter} />
              <MetaChip label="States" value={[...new Set(organizations.map((organization) => organization.state))].join(", ")} />
            </div>
          </div>

          <div className={`grid gap-3 ${isGallery ? "xl:grid-cols-[minmax(0,1fr)_auto]" : ""}`}>
            <label className="flex items-center gap-3 rounded-[1.7rem] border border-black/6 bg-white/88 px-4 py-3 text-sm text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <MagnifyingGlass size={18} weight="bold" />
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search by name, state, or note"
                className="w-full border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>

            <div className="flex flex-wrap gap-2 rounded-[1.7rem] border border-black/6 bg-white/88 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              {ACTION_OPTIONS.map((option) => {
                const selected = option === actionFilter;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onActionFilterChange(option)}
                    className={`relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-[background-color,color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${
                      selected ? "text-[#faf6ee]" : "text-slate-500 hover:bg-black/[0.045] hover:text-slate-700"
                    }`}
                  >
                    {selected ? (
                      <motion.span
                        layoutId="portfolio-filter-pill"
                        className="absolute inset-0 rounded-full bg-[#30483e] shadow-[0_20px_36px_-26px_rgba(48,72,62,0.52)]"
                        transition={{ type: "spring", stiffness: 140, damping: 18 }}
                      />
                    ) : null}
                    <span className="relative z-[1] inline-flex items-center gap-2">
                      <FunnelSimple size={12} weight={selected ? "fill" : "bold"} />
                    <span className="relative z-[1]">{option}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {!isGallery && hiddenCount > 0 ? (
            <p className="text-xs leading-relaxed text-slate-500">{displayedOrganizations.length} shown • {hiddenCount} more match this filter.</p>
          ) : null}
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          {displayedOrganizations.length ? (
            <div className="grid gap-4">
              {displayedOrganizations.map((organization) => (
                <div key={organization.id}>
                  <OrganizationCard
                    organization={organization}
                    isSelected={organization.id === selectedId}
                    layoutMode={layoutMode}
                    onSelect={onSelectOrganization}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[20rem] items-center justify-center rounded-[2rem] border border-dashed border-black/10 bg-white/75 px-6 text-center text-sm leading-relaxed text-slate-500">
              No cases match this lens right now. Adjust the search or action filter to bring the portfolio back into view.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.7rem] border border-black/6 bg-white/86 px-4 py-4 text-center shadow-[0_20px_44px_-34px_rgba(15,23,42,0.18)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-base font-medium tracking-[-0.03em] text-slate-800">{value}</p>
    </div>
  );
}
