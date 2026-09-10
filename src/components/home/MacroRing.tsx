import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { macroRingState } from "@/utils/formatters";

/**
 * One macro's progress toward its daily target: grams logged in the
 * centre, the nutrient's name and its target beneath.
 *
 * The track is a 35% tint of the macro's own hue, and the alpha is
 * measured rather than chosen. An earlier pass drew it neutral, on the
 * finding that a hue tint measured 1.06:1 against the card for carbs
 * and that "yellow cannot clear 1.26:1 on white at ANY alpha". That
 * measurement was right about the value it used and wrong about the
 * conclusion: it tinted `THEME.macros.carbs`, the ACCENT #EAB308, which
 * really is capped at 1.92:1 even solid. The palette already carries the
 * answer — `useMacroPalette().text` swaps to #A16207 on a light card
 * precisely so macro colour can survive there.
 *
 * Measured against `--card` with the caller passing the theme's own
 * palette track (text in light, accent in dark):
 *
 *              track@35%        arc          arc vs track
 *   light      1.85/1.62/1.59   6.04/4.92/4.83   3.26/3.03/3.03
 *   dark       1.61/2.20/1.97   4.62/8.49/6.67   2.87/3.86/3.38
 *
 * The neutral groove it replaces was 1.34 light / 1.48 dark, so every
 * macro is now MORE visible than the groove in both themes, the arc
 * clears the 3:1 WCAG 1.4.11 asks of a meaningful graphic, and filled
 * still reads as distinctly filled against remaining. 35% is the
 * balance point: 25% barely beats the old groove, 45% drops arc-vs-track
 * to ~2.6 and the ring starts reading as uniformly coloured.
 *
 * `color` must therefore be the palette's THEME-AWARE value, not a raw
 * `THEME.macros.*`. Passing the accent in light mode puts the carbs arc
 * at 1.92:1 on white — the filled half of the ring effectively invisible
 * — which is what TodayEnergy was doing.
 *
 * The arc is clamped at one full turn (`macroRingState` caps at 1.3 and
 * the dash array takes `min(pct, 1)`), so going over target never wraps
 * the ring back around and understates itself. The centre keeps the real
 * logged figure, uncapped.
 */
export default function MacroRing({
  value,
  target,
  color,
  label,
  unit = "",
}: {
  value: number;
  target: number;
  color: string;
  label: string;
  unit?: string;
}) {
  const size = 64;
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  // Nutr3: a target of 0 means NO goal (a calorie target below the
  // essential-fat floor funds no protein or carbs), not "0 g to eat" — so
  // the ring stays empty and the sub-label says so in words.
  const hasTarget = target > 0;
  const { pct, done } = hasTarget
    ? macroRingState(value, target)
    : { pct: 0, done: false };
  /* One sentence for assistive tech, and the visual fragments hidden
     from it. Read as three separate nodes the ring announced
     "98g / Protein / Target 140g" — and "98g" is spoken "ninety-eight
     gee", because `g` beside a numeral is a glyph, not a word. The
     Food macro tiles already carry their state this way. */
  const a11yLabel = hasTarget
    ? `${label}: ${Math.round(value)} grams logged, target ${Math.round(
        target
      )} grams${done ? ", target reached" : ""}`
    : `${label}: ${Math.round(value)} grams logged, no target`;
  const [flashKey, setFlashKey] = useState(0);
  const prevDoneRef = useRef(done);

  useEffect(
    function () {
      const wasDone = prevDoneRef.current;
      prevDoneRef.current = done;
      if (done && !wasDone) {
        // Schedule flash on next microtask to satisfy lint
        queueMicrotask(function () {
          setFlashKey(function (k) {
            return k + 1;
          });
        });
        haptic("heavy");
      }
    },
    [done]
  );

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="sr-only">{a11yLabel}</span>
      <div
        className="relative"
        aria-hidden="true"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          aria-hidden="true"
          style={{
            transform: "rotate(-90deg)",
            position: "absolute",
            inset: 0,
          }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            /* 0x59 = 89/255 = 0.349. The established alpha-hex form
               (`${THEME.x}NN`) rather than a second colour prop, so the
               track cannot drift from the arc it belongs to. */
            stroke={`${color}59`}
            strokeWidth="5"
          />
          {pct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeDasharray={`${circ * Math.min(pct, 1)} ${circ}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold font-mono tabular-nums leading-none text-foreground">
            {Math.round(value)}
            {unit}
          </span>
          {done && (
            /* The tick is the only place a macro hue lands on a glyph, and
               it is decorative: the sr-only sentence above says "target
               reached" in words, so contrast is not load-bearing here. */
            <span className="text-micro leading-none mt-0.5" style={{ color }}>
              &#10003;
            </span>
          )}
        </div>
        {/* Completion flash overlay */}
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ backgroundColor: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 0.5 }}
          />
        )}
      </div>
      <div className="text-center leading-tight" aria-hidden="true">
        {/* Foreground, sentence case, medium — deliberately NOT the
            uppercase muted SectionLabel treatment. At 12px, muted and
            letter-spaced, a nutrient name reads as chrome rather than as
            the ring's own label, which is half of what makes an unfilled
            ring look switched off rather than empty. */}
        <p className="text-xs font-medium text-foreground">{label}</p>
        {/* "Target" is a word, so it sets in the display font; only the
            figure takes the numeral face. Wrapping the whole string in
            font-mono put the label itself in Archivo, which this codebase
            reserves for numbers — and it is what made three of these in a
            row read as a stutter, since the repeated word carried the same
            typographic weight as the data it qualifies. Same split the
            weight tile uses for its unit. */}
        <p
          className="text-micro"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {hasTarget ? (
            <>
              Target{" "}
              <span className="font-mono tabular-nums">
                {Math.round(target)}
                {unit}
              </span>
            </>
          ) : (
            "No target"
          )}
        </p>
      </div>
    </div>
  );
}
