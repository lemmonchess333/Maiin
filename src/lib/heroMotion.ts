import { HERO_MOTION, type HeroMotionSheet } from "./heroMotion.data";

export type { HeroMotionSheet };

/**
 * Home's hero pictures that move: a flipbook for a still cut-out, made
 * from a Gemini clip by scripts/art/hero-motion.ts. Keyed by the still's
 * public path, so the run card's runner and the lift card's lead lift
 * find theirs the same way. Null for a still with no animation, which
 * the hero keeps showing as before.
 */
export function heroMotionFor(still: string): HeroMotionSheet | null {
  return HERO_MOTION[still.replace(/^\//, "")] ?? null;
}

/** About how long the hero moves before it rests on its still. Home's
 *  water glass is already the screen's one loop (DESIGN_GUIDE §14h), so
 *  the hero plays when Home opens and then stops. */
export const HERO_MOTION_SECONDS = 5;

/** Whole times round the loop that fill about HERO_MOTION_SECONDS. */
export function heroMotionCycles(sheet: HeroMotionSheet): number {
  return Math.max(
    1,
    Math.round((HERO_MOTION_SECONDS * sheet.fps) / sheet.frames)
  );
}

/** Where frame `index` sits in the sheet, as a background position. */
export function sheetPosition(sheet: HeroMotionSheet, index: number): string {
  const cols = Math.max(1, sheet.cols);
  const rows = Math.max(1, Math.ceil(sheet.frames / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = cols === 1 ? 0 : (col / (cols - 1)) * 100;
  const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;
  return `${x}% ${y}%`;
}
