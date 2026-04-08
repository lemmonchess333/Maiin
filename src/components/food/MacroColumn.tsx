import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  animate,
  useReducedMotion as useFramerReducedMotion,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { getOverTargetColor } from "@/lib/theme";

export type MacroColumnKey = "protein" | "carbs" | "fat";

interface MacroColumnProps {
  macroKey: MacroColumnKey;
  Icon: LucideIcon;
  consumed: number;
  target: number;
  /** Uppercase label e.g. "PROTEIN" */
  label: string;
  /** Saturated brand colour for this macro */
  color: string;
  /** Forward-compat tap hook (no-op for phase 1) */
  onTap?: () => void;
  /** Number count duration in seconds */
  numberDurationSec?: number;
  /** Progress bar animation duration in seconds */
  barDurationSec?: number;
}

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

export default function MacroColumn({
  macroKey,
  Icon,
  consumed,
  target,
  label,
  color,
  onTap = () => {},
  numberDurationSec = 0.6,
  barDurationSec = 0.6,
}: MacroColumnProps) {
  const framerReduce = useFramerReducedMotion();
  const reduce = framerReduce === true;

  const hasTarget = target > 0;
  const pct = hasTarget ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target && hasTarget;
  const displayValue = isOver ? consumed - target : remaining;

  // Over-target colour ramping (number + bar only, NOT icon/label/tertiary)
  const overColor = isOver ? getOverTargetColor(consumed, target) : color;

  // Pulse-once-on-cross: compare current consumed against previous, fire a
  // one-shot opacity pulse via an imperative animate() call on a MotionValue.
  // No setState → avoids react-hooks/set-state-in-effect lint rule.
  const prevRef = useRef<number>(consumed);
  const firstMountRef = useRef(true);
  const pulseOpacity = useMotionValue(1);

  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      prevRef.current = consumed;
      return;
    }

    const prev = prevRef.current;
    prevRef.current = consumed;

    const justCrossed = prev <= target && consumed > target;
    if (justCrossed && !reduce) {
      const controls = animate(pulseOpacity, [1, 0.6, 1], {
        duration: 0.4,
        ease: "easeOut",
      });
      return () => controls.stop();
    }
  }, [consumed, target, reduce, pulseOpacity]);

  return (
    <button
      type="button"
      data-macro={macroKey}
      onClick={onTap}
      className="flex-1 flex flex-col items-center text-center bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
    >
      {/* Icon */}
      <Icon className="w-6 h-6" style={{ color }} strokeWidth={2} aria-hidden="true" />

      {/* Big number */}
      <p
        className="text-3xl font-extrabold font-mono tabular-nums leading-none mt-2"
        style={{ color: overColor }}
      >
        <AnimatedNumber
          value={displayValue}
          duration={numberDurationSec}
          ease={RING_EASE}
        />
        <span className="text-base font-bold">g</span>
      </p>

      {/* "left" label — stays in original colour */}
      <p className="text-xs text-muted-foreground mt-0.5 lowercase">
        {isOver ? "over" : "left"}
      </p>

      {/* Progress bar */}
      <div
        className="w-full mt-2.5 h-1.5 rounded-full overflow-hidden"
        style={{ background: "#F2F2F7" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: overColor, opacity: pulseOpacity }}
          initial={{ width: reduce ? `${pct * 100}%` : "0%" }}
          animate={{ width: `${pct * 100}%` }}
          transition={{
            width: { duration: reduce ? 0 : barDurationSec, ease: RING_EASE },
          }}
        />
      </div>

      {/* Tertiary line — stays muted */}
      <p className="text-[10px] text-muted-foreground/70 tabular-nums mt-1.5">
        {Math.round(consumed)} / {Math.round(target)}g
      </p>

      {/* Uppercase macro label in macro colour */}
      <p
        className="text-[10px] font-semibold uppercase tracking-wider mt-0.5"
        style={{ color }}
      >
        {label}
      </p>
    </button>
  );
}
