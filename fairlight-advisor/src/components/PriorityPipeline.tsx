import { motion } from "framer-motion";

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
      className="w-full min-w-0 space-y-5"
    >
      {/* ── Header card ── */}
      <motion.div variants={rise} className="w-full">
        <div className="rounded-[2.2rem] border border-black/6 bg-[linear-gradient(160deg,rgba(5,150,105,0.06),rgba(16,185,129,0.02))] p-6 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
          <div className="space-y-3 max-w-3xl">
              <div className="flex items-center gap-3">
                <div className="h-1 w-10 rounded-full bg-emerald-500" />
                <p className="text-[12px] font-medium uppercase tracking-[0.28em] text-slate-400">
                  Fairlight priority pipeline
                </p>
              </div>
              <h2 className="whitespace-nowrap text-[2.85rem] font-semibold tracking-[-0.055em] text-slate-950 md:text-[3.75rem]">
                Organizations ready to move.
              </h2>
              <p className="text-[18px] leading-[1.78] text-slate-600">
                These nonprofits are financially healthy enough to fund — but they depend on too few revenue sources.
                That's the gap Fairlight can directly address. Strong trajectory, fixable problem, right size for a meaningful relationship.
              </p>
          </div>

          {/* Criteria pills */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-black/6 pt-4">
            <p className="mr-2 self-center text-[12px] font-medium uppercase tracking-[0.22em] text-slate-400">Filters applied:</p>
            {[
              "Action: Revenue Concentration Risk",
              "Revenue $10M–$75M",
              "Revenue concentration > 70%",
              "Trend: stable or improving",
              "Operating margin > −5%",
            ].map((c) => (
              <span key={c} className="rounded-full border border-black/8 bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-slate-600">
                {c}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Table ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.06 }} className="w-full">
        <div className="rounded-[2.2rem] border border-black/6 bg-white/88 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
          <div className="rounded-t-[2.2rem] border-b border-black/6 bg-white/97 px-6 pb-2 pt-5 backdrop-blur-md">
            <p className="text-[12px] font-medium uppercase tracking-[0.26em] text-slate-400">Priority order</p>
            <h3 className="mt-1 text-[2.15rem] font-semibold tracking-[-0.045em] text-slate-950">
              Top {orgs.length} opportunities
            </h3>
            <p className="mt-1 text-[15px] text-slate-500">
              Ranked by revenue × concentration gap — bigger org with worse diversification ranks higher.
            </p>
          </div>

          <div
            className="sticky top-0 z-30 grid grid-cols-[4.5rem_minmax(0,32%)_minmax(0,24%)_9rem_18rem_9rem_9rem] border-b border-black/6 bg-[rgba(255,255,255,0.98)] shadow-[0_12px_24px_-20px_rgba(15,23,42,0.32)] backdrop-blur-md"
            data-testid="priority-pipeline-sticky-header"
          >
            <div role="columnheader" className="px-6 py-3 text-left text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">#</div>
            <div role="columnheader" className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Organization</div>
            <div role="columnheader" className="hidden px-3 py-3 text-left text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400 md:block">Sector</div>
            <div role="columnheader" className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Revenue</div>
            <div role="columnheader" className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Revenue concentration</div>
            <div role="columnheader" className="hidden px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400 lg:block">Op. margin</div>
            <div role="columnheader" className="hidden px-6 py-3 text-right text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400 lg:block">Trend</div>
          </div>

          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[4.5rem]" />
                <col className="w-[32%]" />
                <col className="w-[24%]" />
                <col className="w-[9rem]" />
                <col className="w-[18rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
              </colgroup>
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
                    <td className="px-6 py-3 text-[14px] font-semibold text-slate-300 w-8">{i + 1}</td>

                    {/* Org name + state */}
                    <td className="w-[32%] px-3 py-3 align-top">
                      <p className="max-w-[24rem] text-[16px] font-semibold leading-[1.18] text-slate-900">{org.orgName}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-500">{org.state}</span>
                        <span className="text-[12px] text-slate-400">FY {org.fiscalYear}</span>
                      </div>
                    </td>

                    {/* Sector */}
                    <td className="hidden px-3 py-3 align-top md:table-cell">
                      <p className="max-w-[15rem] text-[15px] leading-snug text-slate-500">{org.sector}</p>
                    </td>

                    {/* Revenue */}
                    <td className="px-3 py-3 text-right align-top">
                      <span className="text-[16px] font-semibold text-slate-800">{org.revenueDisplay}</span>
                    </td>

                    {/* RDI bar + label */}
                    <td className="px-3 py-3 align-top">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[13px] font-semibold ${rdiColor(org.rdi)}`}>{org.rdiLabel}</span>
                          <span className="text-[12px] text-slate-400">{(org.rdi * 100).toFixed(0)}%</span>
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
                    <td className="hidden px-3 py-3 text-right align-top lg:table-cell">
                      <span className={`text-[15px] font-semibold ${marginColor(org.operatingMargin)}`}>
                        {formatMargin(org.operatingMargin)}
                      </span>
                    </td>

                    {/* Trend */}
                    <td className="hidden px-6 py-3 text-right align-top lg:table-cell">
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
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
