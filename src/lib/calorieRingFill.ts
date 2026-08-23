import type { CalorieRingMode } from "@/components/food/CalorieRing";

/**
 * Which way a progress bar fills, given the hero's display mode.
 *
 * `MacroColumn` documents this as a lockstep property: the bar moves the
 * same direction as the big number beside it, so both signals say the same
 * thing.
 *
 *   LEFT mode  → fill = remaining %  (drains as you log; the number counts down)
 *   EATEN mode → fill = consumed %   (grows as you log; the number counts up)
 *
 * Over target in LEFT mode pins to 100%: a full bar reads as "maxed out,
 * and over by N" alongside the big number, whereas an empty bar would
 * falsely read as "nothing left to eat".
 *
 * It lives here because the property was claimed and not kept. The tile and
 * the calorie ring implemented it; `HeroDrillDownSheet` — the surface you
 * open to disambiguate the tile — never received the mode at all and drew
 * consumed% unconditionally. Measured off the Food frames: the same protein
 * data rendered as a 9%-full bar on the tile and an 89%-full bar in the
 * sheet, one tap apart. A third hand-written copy of the expression is how
 * that happens again, so there is one.
 */
export function barFillPct(
  consumedPct: number,
  mode: CalorieRingMode,
  isOver: boolean
): number {
  if (mode !== "left") return consumedPct;
  return isOver ? 100 : 100 - consumedPct;
}

/**
 * The percentage to PRINT beside such a bar.
 *
 * Separate from the fill only because a caption can be wrong in a way a bar
 * cannot: a draining bar next to "89%" is worse than either alone, and that
 * is what threading the mode into the sheet would have produced if the
 * number had been left as-is.
 */
export function barLabelPct(
  consumedPct: number,
  mode: CalorieRingMode
): number {
  return mode === "left" ? Math.max(0, 100 - consumedPct) : consumedPct;
}
