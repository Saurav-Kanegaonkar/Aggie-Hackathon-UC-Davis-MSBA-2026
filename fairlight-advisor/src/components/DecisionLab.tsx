import { ArrowArcLeft, ArrowLineUpRight, CompassRose, Pulse, ShieldCheck } from "@phosphor-icons/react";
import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

import { SoftActionButton } from "./SoftActionButton";
import { formatAnalogValue, formatOrganizationName, getDecisionLabCopy } from "../lib/advisorLanguage";
import type { OrganizationRecord } from "../types";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.99 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export function DecisionLab({
  onPrepareRecommendation,
  onReturnToPortfolio,
  organization,
}: {
  onPrepareRecommendation: () => void;
  onReturnToPortfolio: () => void;
  organization: OrganizationRecord;
}) {
  const copy = getDecisionLabCopy(organization);

  return (
    <motion.section
      layout
      className="rounded-[2.8rem] border border-black/6 bg-[rgba(255,253,248,0.74)] p-2 shadow-[0_34px_94px_-56px_rgba(15,23,42,0.28)]"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="rounded-[calc(2.8rem-0.5rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.88))] px-5 pb-5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:px-6"
      >
        <motion.div variants={itemVariants} className="grid gap-5 border-b border-black/6 pb-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">Decision Lab</h2>
              <button
                type="button"
                onClick={onReturnToPortfolio}
                className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98]"
              >
                <ArrowArcLeft size={14} weight="bold" />
                Back to inbox
              </button>
              <SoftActionButton aria-label="Prepare recommendation" onClick={onPrepareRecommendation}>
                <span className="tracking-[0]">Funding decision</span>
              </SoftActionButton>
            </div>

            <div className="space-y-3">
              <h3 className="max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-slate-950 md:text-6xl">
                {formatOrganizationName(organization.orgName)}
              </h3>
              <p className="max-w-3xl text-lg leading-relaxed text-slate-600">{copy.titleLine}</p>
            </div>
          </div>

          <motion.div
            variants={itemVariants}
            className="rounded-[2rem] border border-black/6 bg-[rgba(246,241,232,0.92)] p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">At a glance</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <SnapshotTile label="Next move" value={copy.nextMove} />
              <SnapshotTile label="Risk next year" value={copy.riskLine} />
              <SnapshotTile label="Baseline" value={`${organization.distress.baseline.toFixed(1)}% portfolio`} />
              <SnapshotTile label="Confidence" value={copy.confidenceLine} />
            </div>
          </motion.div>
        </motion.div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="grid content-start gap-4">
            <motion.div variants={itemVariants}>
              <Panel eyebrow="Summary" icon={<CompassRose size={18} weight="duotone" />} title="What Fairlight sees">
                <div className="grid gap-3 md:grid-cols-2">
                  {copy.factCards.map((fact) => (
                    <QuietFact key={fact.label} label={fact.label} value={fact.value} detail={fact.detail} />
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <NoteCard label="Why it surfaced" value={copy.surfacedReason} />
                  <NoteCard label="Peer read" value={copy.peerRead} />
                  <NoteCard label="Stress read" value={copy.stressRead} />
                </div>
              </Panel>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Panel eyebrow="Path forward" icon={<ShieldCheck size={18} weight="duotone" />} title="What could improve the case">
                <div className="grid gap-3">
                  {copy.supportSignals.map((item) => (
                    <BulletRow key={item} tone="positive">
                      {item}
                    </BulletRow>
                  ))}
                </div>

                <div className="mt-4 grid gap-3">
                  {copy.scenarios.map((scenario) => (
                    <div key={scenario.title} className="rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.9)] p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">{scenario.title}</p>
                      <p className="mt-2 text-base font-medium tracking-[-0.03em] text-slate-900">{scenario.effect}</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">{scenario.summary}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          </div>

          <div className="grid content-start gap-4">
            <motion.div variants={itemVariants}>
              <Panel eyebrow="Priority" icon={<Pulse size={18} weight="duotone" />} title="What needs attention now">
                <div className="grid gap-3">
                  {copy.pressurePoints.map((point) => (
                    <BulletRow key={point} tone="warning">
                      {point}
                    </BulletRow>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <QuietFact label="Risk" value={copy.riskDetail} detail="Forward distress read" />
                  <QuietFact label="Confidence" value={copy.confidenceDetail} detail="How much to trust the signal" />
                </div>
              </Panel>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Panel eyebrow="Recovery analogs" icon={<ArrowLineUpRight size={18} weight="duotone" />} title="Observed organizations that recovered">
                <div className="grid gap-3">
                  {organization.analogs.length ? (
                    organization.analogs.map((analog) => (
                      <div
                        key={`${analog.orgName}-${analog.recoveryWindow}`}
                        className="rounded-[1.7rem] border border-black/6 bg-white/86 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-medium tracking-[-0.03em] text-slate-900">{analog.orgName}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                              {analog.state} • {analog.metricName.replaceAll("_", " ")}
                            </p>
                          </div>
                          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{analog.recoveryWindow}</p>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-slate-700">
                          Improved from {formatAnalogValue(analog.preValue)} to {formatAnalogValue(analog.postValue)}.
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[1.7rem] border border-dashed border-black/10 bg-white/75 px-4 py-5 text-sm leading-relaxed text-slate-500">
                      Fairlight does not have a direct recovery analog for this case yet.
                    </p>
                  )}
                </div>
              </Panel>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
}

function Panel({
  children,
  eyebrow,
  icon,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-[2.2rem] border border-black/6 bg-white/88 p-5 shadow-[0_28px_62px_-48px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
          <h3 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.05em] text-slate-950">{title}</h3>
        </div>
        <div className="rounded-full border border-black/6 bg-[rgba(246,241,232,0.92)] p-3 text-[var(--northstar-accent)]">
          {icon}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function SnapshotTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-black/6 bg-white/78 p-4 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-base font-medium leading-snug text-slate-900">{value}</p>
    </div>
  );
}

function QuietFact({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-black/6 bg-white/82 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-base font-medium tracking-[-0.03em] text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function BulletRow({ children, tone }: { children: ReactNode; tone: "warning" | "positive" }) {
  const accent = tone === "warning" ? "bg-[#b68a48]" : "bg-[#466859]";

  return (
    <div className="flex gap-3 rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.88)] px-4 py-3">
      <div className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} />
      <p className="text-sm leading-relaxed text-slate-700">{children}</p>
    </div>
  );
}

function NoteCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.82)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}
