/**
 * The pieces every badge drawing is built from (DS4 call 4): the hexagon a
 * badge keeps (DS7 and the owner's 8 November call), the display cut's
 * numerals as outlines, and colour steps taken from the THEME tokens.
 *
 * Pure string building, no DOM, so the art script (Node) and the dev lab
 * (the browser) draw the same bytes. A badge is shown through an <img>,
 * which loads no web font and reads no page CSS, so everything a badge
 * needs is inside its SVG.
 */
import { BADGE_NUMERALS } from "./numerals.data";

/** Badge art is drawn in a 100 × 100 box. */
export const BOX = 100;

export type Point = readonly [number, number];

/** The medal frame every badge has shipped in since the first set
 *  (scripts/art/key-hexagon.py's `medal`): a pointy-top hexagon whose box
 *  spans x 5.5..94.5 and y 0.5..99.5, so new art drops into the shelf,
 *  the grid and the reveal without moving anything. */
export const HEX: readonly Point[] = [
  [50, 0.5],
  [94.5, 25.25],
  [94.5, 74.75],
  [50, 99.5],
  [5.5, 74.75],
  [5.5, 25.25],
];

/** One decimal place is a tenth of a unit: under a pixel at the reveal's
 *  120 px, and half the bytes of two. */
export const n = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

/** The hexagon moved in by `d` units on every side (each edge offset
 *  along its inward normal, neighbours intersected). */
export function insetPolygon(pts: readonly Point[], d: number): Point[] {
  const count = pts.length;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % count];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    // Clockwise in screen space (y down): the inward normal is (-dy, dx).
    const nx = -dy / len;
    const ny = dx / len;
    return {
      p: [p[0] + nx * d, p[1] + ny * d] as Point,
      v: [dx, dy] as Point,
    };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i - 1 + count) % count];
    // prev.p + t·prev.v = cur.p + s·cur.v
    const det = prev.v[0] * cur.v[1] - prev.v[1] * cur.v[0];
    const t =
      ((cur.p[0] - prev.p[0]) * cur.v[1] - (cur.p[1] - prev.p[1]) * cur.v[0]) /
      det;
    return [prev.p[0] + t * prev.v[0], prev.p[1] + t * prev.v[1]] as Point;
  });
}

/** A closed polygon with each corner rounded by `r` units. */
export function roundedPath(pts: readonly Point[], r: number): string {
  const count = pts.length;
  const parts: string[] = [];
  pts.forEach((v, i) => {
    const prev = pts[(i - 1 + count) % count];
    const next = pts[(i + 1) % count];
    const toward = (to: Point): Point => {
      const dx = to[0] - v[0];
      const dy = to[1] - v[1];
      const k = r / Math.hypot(dx, dy);
      return [v[0] + dx * k, v[1] + dy * k];
    };
    const a = toward(prev);
    const b = toward(next);
    parts.push(
      `${i === 0 ? "M" : "L"}${n(a[0])} ${n(a[1])}Q${n(v[0])} ${n(v[1])} ${n(b[0])} ${n(b[1])}`
    );
  });
  return `${parts.join("")}Z`;
}

/** The badge's hexagon, `inset` units in from the frame, corners rounded. */
export function hexPath(inset = 0, r = 4): string {
  return roundedPath(inset ? insetPolygon(HEX, inset) : HEX, r);
}

// ── Colour ────────────────────────────────────────────────────────────

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

const toHex = (c: readonly number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `a` moved `t` of the way to `b` (both hex). */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** The colour as a grey of the same lightness (Rec. 709 luma), for a
 *  badge not yet earned: the same art, greyed (§14m rule 27). */
export function grey(hex: string): string {
  const [r, g, b] = parse(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return toHex([l, l, l]);
}

// ── Numerals ──────────────────────────────────────────────────────────

const NUMERAL_NUMBER = /-?\d+(?:\.\d+)?/g;

type NumeralGlyph = { readonly d: string; readonly advance: number };

function glyph(ch: string): NumeralGlyph {
  const g = (BADGE_NUMERALS.glyphs as Record<string, NumeralGlyph>)[ch];
  if (!g) throw new Error(`badge numerals have no "${ch}"`);
  return g;
}

/** The ink box of a run of glyphs in font units (y up), from every point
 *  of their outlines (control points included: a little generous, never
 *  short). */
function inkBox(text: string): {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
} {
  let pen = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const ch of text) {
    const g = glyph(ch);
    const nums = (g.d.match(NUMERAL_NUMBER) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i] + pen);
      x1 = Math.max(x1, nums[i] + pen);
      y0 = Math.min(y0, nums[i + 1]);
      y1 = Math.max(y1, nums[i + 1]);
    }
    pen += g.advance;
  }
  return { x0, x1, y0, y1 };
}

export interface NumeralBox {
  /** The centre of the figure's ink, across. */
  cx: number;
  /** Where the figures stand. */
  baseline: number;
  /** The capitals' and figures' height, in badge units. */
  capHeight: number;
  /** The widest the ink may be: the figure shrinks to fit. */
  maxWidth: number;
}

/** The text's outlines, laid out in the box, as one path's `d` already in
 *  badge units, and the cap height they were set at. */
export function numeralPath(
  text: string,
  box: NumeralBox
): { d: string; capHeight: number; width: number } {
  const ink = inkBox(text);
  const em = BADGE_NUMERALS.capHeight;
  let s = box.capHeight / em;
  if ((ink.x1 - ink.x0) * s > box.maxWidth)
    s = box.maxWidth / (ink.x1 - ink.x0);
  const ox = box.cx - ((ink.x0 + ink.x1) / 2) * s;
  const parts: string[] = [];
  let pen = 0;
  for (const ch of text) {
    const g = glyph(ch);
    // Re-write each coordinate pair into badge space: x scaled and moved,
    // y flipped (fonts are y up).
    let i = 0;
    const d = g.d.replace(NUMERAL_NUMBER, (m) => {
      const v = Number(m);
      const out = i % 2 === 0 ? ox + (v + pen) * s : box.baseline - v * s;
      i += 1;
      return ` ${n(out)}`;
    });
    parts.push(d.replace(/([A-Za-z]) /g, "$1"));
    pen += g.advance;
  }
  return {
    d: parts.join(""),
    capHeight: em * s,
    width: (ink.x1 - ink.x0) * s,
  };
}

/** An <svg> document around a body. */
export function svgDoc(body: string, defs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}
