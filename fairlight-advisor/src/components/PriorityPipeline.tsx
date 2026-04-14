import { ChartBar, CurrencyDollar, Funnel } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const rise = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

interface PipelineOrg {
  id: string;
  ein: string;
  orgName: string;
  state: string;
  totalRevenue: number;
  revenueDisplay: string;
  rdi: number;
  rdiLabel: string;
  operatingMargin: number;
  marginTrend: string;
  sector: string;
  fiscalYear: number;
  confidenceTier: string;
  priorityScore: number;
}

interface PipelineDataset {
  generatedAt: string;
  totalMatched: number;
  criteria: {
    action: string;
    revenueMin: number;
    revenueMax: number;
    rdiMax: number;
    trend: string;
  };
  organizations: PipelineOrg[];
}

function rdiColor(rdi: number): string {
  if (rdi < 0.05) return "text-rose-700";
  if (rdi < 0.15) return "text-rose-600";
  if (rdi < 0.22) return "text-amber-600";
  return "text-amber-500";
}

function rdiBarColor(rdi: number): string {
  if (rdi < 0.15) return "bg-rose-400";
  if (rdi < 0.22) return "bg-amber-400";
  return "bg-amber-300";
}

function marginColor(m: number): string {
  if (m < 0) return "text-rose-600";
  if (m < 0.05) return "text-slate-500";
  return "text-emerald-700";
}

function formatMargin(m: number): string {
  return `${m >= 0 ? "+" : ""}${(m * 100).toFixed(1)}%`;
}

export function PriorityPipeline({ data }: { data: PipelineDataset }) {
  const orgs = data.organizations;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {/* ── Header card ── */}
      <motion.div variants={rise}>
        <div className="rounded-[2.2rem] border border-black/6 bg-[linear-gradient(160deg,rgba(5,150,105,0.06),rgba(16,185,129,0.02))] p-6 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-3">
                <div className="h-1 w-10 rounded-full bg-emerald-500" />
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
                  Fairlight priority pipeline
                </p>
              </div>
              <h2 className="text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-5xl">
                Organizations ready to move.
              </h2>
              <p className="text-[15px] leading-[1.65] text-slate-600">
                These nonprofits are financially healthy enough to fund — but they depend on too few revenue sources.
                That's the gap Fairlight can directly address. Strong trajectory, fixable problem, right size for a meaningful relationship.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 shrink-0">
              <StatTile
                icon={<Funnel size={16} weight="duotone" />}
                label="Matched"
                value={String(data.totalMatched)}
                sub="from 60K orgs reviewed"
              />
              <StatTile
                icon={<CurrencyDollar size={16} weight="duotone" />}
                label="Revenue range"
                value="$10M–$75M"
                sub="target AUM tier"
              />
              <StatTile
                icon={<ChartBar size={16} weight="duotone" />}
                label="Showing"
                value={`Top ${orgs.length}`}
                sub="by opportunity score"
              />
            </div>
          </div>

          {/* Criteria pills */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-black/6 pt-4">
            <p className="self-center text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400 mr-1">Filters applied:</p>
            {[
              "Action: Diversify",
              "Revenue $10M–$75M",
              "Revenue concentration > 70%",
              "Trend: stable or improving",
              "Operating margin > −5%",
            ].map((c) => (
              <span key={c} className="rounded-full border border-black/8 bg-white/70 px-3 py-1 text-[11px] font-medium text-slate-600">
                {c}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Table ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.06 }}>
        <div className="overflow-x-auto rounded-[2.2rem] border border-black/6 bg-white/88 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
          <div className="sticky top-0 z-10 rounded-t-[2.2rem] border-b border-black/6 bg-white/97 px-6 pb-2 pt-5 backdrop-blur-md">
            <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">Priority order</p>
            <h3 className="mt-1 text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">
              Top {orgs.length} opportunities
            </h3>
            <p className="mt-1 text-[12px] text-slate-500">
              Ranked by revenue × concentration gap — bigger org with worse diversification ranks higher.
            </p>
          </div>

          <div>
            <table className="w-full border-collapse">
              <thead className="sticky top-[6.25rem] z-10">
                <tr className="border-b border-black/6 bg-white/97 backdrop-blur-md">
                  <th className="px-6 py-3 text-left text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400 w-8">#</th>
                  <th className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">Organization</th>
                  <th className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400 hidden md:table-cell">Sector</th>
                  <th className="px-3 py-3 text-right text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">Revenue</th>
                  <th className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400 min-w-[160px]">Revenue concentration</th>
                  <th className="px-3 py-3 text-right text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400 hidden lg:table-cell">Op. margin</th>
                  <th className="px-6 py-3 text-right text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400 hidden lg:table-cell">Trend</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org, i) => (
                  <motion.tr
                    key={org.id}
                    className="border-b border-black/5 last:border-0 hover:bg-slate-50/60 transition-colors"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    {/* Rank */}
                    <td className="px-6 py-3 text-[13px] font-semibold text-slate-300 w-8">{i + 1}</td>

                    {/* Org name + state */}
                    <td className="px-3 py-3">
                      <p className="text-[15px] font-semibold text-slate-900 leading-snug">{org.orgName}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{org.state}</span>
                        <span className="text-[11px] text-slate-400">FY {org.fiscalYear}</span>
                      </div>
                    </td>

                    {/* Sector */}
                    <td className="px-3 py-3 hidden md:table-cell">
                      <p className="text-[14px] text-slate-500 max-w-[180px] leading-snug">{org.sector}</p>
                    </td>

                    {/* Revenue */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-[15px] font-semibold text-slate-800">{org.revenueDisplay}</span>
                    </td>

                    {/* RDI bar + label */}
                    <td className="px-3 py-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[12px] font-semibold ${rdiColor(org.rdi)}`}>{org.rdiLabel}</span>
                          <span className="text-[11px] text-slate-400">{(org.rdi * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <motion.div
                            className={`h-1.5 rounded-full ${rdiBarColor(org.rdi)}`}
                            style={{ width: `${org.rdi * 100}%`, transformOrigin: "left" }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ type: "spring", stiffness: 80, damping: 18, delay: i * 0.02 }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Operating margin */}
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      <span className={`text-[14px] font-semibold ${marginColor(org.operatingMargin)}`}>
                        {formatMargin(org.operatingMargin)}
                      </span>
                    </td>

                    {/* Trend */}
                    <td className="px-6 py-3 text-right hidden lg:table-cell">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        org.marginTrend === "improving"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {org.marginTrend === "improving" ? "Improving" : "Plateaued"}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-black/6">
            <p className="text-[11px] leading-relaxed text-slate-400">
              Showing top {orgs.length} of {data.totalMatched} organizations that matched across 60,089 reviewed.
              Data from most recent IRS Form 990 filing per organization (FY 2014–2023).
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatTile({
  icon, label, value, sub,
}: {
  icon: ReactNode; label: string; value: string; sub: string;
}) {
  return (
    <div className="rounded-[1.8rem] border border-black/6 bg-white/70 p-4">
      <div className="flex items-center gap-2 text-[var(--northstar-accent)]">{icon}</div>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 text-[1.6rem] font-bold tracking-[-0.04em] text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}
