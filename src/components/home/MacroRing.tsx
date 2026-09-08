import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { macroRingState } from "@/utils/formatters";

/**
 * One macro's progress toward its daily target: grams logged in the
 * centre, the nutrient's name and its target beneath.
 *
 * The track is NEUTRAL rather than a tint of the macro's own hue, and
 * that is a contrast decision rather than a stylistic one. A track drawn
 * as `color + "18"` measured 1.06:1 against the card for carbs, 1.08:1
 * for fat and 1.12:1 for protein — invisible, so a ring with nothing
 * logged read as a disabled control instead of an empty one. Raising the
 * alpha does not fix it: carbs is #EAB308, and yellow cannot clear
 * 1.26:1 on white at ANY alpha, so the three rings would stay unequal
 * with the worst one still unreadable. A neutral groove at
 * `--muted-foreground / 0.22` measures 1.34:1 light and 1.48:1 dark for
 * all three alike, and the macro's identity stays where it carries
 * meaning: the filled arc. Same reasoning as the Food macro columns,
 * which put the hue on the icon and bar and leave the number neutral.
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
            stroke="hsl(var(--muted-foreground) / 0.22)"
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
        <p
          className="text-micro font-mono tabular-nums"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {hasTarget ? `Target ${Math.round(target)}${unit}` : "No target"}
        </p>
      </div>
    </div>
  );
}
