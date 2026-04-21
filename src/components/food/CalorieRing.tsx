import { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight } from "lucide-react";
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

// Brand colours — ring uses the Tropos purple palette, matching the app's
// primary colour. Both modes (left / eaten) share the same visual identity;
// the toggle changes the displayed value, not the ring's colour.
//
// Over-target does NOT escalate to amber or red. Previously the number and
// overshoot arc cascaded through warning-orange into deep red, which
// (a) treated going over as a failure state, and (b) clashed with the
// macro ring colours (which stayed pink/blue/orange). Now the ring stays
// purple, the number stays purple, and "over" is communicated by the
// tertiary "kcal over" label + the overshoot arc in a darker purple shade.
const COLOR_RING = "#7B72E9"; // brand purple
const COLOR_RING_LIGHT = "#A8A2EF"; // lighter stop for the arc gradient
const COLOR_RING_DEEP = "#5D55C9"; // deeper stop for the overshoot arc
const COLOR_TRACK = "rgba(123, 114, 233, 0.10)";

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

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

  // Colour stays purple in both modes — the toggle changes the displayed
  // value, not the ring's visual identity. The centre label text is the
  // only mode indicator ("KCAL LEFT" vs "KCAL EATEN").
  const numberColor = hasTarget ? COLOR_RING : "#D1D5DB";
  const trackColor = COLOR_TRACK;

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
        // Celebration glow — purple matching the ring itself.
        filter: glowing ? "drop-shadow(0 0 16px rgba(123, 114, 233, 0.4))" : undefined,
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
            <stop offset="0%" stopColor={COLOR_RING_LIGHT} />
            <stop offset="100%" stopColor={COLOR_RING} />
          </linearGradient>
          {/* Overshoot gradient — a deeper shade of the same brand purple
              so going over target still reads visually without introducing
              a red "danger" state. The arc layers on top of the main ring
              and only extends up to 1× target (capped), so it looks like
              the ring has completed a second lap rather than broken. */}
          <linearGradient id={overflowGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLOR_RING} />
            <stop offset="100%" stopColor={COLOR_RING_DEEP} />
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
              stroke={`url(#${ringGradientId})`}
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

      {/* Centre text — cross-fades on mode toggle. aria-hidden because
          the outer button's aria-label already announces the same value
          (and the mode toggle hint), so without this VoiceOver reads
          the calorie number twice on focus. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-hidden="true">
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
                className="text-4xl font-extrabold font-mono tabular-nums leading-none tracking-tight"
                style={{ color: numberColor, opacity: displayValue === 0 ? 0.4 : 1 }}
              >
                <AnimatedNumber value={displayValue} duration={ringDurationSec} ease={RING_EASE} />
              </p>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mt-1 flex items-center gap-1"
                style={{ color: numberColor, opacity: 0.7 }}
              >
                {CALORIE_UNIT} {isLeftMode ? (isOver ? "over" : "left") : "eaten"}
                <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" aria-hidden="true" />
              </p>
              {trajectoryLabel && (
                <p className="text-[10px] mt-1 text-muted-foreground/70 font-mono tabular-nums">
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
          <span className="text-4xl font-extrabold text-muted-foreground/40">&mdash;</span>
        )}
      </div>
    </button>
  );
}
