import { useEffect, useRef, type ComponentType, type SVGProps } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import {
  m,
  useMotionValue,
  animate,
  useReducedMotion as useFramerReducedMotion,
} from "framer-motion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import SwapFade from "@/components/ui/SwapFade";
import { haptic } from "@/lib/haptic";
import {
  overshootFill,
  ringFill,
  VIEW_SWITCH_SEC,
} from "@/lib/calorieRingFill";
import { useRingMoveCause } from "@/hooks/useRingMoveCause";
import { cn } from "@/lib/utils";
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
  /** The macro's name, as said: "Protein". */
  label: string;
  /** Saturated brand colour for this macro */
  color: string;
  /** Display mode — "left" shows remaining, "eaten" shows what's logged */
  mode: CalorieRingMode;
  /** Forward-compat tap hook (no-op for phase 1) */
  onTap?: () => void;
  /** Number count duration in seconds */
  numberDurationSec?: number;
  /** Progress bar animation duration in seconds */
  barDurationSec?: number;
  /** Fill the bar and count the number up from zero when it mounts
   *  (the default). False mounts it at its figures. */
  drawIn?: boolean;
  /**
   * "row" is the Food page's macro (Food11 call 4): no box, read from
   * the left as a line of text is. The icon and the name, then the
   * figure with its word beside it, then a thin bar. Three of them make
   * one row under the calorie wheel.
   *
   * "tile" is the centred form on a card. "compact" is that tile at
   * the size Home's food card draws it, on a tinted tile beside the calorie ring: a smaller
   * icon and number, the 12px labels unchanged, and a bar track that
   * shows on the tint.
   */
  size?: "tile" | "compact" | "row";
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
  drawIn = true,
  size = "tile",
}: MacroColumnProps) {
  const compact = size === "compact";
  const row = size === "row";
  const framerReduce = useFramerReducedMotion();
  const reduce = framerReduce === true;
  const settled = reduce || !drawIn;

  const hasTarget = target > 0;
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target && hasTarget;
  const isLeftMode = mode === "left";

  /* The bar follows the left and logged switch as the calorie wheel's
     arc does (`ringFill` has the reasons and the one rule the wheel,
     these bars and the Details sheet share): what is logged in the
     logged view, what is left in the left view. */
  const barFillPct = ringFill(consumed, target, mode);

  // Overshoot — only when consumed exceeds target, in both views. Capped
  // at one full extra lap; going 3× over wouldn't read any differently
  // than 2×. Layered on top of the base bar in a darker shade of the
  // macro colour, mirroring the calorie ring's overshoot arc.
  const overshootPct = overshootFill(consumed, target);

  /* A tap on the switch moves the bar to the other view's fill at once
     and briskly, with the wheel; food moves it on the page's timing
     (`useRingMoveCause`). */
  const barTransitionSec =
    useRingMoveCause(mode, consumed, target) === "switch"
      ? VIEW_SWITCH_SEC
      : barDurationSec;

  // LEFT mode:
  //   under target → remaining   (e.g. "151g left")
  //   over target  → overshoot   (e.g. "5g over")
  // LOGGED mode (the stored mode key is "eaten"):
  //   either       → consumed    (e.g. "14g logged" or "170g logged")
  const displayValue =
    isLeftMode && hasTarget
      ? isOver
        ? consumed - target
        : remaining
      : consumed;

  // LEFT mode:
  //   under target → "left"   (e.g. "151g left")
  //   over target  → "over"   (e.g. "5g over")
  // LOGGED mode:
  //   either       → "logged" (e.g. "14g logged")
  // Without a label in this mode the big number reads ambiguously
  // (a user who didn't notice the toggle sees "85g" with no qualifier).
  // Rendering "logged" makes the mode self-documenting at the cost of
  // one short word, and says what the number counts: what is in the
  // diary, as the calorie ring does. Over-target is signalled by the
  // bar overshoot and the tertiary "X / Yg" line.
  const displayLabel =
    isLeftMode && hasTarget ? (isOver ? "over" : "left") : "logged";

  /* The tile's words as drawn, for the start of its name: the figure as
     `AnimatedNumber` settles on it, with its "g". */
  const figureWords = `${Math.round(displayValue).toLocaleString()}g`;
  const shownWords = row
    ? `${label} ${figureWords} ${displayLabel}`
    : `${figureWords} ${displayLabel} ${label}`;

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

  /* Icon — a bare glyph in every state. No disc behind it.
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

      Keep the scale pop — that is per-log feedback, not a state. */
  const icon = (
    <m.span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ scale: iconScale }}
    >
      <Icon
        className={cn(
          "relative",
          row ? "size-4" : compact ? "size-5" : "size-6"
        )}
        style={{ color }}
        strokeWidth={2}
        aria-hidden="true"
      />
    </m.span>
  );

  /* Big number — Food7: neutral foreground (not the macro hue). The
      macro identity is carried by the icon + progress bar; a neutral
      number is the calorie ring's unified-colour story applied to the
      tiles. text-foreground is theme-aware (dark on light, light on
      dark) so there's no AA concern. */
  /* The unit is SECONDARY to the figure. It rendered at text-2xl —
     identical to the number — so "128g" read as one four-character
     token rather than a value with a unit, and the tile lost its
     numeric hierarchy at exactly the widths where it matters. The
     number keeps text-2xl: it is glanceable data, and shrinking it
     to fix a problem caused by its neighbour is the wrong lever.
     whitespace-nowrap keeps a three-digit value and its unit on one
     line now that the column can be narrower.
     The "g" is a word, so it takes the text face at the weight of the
     tile's other words, about two thirds of the figure's size, as the
     weight tile's "kg" does. A 12px bold "g" under a 20px figure read
     as a subscript. It stays unspaced: grams on the food surface are
     "128g". */
  const FigureTag = row ? "span" : "p";
  /* `swapped`: the left and logged switch has been used since this
     mounted, so the figure starts at its value rather than counting up
     from zero (`SwapFade`). */
  const figure = (swapped: boolean) => (
    <FigureTag
      className={cn(
        "font-extrabold font-figure tabular-nums leading-none tracking-tight text-foreground whitespace-nowrap",
        row ? "text-xl" : compact ? "text-xl mt-1.5" : "text-2xl mt-2"
      )}
    >
      <AnimatedNumber
        value={displayValue}
        duration={numberDurationSec}
        ease={RING_EASE}
        fromZero={drawIn && !swapped}
      />
      <span
        data-macro-unit=""
        className={cn(
          "font-sans font-medium tracking-normal text-muted-foreground",
          row || compact ? "text-sm" : "text-base"
        )}
      >
        g
      </span>
    </FigureTag>
  );

  /* Progress bar */
  /* Track — inset shadow reads as a recessed channel cut into the
      white card surface, with the coloured fill sitting inside the
      groove. Shadow is deliberately subtle (0.06 opacity). An EMPTY
      bar fades the whole track to reduce visual noise without
      causing a layout jump on first log.

      An empty bar is nothing drawn on it: nothing logged in the logged
      view, the target reached in the left one. Only the tile's solid
      track fades, and not under an overshoot it still carries. The row
      and the compact tile sit beside the calorie wheel on its grey
      groove, and a faded groove would be 8% grey under a wheel track at
      20%: the same "not yet" drawn two ways. */
  const bar = (
    <div
      data-macro-bar=""
      className={cn(
        "relative w-full rounded-full overflow-hidden transition-opacity duration-300",
        row ? "h-1 mt-1.5" : compact ? "h-1.5 mt-2" : "h-1.5 mt-2.5"
      )}
      style={{
        /* A compact tile sits on Home's card beside the calorie ring,
           so its track is the ring's grey groove (CalorieRing's
           COLOR_TRACK): one grey for "not yet" across the card. The
           row sits on the page under the wheel and takes the same
           groove; it is 4px of line, not a channel cut into a card,
           so it has no inner shadow. */
        background:
          compact || row
            ? "hsl(var(--muted-foreground) / 0.2)"
            : "hsl(var(--muted))",
        boxShadow: row ? undefined : "inset 0 1px 2px rgb(0 0 0 / 0.06)",
        opacity:
          barFillPct === 0 && overshootPct === 0 && !compact && !row ? 0.4 : 1,
      }}
    >
      <m.div
        className="h-full rounded-full"
        style={{ background: overColor, opacity: pulseOpacity }}
        initial={{ width: settled ? `${barFillPct * 100}%` : "0%" }}
        animate={{ width: `${barFillPct * 100}%` }}
        transition={{
          width: { duration: reduce ? 0 : barTransitionSec, ease: RING_EASE },
        }}
      />
      {/* Overshoot overlay — darker shade layered from the left,
          width = overshoot %. Mirrors CalorieRing.tsx's overshoot
          arc. Slight delay so it reads as "filled, then leaked over"
          rather than racing the base bar. */}
      {isOver && (
        <m.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: overColor,
            filter: "brightness(0.65) saturate(1.2)",
            opacity: pulseOpacity,
          }}
          initial={{ width: settled ? `${overshootPct * 100}%` : "0%" }}
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
  );

  return (
    <button
      type="button"
      data-macro={macroKey}
      onClick={onTap}
      /* Starts with the tile's words in the order they are drawn
         ("78g left Protein", or "Protein 78g left" as a row): Voice
         Control is spoken to with the words on the screen, so every one
         of them is in the name, first (WCAG 2.5.3, Label in Name). The
         figure is the one `AnimatedNumber` settles on. Then what a
         screen-reader user cannot see: the goal-reached state, the grams
         against the target, and what a tap does, named as the mode it
         switches to, since the tap flips a mode shared with the calorie
         ring and "toggle" would be too vague to predict.

         The goal-reached state is IN the label rather than left to the
         sr-only span below, because an `aria-label` REPLACES the
         content-derived name outright, and
         `surfaces.screens.capture.spec.ts` asserts it in the name as the
         state-independent proof of the halo. */
      aria-label={
        `${shownWords}. ` +
        (goalReached ? `${label} goal reached. ` : "") +
        `${Math.round(consumed)}g logged${hasTarget ? ` of ${Math.round(target)}g` : "; no target"}. ` +
        `Show ${label.toLowerCase()} ${isLeftMode ? "logged" : "remaining"}`
      }
      className={cn(
        "min-w-0 flex-1 flex flex-col bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg",
        row
          ? "w-full min-h-[44px] items-stretch justify-center text-left"
          : "items-center text-center"
      )}
    >
      {/* Kept ALONGSIDE the aria-label above, not replaced by it. Two
          existing unit tests assert this sr-only TEXT, while
          surfaces.screens.capture.spec.ts asserts the accessible NAME —
          and an aria-label satisfies only the second. That split is
          exactly how the regression hid: text-based tests stayed green
          while the name lost the state. Both now carry it. */}
      {goalReached && <span className="sr-only">{label} goal reached</span>}
      {row ? (
        <>
          {/* The name leads, as a line of text does, with the macro's
              colour on its icon alone (Food7). 14px, the size of the
              page's other names; the tile's 12px caption under a bar was
              the smallest text on the screen's first third. */}
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
            {icon}
            <span className="min-w-0 truncate">{label}</span>
          </span>
          {/* The spaces between the words are in the text, so it reads as
              words, as the name does ("Protein 15g left"), not run
              together; a flex box draws nothing for them. */}{" "}
          {/* The figure and its word on one line ("15g left"), wrapping
              the word under the figure when the column is too narrow
              for both ("logged" at larger text). The left and logged
              switch swaps them with the wheel's crossfade, never
              counting from one meaning to the other (`SwapFade`). */}
          <SwapFade as="span" swapKey={mode} className="mt-0.5">
            {(swapped) => (
              <span className="flex flex-wrap items-baseline gap-x-1">
                {figure(swapped)}{" "}
                <span className="text-sm text-muted-foreground lowercase">
                  {displayLabel}
                </span>
              </span>
            )}
          </SwapFade>
          {bar}
        </>
      ) : (
        <>
          {icon}
          {/* The figure and its word swap together on the left and
              logged switch, in step with the wheel (`SwapFade`). */}
          <SwapFade swapKey={mode} className="justify-items-center">
            {(swapped) => (
              <div className="flex flex-col items-center">
                {figure(swapped)}
                {/* Spaces in the text, as the row has, so the tile reads
                    as words ("78g left Protein"). */}{" "}
                {/* Mode-aware label sits below the big number.
                    Always-rendered rather than conditionally suppressed
                    so the line height stays stable across mode toggles. */}
                <p className="text-xs text-muted-foreground mt-0.5 lowercase">
                  {displayLabel}
                </p>
              </div>
            )}
          </SwapFade>{" "}
          {bar}
          {/* Macro label — intentionally muted (same tone as the
              `X / Yg` ratio line above) so the card's colour identity is
              carried by the icon + big number + progress bar, not duplicated
              four times. The label is a caption, not a headline. */}
          <SectionLabel className={compact ? "mt-1.5" : "mt-2"}>
            {label}
          </SectionLabel>
        </>
      )}
    </button>
  );
}
