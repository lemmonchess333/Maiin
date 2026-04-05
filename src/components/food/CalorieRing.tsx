import { motion } from "framer-motion";
import { THEME } from "@/lib/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

interface CalorieRingProps {
  consumed: number;
  target: number;
}

const RADIUS = 85;
const STROKE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const COLOR = THEME.macros.calories;
const NEAR_TARGET_COLOR = "#DC2626"; // red-600
const OVER_COLOR = "#B91C1C"; // red-700

function getNumberColor(target: number, remaining: number): string {
  if (target <= 0) return "#D1D5DB"; // gray-300
  if (remaining < 0) return OVER_COLOR;
  if (remaining / target <= 0.1) return NEAR_TARGET_COLOR;
  return COLOR;
}

export default function CalorieRing({ consumed, target }: CalorieRingProps) {
  const reduce = useReducedMotion();
  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const isOver = hasTarget && remaining < 0;
  const progress = hasTarget ? Math.min(consumed / target, 1) : 0;
  const displayValue = isOver ? Math.abs(remaining) : remaining;
  const numberColor = getNumberColor(target, remaining);

  const ariaLabel = hasTarget
    ? isOver
      ? `${consumed} of ${target} calories consumed, ${Math.abs(remaining)} over target`
      : `${consumed} of ${target} calories consumed, ${remaining} remaining`
    : `${consumed} calories consumed, no target set`;

  return (
    <div
      className="relative w-40 h-40 aspect-square mx-auto"
      role="img"
      aria-label={ariaLabel}
    >
      {/* SVG Ring */}
      <svg viewBox="0 0 200 200" className="w-full h-full">
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
              stroke={COLOR}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: reduce ? CIRCUMFERENCE * (1 - progress) : CIRCUMFERENCE }}
              animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
              transition={{
                duration: reduce ? 0 : 1.5,
                ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
                delay: reduce ? 0 : 0.3,
              }}
            />
          )}
        </g>
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {hasTarget ? (
          <>
            <p className="text-3xl font-bold font-mono tabular-nums leading-none" style={{ color: numberColor }}>
              {isOver && "+"}
              <AnimatedNumber value={displayValue} />
            </p>
            <p className="text-xs font-medium uppercase tracking-wide mt-1" style={{ color: numberColor, opacity: 0.7 }}>
              {CALORIE_UNIT} {isOver ? "over" : "left"}
            </p>
            <p className="text-[10px] mt-1" style={{ color: numberColor, opacity: 0.4 }}>
              <AnimatedNumber value={consumed} /> {CALORIE_UNIT} eaten
            </p>
          </>
        ) : (
          <span className="text-3xl font-bold text-gray-300">&mdash;</span>
        )}
      </div>
    </div>
  );
}
