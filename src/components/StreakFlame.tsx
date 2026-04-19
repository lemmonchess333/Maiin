import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakFlameProps {
  streak: number;
  /** Entrance bounce on mount / streak change. */
  bounce?: boolean;
  /** Celebration scale-pop (1 → 1.2 → 1 over ~300ms). */
  celebrate?: boolean;
  /** The display string for the number — defaults to `streak`. Override
   *  to animate the counting via a parent-managed motion value. */
  display?: React.ReactNode;
}

/**
 * Streak pill — shared by Home's top-right and the Food hero card.
 *
 * The palette escalates with streak length so the chip itself is a
 * milestone reward. 1–6 days is warm orange (the default). At 7 days the
 * chip shifts into a richer amber (a deliberate nod to the silver-tier
 * badge). At 30+ it goes deeper red-amber. At 100+ it drops into a
 * purple gradient — matches the "platinum" badge language.
 *
 * Each tier defines:
 *   - gradient fill        (radial, bright top-left → deep bottom-right)
 *   - border colour        (~45% alpha of the tier hue)
 *   - outer glow           (drop-shadow + halo ring for ≥ 7 days)
 *   - flame stroke + fill  (matching hue pair)
 *   - number colour        (deeper tier hue for contrast on the fill)
 */

interface Palette {
  bg: string;
  border: string;
  glow: string;
  flameStroke: string;
  flameFill: string;
  numberClass: string;
}

const TIER_BASE: Palette = {
  bg: "radial-gradient(circle at 30% 30%, rgba(253,186,116,0.38), rgba(251,146,60,0.18) 60%, rgba(234,88,12,0.10) 100%)",
  border: "1px solid rgba(249,115,22,0.45)",
  glow: "0 2px 8px -2px rgba(249,115,22,0.35)",
  flameStroke: "#ea580c",
  flameFill: "rgba(251,146,60,0.55)",
  numberClass: "text-orange-700 dark:text-orange-300",
};

const TIER_WEEK: Palette = {
  bg: "radial-gradient(circle at 30% 30%, rgba(253,230,138,0.55), rgba(245,158,11,0.22) 60%, rgba(217,119,6,0.14) 100%)",
  border: "1px solid rgba(217,119,6,0.55)",
  glow: "0 2px 10px -1px rgba(217,119,6,0.45)",
  flameStroke: "#b45309",
  flameFill: "rgba(251,191,36,0.65)",
  numberClass: "text-amber-700 dark:text-amber-300",
};

const TIER_MONTH: Palette = {
  bg: "radial-gradient(circle at 30% 25%, rgba(252,165,165,0.55), rgba(239,68,68,0.25) 55%, rgba(185,28,28,0.18) 100%)",
  border: "1px solid rgba(220,38,38,0.55)",
  glow: "0 2px 12px -1px rgba(220,38,38,0.45)",
  flameStroke: "#b91c1c",
  flameFill: "rgba(248,113,113,0.70)",
  numberClass: "text-red-700 dark:text-red-300",
};

const TIER_ELITE: Palette = {
  bg: "radial-gradient(circle at 30% 25%, rgba(196,181,253,0.55), rgba(139,92,246,0.28) 55%, rgba(91,33,182,0.20) 100%)",
  border: "1px solid rgba(124,58,237,0.55)",
  glow: "0 2px 14px -1px rgba(124,58,237,0.50)",
  flameStroke: "#6d28d9",
  flameFill: "rgba(167,139,250,0.70)",
  numberClass: "text-violet-700 dark:text-violet-300",
};

function paletteForStreak(streak: number): Palette {
  if (streak >= 100) return TIER_ELITE;
  if (streak >= 30) return TIER_MONTH;
  if (streak >= 7) return TIER_WEEK;
  return TIER_BASE;
}

export function StreakFlame({
  streak,
  bounce,
  celebrate,
  display,
}: StreakFlameProps) {
  // Hide entirely at zero — a flame labelled "0" reads as a failure
  // indicator. This early return is safe because the component uses no
  // React hooks; only framer-motion's motion.div/motion.span.
  if (streak <= 0) return null;

  const p = paletteForStreak(streak);

  return (
    <motion.div
      key={streak}
      initial={bounce ? { scale: 1.15 } : undefined}
      animate={celebrate ? { scale: [1, 1.2, 1] } : { scale: 1 }}
      transition={
        celebrate
          ? { duration: 0.3, ease: "easeOut" }
          : { type: "spring", stiffness: 300 }
      }
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: p.bg,
        border: p.border,
        boxShadow: p.glow,
      }}
    >
      <motion.span
        animate={{
          // Combined flicker: scale breathes + a gentle rotational wobble
          // at a different frequency so the flame looks alive rather than
          // strictly mechanical. No opacity change — never translucent.
          scale: [0.93, 1.02, 0.96, 1, 0.93],
          rotate: [-2, 2, -1, 1.5, -2],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ display: "inline-flex", transformOrigin: "50% 75%" }}
      >
        <Flame
          className="w-[18px] h-[18px]"
          style={{ color: p.flameStroke, fill: p.flameFill }}
          strokeWidth={2.25}
        />
      </motion.span>
      <span
        className={cn(
          "text-sm font-extrabold tabular-nums leading-none",
          p.numberClass,
        )}
      >
        {display ?? streak}
      </span>
    </motion.div>
  );
}
