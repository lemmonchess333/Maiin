import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  animate,
  useReducedMotion as useFramerReducedMotion,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import type { CalorieRingMode } from "./CalorieRing";

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
  /** Display mode — "left" shows remaining, "eaten" shows consumed */
  mode: CalorieRingMode;
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
  mode,
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
  const isLeftMode = mode === "left";

  // LEFT mode:
  //   under target → remaining   (e.g. "151g left")
  //   over target  → overshoot   (e.g. "5g over")
  // EATEN mode:
  //   either       → consumed    (e.g. "14g eaten" or "170g eaten")
  const displayValue = isLeftMode
    ? (isOver ? consumed - target : remaining)
    : consumed;

  // "eaten" (the default eaten-mode label) is suppressed; the dynamic
  // "over" state is preserved so users still see the over-target signal.
  const displayLabel = isLeftMode
    ? (isOver ? "over" : "left")
    : null;

  // Macro number + bar stay in the macro's own colour regardless of
  // over/under target. Previously the colour ramped amber → deep red
  // when over, which made the Food hero read as a failure state
  // (numbers going red, bars going red) even though "over carbs by 10g"
  // is not a failure. Going over is now communicated purely by the
  // "over" text label + the number visibly exceeding the target in
  // the tertiary row. No red, no amber cascade.
  const overColor = color;

  // Pulse-once-on-cross: compare current consumed against previous, fire a
  // one-shot opacity pulse via an imperative animate() call on a MotionValue.
  // No setState → avoids react-hooks/set-state-in-effect lint rule.
  //
  // Guard against target shifts: we compare prev INTAKE against the PREVIOUS
  // target (not the current one). If the target moves because the effective
  // day type changed (e.g. lift → both), we do NOT fire a pulse — that's a
  // target shift, not an intake crossing. Only user-driven intake that
  // crosses the previous target threshold fires the pulse.
  const prevConsumedRef = useRef<number>(consumed);
  const prevTargetRef = useRef<number>(target);
  const firstMountRef = useRef(true);
  const pulseOpacity = useMotionValue(1);

  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      prevConsumedRef.current = consumed;
      prevTargetRef.current = target;
      return;
    }

    const prevConsumed = prevConsumedRef.current;
    const prevTarget = prevTargetRef.current;
    prevConsumedRef.current = consumed;
    prevTargetRef.current = target;

    const intakeIncreased = consumed > prevConsumed;
    const crossedPrevTarget =
      prevConsumed <= prevTarget && consumed > prevTarget;
    const justCrossed = intakeIncreased && crossedPrevTarget;

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
        className="text-3xl font-extrabold font-mono tabular-nums leading-none tracking-tight mt-2"
        style={{ color: overColor }}
      >
        <AnimatedNumber
          value={displayValue}
          duration={numberDurationSec}
          ease={RING_EASE}
        />
        <span className="text-3xl">g</span>
      </p>

      {/* Left/over label — suppressed in eaten mode (displayLabel === null) */}
      {displayLabel && (
        <p className="text-xs text-muted-foreground mt-0.5 lowercase">
          {displayLabel}
        </p>
      )}

      {/* Progress bar */}
      {/* Track — inset shadow reads as a recessed channel cut into the
          white card surface, with the coloured fill sitting inside the
          groove. Shadow is deliberately subtle (0.06 opacity). At
          empty (consumed === 0) the whole track fades to reduce visual
          noise without causing a layout jump on first log. */}
      <div
        className="w-full mt-2.5 h-1.5 rounded-full overflow-hidden transition-opacity duration-300"
        style={{
          background: "#F2F2F7",
          boxShadow: "inset 0 1px 2px rgb(0 0 0 / 0.06)",
          opacity: consumed === 0 ? 0.4 : 1,
        }}
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

      {/* Tertiary line — consumed value tweens with the big number so all
          three (big number, bar fill, tertiary) advance together during a log. */}
      <p className="text-[10px] text-muted-foreground/70 font-mono tabular-nums mt-1.5">
        <AnimatedNumber
          value={Math.round(consumed)}
          duration={numberDurationSec}
          ease={RING_EASE}
        />
        {" / "}{Math.round(target)}g
      </p>

      {/* Uppercase macro label — intentionally muted (same tone as the
          `X / Yg` ratio line above) so the card's colour identity is
          carried by the icon + big number + progress bar, not duplicated
          four times. The label is a caption, not a headline. */}
      <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">
        {label}
      </p>
    </button>
  );
}
