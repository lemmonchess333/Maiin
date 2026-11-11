/**
 * Moves a drawing's lit muscles from one meaning colour to another, in
 * place, on raw RGBA: every pixel whose hue sits in the violet band (the
 * lifting purple and its pale lilac, 215-295 degrees) and that carries
 * colour at all (HSL saturation above 0.12) takes the target hue, its
 * saturation scaled, its lightness kept. The white-grey body, the dark
 * contours and the transparent keyed backdrop have no colour and are left
 * as they are, so only the highlight moves.
 *
 * The runner's poses are drawn with the lifting purple; running is coral
 * everywhere in the app (DESIGN_GUIDE §0 rule 2), so `art:run-poses` runs
 * this over them as it cuts them out. The rest day's walker keeps its
 * purple: a rest day belongs to the plan, not to a run.
 */

/** The violet band the lifting purple and its lilac fall in. */
const VIOLET: readonly [number, number] = [215, 295];
const MIN_SATURATION = 0.12;

export interface HighlightTarget {
  /** Hue in degrees: 348 for running's coral (#D4637A). */
  hue: number;
  /** Saturation multiplier. */
  saturation: number;
}

/** Running's coral, from the purple the poses were drawn in. The drawn
 *  purple's median saturation (0.56 on the run poses) is already coral's
 *  (#D4637A, 0.57), so only the hue moves; scaled to 0.78 it read dusty. */
export const RUNNING_CORAL: HighlightTarget = { hue: 348, saturation: 1 };

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** Recolours the violet highlight in `rgba` (4 bytes a pixel) to `target`.
 *  Returns how many pixels moved. */
export function recolourHighlight(
  rgba: Uint8Array,
  target: HighlightTarget
): number {
  let moved = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(
      rgba[p] / 255,
      rgba[p + 1] / 255,
      rgba[p + 2] / 255
    );
    if (s <= MIN_SATURATION || h < VIOLET[0] || h > VIOLET[1]) continue;
    const [r, g, b] = hslToRgb(
      target.hue,
      Math.min(1, s * target.saturation),
      l
    );
    rgba[p] = Math.round(r * 255);
    rgba[p + 1] = Math.round(g * 255);
    rgba[p + 2] = Math.round(b * 255);
    moved++;
  }
  return moved;
}
