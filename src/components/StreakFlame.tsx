import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  flamePaletteFor,
  type FlamePalette,
} from "@/features/streaks/flameTiers";

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
 * A clean neutral pill with a two-tone flame inside, so the flame is the
 * only coloured thing on it. The flame is brand purple, and its tier is
 * carried by the flame's colours alone, never the pill: each tier is a
 * step further down the brand purple ramp, and at 100 days the flame's
 * heart is the platinum of the top badge tier. The table lives in
 * `flameTiers.ts`, which may hold tokens only. Gold is not a tier colour:
 * it means a new best.
 */

/**
 * Two-layer flame SVG — outer body gradient + inner core gradient.
 * Looks like a proper coloured flame emoji without depending on platform
 * emoji rendering. Each path has its own vertical linearGradient so the
 * base-to-tip shift between ramp steps reads at the 18px render size.
 */
function FlameSvg({
  palette,
  size = 18,
}: {
  palette: FlamePalette;
  size?: number;
}) {
  // useId so multiple streak chips on the same page don't collide on
  // gradient <defs> ids (would cause the last-rendered chip's palette to
  // win for everyone).
  const id = useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`flame-body-${id}`}
          x1="50%"
          y1="100%"
          x2="50%"
          y2="0%"
        >
          <stop offset="0%" stopColor={palette.bodyBase} />
          <stop offset="100%" stopColor={palette.bodyTip} />
        </linearGradient>
        <linearGradient
          id={`flame-core-${id}`}
          x1="50%"
          y1="100%"
          x2="50%"
          y2="0%"
        >
          <stop offset="0%" stopColor={palette.coreBase} />
          <stop offset="100%" stopColor={palette.coreTip} />
        </linearGradient>
      </defs>
      {/* Outer flame body — loosely the lucide Flame silhouette, padded
          a touch for weight at small sizes. */}
      <path
        d="M12 2c-1.5 2.3-3 3.8-3 6 0 1.3.4 2 .8 2.6.4.6.2 1.4-.5 1.7-1.2.5-2 1.6-2 3.2a6.7 6.7 0 0 0 13.4 0c0-2.2-1.2-3.9-2.7-5.5-1.8-1.8-3-4.1-3.5-6.5-.4.8-1 1.5-1.5 2z"
        fill={`url(#flame-body-${id})`}
      />
      {/* Inner core — smaller, sits in the lower half of the body. */}
      <path
        d="M12 11c-.6 1.1-1.4 2-1.4 3.3a3 3 0 0 0 2.8 3 2.7 2.7 0 0 0 2-4.3c-.7-.9-1.1-1.7-1.4-2.8-.4.5-.7 1-1 1.3-.3-.2-.6-.3-1-.5z"
        fill={`url(#flame-core-${id})`}
      />
    </svg>
  );
}

export function StreakFlame({
  streak,
  bounce,
  celebrate,
  display,
}: StreakFlameProps) {
  // The flame stands still. It flickered forever (scale and rotate on a
  // 1.8 s loop), a second ambient loop on Home beside the water glass
  // (DESIGN_GUIDE §14h: one per surface) on a chip seen on every visit,
  // running on the main thread. Bounce and celebrate stay: brief
  // one-shots that mark a change.
  if (streak <= 0) return null;

  const palette = flamePaletteFor(streak);

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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card"
      style={{
        // Neutral drop-shadow — no tier colour in the shadow, so the
        // only warm element on the chip is the flame itself. Matches
        // Cal AI's approach.
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      <span style={{ display: "inline-flex" }}>
        <FlameSvg palette={palette} size={18} />
      </span>
      <span
        className={cn(
          "text-sm font-bold font-mono tabular-nums leading-none text-foreground"
        )}
      >
        {display ?? streak}
      </span>
    </motion.div>
  );
}
