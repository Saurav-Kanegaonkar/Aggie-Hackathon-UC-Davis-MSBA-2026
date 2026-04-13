import type { ReactNode } from "react";

export function SignalChip({
  accentClassName,
  children,
  label,
}: {
  accentClassName: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-black/6 bg-[rgba(255,255,255,0.82)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600 shadow-[0_18px_30px_-26px_rgba(15,23,42,0.22)] ${accentClassName}`}
    >
      <span className="inline-flex h-2 w-2 rounded-full bg-current opacity-75" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <span>{children}</span>
    </div>
  );
}
