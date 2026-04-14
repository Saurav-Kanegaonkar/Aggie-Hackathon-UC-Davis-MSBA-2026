import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { MouseEventHandler, PropsWithChildren } from "react";

type SoftActionButtonProps = PropsWithChildren<{
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  motionMode?: "magnetic" | "still";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  variant?: "primary" | "secondary";
}>;

export function SoftActionButton({
  children,
  className = "",
  motionMode = "magnetic",
  onMouseLeave,
  variant = "primary",
  ...props
}: SoftActionButtonProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 140, damping: 16, mass: 0.3 });
  const springY = useSpring(y, { stiffness: 140, damping: 16, mass: 0.3 });
  const rotate = useTransform(x, [-10, 10], [-1.6, 1.6]);

  const magneticEnabled = motionMode === "magnetic";

  const palette =
    variant === "primary"
      ? "border border-[#31493f]/10 bg-[#30483e] text-[#faf6ee] shadow-[0_26px_50px_-28px_rgba(48,72,62,0.52)]"
      : "border border-black/6 bg-white/88 text-slate-900 shadow-[0_24px_46px_-30px_rgba(15,23,42,0.22)]";

  return (
    <motion.button
      type="button"
      {...props}
      style={magneticEnabled ? { x: springX, y: springY, rotate } : undefined}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onMouseMove={(event) => {
        if (!magneticEnabled) {
          return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        const offsetX = event.clientX - (bounds.left + bounds.width / 2);
        const offsetY = event.clientY - (bounds.top + bounds.height / 2);
        x.set(offsetX * 0.06);
        y.set(offsetY * 0.06);
      }}
      onMouseLeave={(event) => {
        if (magneticEnabled) {
          x.set(0);
          y.set(0);
        }

        onMouseLeave?.(event);
      }}
      className={`group relative inline-flex items-center justify-center overflow-hidden rounded-full px-5 py-2.5 text-sm font-medium tracking-[-0.03em] whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.985] ${palette} ${className}`}
    >
      <span className="pointer-events-none absolute inset-[1px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02))]" />
      <span className="relative z-[1] inline-flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}
