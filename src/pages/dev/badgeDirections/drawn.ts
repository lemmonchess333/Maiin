/**
 * Direction B, "Porcelain and drawing": the badge is a pale porcelain
 * hexagon in its tier's metal, and on it a drawing in Tropos's own
 * illustration style, the one the exercise figures and Food's pictures
 * are drawn in: off-white forms, soft grey shading, fine dark-grey contour
 * lines and one accent, the family's colour, on the part that matters.
 * The number the badge is for is set in the display cut in a deep step of
 * that colour. The face is the paper the drawing needs: an <img> cannot
 * follow the app's theme, and a coloured figure on no ground read on one
 * theme and not the other.
 */
import { TIER_PALETTES } from "@/features/streaks/tierPalettes";
import {
  hexPath,
  mix,
  numeralPath,
  svgDoc,
} from "@/features/streaks/badgeArt/svg";
import {
  FAMILY_HUE,
  type BadgeState,
  type Direction,
  type Sample,
  type SampleId,
} from "./samples";

interface Ink {
  /** The paper the forms are drawn on. */
  form: string;
  /** The shaded side of a form. */
  shade: string;
  /** Contour lines. */
  line: string;
  /** The accent and its shaded side. */
  accent: string;
  accentDeep: string;
  rim: [string, string, string];
  /** The porcelain, and the family's colour washed into its top. */
  paper: string;
  paperTop: string;
  figureTop: string;
  figureBottom: string;
}

/** The objects, as paths with roles: `F` a form (off-white), `A` the
 *  accent, `L` a line only. Drawn in the 100-unit box: an object above a
 *  number sits in y 15..46; one alone fills the ring. */
type Part = readonly [role: "F" | "A" | "L" | "S", d: string];

const FLAME: Part[] = [
  [
    "A",
    "M50.0 10.8C46.9 15.8 43.5 19.2 43.5 24.0 43.5 26.8 44.4 28.4 45.3 29.7 46.1 31.0 45.7 32.8 44.1 33.5 41.4 34.5 39.6 37.0 39.6 40.5A10.5 10.5 0 0 0 60.4 40.5C60.4 35.7 58.5 32.0 55.9 28.5 53.1 24.6 51.2 19.6 50.4 14.4 49.7 16.0 48.8 17.6 48.2 18.9Z",
  ],
  [
    "F",
    "M50.0 31.6C48.8 34.0 46.6 35.8 46.6 38.7A4.3 4.3 0 0 0 55.2 39.1C55.2 37.0 54.2 35.7 53.1 34.1 52.3 33.0 51.7 31.5 51.3 29.7 50.8 30.5 50.5 31.0 50.0 31.6Z",
  ],
];

const BARBELL: Part[] = [
  ["F", "M11 47.6H89V52.4H11Z"],
  ["F", "M36 43.5H39.5V56.5H36ZM60.5 43.5H64V56.5H60.5Z"],
  ["A", "M19 30H26.2V70H19ZM27.8 30H35V70H27.8Z"],
  ["A", "M65 30H72.2V70H65ZM73.8 30H81V70H73.8Z"],
  [
    "S",
    "M19 30H21.4V70H19ZM27.8 30H30.2V70H27.8ZM65 30H67.4V70H65ZM73.8 30H76.2V70H73.8Z",
  ],
];

const SHOE: Part[] = [
  // Upper, toe to the right.
  [
    "F",
    "M33.5 37.5C33.2 31.5 34.5 26.5 37.5 24.6 39.3 23.5 41.6 23.6 43.3 24.4 45 28.2 49.6 30 54.6 30.6 60.4 31.3 65.6 32.4 67.2 35.4 67.8 36.6 67.4 37.6 66.4 38Z",
  ],
  // Sole.
  [
    "A",
    "M32.6 37.4H66.8C68.6 37.4 68.8 40.7 66.6 41.6 64.6 42.4 61 42.6 56 42.6H36C33.6 42.6 32.4 41.4 32.4 39.8Z",
  ],
  ["L", "M45.6 27.4L48.6 25.6M48.6 29.3L51.6 27.5M38.4 33.6H48"],
];

const PLATE: Part[] = [
  // A plate with a fork and a knife.
  ["F", "M50 18.5A12.5 12.5 0 1 1 49.9 18.5Z"],
  ["A", "M50 23.5A7.5 7.5 0 1 1 49.9 23.5Z"],
  [
    "F",
    "M30.6 18.5V25.6C30.6 27.2 31.3 28.2 32.4 28.6V42.6A1.3 1.3 0 0 0 35 42.6V28.6C36.1 28.2 36.8 27.2 36.8 25.6V18.5H35.6V24.8H34.3V18.5H33.1V24.8H31.8V18.5Z",
  ],
  [
    "F",
    "M66.8 42.6V18.5C68.9 19.3 70.2 22.5 70.2 26.2 70.2 28.6 69.4 30.4 68.4 31.2V42.6A0.8 0.8 0 0 1 66.8 42.6Z",
  ],
];

const GLASS: Part[] = [
  [
    "F",
    "M38 16.5H62L59.4 44.5C59.3 45.6 58.4 46.4 57.3 46.4H42.7C41.6 46.4 40.7 45.6 40.6 44.5Z",
  ],
  [
    "A",
    "M39.4 27H60.6L59.4 44.5C59.3 45.6 58.4 46.4 57.3 46.4H42.7C41.6 46.4 40.7 45.6 40.6 44.5Z",
  ],
  ["L", "M43 31L44.4 42.5"],
];

const OBJECTS: Record<SampleId, Part[]> = {
  week_warrior: FLAME,
  two_plate: BARBELL,
  first_5k: SHOE,
  marathon: SHOE,
  meal_prep_master: PLATE,
  hydration_hero: GLASS,
};

const PAPER = "#f7f5f1";

function ink(sample: Sample, state: BadgeState): Ink {
  if (state === "locked") {
    return {
      form: "#e9e9ec",
      shade: "#cfcfd4",
      line: "#7c7c84",
      accent: "#a9a9b0",
      accentDeep: "#8d8d95",
      rim: ["#b9b9c0", "#90909a", "#6c6c74"],
      paper: "#dedee2",
      paperTop: "#e6e6e9",
      figureTop: "#9a9aa2",
      figureBottom: "#8a8a92",
    };
  }
  const h = FAMILY_HUE[sample.family];
  const metal = TIER_PALETTES[sample.tier];
  return {
    form: "#f6f4f0",
    shade: "#dcd8d1",
    line: "#3a3940",
    accent: h.base,
    accentDeep: h.deep,
    rim: [metal.highlight, metal.base, metal.edge],
    paper: PAPER,
    paperTop: mix(PAPER, h.base, 0.16),
    figureTop: h.base,
    figureBottom: h.deep,
  };
}

export function drawDrawn(sample: Sample, state: BadgeState): string {
  const k = ink(sample, state);
  const parts = OBJECTS[sample.id];
  const fig = sample.numeral
    ? numeralPath(sample.numeral, {
        cx: 50,
        baseline: 78,
        capHeight: 23,
        maxWidth: 58,
      }).d
    : null;
  const defs =
    `<linearGradient id="r" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${k.rim[0]}"/><stop offset="0.45" stop-color="${k.rim[1]}"/><stop offset="1" stop-color="${k.rim[2]}"/></linearGradient>` +
    `<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.paperTop}"/><stop offset="0.6" stop-color="${k.paper}"/></linearGradient>` +
    `<linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.figureTop}"/><stop offset="1" stop-color="${k.figureBottom}"/></linearGradient>` +
    `<linearGradient id="fs" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0.45" stop-color="${k.form}"/><stop offset="1" stop-color="${k.shade}"/></linearGradient>` +
    `<linearGradient id="as" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0.3" stop-color="${k.accent}"/><stop offset="1" stop-color="${k.accentDeep}"/></linearGradient>`;
  const lineAttrs = `stroke="${k.line}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"`;
  const drawing = parts
    .map(([role, d]) => {
      if (role === "F") return `<path d="${d}" fill="url(#fs)" ${lineAttrs}/>`;
      if (role === "A") return `<path d="${d}" fill="url(#as)" ${lineAttrs}/>`;
      if (role === "S")
        return `<path d="${d}" fill="#ffffff" fill-opacity="0.28"/>`;
      return `<path d="${d}" fill="none" ${lineAttrs}/>`;
    })
    .join("");
  const figure = fig ? `<path d="${fig}" fill="url(#n)"/>` : "";
  const body =
    `<path d="${hexPath(0.4, 4.8)}" fill="url(#r)" stroke="${k.rim[2]}" stroke-width="0.8"/>` +
    `<path d="${hexPath(4.4, 3.6)}" fill="url(#p)"/>` +
    `<path d="${hexPath(4.4, 3.6)}" fill="none" stroke="#000000" stroke-opacity="0.12" stroke-width="0.7"/>` +
    drawing +
    figure;
  return svgDoc(body, defs);
}

export const DRAWN_DIRECTION: Direction = {
  key: "drawn",
  name: "B · Porcelain and drawing",
  summary:
    "Porcelain in the tier’s metal, an object drawn as Food’s pictures are, the number in the family’s colour.",
  draw: drawDrawn,
};
