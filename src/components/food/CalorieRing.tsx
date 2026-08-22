import { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
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
}

// Ring dimensions — restore a larger focal ring so the hero reads as the
// primary surface again on the Food page. Keeps the same 1:16-ish visual
// stroke ratio and preserves centre typography hierarchy.
const SIZE = 160;
const RADIUS = 75;
const STROKE = 10;
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
const COLOR_RING = THEME.brand; // brand purple
const COLOR_RING_LIGHT = THEME.calorieRing.light; // lighter arc gradient stop
const COLOR_RING_DEEP = THEME.calorieRing.deep; // deeper overshoot arc stop
const COLOR_TRACK = THEME.iconBg; // brand tint (rgba(123,114,233,0.10))

const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

export default function CalorieRing({
  consumed,
  target,
  mode,
  onToggleMode,
  trajectoryLabel,
  glowing = false,
  ringDurationMs = 1500,
}: CalorieRingProps) {
  const reduce = useReducedMotion();
  const isDark = useIsDarkMode();
  const id = useId();
  const ringGradientId = `calorie-ring-gradient${id}`;
  const overflowGradientId = `calorie-overflow-gradient${id}`;
  const trackFilterId = `calorie-track-inset${id}`;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;

  const isLeftMode = mode === "left";
  const progress = hasTarget ? Math.min(consumed / target, 1) : 0;

  /* Centre value + label derivation lives in a pure helper so the
     label/value pairing is unit-testable without mounting the
     component. Pre-F3.1 the inline label expression forced "over"
     whenever isOver was true regardless of mode, which produced
     "5700 KCAL OVER" in eaten mode + over target — the value
     was the consumed amount, not the over amount. The helper now
     anchors the contract: eaten mode always reads "eaten",
     left mode reads "over" when the user has gone past target
     (with the magnitude as the centre number) or "left" otherwise. */
  const { displayValue, labelMode, isOver } = getCalorieRingDisplay({
    consumed,
    target,
    isLeftMode,
  });

  /* Colour stays purple in both modes — the toggle changes the displayed
     value, not the ring's visual identity. The centre label text is the
     only mode indicator ("KCAL LEFT" vs "KCAL EATEN").

     Theme split (the chip's #1728 pattern, applied to the number): DARK
     keeps the brand purple on the dark card; LIGHT uses the deeper ring
     step. The brand purple measures ~3:1 against the light-mode photo
     wash — the exact large-text floor, with lunch marginally under —
     and that floor is what forced the wash to stay heavy. The deep step
     (~5:1 on white) buys the headroom that lets the wash lighten so the
     photo reads as food instead of fog. On the plain white card it is
     simply higher-contrast, same family. */
  const numberColor = hasTarget
    ? isDark
      ? COLOR_RING
      : COLOR_RING_DEEP
    : THEME.neutral[300];

  /* Ring track. The 10% brand tint reads as a recessed groove on a flat
     WHITE card, but it's far too sheer over the dark-mode hero photo —
     and at 0 progress the track is the ONLY ring geometry drawn (the
     progress arc has zero length), so a track you can't see means the
     ring disappears entirely on a day with nothing logged. Dark mode
     therefore gets a stronger tint so the circle always reads as a
     shape, empty or not. */
  const trackColor = isDark ? `${COLOR_RING}52` : COLOR_TRACK;

  /* The SVG halo bed that briefly lived here (2026-07-26, #1753/#1774)
     is REMOVED — device feedback: it read as a hard black outline in
     dark mode, and its STROKE+6 width painted past the 160px viewBox
     (ring outer edge sits EXACTLY at the box edge at r=75 + stroke/2),
     so the box clipped it flat on all four sides. The wheel's bed is
     the photo scrim's concentrated ring-bed disc in FoodHeroCard —
     soft-edged and unclippable. Nothing drawn here may exceed
     r + strokeWidth/2 = SIZE/2 (regression-pinned). */

  /* Zero is a real value, not a placeholder — it renders at full strength
     like any other. The centre number used to drop to 0.4 opacity at
     zero: a soft "nothing yet" cue that was survivable on a plain card
     but rendered the hero's primary number all but invisible over the
     dark-mode photo, which is exactly the state a user opens the app in
     each morning. The de-emphasis was also redundant — an empty progress
     arc already says "nothing logged" — and it broke the app's
     consistent-numeric-treatment rule by special-casing one value. */

  /* Mode-chip palette, theme-aware (mirrors the useMacroPalette split).
     The deep purple below is tuned for the lavender tint over a WHITE
     card; on the dark card it lands at ~2.8:1 — under AA for 11px text —
     and it disappears almost entirely over the dark-mode hero photo,
     where the 10% tint is too sheer to give the text a surface of its
     own. In dark mode the chip therefore uses the LIGHT ring step
     (~7:1 on the dark card) over a slightly stronger purple backing so
     it holds up against photography as well as the flat card. */
  const chipTextColor = isDark ? COLOR_RING_LIGHT : COLOR_RING_DEEP;
  /* Light backing is OPAQUE (the tint flattened on white): translucent
     10% tint went sheer over the photo wash and the chip fell under AA
     on the busiest shot (3.06:1). Same rendered colour on a plain card. */
  const chipBackground = isDark
    ? `${COLOR_RING}33`
    : THEME.calorieRing.chipBgLight;

  // Ring fill direction:
  // LEFT mode = drains from full as consumed grows (1 - progress)
  // EATEN mode = fills from empty as consumed grows (progress)
  const fillRatio = isLeftMode ? 1 - progress : progress;
  const strokeDashoffset = CIRCUMFERENCE * (1 - fillRatio);

  // Overshoot arc (only shown in LEFT mode when over target)
  const overshoot = isOver ? consumed - target : 0;
  const overshootRatio =
    isOver && target > 0 ? Math.min(overshoot / target, 1) : 0;
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
      aria-label={
        ariaLabel + ". Tap to toggle between calories left and calories eaten."
      }
      className="relative size-40 aspect-square mx-auto block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
      style={{
        // Celebration glow — purple matching the ring itself.
        filter: glowing
          ? "drop-shadow(0 0 16px rgba(123, 114, 233, 0.4))"
          : undefined,
        transition: "filter 800ms ease-in-out",
      }}
    >
      {/* Idle breathing pulse — the single ambient loop on the Food hero,
          so the ring reads as alive at rest instead of a static empty
          circle. Glow recipe (WKWebView-safe): a STATIC blurred layer whose
          OPACITY animates — never the blur value. Suppressed under
          reduced-motion and while the completion glow is celebrating, so
          the two never stack. */}
      {!reduce && !glowing && (
        <motion.div
          className="absolute inset-3 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${COLOR_RING}2E 0%, transparent 70%)`,
            filter: "blur(8px)",
          }}
          initial={{ opacity: 0.28 }}
          animate={{ opacity: [0.28, 0.5, 0.28] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        />
      )}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative size-full">
        <defs>
          {/* Apple Activity Rings-style gradient — lighter at the top of the
              arc (12 o'clock), deeper at the bottom. Uses userSpaceOnUse so
              the gradient is anchored to the SVG viewport, not to the
              rotated <g>. The -90° rotation on <g> starts the arc at 12
              o'clock; this vertical gradient naturally aligns lighter at
              the arc start and deeper at the arc end. */}
          <linearGradient
            id={ringGradientId}
            x1="0"
            y1="0"
            x2="0"
            y2={SIZE}
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
          <linearGradient
            id={overflowGradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={COLOR_RING} />
            <stop offset="100%" stopColor={COLOR_RING_DEEP} />
          </linearGradient>
          {/* Inset shadow filter for the track circle — makes it read as a
              recessed groove cut into the white card surface rather than a
              flat painted shape. Uses feComposite operator="out" to invert
              the blur into a true inner shadow (regular drop-shadow would
              make it look like it's floating). */}
          <filter
            id={trackFilterId}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
            <feOffset in="blur" dx="0" dy="1" result="offsetBlur" />
            <feComposite
              in="offsetBlur"
              in2="SourceAlpha"
              operator="out"
              result="innerShadow"
            />
            <feFlood floodColor="#000000" floodOpacity="0.08" result="colour" />
            <feComposite
              in="colour"
              in2="innerShadow"
              operator="in"
              result="colouredShadow"
            />
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
          {/* Overshoot overlap arc — renders in BOTH modes when over target.
              Previously LEFT-only, which left EATEN-mode users with no
              visual indication they'd gone over (the ring just sat at
              100% indistinguishable from "hit your target exactly").
              Intentional longer flourish (1.5s / 0.6s delay) — runs AFTER
              the main 600ms log moment completes. Haptic fires via the
              main ring's onComplete, not at the end of the overshoot. */}
          {isOver && (
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={`url(#${overflowGradientId})`}
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
              <p
                className="text-4xl font-extrabold font-mono tabular-nums leading-none tracking-tight"
                style={{ color: numberColor }}
              >
                <AnimatedNumber
                  value={displayValue}
                  duration={ringDurationSec}
                  ease={RING_EASE}
                />
              </p>
              {/* Mode indicator promoted from a faint caption into an
                  obvious toggle pill: a purple-tinted rounded chip carrying
                  the active mode word + the swap glyph. The tinted background
                  + the ⇄ icon read as "tap to switch" at a glance, so the
                  active framing (LEFT vs EATEN) is legible without parsing
                  the 10px text. Reuses the ring's own track tint
                  (`trackColor`) for the chip. In LIGHT mode the text is the
                  deeper brand purple (`COLOR_RING_DEEP`, already the
                  overshoot-arc shade) so it clears WCAG AA (~5.3:1) on the
                  lavender tint at 10px; DARK mode flips to the lighter ring
                  step over a stronger backing (see `chipTextColor` above) —
                  the deep purple failed AA on the dark card and vanished
                  over the hero photo. Either way it stays one purple
                  identity. */}
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold uppercase tracking-wider"
                style={{
                  color: chipTextColor,
                  backgroundColor: chipBackground,
                }}
              >
                {CALORIE_UNIT} {labelMode}
                <ArrowLeftRight className="size-2.5" aria-hidden="true" />
              </span>
              {trajectoryLabel && (
                <p className="text-caption mt-1 text-muted-foreground font-mono tabular-nums">
                  {trajectoryLabel}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <span className="text-4xl font-extrabold text-muted-foreground">
            &mdash;
          </span>
        )}
      </div>
    </button>
  );
}
