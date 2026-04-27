import { useId, type ComponentType, type SVGProps } from "react";
import { motion } from "framer-motion";
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MACROS_TEXT_LIGHT } from "@/lib/theme";
import type { CalorieRingMode } from "./CalorieRing";

export type MacroRingKey = "protein" | "carbs" | "fat";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;

interface MacroRingProps {
  macroKey: MacroRingKey;
  Icon: IconComponent;
  consumed: number;
  target: number;
  label: string;
  color: string;
  mode: CalorieRingMode;
  onTap?: () => void;
  numberDurationSec?: number;
  barDurationSec?: number;
}

// Mini-ring dimensions tuned to fit the existing macro tile width
// while keeping the inner gram readout legible. 88px outer with 6px
// stroke gives ~76px inner space — comfortably fits "1,205g" at 20px
// tabular-nums extrabold. Stroke-to-size ratio (~1:14) sits in the
// same family as the calorie hero (10:160 = 1:16) so the rings
// visually belong to one set.
const RADIUS = 36;
const STROKE = 6;
const SIZE = 88;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

/**
 * Experimental ring variant of MacroColumn — same prop interface, swap-in.
 * Used for an A/B comparison against the bar version. Mirrors:
 *   - mode-locked fill direction (drain in LEFT, fill in EATEN)
 *   - darker overshoot arc (CalorieRing.tsx pattern)
 *   - macro colour identity
 *   - big-number animation
 *
 * Layout: icon (small, top) → ring with big number inside → uppercase
 * label below.
 */
export default function MacroRing({
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
}: MacroRingProps) {
  const framerReduce = useFramerReducedMotion();
  const reduce = framerReduce === true;
  const id = useId();
  const trackId = `macro-ring-track-${id}`;

  const hasTarget = target > 0;
  const pct = hasTarget ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target && hasTarget;
  const isLeftMode = mode === "left";

  const displayValue = isLeftMode
    ? (isOver ? consumed - target : remaining)
    : consumed;

  // Same direction lock as the bar version
  const ringFillPct = isLeftMode
    ? (isOver ? 1 : 1 - pct)
    : pct;

  const overshootPct = isOver ? Math.min((consumed - target) / target, 1) : 0;

  const strokeDashoffset = CIRCUMFERENCE * (1 - ringFillPct);
  const overshootDashoffset = CIRCUMFERENCE * (1 - overshootPct);

  return (
    <button
      type="button"
      data-macro={macroKey}
      onClick={onTap}
      className="flex-1 flex flex-col items-center text-center bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
    >
      <Icon className="w-5 h-5" style={{ color }} strokeWidth={2} aria-hidden="true" />

      <div className="relative mt-1.5" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full">
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={`${color}1A`}
              strokeWidth={STROKE}
              id={trackId}
            />
            {hasTarget && (
              <motion.circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                initial={{ strokeDashoffset: reduce ? strokeDashoffset : CIRCUMFERENCE }}
                animate={{ strokeDashoffset }}
                transition={{
                  duration: reduce ? 0 : barDurationSec,
                  ease: RING_EASE,
                }}
              />
            )}
            {isOver && (
              <motion.circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={MACROS_TEXT_LIGHT[macroKey]}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                initial={{ strokeDashoffset: reduce ? overshootDashoffset : CIRCUMFERENCE }}
                animate={{ strokeDashoffset: overshootDashoffset }}
                transition={{
                  duration: reduce ? 0 : barDurationSec,
                  ease: RING_EASE,
                  delay: reduce ? 0 : 0.15,
                }}
              />
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p
            className="font-extrabold font-mono tabular-nums leading-none tracking-tight"
            style={{ color, fontSize: 20 }}
          >
            <AnimatedNumber
              value={displayValue}
              duration={numberDurationSec}
              ease={RING_EASE}
            />
            <span style={{ fontSize: 12 }}>g</span>
          </p>
        </div>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-wider mt-2 text-muted-foreground">
        {label}
      </p>
    </button>
  );
}
