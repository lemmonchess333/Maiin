import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import { getCalorieRingDisplay } from "@/lib/calorieRingDisplay";
import { loggedFill, WHEEL_SIZE, WHEEL_STROKE } from "@/lib/calorieRingFill";
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
  /** How long the arc takes to redraw and the number to count, in ms.
   *  Default 1500. */
  ringDurationMs?: number;
  /** How long the arc waits before it redraws, in ms. Default 100. */
  ringDelayMs?: number;
  /** Draw the ring and count the number up from zero when it mounts
   *  (the default). False mounts it already drawn, at its figures —
   *  Food's hero after a day switch, which is a browse, not a log. */
  drawIn?: boolean;
  /**
   * "hero" is the Food page's wheel (Food11 call 2): 264px, on the page
   * and not in a card, the screen's one hero. Its label carries the
   * target ("kcal left of 2,200") and a small mark that says the wheel
   * can be tapped.
   *
   * "compact" is the same wheel at the size Home's food card draws it:
   * one wheel, so the screens show the same object (owner call; DS3's
   * STATUS lines). The drawing scales with the box; the number steps
   * down, and the label keeps its 12px text so it stays readable.
   */
  size?: "hero" | "compact";
}

/* Drawn on a 160 box. Nothing may paint past r + stroke / 2 = SIZE / 2:
   the box clips it flat on all four sides (regression-pinned). */
const SIZE = WHEEL_SIZE;
const STROKE = WHEEL_STROKE;
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

/* The second lap is the same hue as the first, a step deeper, so where
   its head lies on the first lap the two can run together. A sliver of
   the surface's own colour just ahead of the head keeps them apart
   (Food11 call 2; of the ring apps looked at, the one with a same-hue
   second lap, Google Health's, outlines its head). It is a dot of the
   ring's own width set this far ahead along the ring and drawn under the
   lap, so only its leading edge shows, and nothing is drawn wider than
   the ring (the box would clip it flat; see SIZE). In the 160 box's
   units: 4px on the 264px wheel, under 2px on Home's. */
const LAP_GAP = 2.5;

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

export default function CalorieRing({
  consumed,
  target,
  mode,
  onToggleMode,
  trajectoryLabel,
  glowing = false,
  ringDurationMs = 1500,
  ringDelayMs = 100,
  drawIn = true,
  size = "hero",
}: CalorieRingProps) {
  const compact = size === "compact";
  const hero = size === "hero";
  /* What the wheel stands on: the page for Food's, a card for Home's.
     The sliver ahead of the second lap's head is this colour. */
  const surface = hero ? "hsl(var(--background))" : "hsl(var(--card))";
  const reduce = useReducedMotion();
  const settled = reduce || !drawIn;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;

  const isLeftMode = mode === "left";

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

  /* The arc is what is logged, in both modes (Food11 call 5): it grows
     as food is logged, and nothing logged is the bare grey track. Only
     the number and its label follow the left and logged switch
     (`loggedFill` has the reasons). */
  const fillRatio = loggedFill(consumed, target);
  const strokeDashoffset = CIRCUMFERENCE * (1 - fillRatio);

  // Overshoot lap, in both modes, capped at one extra lap.
  const overshoot = isOver ? consumed - target : 0;
  const overshootRatio =
    isOver && target > 0 ? Math.min(overshoot / target, 1) : 0;
  const overlapOffset = CIRCUMFERENCE * (1 - overshootRatio);
  /* Where the sliver's dot sits: the lap's length along the ring, and the
     gap more. A negative offset moves a dash forward. */
  const lapGapOffset = -(CIRCUMFERENCE * overshootRatio + LAP_GAP);

  const ringDurationSec = ringDurationMs / 1000;
  const ringDelaySec = ringDelayMs / 1000;
  /* The second lap takes as long as the first and starts a moment after
     it, so going over reads as filled, then past, inside the same log
     moment. It ran 1.5 s from 0.6 s whatever the first lap took, so a
     log over the target was shown 2.1 s after it was made. */
  const lapTransition = {
    duration: reduce ? 0 : ringDurationSec,
    ease: RING_EASE,
    delay: reduce ? 0 : ringDelaySec + 0.15,
  };

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
      /* The food's flight finds the wheel by this (`FoodLogFlight`). */
      data-calorie-wheel=""
      onClick={onToggleMode}
      aria-label={
        ariaLabel + ". Tap to toggle between calories left and calories logged."
      }
      className={cn(
        "relative aspect-square block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full",
        // Never wider than what holds it: at larger text on the phone
        // the ring's rem size outgrew its card.
        /* Food's wheel is 264px (Food11 call 2; 176 before), a drawing
           sized in px so larger text does not grow it past a 320px
           phone, and its figure is the screen's largest text. A
           container, so the figure sizes from the ring and never
           outgrows it at larger text. */
        hero
          ? "@container w-[264px] max-w-full mx-auto"
          : "w-26 max-w-full shrink-0"
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
                strokeDashoffset: settled ? strokeDashoffset : CIRCUMFERENCE,
              }}
              animate={{ strokeDashoffset }}
              transition={{
                duration: reduce ? 0 : ringDurationSec,
                ease: RING_EASE,
                delay: reduce ? 0 : ringDelaySec,
              }}
            />
          )}
          {/* Overshoot lap — in BOTH modes when over target, so the
              logged view does not sit at 100% indistinguishable from
              "hit the target exactly". It starts a moment after the
              main ring (`lapTransition`). */}
          {/* The sliver ahead of the second lap's head (LAP_GAP). It
              travels with the head: the same transition. */}
          {isOver && (
            <motion.circle
              data-lap-gap=""
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              style={{ stroke: surface }}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`0.01 ${CIRCUMFERENCE}`}
              initial={{
                strokeDashoffset: settled ? lapGapOffset : -LAP_GAP,
              }}
              animate={{ strokeDashoffset: lapGapOffset }}
              transition={lapTransition}
            />
          )}
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
                strokeDashoffset: settled ? overlapOffset : CIRCUMFERENCE,
              }}
              animate={{ strokeDashoffset: overlapOffset }}
              transition={lapTransition}
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
          /* One figure for both modes: a tap counts it from the old value
             to the new one, as the tiles do. Keyed by mode, it went blank
             for 200 ms, then counted up from zero for 1.5 s. */
          <div className="flex flex-col items-center">
            {/* Zero is a real value, not a placeholder: full strength,
                  like any other number. */}
            <p
              className={cn(
                "font-extrabold font-figure tabular-nums leading-none tracking-tight text-foreground",
                compact
                  ? "text-2xl"
                  : "text-[clamp(1.75rem,25cqw,var(--text-display))]"
              )}
            >
              <AnimatedNumber
                value={displayValue}
                duration={ringDurationSec}
                ease={RING_EASE}
                fromZero={drawIn}
              />
            </p>
            {/* The label is the only mode indicator ("kcal left",
                  "kcal logged", "kcal over"), in the tiles' register:
                  plain text. The whole ring is the tap target, and the
                  macros switch the same way.

                  Food's wheel adds two things to it (Food11 call 2, from
                  the research). The target, so the number has both ends
                  of its range beside it: "kcal left of 2,200" (5 of the
                  6 food apps with a ring print the goal by the number,
                  and Apple's gauge rule asks for it). And a small mark
                  after the words, because nothing else says the wheel
                  can be tapped: the two apps that switch on a tap both
                  mark it. DS3 took a swap arrow off this label with the
                  tag it sat in; this is a 13px grey mark, and Home's
                  wheel still has none. The label may wrap inside the
                  ring at larger text. */}
            <p
              className={cn(
                "font-medium text-muted-foreground",
                hero
                  ? "mt-2 max-w-[72cqw] text-center text-balance text-sm font-mono tabular-nums"
                  : "mt-1 text-xs"
              )}
            >
              {hero ? (
                <>
                  {labelMode === "over"
                    ? `${CALORIE_UNIT} over ${formatCalories(target)}`
                    : `${CALORIE_UNIT} ${labelMode} of ${formatCalories(target)}`}
                  {/* In the line, so it stays beside the last word when
                      the label wraps, and sized from the text (13px at
                      the label's 14). */}
                  <ChevronsUpDown
                    data-tap-mark=""
                    className="ml-1 inline-block size-[0.93em] align-[-0.08em]"
                    aria-hidden="true"
                  />
                </>
              ) : (
                `${CALORIE_UNIT} ${labelMode}`
              )}
            </p>
            {trajectoryLabel && (
              <p className="text-caption mt-1 text-muted-foreground font-mono tabular-nums">
                {trajectoryLabel}
              </p>
            )}
          </div>
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
