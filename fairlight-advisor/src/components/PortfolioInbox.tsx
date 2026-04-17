import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { OrganizationCard } from "./OrganizationCard";
import type { OrganizationRecord } from "../types";

type BucketTab = "uab" | "rcr" | "all";
type AllCasesChip = "all" | "wff" | "ndd";

const SORT_OPTIONS = [
  { value: "northstar-desc", label: "Score high-low" },
  { value: "northstar-asc", label: "Score low-high" },
  { value: "name-asc", label: "Name A-Z" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];
type ToolbarKey = "size-bucket" | "sort" | "state" | "bucket-filter" | null;

const REVENUE_BUCKET_LABELS: Record<string, string> = {
  All: "All ranges",
  "<500K": "$250K–$500K",
  "500K-2M": "$500K–$2M",
  "2M-10M": "$2M–$10M",
  ">10M": "$10M–$100M",
};
const REVENUE_BUCKET_ORDER = ["All", "<500K", "500K-2M", "2M-10M", ">10M"] as const;

const TAB_CONFIGS: Array<{
  id: BucketTab;
  label: string;
  description: string;
}> = [
  {
    id: "uab",
    label: "Portfolio Growth",
    description: "Underinvested asset bases — investment management pitch",
  },
  {
    id: "rcr",
    label: "Strategic Advisory",
    description: "Revenue concentration risk — diversification advisory pitch",
  },
  {
    id: "all",
    label: "Active Review",
    description: "Full shortlist including WFF and NDD cases",
  },
];

export function PortfolioInbox({
  layoutMode,
  onSearchQueryChange,
  onSelectOrganization,
  onSizeBucketFilterChange,
  onSortOptionChange,
  onStateFilterChange,
  organizations,
  searchQuery,
  selectedId,
  sizeBucketFilter,
  sizeBucketOptions,
  sortOption,
  stateFilter,
  stateOptions,
}: {
  layoutMode: "gallery" | "rail";
  onSearchQueryChange: (value: string) => void;
  onSelectOrganization: (organization: OrganizationRecord) => void;
  onSizeBucketFilterChange: (value: string) => void;
  onSortOptionChange: (value: SortOption) => void;
  onStateFilterChange: (value: string) => void;
  organizations: OrganizationRecord[];
  searchQuery: string;
  selectedId: string | null;
  sizeBucketFilter: string;
  sizeBucketOptions: string[];
  sortOption: SortOption;
  stateFilter: string;
  stateOptions: string[];
}) {
  const isGallery = layoutMode === "gallery";
  const [bucketTab, setBucketTab] = useState<BucketTab>("uab");
  const [allCasesChip, setAllCasesChip] = useState<AllCasesChip>("all");
  const [openToolbarKey, setOpenToolbarKey] = useState<ToolbarKey>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const tabFilteredOrganizations = useMemo(() => {
    if (bucketTab === "uab") {
      return organizations.filter((organization) => organization.actionLabel === "Underinvested Asset Base");
    }
    if (bucketTab === "rcr") {
      return organizations.filter((organization) => organization.actionLabel === "Revenue Concentration Risk");
    }
    if (allCasesChip === "wff") {
      return organizations.filter((organization) => organization.actionLabel === "Weak Financial Foundation");
    }
    if (allCasesChip === "ndd") {
      return organizations.filter((organization) => organization.actionLabel === "Needs Data Diligence");
    }
    return organizations;
  }, [organizations, bucketTab, allCasesChip]);

  const displayedOrganizations = isGallery
    ? tabFilteredOrganizations
    : [
        ...tabFilteredOrganizations.filter((organization) => organization.id === selectedId),
        ...tabFilteredOrganizations.filter((organization) => organization.id !== selectedId).slice(0, 5),
      ];

  const hiddenCount = Math.max(0, tabFilteredOrganizations.length - displayedOrganizations.length);
  const showBucketBadge = bucketTab === "all";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenToolbarKey(null);
      }
    }

    if (openToolbarKey) {
      window.addEventListener("mousedown", handlePointerDown);
    }

    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [openToolbarKey]);

  const sizeOptions = useMemo(
    () => REVENUE_BUCKET_ORDER.filter((value) => value === "All" || sizeBucketOptions.includes(value)),
    [sizeBucketOptions],
  );
  const stateFilterOptions = useMemo(() => ["All", ...stateOptions], [stateOptions]);

  const uabCount = organizations.filter((organization) => organization.actionLabel === "Underinvested Asset Base").length;
  const rcrCount = organizations.filter((organization) => organization.actionLabel === "Revenue Concentration Risk").length;

  return (
    <section className="w-full rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.72)] p-2 shadow-[0_34px_94px_-56px_rgba(15,23,42,0.28)]">
      <div className="rounded-[calc(2.8rem-0.5rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(251,248,242,0.86))] px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:px-6">
        <h2 className="sr-only">Portfolio Inbox</h2>

        <div className="space-y-5 border-b border-black/6 pb-5">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-black/6 bg-[rgba(246,241,232,0.9)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
              Portfolio Inbox
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <h2
                className={`font-semibold tracking-[-0.052em] text-slate-950 ${
                  isGallery ? "text-4xl md:text-5xl" : "text-3xl"
                }`}
              >
                Cases for Review
              </h2>
              <div className="inline-flex items-center rounded-full border border-black/6 bg-[rgba(246,241,232,0.82)] px-4 py-2 text-sm font-medium tracking-[-0.02em] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                {tabFilteredOrganizations.length} cases
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TAB_CONFIGS.map((tab) => {
              const count = tab.id === "uab" ? uabCount : tab.id === "rcr" ? rcrCount : organizations.length;
              const active = bucketTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBucketTab(tab.id)}
                  title={tab.description}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-semibold tracking-[-0.01em] transition-colors duration-150 ${
                    active
                      ? "border-[#30483e]/16 bg-[#30483e] text-[#faf6ee] shadow-sm"
                      : "border-black/8 bg-white/80 text-slate-600 hover:border-black/12 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      active
                        ? "bg-white/16 text-[#d4ead9]"
                        : "bg-[rgba(246,241,232,0.9)] text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            ref={toolbarRef}
            className={`grid gap-3 ${
              bucketTab === "all"
                ? isGallery
                  ? "xl:grid-cols-[minmax(0,1fr)_repeat(4,minmax(160px,0.32fr))]"
                  : "md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_repeat(4,minmax(150px,0.3fr))]"
                : isGallery
                  ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.42fr)_repeat(2,minmax(170px,0.31fr))]"
                  : "md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(220px,0.42fr)_repeat(2,minmax(160px,0.3fr))]"
            }`}
          >
            <label className="flex items-center gap-3 rounded-[1.7rem] border border-black/6 bg-white/88 px-4 py-3 text-sm text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <MagnifyingGlass size={18} weight="bold" />
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search by name, state, or note"
                className="w-full border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>

            {bucketTab === "all" ? (
              <DropdownPill
                buttonLabel="Bucket"
                value={allCasesChip === "all" ? "All" : allCasesChip === "wff" ? "Financial Infra" : "Needs Diligence"}
                open={openToolbarKey === "bucket-filter"}
                onToggle={() => setOpenToolbarKey((current) => (current === "bucket-filter" ? null : "bucket-filter"))}
                onSelect={(value) => {
                  setAllCasesChip(value as AllCasesChip);
                  setOpenToolbarKey(null);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "wff", label: "Financial Infra" },
                  { value: "ndd", label: "Needs Diligence" },
                ]}
              />
            ) : null}

            <DropdownPill
              buttonLabel="Revenue Bucket"
              value={revenueBucketLabel(sizeBucketFilter === "All" ? "All" : sizeBucketFilter)}
              open={openToolbarKey === "size-bucket"}
              onToggle={() => setOpenToolbarKey((current) => (current === "size-bucket" ? null : "size-bucket"))}
              onSelect={(value) => {
                onSizeBucketFilterChange(value);
                setOpenToolbarKey(null);
              }}
              options={sizeOptions.map((value) => ({ value, label: revenueBucketLabel(value) }))}
            />

            <DropdownPill
              buttonLabel="Sort"
              value={shortSortLabel(sortOption)}
              open={openToolbarKey === "sort"}
              onToggle={() => setOpenToolbarKey((current) => (current === "sort" ? null : "sort"))}
              onSelect={(value) => {
                onSortOptionChange(value as SortOption);
                setOpenToolbarKey(null);
              }}
              options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />

            <DropdownPill
              buttonLabel="State"
              value={stateFilter === "All" ? "All" : stateFilter}
              open={openToolbarKey === "state"}
              onToggle={() => setOpenToolbarKey((current) => (current === "state" ? null : "state"))}
              onSelect={(value) => {
                onStateFilterChange(value);
                setOpenToolbarKey(null);
              }}
              options={stateFilterOptions.map((value) => ({ value, label: value }))}
            />
          </div>

          {!isGallery && hiddenCount > 0 ? (
            <p className="text-xs leading-relaxed text-slate-500">
              {displayedOrganizations.length} shown · {hiddenCount} more match this view.
            </p>
          ) : null}
        </div>

        <div className="mt-5 pr-1">
          {displayedOrganizations.length ? (
            <div className="grid gap-4">
              {displayedOrganizations.map((organization) => (
                <div key={organization.id}>
                  <OrganizationCard
                    organization={organization}
                    isSelected={organization.id === selectedId}
                    layoutMode={layoutMode}
                    onSelect={onSelectOrganization}
                    showBucketBadge={showBucketBadge}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[20rem] items-center justify-center rounded-[2rem] border border-dashed border-black/10 bg-white/75 px-6 text-center text-sm leading-relaxed text-slate-500">
              No cases match these controls. Adjust the search or filters to bring the shortlist back into view.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DropdownPill({
  buttonLabel,
  onSelect,
  onToggle,
  open,
  options,
  value,
}: {
  buttonLabel: string;
  onSelect: (value: string) => void;
  onToggle: () => void;
  open: boolean;
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`${buttonLabel}: ${value}`}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-[1.7rem] border border-black/6 bg-white/90 px-4 py-3 text-left shadow-[0_18px_44px_-32px_rgba(15,23,42,0.18)] transition-[border-color,box-shadow,background-color] duration-200 ease-out hover:border-black/10 hover:shadow-[0_20px_48px_-34px_rgba(15,23,42,0.2)]"
      >
        <div>
          <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
            {buttonLabel}
          </p>
          <p className="mt-1 text-sm font-medium tracking-[-0.02em] text-slate-800">{value}</p>
        </div>
        <CaretDown
          size={16}
          weight="bold"
          className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.75rem)] z-20 w-full min-w-[14rem] rounded-[1.8rem] border border-black/6 bg-[rgba(255,253,248,0.98)] p-3 shadow-[0_28px_72px_-40px_rgba(15,23,42,0.26)]">
          <div className="grid gap-2">
            {options.map((option) => (
              <DropdownOption
                key={option.value}
                label={option.label}
                selected={option.label === value || option.value === value}
                onClick={() => onSelect(option.value)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DropdownOption({
  label,
  onClick,
  selected,
}: {
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-[1.25rem] border px-3 py-3 text-left transition-[background-color,border-color,color] duration-150 ease-out ${
        selected
          ? "border-[#30483e]/16 bg-[#30483e] text-[#faf6ee] shadow-[0_20px_40px_-28px_rgba(48,72,62,0.45)]"
          : "border-black/6 bg-white/88 text-slate-700 hover:border-black/10 hover:bg-[rgba(246,241,232,0.68)]"
      }`}
    >
      <span className="text-sm font-medium tracking-[-0.02em]">{label}</span>
      <span
        className={`h-2.5 w-2.5 rounded-full ${selected ? "bg-[#faf6ee]" : "border border-slate-300 bg-transparent"}`}
      />
    </button>
  );
}

function shortSortLabel(sortOption: SortOption) {
  if (sortOption === "northstar-asc") return "Score low-high";
  if (sortOption === "name-asc") return "Name A-Z";
  return "Score high-low";
}

function revenueBucketLabel(value: string) {
  return REVENUE_BUCKET_LABELS[value] ?? value;
}
