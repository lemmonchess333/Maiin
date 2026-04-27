import { useEffect, useRef, type ComponentType, type SVGProps } from "react";
import {
  motion,
  useMotionValue,
  animate,
  useReducedMotion as useFramerReducedMotion,
} from "framer-motion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import type { CalorieRingMode } from "./CalorieRing";

export type MacroColumnKey = "protein" | "carbs" | "fat";

// Accepts lucide-react icons and our own custom SVG icons (e.g. Avocado)
// via a shared shape. Both export a component that takes SVG props,
// className, and strokeWidth.
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;

interface MacroColumnProps {
  macroKey: MacroColumnKey;
  Icon: IconComponent;
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

  // Bar fill direction is mode-locked to the big number's direction so
  // both signals move in lockstep:
  //   LEFT mode → fill = remaining %   (drains as you log; matches the
  //                                    big number which counts down)
  //   EATEN mode → fill = consumed %   (grows as you log; matches the
  //                                    big number which counts up)
  // Over-target in LEFT mode pins to 100% (a full bar reads as
  // "maxed out + over by N" combined with the big number; an empty
  // bar would falsely read as "nothing left to eat").
  // Mirrors the calorie ring's fill direction in CalorieRing.tsx.
  const barFillPct = isLeftMode
    ? (isOver ? 1 : 1 - pct)
    : pct;

  // LEFT mode:
  //   under target → remaining   (e.g. "151")
  //   over target  → overshoot   (e.g. "5")
  // EATEN mode:
  //   either       → consumed    (e.g. "14" or "170")
  // Big number is the only readout — the previous "left/over" caption
  // and the "consumed / target" fraction were redundant with the
  // calorie ring's mode label and the bar fill respectively.
  const displayValue = isLeftMode
    ? (isOver ? consumed - target : remaining)
    : consumed;

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

      {/* Big number — semantics flips with `mode`:
          LEFT mode: remaining (or magnitude over) — e.g. "138g"
          EATEN mode: consumed — e.g. "86g"
          Identity carried by icon + bar fill + uppercase label below.
          The "left/over" caption + the consumed/target fraction were
          removed: the calorie ring's mode label is the global signal,
          and repeating it on every macro card was noise. */}
      <p
        className="text-2xl font-extrabold font-mono tabular-nums leading-none tracking-tight mt-2"
        style={{ color: overColor }}
      >
        <AnimatedNumber
          value={displayValue}
          duration={numberDurationSec}
          ease={RING_EASE}
        />
        <span className="text-2xl">g</span>
      </p>

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
          initial={{ width: reduce ? `${barFillPct * 100}%` : "0%" }}
          animate={{ width: `${barFillPct * 100}%` }}
          transition={{
            width: { duration: reduce ? 0 : barDurationSec, ease: RING_EASE },
          }}
        />
      </div>

      {/* Uppercase macro label — intentionally muted. The card's colour
          identity is carried by the icon + big number + progress bar;
          the label is a caption, not a headline. */}
      <p className="text-[10px] font-semibold uppercase tracking-wider mt-2 text-muted-foreground">
        {label}
      </p>
    </button>
  );
}
