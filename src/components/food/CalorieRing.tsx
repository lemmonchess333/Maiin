import { useId } from "react";
import { motion } from "framer-motion";
import { THEME, getOverTargetColor } from "@/lib/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

interface CalorieRingProps {
  consumed: number;
  target: number;
}

const RADIUS = 88;
const STROKE = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const COLOR = THEME.macros.calories;
const NEAR_TARGET_COLOR = "#DC2626"; // red-600

function getNumberColor(consumed: number, target: number, remaining: number): string {
  if (target <= 0) return "#D1D5DB"; // gray-300
  if (remaining < 0) return getOverTargetColor(consumed, target);
  if (remaining / target <= 0.1) return NEAR_TARGET_COLOR;
  return COLOR;
}

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

export default function CalorieRing({ consumed, target }: CalorieRingProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const ringGradientId = `calorie-ring-gradient${id}`;
  const overflowGradientId = `calorie-overflow-gradient${id}`;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const isOver = hasTarget && remaining < 0;
  const progress = hasTarget ? Math.min(consumed / target, 1) : 0;
  const displayValue = isOver ? Math.abs(remaining) : remaining;
  const numberColor = getNumberColor(consumed, target, remaining);

  // Overshoot overlap arc (Change 2)
  const overshoot = isOver ? consumed - target : 0;
  const overshootRatio = isOver && target > 0 ? Math.min(overshoot / target, 1) : 0;
  const overlapOffset = CIRCUMFERENCE * (1 - overshootRatio);

  const ariaLabel = hasTarget
    ? isOver
      ? `${consumed} of ${target} calories consumed, ${Math.abs(remaining)} over target`
      : `${consumed} of ${target} calories consumed, ${remaining} remaining`
    : `${consumed} calories consumed, no target set`;

  return (
    <div
      className="relative w-48 h-48 aspect-square mx-auto drop-shadow-[0_12px_32px_rgb(239_68_68_/_0.18)]"
      role="img"
      aria-label={ariaLabel}
    >
      {/* SVG Ring */}
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {/* Gradient definitions */}
        <defs>
          <linearGradient id={ringGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#F87171" />
          </linearGradient>
          <linearGradient id={overflowGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7F1D1D" />
            <stop offset="100%" stopColor="#B91C1C" />
          </linearGradient>
        </defs>

        <g transform="rotate(-90 100 100)">
          {/* Track */}
          <circle
            cx={100}
            cy={100}
            r={RADIUS}
            fill="none"
            stroke={COLOR}
            strokeWidth={STROKE}
            strokeOpacity={0.15}
          />
          {/* Progress */}
          {hasTarget && (
            <motion.circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              stroke={`url(#${ringGradientId})`}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: reduce ? CIRCUMFERENCE * (1 - progress) : CIRCUMFERENCE }}
              animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
              transition={{
                duration: reduce ? 0 : 1.5,
                ease: RING_EASE,
                delay: reduce ? 0 : 0.3,
              }}
            />
          )}
          {/* Overshoot overlap arc */}
          {isOver && (
            <motion.circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              stroke={`url(#${overflowGradientId})`}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: reduce ? overlapOffset : CIRCUMFERENCE }}
              animate={{ strokeDashoffset: overlapOffset }}
              transition={{
                duration: reduce ? 0 : 1.5,
                ease: RING_EASE,
                delay: reduce ? 0 : 0.6,
              }}
            />
          )}
        </g>
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {hasTarget ? (
          <>
            <p className="text-4xl font-black font-mono tabular-nums leading-none tracking-tight" style={{ color: numberColor }}>
              <AnimatedNumber value={displayValue} />
            </p>
            <p className="text-xs font-medium uppercase tracking-wide mt-1" style={{ color: numberColor, opacity: 0.7 }}>
              {CALORIE_UNIT} {isOver ? "over" : "left"}
            </p>
            {isOver ? (
              <p className="text-[10px] mt-1" style={{ color: numberColor, opacity: 0.4 }}>
                <AnimatedNumber value={consumed} /> {CALORIE_UNIT} eaten
              </p>
            ) : (
              <p className="text-[10px] mt-1" style={{ color: numberColor, opacity: 0.4 }}>
                Goal {target.toLocaleString()}
              </p>
            )}
          </>
        ) : (
          <span className="text-4xl font-black text-muted-foreground/40">&mdash;</span>
        )}
      </div>
    </div>
  );
}
