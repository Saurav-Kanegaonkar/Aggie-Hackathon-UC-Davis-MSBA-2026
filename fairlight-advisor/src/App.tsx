import { Compass, Info, Pulse, ShieldCheck } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DecisionLab } from "./components/DecisionLab";
import { FundingDecisionPanel } from "./components/FundingDecisionPanel";
import { PortfolioInbox } from "./components/PortfolioInbox";
import type { AdvisorDataset, OrganizationRecord } from "./types";

type SortOption = "northstar-desc" | "northstar-asc" | "name-asc";

export default function App() {
  const [advisorDataset, setAdvisorDataset] = useState<AdvisorDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>("All");
  const [sortOption, setSortOption] = useState<SortOption>("northstar-desc");
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

    void loadDataset();

    return () => {
      isMounted = false;
    };
  }, []);

  const organizations = advisorDataset?.organizations ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedId) ?? null;
  const workspaceOpen = selectedOrganization !== null;

  const visibleOrganizations = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return organizations
      .filter((organization) => {
      const matchesAction = actionFilter === "All" || organization.actionLabel === actionFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        organization.orgName.toLowerCase().includes(normalizedQuery) ||
        organization.state.toLowerCase().includes(normalizedQuery) ||
        organization.decisionReason.toLowerCase().includes(normalizedQuery) ||
        organization.whySurfaced.toLowerCase().includes(normalizedQuery);

      return matchesAction && matchesQuery;
      })
      .sort((left, right) => {
        if (sortOption === "name-asc") {
          return left.orgName.localeCompare(right.orgName);
        }

        if (sortOption === "northstar-asc") {
          return right.distressProbability - left.distressProbability;
        }

        return left.distressProbability - right.distressProbability;
      });
  }, [actionFilter, deferredSearchQuery, organizations, sortOption]);

  const handleSelectOrganization = (organization: OrganizationRecord) => {
    startTransition(() => {
      setSelectedId(organization.id);
      setRecommendationOpen(false);
    });
  };

  const handleReturnToPortfolio = () => {
    startTransition(() => {
      setSelectedId(null);
      setRecommendationOpen(false);
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
    <MotionConfig transition={{ type: "spring", stiffness: 108, damping: 20 }}>
      <main className="min-h-[100dvh] text-slate-900">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute left-[-6rem] top-[-4rem] h-[28rem] w-[28rem] rounded-full bg-white/70 blur-3xl" />
          <div className="absolute right-[-8rem] top-[6rem] h-[30rem] w-[30rem] rounded-full bg-emerald-100/30 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
          <motion.header
            layout
            className="rounded-[2.7rem] border border-black/6 bg-[rgba(255,253,248,0.78)] p-6 shadow-[0_30px_90px_-52px_rgba(15,23,42,0.28)]"
          >
            <div className={`grid gap-6 ${workspaceOpen ? "" : "xl:grid-cols-[1fr_auto]"}`}>
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/80 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
                  <Compass size={14} weight="bold" />
                  Fairlight advisor workspace
                </div>
                <h1 className={`northstar-display leading-[0.88] tracking-[-0.09em] text-[#111720] [text-wrap:balance] ${workspaceOpen ? "text-[5.2rem] font-[600] md:text-[6.4rem]" : "text-[6.7rem] font-[600] md:text-[8.8rem]"}`}>
                  Northstar
                </h1>
              </div>

              {!workspaceOpen ? (
                <SummaryRail
                  items={[
                    {
                      id: "review",
                      icon: <Compass size={16} weight="duotone" />,
                      label: "Cases in review",
                      value: String(advisorDataset.summary.totalOrganizations),
                      detail: `${advisorDataset.summary.states.join(" + ")} shortlist`,
                      explanation: "Organizations currently in Fairlight's working shortlist.",
                    },
                    {
                      id: "risk",
                      icon: <Pulse size={16} weight="duotone" />,
                      label: "Typical risk",
                      value: `${advisorDataset.summary.distressBaselineRate}%`,
                      detail: "Average next-year risk",
                      explanation: "Average chance of financial stress next year across this shortlist.",
                    },
                    {
                      id: "paused",
                      icon: <ShieldCheck size={16} weight="duotone" />,
                      label: "Paused cases",
                      value: `${advisorDataset.summary.countsByAction["Deep Review"]}`,
                      detail: "Need more checking",
                      explanation: "Cases that need extra diligence before anyone can make a confident call.",
                    },
                  ]}
                />
              ) : null}
            </div>
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
                      onPrepareRecommendation={() => setRecommendationOpen(true)}
                      onReturnToPortfolio={handleReturnToPortfolio}
                    />
                  </div>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="portfolio-gallery"
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="mt-5 flex flex-1"
              >
                <PortfolioInbox
                  organizations={visibleOrganizations}
                  selectedId={selectedId}
                  actionFilter={actionFilter}
                  sortOption={sortOption}
                  onActionFilterChange={setActionFilter}
                  onSortOptionChange={setSortOption}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onSelectOrganization={handleSelectOrganization}
                  layoutMode="gallery"
                />
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {workspaceOpen && selectedOrganization && recommendationOpen ? (
              <motion.div
                key="funding-decision-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <FundingDecisionPanel organization={selectedOrganization} onClose={() => setRecommendationOpen(false)} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>
    </MotionConfig>
  );
}

function SummaryRail({
  items,
}: {
  items: Array<{
    id: string;
    detail: string;
    explanation: string;
    icon: ReactNode;
    label: string;
    value: string;
  }>;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  return (
    <div className="w-full max-w-[34rem] rounded-[2rem] border border-black/6 bg-white/84 p-3 shadow-[0_24px_56px_-42px_rgba(15,23,42,0.22)] xl:min-w-[31rem]">
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const active = item.id === activeItem?.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={`rounded-[1.45rem] border px-4 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                active
                  ? "border-[#30483e]/16 bg-[rgba(246,241,232,0.96)] shadow-[0_18px_36px_-28px_rgba(48,72,62,0.18)]"
                  : "border-black/6 bg-white/72 hover:bg-white/90"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="rounded-full border border-black/6 bg-white/74 p-2 text-[var(--northstar-accent)]">
                  {item.icon}
                </div>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  {active ? "Selected" : "Open"}
                </span>
              </div>
              <p className="mt-3 text-[12px] font-medium tracking-[0.03em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.07em] text-slate-950">{item.value}</p>
              <p className="mt-2 text-[12px] leading-[1.3] text-slate-600">{item.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-[1.5rem] border border-black/6 bg-[rgba(246,241,232,0.78)] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white/74 text-[#36574a]">
            <Info size={14} weight="fill" />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
              {activeItem?.label}
            </p>
            <p className="mt-1 text-[13px] leading-[1.45] text-slate-700">{activeItem?.explanation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingTile() {
  return <div className="h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white/82" />;
}
