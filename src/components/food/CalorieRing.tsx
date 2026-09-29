import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { getCalorieRingDisplay } from "@/lib/calorieRingDisplay";
import { THEME } from "@/lib/theme";

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
   * "hero" is the Food page's ring. "compact" is the same ring at the size
   * Home's food card draws it: one ring, two sizes, so the two screens
   * show the same object (owner call; DS3's STATUS lines). The drawing
   * scales with the box; the number steps down, and the label keeps its
   * 12px text so it stays readable.
   */
  size?: "hero" | "compact";
}

/* Drawn on a 160 box. Nothing may paint past r + stroke / 2 = SIZE / 2:
   the box clips it flat on all four sides (regression-pinned). */
const SIZE = 160;
const STROKE = 12;
const RADIUS = SIZE / 2 - STROKE / 2;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/* The quiet ring (owner call; DS3's STATUS lines). One colour does one
   job: the arc is the food orange and nothing else on the ring is. The
   number is the text colour, as the macro tiles' numbers are; the track
   is a plain grey groove; and the label under the number is plain grey
   text, not a tag. It had an orange number in an orange tag, a gradient
   arc, a shadowed track and a slow pulsing glow, and read as decoration
   rather than a reading.

   Over target does NOT escalate to amber or red: the overshoot lap is a
   deeper orange, so going over reads as a second lap, not a failure, and
   the label says "over". */
const COLOR_RING = THEME.semantic.nutrition; // food orange
const COLOR_RING_DEEP = THEME.calorieRing.deep; // overshoot lap
/* A token rather than an orange tint: grey reads as "not yet" on the
   plain card, on Food's wash, and in both themes, where the tint went
   muddy brown on the dark card. */
const COLOR_TRACK = "hsl(var(--muted-foreground) / 0.2)";

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

export default function CalorieRing({
  consumed,
  target,
  mode,
  onToggleMode,
  trajectoryLabel,
  glowing = false,
  ringDurationMs = 1500,
  size = "hero",
}: CalorieRingProps) {
  const compact = size === "compact";
  const reduce = useReducedMotion();

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;

  const isLeftMode = mode === "left";
  const progress = hasTarget ? Math.min(consumed / target, 1) : 0;

  /* Centre value + label derivation lives in a pure helper so the
     label/value pairing is unit-testable without mounting the
     component: left mode reads "over" past the target (with the
     magnitude as the centre number) or "left" otherwise, and the other
     mode always reads "logged". */
  const { displayValue, labelMode, isOver } = getCalorieRingDisplay({
    consumed,
    target,
    isLeftMode,
  });

  // Ring fill direction:
  // LEFT mode = drains from full as consumed grows (1 - progress)
  // LOGGED mode = fills from empty as consumed grows (progress)
  const fillRatio = isLeftMode ? 1 - progress : progress;
  const strokeDashoffset = CIRCUMFERENCE * (1 - fillRatio);

  // Overshoot lap, in both modes, capped at one extra lap.
  const overshoot = isOver ? consumed - target : 0;
  const overshootRatio =
    isOver && target > 0 ? Math.min(overshoot / target, 1) : 0;
  const overlapOffset = CIRCUMFERENCE * (1 - overshootRatio);

  const ringDurationSec = ringDurationMs / 1000;

  const ariaLabel = hasTarget
    ? isOver
      ? `${consumed} of ${target} calories logged, ${Math.abs(remaining)} over target`
      : isLeftMode
        ? `${consumed} of ${target} calories logged, ${remaining} remaining`
        : `${consumed} of ${target} calories logged`
    : `${consumed} calories logged, no target set`;

  return (
    <button
      type="button"
      onClick={onToggleMode}
      aria-label={
        ariaLabel + ". Tap to toggle between calories left and calories logged."
      }
      className={cn(
        "relative aspect-square block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full",
        compact ? "size-26 shrink-0" : "size-40 mx-auto"
      )}
      style={{
        // Celebration glow — the ring's own orange, for the moment a day's
        // goals are met. Transient; the ring has no ambient loop.
        filter: glowing ? `drop-shadow(0 0 16px ${COLOR_RING}66)` : undefined,
        transition: "filter 800ms ease-in-out",
      }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative size-full">
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            style={{ stroke: COLOR_TRACK }}
            strokeWidth={STROKE}
          />
          {hasTarget && (
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={COLOR_RING}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{
                strokeDashoffset: reduce ? strokeDashoffset : CIRCUMFERENCE,
              }}
              animate={{ strokeDashoffset }}
              transition={{
                duration: reduce ? 0 : ringDurationSec,
                ease: RING_EASE,
                delay: reduce ? 0 : 0.1,
              }}
            />
          )}
          {/* Overshoot lap — in BOTH modes when over target, so the
              logged view does not sit at 100% indistinguishable from
              "hit the target exactly". Runs after the main ring's draw. */}
          {isOver && (
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={COLOR_RING_DEEP}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{
                strokeDashoffset: reduce ? overlapOffset : CIRCUMFERENCE,
              }}
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
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
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
              {/* Zero is a real value, not a placeholder: full strength,
                  like any other number. */}
              <p
                className={cn(
                  "font-extrabold font-mono tabular-nums leading-none tracking-tight text-foreground",
                  compact ? "text-2xl" : "text-4xl"
                )}
              >
                <AnimatedNumber
                  value={displayValue}
                  duration={ringDurationSec}
                  ease={RING_EASE}
                />
              </p>
              {/* The label is the only mode indicator ("kcal left",
                  "kcal logged", "kcal over"), in the tiles' register:
                  plain text. The whole ring is the tap target, and the
                  tiles switch the same way. */}
              <p
                className={cn(
                  "text-xs font-medium text-muted-foreground",
                  compact ? "mt-1" : "mt-1.5"
                )}
              >
                {CALORIE_UNIT} {labelMode}
              </p>
              {trajectoryLabel && (
                <p className="text-caption mt-1 text-muted-foreground font-mono tabular-nums">
                  {trajectoryLabel}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <span
            className={cn(
              "font-extrabold text-muted-foreground",
              compact ? "text-2xl" : "text-4xl"
            )}
          >
            &mdash;
          </span>
        )}
      </div>
    </button>
  );
}
