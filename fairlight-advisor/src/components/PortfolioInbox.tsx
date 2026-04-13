import { CaretDown, FunnelSimple, MagnifyingGlass, Rows, SlidersHorizontal, SquaresFour } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { OrganizationCard } from "./OrganizationCard";
import type { OrganizationRecord } from "../types";

const ACTION_OPTIONS = ["All", "Stabilize", "Deep Review", "Diversify", "Amplify"];
const SORT_OPTIONS = [
  { value: "northstar-desc", label: "Northstar score: high to low" },
  { value: "northstar-asc", label: "Northstar score: low to high" },
  { value: "name-asc", label: "Name: A to Z" },
] as const;

export function PortfolioInbox({
  actionFilter,
  layoutMode,
  onActionFilterChange,
  onSearchQueryChange,
  onSortOptionChange,
  onSelectOrganization,
  organizations,
  searchQuery,
  selectedId,
  sortOption,
}: {
  actionFilter: string;
  layoutMode: "gallery" | "rail";
  onActionFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSortOptionChange: (value: "northstar-desc" | "northstar-asc" | "name-asc") => void;
  onSelectOrganization: (organization: OrganizationRecord) => void;
  organizations: OrganizationRecord[];
  searchQuery: string;
  selectedId: string | null;
  sortOption: "northstar-desc" | "northstar-asc" | "name-asc";
}) {
  const isGallery = layoutMode === "gallery";
  const [refineOpen, setRefineOpen] = useState(false);
  const refineRef = useRef<HTMLDivElement | null>(null);
  const displayedOrganizations = isGallery
    ? organizations
    : [
        ...organizations.filter((organization) => organization.id === selectedId),
        ...organizations.filter((organization) => organization.id !== selectedId).slice(0, 5),
      ];
  const hiddenCount = Math.max(0, organizations.length - displayedOrganizations.length);
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortOption)?.label ?? "Northstar score: high to low";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!refineRef.current?.contains(event.target as Node)) {
        setRefineOpen(false);
      }
    }

    if (refineOpen) {
      window.addEventListener("mousedown", handlePointerDown);
    }

    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [refineOpen]);

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
                  {isGallery ? "Cases to Review" : "Portfolio view"}
                </h2>
              </div>
            </div>

            <div className={`grid gap-3 ${isGallery ? "self-end md:grid-cols-3" : "md:grid-cols-3"}`}>
              <MetaChip label="Showing" value={String(organizations.length)} />
              <MetaChip label="Sort" value={shortSortLabel(sortOption)} />
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

            <div ref={refineRef} className="relative">
              <button
                type="button"
                onClick={() => setRefineOpen((current) => !current)}
                className="flex w-full min-w-[21rem] items-center justify-between gap-4 rounded-[1.7rem] border border-black/6 bg-white/90 px-4 py-3 text-left shadow-[0_18px_44px_-32px_rgba(15,23,42,0.18)] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-[1px] hover:shadow-[0_24px_52px_-34px_rgba(15,23,42,0.22)]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] p-2 text-[var(--northstar-accent)]">
                    <SlidersHorizontal size={15} weight="bold" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Refine</p>
                    <p className="mt-1 text-sm font-medium tracking-[-0.02em] text-slate-800">
                      {actionFilter === "All" ? "All cases" : actionFilter} · {sortLabel}
                    </p>
                  </div>
                </div>
                <CaretDown
                  size={16}
                  weight="bold"
                  className={`shrink-0 text-slate-500 transition-transform duration-500 ${refineOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {refineOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 120, damping: 18 }}
                    className="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-full min-w-[21rem] rounded-[2rem] border border-black/6 bg-[rgba(255,253,248,0.96)] p-4 shadow-[0_28px_72px_-40px_rgba(15,23,42,0.26)]"
                  >
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Action</p>
                        <div className="grid gap-2">
                          {ACTION_OPTIONS.map((option) => {
                            const selected = option === actionFilter;

                            return (
                              <DropdownOption
                                key={option}
                                label={option === "All" ? "All cases" : option}
                                selected={selected}
                                onClick={() => {
                                  onActionFilterChange(option);
                                  setRefineOpen(false);
                                }}
                                icon={<FunnelSimple size={12} weight={selected ? "fill" : "bold"} />}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Sort</p>
                        <div className="grid gap-2">
                          {SORT_OPTIONS.map((option) => (
                            <DropdownOption
                              key={option.value}
                              label={option.label}
                              selected={option.value === sortOption}
                              onClick={() => {
                                onSortOptionChange(option.value);
                                setRefineOpen(false);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
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
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-medium tracking-[-0.03em] text-slate-800">{value}</p>
    </div>
  );
}

function DropdownOption({
  icon,
  label,
  onClick,
  selected,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-[1.25rem] border px-3 py-3 text-left transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        selected
          ? "border-[#30483e]/16 bg-[#30483e] text-[#faf6ee] shadow-[0_20px_40px_-28px_rgba(48,72,62,0.45)]"
          : "border-black/6 bg-white/88 text-slate-700 hover:border-black/10 hover:bg-[rgba(246,241,232,0.68)]"
      }`}
    >
      <span className="inline-flex items-center gap-2 text-sm font-medium tracking-[-0.02em]">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        {label}
      </span>
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          selected ? "bg-[#faf6ee]" : "border border-slate-300 bg-transparent"
        }`}
      />
    </button>
  );
}

function shortSortLabel(sortOption: "northstar-desc" | "northstar-asc" | "name-asc") {
  if (sortOption === "northstar-asc") {
    return "Score low-high";
  }

  if (sortOption === "name-asc") {
    return "Name A-Z";
  }

  return "Score high-low";
}
