/**
 * How full a calorie or macro bar is drawn: what was eaten, in both modes.
 *
 * The calorie ring, the macro bars under it (Food's hero and Home's food
 * card) and the breakdown sheet's bars all fill with the share of the
 * target eaten, whether the person reads the day as "left" or "logged".
 * Only the number and its words follow the mode: "410" over "left of
 * 2,200 kcal", or "1,790" over "of 2,200 kcal" — the same ring, filled the
 * same way (DS4, owner's delegate, 7 November 2026).
 *
 * The fill used to drain in the left mode, so it moved with the number:
 * a full bar on an empty morning, emptying as the day was logged. That
 * put a full orange ring and three full macro bars on every empty day,
 * colour where there was no data, which DESIGN_GUIDE §14m rules 16 and 33
 * rule out: an empty metric is a full-size grey track, and colour arrives
 * with the first meal. Yazio, Lifesum and Cal AI draw it this way: "left"
 * in the middle of a ring that fills as you eat. So the fill is what you
 * ate, and the number is what you chose to read.
 *
 * Over target the bar is full; the ring draws its overshoot lap on top
 * (CalorieRing), and the words say "over".
 *
 * One function, because three hand-written copies drifted before: the
 * sheet once drew a 9% bar one tap away from the tile's 89% for the same
 * protein. `CalorieRing`, `MacroColumn` and `HeroDrillDownSheet` all read
 * it.
 */
export function barFillPct(consumedPct: number, isOver = false): number {
  if (isOver) return 100;
  return Math.min(100, Math.max(0, consumedPct));
}

/**
 * The percentage printed beside such a bar: the same eaten share the bar
 * shows, in both modes, so a caption never says one thing beside a bar
 * that shows another. Its words say "eaten" where it is printed.
 */
export function barLabelPct(consumedPct: number): number {
  return Math.min(100, Math.max(0, consumedPct));
}
