import { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getOverTargetColor } from "@/lib/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

export type CalorieRingMode = "left" | "eaten";

interface CalorieRingProps {
  consumed: number;
  target: number;
  mode: CalorieRingMode;
  onToggleMode: () => void;
  /** "On pace" / "150 ahead" / "150 behind" / null to suppress */
  trajectoryLabel: string | null;
  /** Drives celebration drop-shadow. Parent owns the timing. */
  glowing?: boolean;
  /** Main ring redraw duration in seconds. Default 1.5. */
  ringDurationMs?: number;
  /**
   * Transient training-burn notice. When non-null, shows "+{delta} · {source}"
   * beneath the centre label for ~3s. Parent owns the lifecycle (detection,
   * lastLogMomentAt race, auto-dismiss). Null to hide.
   */
  trainingBurnToast?: { delta: number; source: string } | null;
}

// New dimensions per spec: 160px diameter, ~10px stroke
const RADIUS = 75;
const STROKE = 10;
const SIZE = 160;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Brand colours
const COLOR_LEFT = "#EF4444"; // red-500
const COLOR_LEFT_TRACK = "rgb(239 68 68 / 0.1)";
const COLOR_EATEN = "#6B7280"; // neutral-500
const COLOR_EATEN_TRACK = "#E5E7EB"; // neutral-200

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

function getLeftNumberColor(consumed: number, target: number, remaining: number): string {
  if (target <= 0) return "#D1D5DB";
  if (remaining < 0) return getOverTargetColor(consumed, target);
  if (remaining / target <= 0.1) return "#DC2626"; // near target — deeper red
  return COLOR_LEFT;
}

export default function CalorieRing({
  consumed,
  target,
  mode,
  onToggleMode,
  trajectoryLabel,
  glowing = false,
  ringDurationMs = 1500,
  trainingBurnToast = null,
}: CalorieRingProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const ringGradientId = `calorie-ring-gradient${id}`;
  const overflowGradientId = `calorie-overflow-gradient${id}`;
  const trackFilterId = `calorie-track-inset${id}`;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const isOver = hasTarget && remaining < 0;

  const isLeftMode = mode === "left";
  const progress = hasTarget ? Math.min(consumed / target, 1) : 0;

  // Value shown in centre depends on mode
  // LEFT: remaining (or magnitude if over)
  // EATEN: consumed total
  const displayValue = isLeftMode
    ? (isOver ? Math.abs(remaining) : remaining)
    : consumed;

  // Colour: LEFT uses red ramp, EATEN uses neutral grey
  const numberColor = isLeftMode
    ? getLeftNumberColor(consumed, target, remaining)
    : COLOR_EATEN;

  // Stroke / track colour
  const strokeColor = isLeftMode ? COLOR_LEFT : COLOR_EATEN;
  const trackColor = isLeftMode ? COLOR_LEFT_TRACK : COLOR_EATEN_TRACK;

  // Ring fill direction:
  // LEFT mode = drains from full as consumed grows (1 - progress)
  // EATEN mode = fills from empty as consumed grows (progress)
  const fillRatio = isLeftMode ? 1 - progress : progress;
  const strokeDashoffset = CIRCUMFERENCE * (1 - fillRatio);

  // Overshoot arc (only shown in LEFT mode when over target)
  const overshoot = isOver ? consumed - target : 0;
  const overshootRatio = isOver && target > 0 ? Math.min(overshoot / target, 1) : 0;
  const overlapOffset = CIRCUMFERENCE * (1 - overshootRatio);

  const ringDurationSec = ringDurationMs / 1000;

  const ariaLabel = hasTarget
    ? isOver
      ? `${consumed} of ${target} calories consumed, ${Math.abs(remaining)} over target`
      : isLeftMode
        ? `${consumed} of ${target} calories consumed, ${remaining} remaining`
        : `${consumed} of ${target} calories eaten`
    : `${consumed} calories consumed, no target set`;

  return (
    <button
      type="button"
      onClick={onToggleMode}
      aria-label={ariaLabel + ". Tap to toggle between calories left and calories eaten."}
      className="relative w-40 h-40 aspect-square mx-auto block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
      style={{
        filter: glowing ? "drop-shadow(0 0 16px rgb(239 68 68 / 0.4))" : undefined,
        transition: "filter 800ms ease-in-out",
      }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full">
        <defs>
          {/* Apple Activity Rings-style gradient — lighter at the top of the
              arc (12 o'clock), deeper at the bottom. Uses userSpaceOnUse so
              the gradient is anchored to the SVG viewport, not to the
              rotated <g>. The -90° rotation on <g> starts the arc at 12
              o'clock; this vertical gradient naturally aligns lighter at
              the arc start and deeper at the arc end. */}
          <linearGradient
            id={ringGradientId}
            x1="0" y1="0" x2="0" y2={SIZE}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FCA5A5" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
          <linearGradient id={overflowGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7F1D1D" />
            <stop offset="100%" stopColor="#B91C1C" />
          </linearGradient>
          {/* Inset shadow filter for the track circle — makes it read as a
              recessed groove cut into the white card surface rather than a
              flat painted shape. Uses feComposite operator="out" to invert
              the blur into a true inner shadow (regular drop-shadow would
              make it look like it's floating). */}
          <filter id={trackFilterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
            <feOffset in="blur" dx="0" dy="1" result="offsetBlur" />
            <feComposite in="offsetBlur" in2="SourceAlpha" operator="out" result="innerShadow" />
            <feFlood floodColor="#000000" floodOpacity="0.08" result="colour" />
            <feComposite in="colour" in2="innerShadow" operator="in" result="colouredShadow" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="colouredShadow" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {/* Track — inset shadow filter makes it read as a recessed groove */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={trackColor}
            strokeWidth={STROKE}
            filter={`url(#${trackFilterId})`}
          />
          {/* Progress */}
          {hasTarget && (
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={isLeftMode ? `url(#${ringGradientId})` : strokeColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: reduce ? strokeDashoffset : CIRCUMFERENCE }}
              animate={{ strokeDashoffset }}
              transition={{
                duration: reduce ? 0 : ringDurationSec,
                ease: RING_EASE,
                delay: reduce ? 0 : 0.1,
              }}
            />
          )}
          {/* Overshoot overlap arc — only in LEFT mode when over target.
              Intentional longer flourish (1.5s / 0.6s delay) — runs AFTER the
              main 600ms log moment completes. Haptic fires via the main ring's
              onComplete, not at the end of the overshoot. */}
          {isLeftMode && isOver && (
            <motion.circle
              cx={CENTER}
              cy={CENTER}
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

      {/* Centre text — cross-fades on mode toggle */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {hasTarget ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center"
            >
              <p
                className="text-4xl font-black font-mono tabular-nums leading-none tracking-tight"
                style={{ color: numberColor }}
              >
                <AnimatedNumber value={displayValue} duration={ringDurationSec} ease={RING_EASE} />
              </p>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mt-1"
                style={{ color: numberColor, opacity: 0.7 }}
              >
                {CALORIE_UNIT} {isLeftMode ? (isOver ? "over" : "left") : "eaten"}
              </p>
              {trajectoryLabel && (
                <p className="text-[10px] mt-1 text-muted-foreground/70 tabular-nums">
                  {trajectoryLabel}
                </p>
              )}
              {/* Training-burn toast — transient, ~3s lifetime. Lives below
                  the trajectory line (or directly below KCAL LEFT when no
                  trajectory is showing). */}
              <AnimatePresence>
                {trainingBurnToast && (
                  <motion.p
                    key="training-burn-toast"
                    initial={reduce ? false : { opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -2 }}
                    transition={{ duration: reduce ? 0 : 0.2 }}
                    className="text-[10px] mt-1 text-muted-foreground/80 tabular-nums"
                  >
                    +{Math.round(trainingBurnToast.delta)} · {trainingBurnToast.source}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        ) : (
          <span className="text-4xl font-black text-muted-foreground/40">&mdash;</span>
        )}
      </div>
    </button>
  );
}
