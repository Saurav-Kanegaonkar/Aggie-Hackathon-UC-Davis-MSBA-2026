import { Info, ArrowClockwise, ArrowUpRight, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeBounds(series: number[][], paddingRatio = 0.12) {
  const values = series.flat().filter((value) => Number.isFinite(value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }

  const span = max - min;
  return {
    min: min - span * paddingRatio,
    max: max + span * paddingRatio,
  };
}

function linePath(values: number[], width: number, height: number, min: number, max: number) {
  if (!values.length) {
    return "";
  }

  const stepX = values.length > 1 ? width / (values.length - 1) : width / 2;

  return values
    .map((value, index) => {
      const x = stepX * index;
      const ratio = (value - min) / (max - min || 1);
      const y = height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${clamp(y, 0, height).toFixed(2)}`;
    })
    .join(" ");
}

function areaUnderLine(values: number[], width: number, height: number, min: number, max: number) {
  if (!values.length) {
    return "";
  }

  const path = linePath(values, width, height, min, max);
  const stepX = values.length > 1 ? width / (values.length - 1) : width / 2;
  const lastX = stepX * (values.length - 1);
  return `${path} L ${lastX.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;
}

function bandAreaPath(
  upperValues: number[],
  lowerValues: number[],
  width: number,
  height: number,
  min: number,
  max: number,
) {
  if (!upperValues.length || !lowerValues.length) {
    return "";
  }

  const stepX = upperValues.length > 1 ? width / (upperValues.length - 1) : width / 2;
  const upperPath = upperValues
    .map((value, index) => {
      const x = stepX * index;
      const ratio = (value - min) / (max - min || 1);
      const y = height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${clamp(y, 0, height).toFixed(2)}`;
    })
    .join(" ");

  const lowerPath = lowerValues
    .map((value, index) => {
      const reverseIndex = lowerValues.length - index - 1;
      const x = stepX * reverseIndex;
      const ratio = (value - min) / (max - min || 1);
      const y = height - ratio * height;
      return `L ${x.toFixed(2)} ${clamp(y, 0, height).toFixed(2)}`;
    })
    .join(" ");

  return `${upperPath} ${lowerPath} Z`;
}

function sparseLabels(labels: string[], maxLabels = 5) {
  if (labels.length <= maxLabels) {
    return labels;
  }

  const lastIndex = labels.length - 1;
  const chosen = new Set<number>();

  for (let step = 0; step < maxLabels; step += 1) {
    const rawIndex = Math.round((step / (maxLabels - 1)) * lastIndex);
    chosen.add(rawIndex);
  }

  const indices = [...chosen].sort((left, right) => left - right);
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] - indices[index - 1] <= 1) {
      chosen.delete(indices[index - 1]);
    }
  }

  return labels.map((label, index) => (chosen.has(index) ? label : ""));
}

function sanitizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function useDocumentScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const appRoot = document.getElementById("root");
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousAppRootOverflow = appRoot?.style.overflow;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (appRoot) {
      appRoot.style.overflow = "hidden";
    }

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      if (appRoot) {
        appRoot.style.overflow = previousAppRootOverflow ?? "";
      }
    };
  }, []);
}

const MODAL_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getModalFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest("[hidden], [inert], [aria-hidden='true']"),
  );
}

function makeOutsideModalInert(modalRoot: HTMLElement) {
  const snapshots: Array<{
    element: HTMLElement;
    hadInert: boolean;
    ariaHidden: string | null;
  }> = [];
  let activeBranch = modalRoot;

  while (activeBranch.parentElement) {
    const parent = activeBranch.parentElement;

    Array.from(parent.children).forEach((sibling) => {
      if (sibling === activeBranch || !(sibling instanceof HTMLElement)) {
        return;
      }

      snapshots.push({
        element: sibling,
        hadInert: sibling.hasAttribute("inert"),
        ariaHidden: sibling.getAttribute("aria-hidden"),
      });
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
    });

    if (parent === document.body) {
      break;
    }
    activeBranch = parent;
  }

  return () => {
    snapshots.forEach(({ element, hadInert, ariaHidden }) => {
      if (!hadInert) {
        element.removeAttribute("inert");
      }
      if (ariaHidden === null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", ariaHidden);
      }
    });
  };
}

function useModalFocus(onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) {
      return;
    }
    const activeDialog = dialog;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreOutsideState = makeOutsideModalInert(overlay);

    (initialFocusRef.current ?? getModalFocusableElements(activeDialog)[0] ?? activeDialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getModalFocusableElements(activeDialog);
      if (!focusableElements.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !activeDialog.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !activeDialog.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      restoreOutsideState();
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return { dialogRef, initialFocusRef, overlayRef };
}

export function PanelShell({
  title,
  guideTitle,
  guideBullets,
  children,
  guideMode = "panel",
  headerHint,
  bodyMode = "fixed",
}: {
  title: string;
  guideTitle: string;
  guideBullets: string[];
  children: ReactNode;
  guideMode?: "panel" | "none";
  headerHint?: string;
  bodyMode?: "fixed" | "auto";
}) {
  const [showGuide, setShowGuide] = useState(false);
  const canFlip = guideMode === "panel";
  const usesFixedBody = bodyMode === "fixed";
  const interactiveSurface = canFlip && usesFixedBody;

  return (
    <section
      className={`decision-chart-surface overflow-hidden rounded-[2.2rem] border border-black/6 p-6 transition-shadow duration-200 hover:shadow-[0_30px_70px_-44px_rgba(15,23,42,0.2)] ${interactiveSurface ? "cursor-pointer" : ""}`}
      onClick={interactiveSurface ? () => setShowGuide((value) => !value) : undefined}
      role={interactiveSurface ? "button" : undefined}
      tabIndex={interactiveSurface ? 0 : undefined}
      onKeyDown={
        interactiveSurface
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setShowGuide((value) => !value);
              }
            }
          : undefined
      }
      aria-label={canFlip ? `${title} ${showGuide ? "guide open" : "guide closed"}` : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[2rem] font-semibold tracking-[-0.06em] text-slate-950">{title}</h3>
        {canFlip ? (
          <button
            type="button"
            data-panel-ignore-click="true"
            onClick={(event) => {
              event.stopPropagation();
              setShowGuide((value) => !value);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/78 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 hover:bg-white"
            aria-label={showGuide ? `Back to ${title}` : `How to read ${title}`}
          >
            {showGuide ? <ArrowClockwise size={14} /> : <Info size={14} />}
            <span>{showGuide ? "Back to chart" : "How to read"}</span>
          </button>
        ) : headerHint ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/78 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            <Info size={12} />
            <span>{headerHint}</span>
          </div>
        ) : null}
      </div>

      {usesFixedBody ? (
        <div className="relative mt-6 min-h-[23rem]">
          <div
            className={`absolute inset-0 rounded-[1.6rem] transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] ${
              canFlip && showGuide ? "pointer-events-none opacity-0 [transform:rotateY(-180deg)]" : "opacity-100 [transform:rotateY(0deg)]"
            }`}
          >
            <div className="flex h-full min-h-[23rem] flex-col">{children}</div>
          </div>

          {canFlip ? (
            <div
              className={`absolute inset-0 rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.88)] p-5 transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] ${
                showGuide ? "opacity-100 [transform:rotateY(0deg)]" : "pointer-events-none opacity-0 [transform:rotateY(180deg)]"
              }`}
            >
              <div className="flex min-h-[23rem] h-full flex-col">
                <p className="text-lg font-medium tracking-[-0.04em] text-slate-950">{guideTitle}</p>
                <ul className="mt-4 space-y-3">
                  {guideBullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#47695c]" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">Tap again to return</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6">
          {canFlip && showGuide ? (
            <div className="rounded-[1.6rem] border border-black/6 bg-[rgba(246,241,232,0.88)] p-5">
              <div className="flex flex-col">
                <p className="text-lg font-medium tracking-[-0.04em] text-slate-950">{guideTitle}</p>
                <ul className="mt-4 space-y-3">
                  {guideBullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#47695c]" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">Use the top-right button to return</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">{children}</div>
          )}
        </div>
      )}
    </section>
  );
}

function FlipGuideCard({
  title,
  value,
  accentColor,
  toneTint,
  openLabel,
  guideBullets,
  onOpenDetail,
  frontVisual,
}: {
  title: string;
  value: string;
  accentColor: string;
  toneTint: string;
  openLabel: string;
  guideBullets: string[];
  onOpenDetail?: () => void;
  frontVisual: ReactNode;
}) {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <article className="relative min-h-[17.5rem] overflow-hidden rounded-[1.45rem] [perspective:1600px]">
      <div
        className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] ${
          showGuide ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]"
        }`}
      >
        <div className="absolute inset-0 flex min-h-[17.5rem] flex-col rounded-[1.45rem] border border-black/6 bg-white/78 p-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] [backface-visibility:hidden]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/6 bg-[rgba(248,244,236,0.9)] text-slate-700 transition-colors hover:bg-white"
              aria-label={`How to read ${title}`}
            >
              <Info size={13} />
            </button>
          </div>
          <div className="mt-4 flex-1">{frontVisual}</div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Open detail</p>
            <button
              type="button"
              onClick={onOpenDetail}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-black/6 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-[1px] hover:border-black/10 hover:shadow-[0_20px_40px_-30px_rgba(15,23,42,0.18)]"
              style={{ backgroundColor: toneTint }}
              aria-label={openLabel}
            >
              <span>View</span>
              <span
                className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-full border border-white/55"
                style={{ color: accentColor, backgroundColor: "rgba(255,255,255,0.72)" }}
              >
                <ArrowUpRight size={11} weight="bold" />
              </span>
            </button>
          </div>
        </div>

        <div className="absolute inset-0 rounded-[1.45rem] border border-black/6 bg-[rgba(246,241,232,0.94)] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="flex min-h-[17.5rem] h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</p>
                <p className="mt-2 text-base font-semibold tracking-[-0.04em] text-slate-950">How to read this chart</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/6 bg-white/74 text-slate-700 transition-colors hover:bg-white"
                aria-label={`Back to ${title} chart`}
              >
                <ArrowClockwise size={12} />
              </button>
            </div>
            <ul className="mt-4 space-y-2.5">
              {guideBullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#47695c]" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Open full detail from the chart side when you want the large view
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function TrendSparkCard({
  label,
  value,
  delta,
  values,
  color,
  tint,
  guideBullets,
  onOpenDetail,
}: {
  label: string;
  value: string;
  delta: string;
  values: number[];
  color: string;
  tint: string;
  guideBullets: string[];
  onOpenDetail?: () => void;
}) {
  const reactId = useId();
  const width = 320;
  const height = 112;
  const bounds = computeBounds([values], 0.18);
  const line = linePath(values, width, height, bounds.min, bounds.max);
  const area = areaUnderLine(values, width, height, bounds.min, bounds.max);
  const fillId = `spark-fill-${sanitizeId(label)}-${sanitizeId(reactId)}`;
  const pointIndexes = [...new Set([0, Math.round((values.length - 1) / 2), values.length - 1])];

  return (
    <FlipGuideCard
      title={label}
      value={value}
      accentColor={color}
      toneTint={tint}
      openLabel={`Open ${label} detail`}
      guideBullets={guideBullets}
      onOpenDetail={onOpenDetail}
      frontVisual={
        <>
          <div className="flex items-start justify-end">
            <span
              className="rounded-full border border-black/6 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]"
              style={{ backgroundColor: tint, color }}
            >
              {delta}
            </span>
          </div>
          <div className="mt-4 overflow-hidden rounded-[1.05rem]" style={{ background: tint }}>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full">
              <defs>
                <linearGradient id={fillId} x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.03" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${fillId})`} />
              <path d={line} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              {pointIndexes.map((index) => {
                const pointValue = values[index];
                const x = values.length > 1 ? (width / (values.length - 1)) * index : width / 2;
                const ratio = (pointValue - bounds.min) / (bounds.max - bounds.min || 1);
                const y = height - ratio * height;
                return <circle key={`${label}-${index}`} cx={x} cy={clamp(y, 0, height)} r="3.7" fill={color} stroke="rgba(255,255,255,0.94)" strokeWidth="1.5" />;
              })}
            </svg>
          </div>
        </>
      }
    />
  );
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(255,255,255,0.78)] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-[12px] font-semibold text-slate-700">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function BandChart({
  labels,
  organization,
  median,
  lowerBand,
  upperBand,
  primaryColor,
  secondaryColor,
}: {
  labels: string[];
  organization: number[];
  median: number[];
  lowerBand: number[];
  upperBand: number[];
  primaryColor: string;
  secondaryColor: string;
}) {
  const width = 700;
  const height = 300;
  const paddingTop = 18;
  const paddingBottom = 36;
  const innerHeight = height - paddingTop - paddingBottom;
  const bounds = computeBounds([organization, median, lowerBand, upperBand], 0.16);
  const displayLabels = sparseLabels(labels, 5);
  const gridValues = [bounds.max, (bounds.max + bounds.min) / 2, bounds.min];

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        {gridValues.map((value) => {
          const ratio = (value - bounds.min) / (bounds.max - bounds.min || 1);
          const y = paddingTop + innerHeight - ratio * innerHeight;
          return (
            <g key={value}>
              <line x1="46" y1={y} x2={width} y2={y} className="decision-gridline" />
              <text x="0" y={y + 4} className="fill-slate-600 text-[11px] tracking-[0.12em] uppercase">
                {`${value >= 0 ? "+" : ""}${value.toFixed(0)}%`}
              </text>
            </g>
          );
        })}

        <g transform={`translate(46 ${paddingTop})`}>
          <path
            d={bandAreaPath(upperBand, lowerBand, width - 46, innerHeight, bounds.min, bounds.max)}
            fill={secondaryColor}
            opacity="0.18"
          />
          <path
            d={linePath(median, width - 46, innerHeight, bounds.min, bounds.max)}
            fill="none"
            stroke={secondaryColor}
            strokeOpacity="0.86"
            strokeWidth="2.2"
            strokeDasharray="6 8"
            strokeLinecap="round"
          />
          <path
            d={linePath(organization, width - 46, innerHeight, bounds.min, bounds.max)}
            fill="none"
            stroke={primaryColor}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <div className="grid" style={{ gridTemplateColumns: `46px repeat(${labels.length}, minmax(0, 1fr))` }}>
        <span />
        {displayLabels.map((label, index) => (
          <span key={`${label}-${index}`} className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RevenueMixTrendGrid({
  series,
  onOpenDetail,
}: {
  series: Array<{
    label: string;
    color: string;
    values: number[];
  }>;
  onOpenDetail?: (label: string) => void;
}) {
  const reactId = useId();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
      {series.map((item) => {
        const latest = item.values.at(-1) ?? 0;
        const width = 248;
        const height = 96;
        const bounds = computeBounds([item.values], 0.18);
        const line = linePath(item.values, width, height, bounds.min, bounds.max);
        const area = areaUnderLine(item.values, width, height, bounds.min, bounds.max);
        const pointIndexes = [...new Set([0, Math.round((item.values.length - 1) / 2), item.values.length - 1])];
        return (
          <FlipGuideCard
            key={item.label}
            title={item.label}
            value={`${Math.round(latest)}%`}
            accentColor={item.color}
            toneTint={`${item.color}12`}
            openLabel={`Open ${item.label} detail`}
            guideBullets={[
              `This chart tracks how much ${item.label.toLowerCase()} contributed to total revenue across the filing history.`,
              "Higher percentages mean the organization is leaning more heavily on this reported category in that year.",
              "Read this alongside the other revenue cards to see whether the overall mix is broadening or concentrating.",
            ]}
            onOpenDetail={() => onOpenDetail?.(item.label)}
            frontVisual={
              <>
                <div className="flex items-start justify-end">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                </div>
                <div className="mt-4 overflow-hidden rounded-[1.05rem]" style={{ backgroundColor: `${item.color}12` }}>
                  <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" data-testid={`revenue-mix-spark-${sanitizeId(item.label)}`}>
                    <defs>
                      <linearGradient id={`mix-fill-${sanitizeId(item.label)}-${sanitizeId(reactId)}`} x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor={item.color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={item.color} stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <path d={area} fill={`url(#mix-fill-${sanitizeId(item.label)}-${sanitizeId(reactId)})`} />
                    <path d={line} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    {pointIndexes.map((index) => {
                      const value = item.values[index];
                      const x = item.values.length > 1 ? (width / (item.values.length - 1)) * index : width / 2;
                      const ratio = (value - bounds.min) / (bounds.max - bounds.min || 1);
                      const y = height - ratio * height;
                      return <circle key={`${item.label}-${index}`} cx={x} cy={clamp(y, 0, height)} r="3.4" fill={item.color} stroke="rgba(255,255,255,0.94)" strokeWidth="1.4" />;
                    })}
                  </svg>
                </div>
              </>
            }
          />
        );
      })}
    </div>
  );
}

export function ComparisonRows({
  rows,
}: {
  rows: Array<{
    label: string;
    currentLabel: string;
    benchmarkLabel: string;
    currentRatio: number;
    benchmarkRatio: number;
    tone: "stronger" | "aligned" | "watch";
    verdict: string;
  }>;
}) {
  const toneClasses: Record<string, string> = {
    stronger: "bg-emerald-50 text-emerald-900 border-emerald-200/75",
    aligned: "bg-stone-50 text-stone-700 border-stone-200/80",
    watch: "bg-amber-50 text-amber-900 border-amber-200/80",
  };

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <div key={row.label} className="rounded-[1.35rem] border border-black/6 bg-white/76 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-medium tracking-[-0.03em] text-slate-900">{row.label}</p>
              <p className="mt-2 text-sm text-slate-500">{row.currentLabel} vs {row.benchmarkLabel}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${toneClasses[row.tone]}`}>
              {row.verdict}
            </span>
          </div>
          <div className="relative mt-4 h-2.5 rounded-full bg-slate-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[rgba(71,105,92,0.18)]"
              style={{ width: `${clamp(row.currentRatio * 100, 12, 100)}%` }}
            />
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#47695c] shadow-[0_8px_18px_-10px_rgba(15,23,42,0.45)]"
              style={{ left: `${clamp(row.currentRatio * 100, 10, 100)}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(17,23,32,0.18)] bg-white shadow-[0_4px_12px_-10px_rgba(15,23,42,0.35)]"
              style={{ left: `${clamp(row.benchmarkRatio * 100, 10, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface DecisionLabDetail {
  title: string;
  subtitle?: string;
  guideTitle?: string;
  guideBullets?: string[];
  content: ReactNode;
}

export function DecisionLabDetailOverlay({
  detail,
  onClose,
}: {
  detail: DecisionLabDetail;
  onClose: () => void;
}) {
  const [showGuide, setShowGuide] = useState(false);
  const { dialogRef, initialFocusRef, overlayRef } = useModalFocus(onClose);
  useDocumentScrollLock();

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(246,241,232,0.58)] p-3 backdrop-blur-[12px] sm:p-4 md:p-5" data-testid="decision-lab-detail-overlay">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-pointer" onClick={onClose} aria-label="Close detail backdrop" />
      <section
        ref={dialogRef}
        className="relative z-[1] flex h-[min(84dvh,760px)] w-[min(92vw,1220px)] flex-col rounded-[2.3rem] border border-black/6 bg-[rgba(255,253,248,0.985)] p-1.5 shadow-[0_56px_160px_-56px_rgba(15,23,42,0.34)]"
        role="dialog"
        aria-modal="true"
        aria-label={detail.title}
        tabIndex={-1}
      >
        <div className="flex h-full flex-col rounded-[calc(2.3rem-0.375rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.988),rgba(250,246,240,0.95))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-[1.8rem] font-semibold tracking-[-0.065em] text-slate-950 md:text-[2.35rem]">{detail.title}</h4>
              {detail.subtitle ? <p className="mt-2.5 max-w-4xl text-[15px] leading-relaxed text-slate-700 md:text-[16px]">{detail.subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              {detail.guideTitle && detail.guideBullets?.length ? (
                <button
                  type="button"
                  onClick={() => setShowGuide((value) => !value)}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/78 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-700 hover:bg-white"
                >
                  {showGuide ? <ArrowClockwise size={14} /> : <Info size={14} />}
                  <span>{showGuide ? "Back to chart" : "How to read"}</span>
                </button>
              ) : null}
              <button
                ref={initialFocusRef}
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full border border-black/6 bg-white/86 p-3 text-slate-700 transition-colors hover:bg-white"
                aria-label="Close detail"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="relative mt-4 min-h-0 flex-1">
            <div
              aria-hidden={showGuide}
              inert={showGuide}
              className={`absolute inset-0 rounded-[1.9rem] transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] ${
                showGuide ? "pointer-events-none opacity-0 [transform:rotateY(-180deg)]" : "opacity-100 [transform:rotateY(0deg)]"
              }`}
            >
              <div className="h-full overflow-hidden rounded-[1.9rem] border border-black/6 bg-[rgba(247,243,235,0.8)] p-4 md:p-5">{detail.content}</div>
            </div>

            {detail.guideTitle && detail.guideBullets?.length ? (
              <div
                aria-hidden={!showGuide}
                inert={!showGuide}
                className={`absolute inset-0 rounded-[1.9rem] border border-black/6 bg-[rgba(246,241,232,0.94)] p-5 transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] md:p-6 ${
                  showGuide ? "opacity-100 [transform:rotateY(0deg)]" : "pointer-events-none opacity-0 [transform:rotateY(180deg)]"
                }`}
              >
                <div className="flex h-full flex-col">
                  <p className="text-[1.6rem] font-medium tracking-[-0.045em] text-slate-950 md:text-[1.9rem]">{detail.guideTitle}</p>
                  <ul className="mt-8 max-w-4xl space-y-6">
                    {detail.guideBullets.map((bullet) => (
                      <li key={bullet} className="flex gap-4 text-[1rem] leading-relaxed text-slate-700 md:text-[1.08rem]">
                        <span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-[#47695c]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-8 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">Use the top-right button to return to the chart</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ChartDetailModal({
  title,
  subtitle,
  onClose,
  children,
  guideTitle,
  guideBullets,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  guideTitle?: string;
  guideBullets?: string[];
}) {
  const [showGuide, setShowGuide] = useState(false);
  const { dialogRef, initialFocusRef, overlayRef } = useModalFocus(onClose);
  useDocumentScrollLock();

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(243,239,231,0.58)] p-3 backdrop-blur-[16px] md:p-4">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-pointer" onClick={onClose} aria-label="Close detail" />
      <section
        ref={dialogRef}
        className="relative z-[1] h-[min(86dvh,820px)] w-[min(92vw,1280px)] rounded-[2.4rem] border border-black/6 bg-[rgba(255,253,248,0.985)] p-1.5 shadow-[0_56px_160px_-56px_rgba(15,23,42,0.34)]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="flex h-full flex-col rounded-[calc(2.4rem-0.375rem)] bg-[linear-gradient(180deg,rgba(255,255,255,0.988),rgba(250,246,240,0.95))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-[2.35rem] font-semibold tracking-[-0.065em] text-slate-950 md:text-[2.9rem]">{title}</h4>
              {subtitle ? <p className="mt-3 max-w-5xl text-[16px] leading-relaxed text-slate-700 md:text-[17px]">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              {guideTitle && guideBullets?.length ? (
                <button
                  type="button"
                  onClick={() => setShowGuide((value) => !value)}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/78 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-700 hover:bg-white"
                >
                  {showGuide ? <ArrowClockwise size={14} /> : <Info size={14} />}
                  <span>{showGuide ? "Back to chart" : "How to read"}</span>
                </button>
              ) : null}
              <button
                ref={initialFocusRef}
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full border border-black/6 bg-white/86 p-3 text-slate-700 transition-colors hover:bg-white"
                aria-label="Close detail"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="relative mt-8 min-h-0 flex-1">
            <div
              aria-hidden={showGuide}
              inert={showGuide}
              className={`absolute inset-0 rounded-[1.9rem] transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] ${
                showGuide ? "pointer-events-none opacity-0 [transform:rotateY(-180deg)]" : "opacity-100 [transform:rotateY(0deg)]"
              }`}
            >
              <div className="h-full overflow-hidden rounded-[2.2rem] border border-black/6 bg-[rgba(247,243,235,0.8)] p-6 md:p-8">{children}</div>
            </div>

            {guideTitle && guideBullets?.length ? (
              <div
                aria-hidden={!showGuide}
                inert={!showGuide}
                className={`absolute inset-0 rounded-[2.2rem] border border-black/6 bg-[rgba(246,241,232,0.94)] p-8 transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] [transform-style:preserve-3d] md:p-10 ${
                  showGuide ? "opacity-100 [transform:rotateY(0deg)]" : "pointer-events-none opacity-0 [transform:rotateY(180deg)]"
                }`}
              >
                <div className="flex h-full flex-col">
                  <p className="text-[1.7rem] font-medium tracking-[-0.045em] text-slate-950 md:text-[2rem]">{guideTitle}</p>
                  <ul className="mt-8 max-w-4xl space-y-6">
                    {guideBullets.map((bullet) => (
                      <li key={bullet} className="flex gap-4 text-[1.08rem] leading-relaxed text-slate-700 md:text-[1.15rem]">
                        <span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-[#47695c]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-8 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-600">Use the top-right button to return to the chart</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ContributionBars({
  rows,
}: {
  rows: Array<{ label: string; value: number; tone: "lift" | "neutral" | "drag" }>;
}) {
  const fills: Record<string, string> = {
    lift: "bg-[#47695c]",
    neutral: "bg-[#8ea39a]",
    drag: "bg-[#b98548]",
  };

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[11rem_1fr_auto] items-center gap-3">
          <span className="text-[15px] text-slate-700">{row.label}</span>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${fills[row.tone]}`} style={{ width: `${clamp(row.value, 6, 100)}%` }} />
          </div>
          <span className="text-sm font-medium text-slate-900">{Math.round(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
