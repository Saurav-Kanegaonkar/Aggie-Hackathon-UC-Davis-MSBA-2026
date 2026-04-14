import { Info } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DecisionLab } from "./components/DecisionLab";
import { PortfolioInbox } from "./components/PortfolioInbox";
import { PriorityPipeline } from "./components/PriorityPipeline";
import { getInboxCopy } from "./lib/advisorLanguage";
import type { AdvisorDataset, OrganizationRecord } from "./types";

type SortOption = "northstar-desc" | "northstar-asc" | "name-asc";
const SIZE_BUCKET_ORDER: Record<string, number> = {
  "<500K": 0,
  "500K-2M": 1,
  "2M-10M": 2,
  ">10M": 3,
};

export default function App() {
  const [advisorDataset, setAdvisorDataset] = useState<AdvisorDataset | null>(null);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [activeView, setActiveView] = useState<"portfolio" | "pipeline">("portfolio");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("All");
  const [sortOption, setSortOption] = useState<SortOption>("northstar-desc");
  const [sizeBucketFilter, setSizeBucketFilter] = useState<string>("All");
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    let isMounted = true;

    async function loadDataset() {
      try {
        const module = await import("./data/fairlight-advisor.json");
        if (isMounted) {
          const dataset = module.default as AdvisorDataset;
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const requestedOrganization = params.get("org");

            if (requestedOrganization === "first" && dataset.organizations[0]) {
              setSelectedId(dataset.organizations[0].id);
            } else if (requestedOrganization) {
              const matchedOrganization = dataset.organizations.find(
                (organization) => organization.id === requestedOrganization,
              );

              if (matchedOrganization) {
                setSelectedId(matchedOrganization.id);
              }
            }
          }

          setAdvisorDataset(dataset);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load dataset");
        }
      }
    }

    async function loadPipeline() {
      try {
        const mod = await import("./data/priority-pipeline.json");
        if (isMounted) setPipelineData(mod.default);
      } catch { /* pipeline data optional */ }
    }

    void loadDataset();
    void loadPipeline();

    return () => {
      isMounted = false;
    };
  }, []);

  const organizations = advisorDataset?.organizations ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedId) ?? null;
  const workspaceOpen = selectedOrganization !== null;
  const sizeBucketOptions = useMemo(
    () =>
      [...new Set(organizations.map((organization) => organization.sizeBucket))].sort(
        (left, right) => (SIZE_BUCKET_ORDER[left] ?? 99) - (SIZE_BUCKET_ORDER[right] ?? 99),
      ),
    [organizations],
  );
  const stateOptions = useMemo(
    () => [...new Set(organizations.map((organization) => organization.state))].sort((left, right) => left.localeCompare(right)),
    [organizations],
  );

  const visibleOrganizations = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return organizations
      .filter((organization) => {
        const matchesAction = actionFilter === "All" || organization.actionLabel === actionFilter;
        const matchesSizeBucket = sizeBucketFilter === "All" || organization.sizeBucket === sizeBucketFilter;
        const matchesState = stateFilter === "All" || organization.state === stateFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          organization.orgName.toLowerCase().includes(normalizedQuery) ||
          organization.state.toLowerCase().includes(normalizedQuery) ||
          organization.decisionReason.toLowerCase().includes(normalizedQuery) ||
          organization.whySurfaced.toLowerCase().includes(normalizedQuery);

        return matchesAction && matchesQuery && matchesSizeBucket && matchesState;
      })
      .sort((left, right) => {
        if (sortOption === "name-asc") {
          return left.orgName.localeCompare(right.orgName);
        }

        if (sortOption === "northstar-asc") {
          return getInboxCopy(left).northstarScore - getInboxCopy(right).northstarScore;
        }

        return getInboxCopy(right).northstarScore - getInboxCopy(left).northstarScore;
      });
  }, [actionFilter, deferredSearchQuery, organizations, sizeBucketFilter, sortOption, stateFilter]);

  const handleSelectOrganization = (organization: OrganizationRecord) => {
    startTransition(() => {
      setSelectedId(organization.id);
    });
  };

  const handleReturnToPortfolio = () => {
    startTransition(() => {
      setSelectedId(null);
    });
  };

  if (loadError) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-4 text-slate-900">
        <section className="w-full max-w-2xl rounded-[2.5rem] border border-black/6 bg-[rgba(255,253,248,0.88)] p-8 shadow-[0_36px_90px_-48px_rgba(15,23,42,0.32)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">Load error</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.07em] text-slate-950">Northstar</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
            The advisor workspace could not load its portfolio data. Refresh after regenerating the app dataset.
          </p>
          <p className="mt-6 rounded-[1.75rem] border border-rose-200/70 bg-rose-50/85 px-4 py-3 text-sm leading-relaxed text-rose-700">
            {loadError}
          </p>
        </section>
      </main>
    );
  }

  if (!advisorDataset) {
    return (
      <main className="min-h-[100dvh] px-4 py-4 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1500px] flex-col gap-5">
          <section className="rounded-[2.6rem] border border-black/6 bg-[rgba(255,253,248,0.82)] p-6 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.28)]">
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="h-8 w-36 animate-pulse rounded-full bg-white/80" />
                <div className="h-[4.8rem] w-full max-w-[26rem] animate-pulse rounded-[1.8rem] bg-white/82" />
                <div className="h-5 w-full max-w-[34rem] animate-pulse rounded-full bg-white/74" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <LoadingTile />
                <LoadingTile />
                <LoadingTile />
              </div>
            </div>
          </section>

          <section className="flex flex-1 rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.7)] p-4 shadow-[0_34px_94px_-54px_rgba(15,23,42,0.28)]">
            <div className="grid min-h-[calc(100dvh-12rem)] w-full gap-4 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className={`rounded-[2.2rem] border border-white/75 bg-white/82 p-5 shadow-[0_28px_60px_-48px_rgba(15,23,42,0.22)] ${
                    index === 0 ? "xl:col-span-2" : ""
                  }`}
                >
                  <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200/75" />
                  <div className="mt-5 h-9 w-full max-w-[18rem] animate-pulse rounded-[1rem] bg-slate-200/80" />
                  <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-slate-200/65" />
                  <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-slate-200/65" />
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="h-10 animate-pulse rounded-full bg-slate-200/70" />
                    <div className="h-10 animate-pulse rounded-full bg-slate-200/70" />
                    <div className="h-10 animate-pulse rounded-full bg-slate-200/70" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
      <main className="min-h-[100dvh] text-slate-900">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute left-[-6rem] top-[-4rem] h-[28rem] w-[28rem] rounded-full bg-white/70 blur-3xl" />
          <div className="absolute right-[-8rem] top-[6rem] h-[30rem] w-[30rem] rounded-full bg-emerald-100/30 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
          <motion.header
            layout
            className={workspaceOpen
              ? "rounded-[2rem] border border-black/6 bg-[rgba(255,253,248,0.78)] px-5 py-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]"
              : "rounded-[2.7rem] border border-black/6 bg-[rgba(255,253,248,0.78)] p-6 shadow-[0_30px_90px_-52px_rgba(15,23,42,0.28)]"
            }
          >
            {workspaceOpen ? (
              <div className="flex items-center justify-center py-1">
                <p className="northstar-display text-[1.6rem] font-[600] tracking-[-0.07em] text-[#111720]">
                  Northstar
                </p>
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[1fr_auto]">
                <div className="space-y-4">
                  <div className="inline-flex items-center rounded-full border border-black/6 bg-white/80 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
                    Fairlight advisor workspace
                  </div>
                  <h1 className="northstar-display text-[6.7rem] font-[600] leading-[0.88] tracking-[-0.09em] text-[#111720] [text-wrap:balance] md:text-[8.8rem]">
                    Northstar
                  </h1>
                </div>

                <SummaryStrip
                  items={[
                    {
                      id: "review",
                      label: "Cases in review",
                      value: String(advisorDataset.summary.totalOrganizations),
                      detail: `${advisorDataset.summary.states.join(", ")} shortlist`,
                      explanation: "Organizations currently in Fairlight's active shortlist.",
                    },
                    {
                      id: "risk",
                      label: "Typical risk",
                      value: `${advisorDataset.summary.distressBaselineRate}%`,
                      detail: "Average next-year risk",
                      explanation: "Average chance of financial stress next year across the shortlist.",
                    },
                    {
                      id: "paused",
                      label: "Paused cases",
                      value: `${advisorDataset.summary.countsByAction["Deep Review"]}`,
                      detail: "Need more checking",
                      explanation: "Cases that still need more verification before Fairlight can make a clean recommendation.",
                    },
                  ]}
                />
              </div>
            )}
          </motion.header>

          <AnimatePresence mode="popLayout" initial={false}>
            {workspaceOpen && selectedOrganization ? (
              <motion.section
                key={`workspace-${selectedOrganization.id}`}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="mt-5 grid flex-1 gap-5 lg:min-h-[calc(100dvh-11.5rem)]"
              >
                <div className="min-h-0">
                  <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
                    <DecisionLab
                      organization={selectedOrganization}
                      onReturnToPortfolio={handleReturnToPortfolio}
                    />
                  </div>
                </div>
              </motion.section>
            ) : activeView === "pipeline" && pipelineData ? (
              <motion.section
                key="pipeline-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-5 flex-1"
              >
                <div className="mb-4 flex justify-end">
                  <div className="flex gap-1 rounded-full border border-black/8 bg-[rgba(246,241,232,0.9)] p-1">
                    {(["portfolio", "pipeline"] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setActiveView(view)}
                        className={`rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors duration-150 ${
                          activeView === view
                            ? "bg-[#111720] text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {view === "portfolio" ? "Portfolio" : "Priority Pipeline"}
                      </button>
                    ))}
                  </div>
                </div>
                <PriorityPipeline data={pipelineData} />
              </motion.section>
            ) : (
              <section
                key="portfolio-gallery"
                className="mt-5 flex flex-1"
              >
                <PortfolioInbox
                  organizations={visibleOrganizations}
                  selectedId={selectedId}
                  actionFilter={actionFilter}
                  sortOption={sortOption}
                  sizeBucketFilter={sizeBucketFilter}
                  stateFilter={stateFilter}
                  onActionFilterChange={setActionFilter}
                  onSortOptionChange={setSortOption}
                  onSizeBucketFilterChange={setSizeBucketFilter}
                  onStateFilterChange={setStateFilter}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onSelectOrganization={handleSelectOrganization}
                  sizeBucketOptions={sizeBucketOptions}
                  stateOptions={stateOptions}
                  layoutMode="gallery"
                  headerAction={
                    pipelineData ? (
                      <div className="flex gap-1 rounded-full border border-black/8 bg-[rgba(246,241,232,0.9)] p-1">
                        {(["portfolio", "pipeline"] as const).map((view) => (
                          <button
                            key={view}
                            type="button"
                            onClick={() => setActiveView(view)}
                            className={`rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors duration-150 ${
                              activeView === view
                                ? "bg-[#111720] text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            {view === "portfolio" ? "Portfolio" : "Priority Pipeline"}
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                />
              </section>
            )}
          </AnimatePresence>

        </div>
      </main>
  );
}

function SummaryStrip({
  items,
}: {
  items: Array<{
    id: string;
    detail: string;
    explanation: string;
    label: string;
    value: string;
  }>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="w-full max-w-[34rem] rounded-[2rem] border border-black/6 bg-white/84 p-3 shadow-[0_24px_56px_-42px_rgba(15,23,42,0.22)] xl:min-w-[31rem]">
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const flipped = activeId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(flipped ? null : item.id)}
              className="group [perspective:1200px] rounded-[1.45rem] text-left"
              aria-pressed={flipped}
              aria-label={`${item.label}: ${flipped ? item.explanation : `${item.value}. ${item.detail}`}`}
            >
              <div
                className={`relative min-h-[10rem] rounded-[1.45rem] transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] ${
                  flipped ? "[transform:rotateY(180deg)]" : ""
                }`}
              >
                <div className="absolute inset-0 flex flex-col rounded-[1.45rem] border border-black/6 bg-[rgba(255,255,255,0.82)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] [backface-visibility:hidden] transition-[box-shadow,border-color] duration-200 ease-out group-hover:shadow-[0_18px_36px_-28px_rgba(15,23,42,0.16)]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] text-slate-500">
                      <Info size={12} weight="bold" />
                    </span>
                  </div>
                  <p className="mt-4 text-[2rem] font-semibold leading-none tracking-[-0.07em] text-slate-950">{item.value}</p>
                  <p className="mt-auto pt-3 text-[12px] leading-[1.35] text-slate-600">{item.detail}</p>
                </div>

                <div className="absolute inset-0 flex flex-col rounded-[1.45rem] border border-black/6 bg-[rgba(248,244,236,0.95)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white/70 text-slate-500">
                      <Info size={12} weight="bold" />
                    </span>
                  </div>
                  <p className="mt-4 text-[12px] leading-[1.5] text-slate-700">{item.explanation}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LoadingTile() {
  return <div className="h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white/82" />;
}
