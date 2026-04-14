import { ArrowArcLeft } from "@phosphor-icons/react";
import { motion } from "framer-motion";

import { formatOrganizationName } from "../lib/advisorLanguage";
import { buildDecisionLabModel } from "../lib/decisionLabModel";
import type { OrganizationRecord } from "../types";
import { CasePositionStrip } from "./decision-lab/CasePositionStrip";
import { FinancialTrajectoryPanel } from "./decision-lab/FinancialTrajectoryPanel";
import { OperatingQualityPanel } from "./decision-lab/OperatingQualityPanel";
import { PeerPositionPanel } from "./decision-lab/PeerPositionPanel";
import { RecommendationFold } from "./decision-lab/RecommendationFold";
import { RecoveryAnalogsPanel } from "./decision-lab/RecoveryAnalogsPanel";
import { RevenueCompositionPanel } from "./decision-lab/RevenueCompositionPanel";
import { ScoreDriversPanel } from "./decision-lab/ScoreDriversPanel";

export function DecisionLab({
  onReturnToPortfolio,
  organization,
}: {
  onReturnToPortfolio: () => void;
  organization: OrganizationRecord;
}) {
  const model = buildDecisionLabModel(organization);
  const bucketLabel = formatSizeBucket(organization.sizeBucket);

  return (
    <motion.section
      layout
      className="rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.74)] p-2 shadow-[0_34px_94px_-56px_rgba(15,23,42,0.28)]"
    >
      <div className="rounded-[calc(2.8rem-0.5rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.88))] px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:px-6">
        <div className="space-y-4 border-b border-black/6 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">Decision Lab</h2>
            <button
              type="button"
              onClick={onReturnToPortfolio}
              className="cursor-pointer ml-auto inline-flex items-center gap-2 rounded-full border border-[#5d7468]/20 bg-[rgba(232,241,235,0.96)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#486156] shadow-[0_22px_40px_-28px_rgba(72,97,86,0.42)] transition-colors hover:bg-[rgba(237,245,240,0.98)]"
            >
              <ArrowArcLeft size={14} weight="bold" />
              Back to inbox
            </button>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <h3 className="flex-1 text-4xl font-semibold tracking-[-0.045em] text-slate-950 md:text-6xl">
              {formatOrganizationName(organization.orgName)}
            </h3>
            <div className="flex flex-wrap justify-end gap-3 xl:max-w-[26rem] xl:pt-2">
              <HeaderPill label="State" value={organization.state} />
              <HeaderPill label="Revenue bucket" value={bucketLabel} />
              <HeaderPill label="Filing coverage" value={`${organization.filingYearsObserved} yrs through FY${organization.latestFilingYear}`} />
            </div>
          </div>
        </div>

        <CasePositionStrip model={model} organization={organization} />

        <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <PeerPositionPanel model={model} />
          <FinancialTrajectoryPanel model={model} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <OperatingQualityPanel model={model} />
          <RevenueCompositionPanel model={model} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ScoreDriversPanel model={model} />
          <RecoveryAnalogsPanel organization={organization} />
        </div>

        <RecommendationFold organization={organization} />
      </div>
    </motion.section>
  );
}

function HeaderPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-black/6 bg-white/78 px-4 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function formatSizeBucket(sizeBucket: string) {
  switch (sizeBucket) {
    case "<500K":
      return "$250K-$500K";
    case "500K-2M":
      return "$500K-$2M";
    case "2M-10M":
      return "$2M-$10M";
    case ">10M":
      return "$10M-$100M";
    default:
      return sizeBucket;
  }
}
