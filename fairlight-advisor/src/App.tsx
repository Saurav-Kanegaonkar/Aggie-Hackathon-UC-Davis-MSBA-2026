import { AnimatePresence, motion } from "framer-motion";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { DecisionLab } from "./components/DecisionLab";
import { PortfolioInbox } from "./components/PortfolioInbox";
import { getInboxCopy, primeNorthstarScores } from "./lib/advisorLanguage";
import type { AdvisorDataset, OrganizationRecord } from "./types";

type SortOption = "northstar-desc" | "northstar-asc" | "name-asc";
const SIZE_BUCKET_ORDER: Record<string, number> = {
  "<500K": 0,
  "500K-2M": 1,
  "2M-10M": 2,
  ">10M": 3,
};

function resolveRequestedOrganizationId(organizations: OrganizationRecord[]): string | null {
  if (typeof window === "undefined") return null;

  const requestedOrganization = new URLSearchParams(window.location.search).get("org");

  if (requestedOrganization === "first") {
    return organizations[0]?.id ?? null;
  }

  return organizations.some((organization) => organization.id === requestedOrganization)
    ? requestedOrganization
    : null;
}

function pushOrganizationToHistory(organizationId: string | null) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  if (organizationId) {
    url.searchParams.set("org", organizationId);
  } else {
    url.searchParams.delete("org");
  }

  window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function App() {
  const [advisorDataset, setAdvisorDataset] = useState<AdvisorDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("northstar-desc");
  const [sizeBucketFilter, setSizeBucketFilter] = useState<string>("All");
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    let isMounted = true;

    async function loadDataset() {
      try {
        const advisorModule = await import("./data/fairlight-advisor-public.json");
        if (isMounted) {
          const dataset = advisorModule.default as AdvisorDataset;
          primeNorthstarScores(dataset.organizations);
          setSelectedId(resolveRequestedOrganizationId(dataset.organizations));
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
        const matchesSizeBucket = sizeBucketFilter === "All" || organization.sizeBucket === sizeBucketFilter;
        const matchesState = stateFilter === "All" || organization.state === stateFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          organization.orgName.toLowerCase().includes(normalizedQuery) ||
          organization.state.toLowerCase().includes(normalizedQuery) ||
          organization.decisionReason.toLowerCase().includes(normalizedQuery) ||
          organization.whySurfaced.toLowerCase().includes(normalizedQuery);

        return matchesQuery && matchesSizeBucket && matchesState;
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
  }, [deferredSearchQuery, organizations, sizeBucketFilter, sortOption, stateFilter]);

  useEffect(() => {
    if (!advisorDataset || typeof window === "undefined") return;

    const handlePopState = () => {
      const requestedOrganizationId = resolveRequestedOrganizationId(advisorDataset.organizations);
      startTransition(() => {
        setSelectedId(requestedOrganizationId);
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [advisorDataset]);

  const handleSelectOrganization = (organization: OrganizationRecord) => {
    pushOrganizationToHistory(organization.id);
    startTransition(() => {
      setSelectedId(organization.id);
    });
  };

  const handleReturnToPortfolio = () => {
    pushOrganizationToHistory(null);
    startTransition(() => {
      setSelectedId(null);
    });
  };

  // Scroll to the top of the page whenever the workspace opens or closes so
  // the user always lands at the header of the newly-rendered view rather than
  // inheriting the scroll position from the previous screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [selectedId]);

  if (loadError) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-4 text-slate-900">
        <section className="w-full max-w-2xl rounded-[2.5rem] border border-black/6 bg-[rgba(255,253,248,0.88)] p-8 shadow-[0_36px_90px_-48px_rgba(15,23,42,0.32)]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-600">Load error</p>
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
    <main className="relative w-full max-w-full overflow-x-hidden text-slate-900">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-[-6rem] top-[-4rem] h-[28rem] w-[28rem] rounded-full bg-white/70 blur-3xl" />
          <div className="absolute right-[-8rem] top-[6rem] h-[30rem] w-[30rem] rounded-full bg-emerald-100/30 blur-3xl" />
          <div className="northstar-halftone northstar-halftone--top" />
          <div className="northstar-halftone northstar-halftone--bottom" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1500px] px-4 pt-4 pb-[max(6rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
          {!workspaceOpen ? (
            <header className="rounded-[2.2rem] border border-black/6 bg-[rgba(255,253,248,0.78)] px-6 py-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.26)]">
              <div className="flex flex-col items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-black/6 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-700 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.16)]">
                  Fairlight advisor workspace
                </div>
                <h1 className="northstar-display text-center text-[5rem] font-[600] leading-[1] tracking-[-0.06em] text-[#111720]">
                  Northstar
                </h1>
                <p className="max-w-2xl text-center text-[15px] leading-relaxed text-slate-600 sm:text-base">
                  Nonprofit financial intelligence for deciding where intervention can still change the curve.
                </p>
              </div>
            </header>
          ) : null}

          <AnimatePresence mode="popLayout" initial={false}>
            {workspaceOpen && selectedOrganization ? (
              <motion.section
                key={`workspace-${selectedOrganization.id}`}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="grid gap-4 pb-8"
              >
                <div>
                  <div className="flex flex-col gap-4">
                    <DecisionLab
                      organization={selectedOrganization}
                      onReturnToPortfolio={handleReturnToPortfolio}
                    />
                  </div>
                </div>
              </motion.section>
            ) : (
              <section key="portfolio-gallery" className="mt-5 flex flex-1">
                <PortfolioInbox
                  organizations={visibleOrganizations}
                  selectedId={selectedId}
                  sortOption={sortOption}
                  sizeBucketFilter={sizeBucketFilter}
                  stateFilter={stateFilter}
                  onSortOptionChange={setSortOption}
                  onSizeBucketFilterChange={setSizeBucketFilter}
                  onStateFilterChange={setStateFilter}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onSelectOrganization={handleSelectOrganization}
                  sizeBucketOptions={sizeBucketOptions}
                  stateOptions={stateOptions}
                  layoutMode="gallery"
                />
              </section>
            )}
          </AnimatePresence>

          <ProjectContextFooter totalOrganizations={advisorDataset.summary.totalOrganizations} />
        </div>
      </main>
  );
}

function ProjectContextFooter({ totalOrganizations }: { totalOrganizations: number }) {
  return (
    <footer className="mt-4 pb-2" aria-label="Project information">
      <details className="group overflow-hidden rounded-[1.75rem] border border-black/6 bg-[rgba(255,253,248,0.76)] shadow-[0_22px_56px_-46px_rgba(15,23,42,0.24)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-left outline-none transition-colors duration-200 hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-emerald-700/35 focus-visible:ring-inset [&::-webkit-details-marker]:hidden sm:px-6">
          <span className="flex min-w-0 items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              About the project
            </span>
            <span className="hidden truncate text-[13px] text-slate-500 sm:inline">
              UC Davis MSBA / IRS Form 990
            </span>
          </span>
          <span
            className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/70 text-slate-600"
            aria-hidden="true"
          >
            <span className="absolute h-px w-2.5 bg-current" />
            <span className="absolute h-2.5 w-px bg-current transition-transform duration-200 group-open:scale-y-0" />
          </span>
        </summary>

        <div className="border-t border-black/6 px-5 py-5 sm:px-6">
          <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            <section aria-labelledby="project-team-heading">
              <h2
                id="project-team-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                Builder and team
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Northstar was built in 48 hours for the 2026 UC Davis MSBA Aggie Hackathon by Team Real Housewives of
                Tenderloin: Saurav Kanegaonkar, Vedant Tiwari, and Amal Farhad Shaji.
              </p>
            </section>

            <section aria-labelledby="project-scope-heading">
              <h2
                id="project-scope-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                IRS Form 990 scope
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                This workspace presents {totalOrganizations} synthetic California and Washington demonstration cases
                patterned on public FY2023-FY2024 full Form 990 filings. Names, EINs, exact amounts, and record ordering
                are transformed. Source histories span FY2007-FY2025; case views stop at their stated decision year,
                while Crisis Replay labels any later observed filings separately. Form 990-EZ and Form 990-PF returns
                are out of scope.
              </p>
            </section>

            <section aria-labelledby="project-method-heading">
              <h2
                id="project-method-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                Methodology
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Deterministic peer cohorts and seven-year persistence benchmarks compare margin, operating runway, and
                revenue diversification. Reported revenue-category shocks, historical recovery analogs, and evidence
                quality add decision context to the Northstar ranking.
              </p>
            </section>

            <section aria-labelledby="project-limitations-heading">
              <h2
                id="project-limitations-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                Limitations
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                This is decision support, not audit, investment, legal, or grantmaking advice. Filing lag, amendments,
                missing fields, reporting-definition changes, cohort size, and modeled shocks can affect results;
                scenario outputs are directional rather than causal forecasts. Verify conclusions against current
                filings and audited financials.
              </p>
            </section>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-black/6 pt-4 text-[13px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Source layer: GivingTuesday Basic 120 Fields and IRS bulk XML.</span>
            <span>Synthetic public demo: exact source records are not exposed in the interface.</span>
          </div>
        </div>
      </details>
    </footer>
  );
}

function LoadingTile() {
  return <div className="h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white/82" />;
}
