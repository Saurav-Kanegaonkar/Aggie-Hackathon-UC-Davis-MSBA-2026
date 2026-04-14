import { Compass, Pulse, ShieldCheck } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DecisionLab } from "./components/DecisionLab";
import { PortfolioInbox } from "./components/PortfolioInbox";
import type { AdvisorDataset, OrganizationRecord } from "./types";

export default function App() {
  const [advisorDataset, setAdvisorDataset] = useState<AdvisorDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("All");
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

    return organizations.filter((organization) => {
      const matchesAction = actionFilter === "All" || organization.actionLabel === actionFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        organization.orgName.toLowerCase().includes(normalizedQuery) ||
        organization.state.toLowerCase().includes(normalizedQuery) ||
        organization.decisionReason.toLowerCase().includes(normalizedQuery) ||
        organization.whySurfaced.toLowerCase().includes(normalizedQuery);

      return matchesAction && matchesQuery;
    });
  }, [actionFilter, deferredSearchQuery, organizations]);

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
    <MotionConfig transition={{ type: "spring", stiffness: 108, damping: 20 }}>
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
              <div className="flex items-center justify-center gap-2">
                <Compass size={13} weight="bold" className="text-slate-400" />
                <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">
                  Northstar
                </span>
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/80 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
                    <Compass size={14} weight="bold" />
                    Fairlight advisor workspace
                  </div>
                  <h1 className="text-6xl font-semibold tracking-[-0.08em] text-slate-950 md:text-7xl">
                    Northstar
                  </h1>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <HeaderSnapshot
                    icon={<Compass size={16} weight="duotone" />}
                    label="Cases in review"
                    value={String(advisorDataset.summary.totalOrganizations)}
                    detail={`${advisorDataset.summary.states.join(" + ")} portfolio`}
                    explanation="Organizations currently inside the active review set."
                  />
                  <HeaderSnapshot
                    icon={<Pulse size={16} weight="duotone" />}
                    label="Typical risk"
                    value={`${advisorDataset.summary.distressBaselineRate}%`}
                    detail="Next-year urgency baseline"
                    explanation="Average next-year distress rate across this portfolio."
                  />
                  <HeaderSnapshot
                    icon={<ShieldCheck size={16} weight="duotone" />}
                    label="Paused cases"
                    value={`${advisorDataset.summary.countsByAction["Deep Review"]}`}
                    detail="Cases currently paused"
                    explanation="Cases that need diligence before a funding move."
                  />
                </div>
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
                  onActionFilterChange={setActionFilter}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onSelectOrganization={handleSelectOrganization}
                  layoutMode="gallery"
                />
              </motion.section>
            )}
          </AnimatePresence>

        </div>
      </main>
    </MotionConfig>
  );
}

function HeaderSnapshot({
  detail,
  explanation,
  icon,
  label,
  value,
}: {
  detail: string;
  explanation: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFlipped((current) => !current)}
      className="h-[150px] rounded-[2rem] border border-black/6 bg-transparent text-left [perspective:1200px]"
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        className="relative h-full w-full rounded-[2rem] [transform-style:preserve-3d]"
      >
        <div className="absolute inset-0 rounded-[2rem] border border-black/6 bg-white/84 p-4 text-center shadow-[0_22px_52px_-40px_rgba(15,23,42,0.22)] [backface-visibility:hidden]">
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] p-3 text-[var(--northstar-accent)]">
              {icon}
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">{label}</p>
              <p className="text-[1.7rem] font-semibold tracking-[-0.06em] text-slate-950">{value}</p>
              <p className="text-sm leading-relaxed text-slate-500">{detail}</p>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 rounded-[2rem] border border-black/6 bg-[rgba(246,241,232,0.96)] p-4 text-center shadow-[0_22px_52px_-40px_rgba(15,23,42,0.18)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">What this means</p>
            <p className="text-sm leading-relaxed text-slate-700">{explanation}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--northstar-accent)]">Click to flip back</p>
          </div>
        </div>
      </motion.div>
    </button>
  );
}

function LoadingTile() {
  return <div className="h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white/82" />;
}
