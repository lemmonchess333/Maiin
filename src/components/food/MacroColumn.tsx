import { useEffect, useRef, type ComponentType, type SVGProps } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import {
  motion,
  useMotionValue,
  animate,
  useReducedMotion as useFramerReducedMotion,
} from "framer-motion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { haptic } from "@/lib/haptic";
import type { CalorieRingMode } from "./CalorieRing";

export type MacroColumnKey = "protein" | "carbs" | "fat";

// Accepts lucide-react icons and our own custom SVG icons (e.g. Avocado)
// via a shared shape. Both export a component that takes SVG props,
// className, and strokeWidth.
type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { strokeWidth?: number | string }
>;

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
  const barFillPct = isLeftMode ? (isOver ? 1 : 1 - pct) : pct;

  // Overshoot — only when consumed exceeds target. Capped at one full
  // extra lap; going 3× over wouldn't read any differently than 2×.
  // Layered on top of the base bar in a darker shade of the macro
  // colour, mirroring the calorie ring's overshoot arc (CalorieRing.tsx).
  const overshootPct = isOver ? Math.min((consumed - target) / target, 1) : 0;

  // LEFT mode:
  //   under target → remaining   (e.g. "151g left")
  //   over target  → overshoot   (e.g. "5g over")
  // EATEN mode:
  //   either       → consumed    (e.g. "14g eaten" or "170g eaten")
  const displayValue = isLeftMode
    ? isOver
      ? consumed - target
      : remaining
    : consumed;

  // LEFT mode:
  //   under target → "left"   (e.g. "151g left")
  //   over target  → "over"   (e.g. "5g over")
  // EATEN mode:
  //   either       → "eaten"  (e.g. "14g eaten")
  // Without a label in eaten mode the big number reads ambiguously
  // (a user who didn't notice the toggle sees "85g" with no qualifier).
  // Rendering "eaten" makes the mode self-documenting at the cost of
  // one short word; over-target is signalled by the bar overshoot and
  // the tertiary "X / Yg" line.
  const displayLabel = isLeftMode ? (isOver ? "over" : "left") : "eaten";

  // Food7 (audit #34 — calm the loudest screen): the macro hue now lives
  // ONLY on the icon + progress bar; the big number renders neutral
  // (text-foreground), mirroring the calorie ring's unified-colour story
  // (the ring stays one colour, only the centre label changes). This is
  // the single biggest cut to the Food page's hue count — three saturated
  // 2xl numbers → three calm neutral numbers with small colour accents.
  //
  // The bar keeps the macro's own colour regardless of over/under target.
  // Previously the number AND bar ramped amber → deep red when over, which
  // made the hero read as a failure state even though "over carbs by 10g"
  // isn't a failure. Over-target is communicated by the "over" label + the
  // tertiary "X / Yg" row + the overshoot overlay. No red, no amber.
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
  // Food-delight #3: the macro glyph gets its own life. A small scale-pop
  // on every logged increase makes each log feel responsive; a bigger pop
  // when the goal is crossed rewards the moment; and a soft macro-colour
  // halo (goalReached, below) leaves a lasting "you hit this" mark.
  const iconScale = useMotionValue(1);
  const goalReached = hasTarget && consumed >= target;

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

    if (reduce) return;

    const intakeIncreased = consumed > prevConsumed;
    const crossedPrevTarget =
      prevConsumed <= prevTarget && consumed > prevTarget;
    const justCrossed = intakeIncreased && crossedPrevTarget;

    const controls: { stop: () => void }[] = [];
    if (justCrossed) {
      // Goal landed — a fuller glyph pop + the bar's opacity pulse + a
      // light haptic so hitting a macro is a small felt win, not just a
      // late all-macros-done celebration (Food-delight #2).
      haptic("light");
      controls.push(
        animate(pulseOpacity, [1, 0.6, 1], { duration: 0.4, ease: "easeOut" })
      );
      controls.push(
        animate(iconScale, [1, 1.35, 1], { duration: 0.5, ease: "easeOut" })
      );
    } else if (intakeIncreased) {
      // Ordinary log — a light, satisfying tick.
      controls.push(
        animate(iconScale, [1, 1.15, 1], { duration: 0.35, ease: "easeOut" })
      );
    }
    if (controls.length) return () => controls.forEach((c) => c.stop());
  }, [consumed, target, reduce, pulseOpacity, iconScale]);

  return (
    <button
      type="button"
      data-macro={macroKey}
      onClick={onTap}
      /* Names the ACTION, not the current state. The visible number
         already says what the tile shows; what a screen-reader user
         cannot see is what tapping would do — and since the tap flips a
         mode shared with the calorie ring, "toggle" would be too vague
         to predict. So the label reads as the destination mode.

         The goal-reached state is APPENDED rather than left to the
         sr-only span below, because an `aria-label` REPLACES the
         content-derived name outright: adding this label silently
         dropped "{label} goal reached" out of the button's accessible
         name, which `surfaces.screens.capture.spec.ts` asserts as the
         state-independent proof of the halo. Nothing in the unit suite
         covered it, so it only surfaced in the screenshot CI run. */
      aria-label={
        `Show ${label.toLowerCase()} ${isLeftMode ? "eaten" : "remaining"}` +
        (goalReached ? `. ${label} goal reached` : "")
      }
      className="min-w-0 flex-1 flex flex-col items-center text-center bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
    >
      {/* Kept ALONGSIDE the aria-label above, not replaced by it. Two
          existing unit tests assert this sr-only TEXT, while
          surfaces.screens.capture.spec.ts asserts the accessible NAME —
          and an aria-label satisfies only the second. That split is
          exactly how the regression hid: text-based tests stayed green
          while the name lost the state. Both now carry it. */}
      {goalReached && <span className="sr-only">{label} goal reached</span>}
      {/* Icon — a bare glyph in every state. No disc behind it.
          Deliberate, and it has been wrong in both directions:

          It USED to render a macro-tinted disc only once the goal was
          met. On a real screen with protein and fat met and carbs short,
          two icons had a circle and the wheat had none, and that was
          reported as the wheat icon being broken. Nothing on the tile
          said the circle meant anything, so "one of these is drawn
          differently" was the only reading available.

          The first fix rendered the disc ALWAYS and moved the signal to
          intensity, which removed the misreading. The operator's call on
          seeing it was that the tiles are cleaner with no disc at all —
          and that answers the same problem more completely: with no disc
          in any state, all three tiles are identical whatever the
          numbers do, so there is nothing left to misread.

          Nothing is lost by dropping it, because the halo was never the
          only goal signal: the progress bar fills and overshoots, the
          tertiary "X / Yg" line shows the ratio, LEFT mode's label flips
          to "over", and the sr-only announcement below still tells
          screen readers. Only the decorative mark is gone.

          Keep the scale pop — that is per-log feedback, not a state. */}
      <motion.span
        className="relative inline-flex items-center justify-center"
        style={{ scale: iconScale }}
      >
        <Icon
          className="relative size-6"
          style={{ color }}
          strokeWidth={2}
          aria-hidden="true"
        />
      </motion.span>

      {/* Big number — Food7: neutral foreground (not the macro hue). The
          macro identity is carried by the icon + progress bar; a neutral
          number is the calorie ring's unified-colour story applied to the
          tiles. text-foreground is theme-aware (dark on light, light on
          dark) so there's no AA concern. */}
      {/* The unit is SECONDARY to the figure. It rendered at text-2xl —
         identical to the number — so "128g" read as one four-character
         token rather than a value with a unit, and the tile lost its
         numeric hierarchy at exactly the widths where it matters. The
         number keeps text-2xl: it is glanceable data, and shrinking it
         to fix a problem caused by its neighbour is the wrong lever.
         whitespace-nowrap keeps a three-digit value and its unit on one
         line now that the column can be narrower. */}
      <p className="text-2xl font-extrabold font-mono tabular-nums leading-none tracking-tight mt-2 text-foreground whitespace-nowrap">
        <AnimatedNumber
          value={displayValue}
          duration={numberDurationSec}
          ease={RING_EASE}
        />
        <span className="text-small font-bold text-muted-foreground">g</span>
      </p>

      {/* Mode-aware label sits below the big number. Always-rendered
          rather than conditionally suppressed so the line height stays
          stable across mode toggles. */}
      <p className="text-xs text-muted-foreground mt-0.5 lowercase">
        {displayLabel}
      </p>

      {/* Progress bar */}
      {/* Track — inset shadow reads as a recessed channel cut into the
          white card surface, with the coloured fill sitting inside the
          groove. Shadow is deliberately subtle (0.06 opacity). At
          empty (consumed === 0) the whole track fades to reduce visual
          noise without causing a layout jump on first log. */}
      <div
        className="relative w-full mt-2.5 h-1.5 rounded-full overflow-hidden transition-opacity duration-300"
        style={{
          background: "hsl(var(--muted))",
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
        {/* Overshoot overlay — darker shade layered from the left,
            width = overshoot %. Mirrors CalorieRing.tsx's overshoot
            arc. Slight delay so it reads as "filled, then leaked over"
            rather than racing the base bar. */}
        {isOver && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: overColor,
              filter: "brightness(0.65) saturate(1.2)",
              opacity: pulseOpacity,
            }}
            initial={{ width: reduce ? `${overshootPct * 100}%` : "0%" }}
            animate={{ width: `${overshootPct * 100}%` }}
            transition={{
              width: {
                duration: reduce ? 0 : barDurationSec,
                ease: RING_EASE,
                delay: reduce ? 0 : 0.15,
              },
            }}
          />
        )}
      </div>

      {/* Tertiary line — consumed value tweens with the big number so all
          three (big number, bar fill, tertiary) advance together during a log. */}
      <p className="text-caption text-muted-foreground font-mono tabular-nums mt-1.5 whitespace-nowrap">
        <AnimatedNumber
          value={Math.round(consumed)}
          duration={numberDurationSec}
          ease={RING_EASE}
        />
        {" / "}
        {/* Nutr3: a 0 target is NO goal (below the essential-fat floor), not "0g" */}
        {hasTarget ? `${Math.round(target)}g` : "—"}
      </p>

      {/* Uppercase macro label — intentionally muted (same tone as the
          `X / Yg` ratio line above) so the card's colour identity is
          carried by the icon + big number + progress bar, not duplicated
          four times. The label is a caption, not a headline. */}
      <SectionLabel tier="section" className="mt-0.5">
        {label}
      </SectionLabel>
    </button>
  );
}
