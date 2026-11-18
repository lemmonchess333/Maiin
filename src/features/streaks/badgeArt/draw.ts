/**
 * The badges' art (DS4 call 4), "Lit enamel": the direction chosen with
 * the design advisor from the two in the dev lab (/dev/badge-directions).
 *
 * Each badge is the hexagon it has always been (DS7, the owner's 8
 * November call): a rim of its tier's metal round a face of dark enamel,
 * the object the seal breaks open to show and the challenge medals share.
 * On the face, its family's sign is drawn as filled forms with a line lit
 * in the family's colour, and the number the badge is for stands under it
 * in the display cut, near white (§14m rule 27). The colour is strokes and
 * a soft glow on a near-neutral ground (rule 14), the face's light stays
 * in one hue and fades into the enamel (rule 13), and the glow is kept low
 * so it is a light and not neon (§14o).
 *
 * A badge not yet earned is the same drawing in greys, with no light in
 * it. Every badge is one SVG for each state, drawn by `npm run
 * art:badges` into public/badges/; an <img> loads no web font and reads no
 * page CSS, so everything is inside the file and the same file serves the
 * dark card and the white one.
 */
import { THEME } from "../../../lib/theme";
import { TIER_PALETTES } from "../tierPalettes";
import type { BadgeTier } from "../badges";
import { BADGE_ART_SPECS, type ArtFamily, type SignId } from "./catalogue";
import { BADGE_NUMERALS } from "./numerals.data";
import { hexPath, mix, n, numeralPath, svgDoc } from "./svg";

export type BadgeArtState = "earned" | "locked";

const WHITE = "#ffffff";
const BLACK = "#000000";
const ENAMEL = THEME.bg;

/** Every line on a badge is this wide in badge units, whatever the sign's
 *  size: about 1.9 px on the shelf's 56 px badge. */
const LINE = 3.4;
/** The rim's width, and the face inside it. */
const RIM = 6;

// ── Colour ────────────────────────────────────────────────────────────

type Hue = "lift" | "brand" | "run" | "food" | "water" | "best" | "dim";

const HUE_BASE: Record<Exclude<Hue, "dim">, string> = {
  lift: THEME.lifting,
  brand: THEME.brand,
  run: THEME.running,
  food: THEME.semantic.nutrition,
  water: THEME.semantic.hydration,
  best: THEME.tier.gold,
};

const FAMILY_HUE: Record<ArtFamily, Exclude<Hue, "dim">> = {
  consistency: "brand",
  lifting: "lift",
  best: "best",
  running: "run",
  food: "food",
  water: "water",
  // A hybrid badge's face is the brand's; its parts carry their sports.
  hybrid: "brand",
};

interface Ink {
  /** The lit line. */
  line: string;
  /** Inside a form, under its line. */
  fill: string;
  /** The soft light behind the line, or none. */
  glow: string | null;
}

/** The face's colour at its edge and lit at its centre: the family's
 *  colour washed into the enamel. Gold lights it from a neutral instead:
 *  mixed into the enamel it turns olive. */
function faceColours(hue: Exclude<Hue, "dim">): [edge: string, centre: string] {
  if (hue === "best")
    return [mix(ENAMEL, WHITE, 0.02), mix(ENAMEL, WHITE, 0.09)];
  const base = HUE_BASE[hue];
  return [
    mix(ENAMEL, base, 0.1),
    mix(ENAMEL, base, hue === "food" ? 0.36 : 0.42),
  ];
}

function ink(hue: Hue, state: BadgeArtState): Ink {
  if (state === "locked") {
    return hue === "dim"
      ? { line: "#4a4a4a", fill: "#2e2e2e", glow: null }
      : { line: "#7a7a7a", fill: "#3a3a3a", glow: null };
  }
  if (hue === "dim") {
    return { line: "#4e4e58", fill: "#26262d", glow: null };
  }
  const base = HUE_BASE[hue];
  if (hue === "best") {
    // Gold is far brighter than the other colours: a glow round it, or a
    // face lit by it, read as neon and turned the enamel olive (§14o).
    return {
      line: mix(base, WHITE, 0.5),
      fill: mix(ENAMEL, base, 0.22),
      glow: null,
    };
  }
  return {
    line: mix(base, WHITE, 0.35),
    fill: mix(ENAMEL, base, 0.28),
    glow: base,
  };
}

/** The four metals, from the tokens: gold taken toward its own shadow so
 *  it reads as metal rather than a yellow line, platinum cooled toward the
 *  brand's violet-white so it is not silver. */
function metal(
  tier: BadgeTier,
  state: BadgeArtState
): [string, string, string] {
  if (state === "locked") return ["#b4b4b4", "#8a8a8a", "#5c5c5c"];
  const p = TIER_PALETTES[tier];
  switch (tier) {
    case "gold":
      return [
        p.highlight,
        mix(mix(p.base, p.edge, 0.38), TIER_PALETTES.silver.base, 0.18),
        p.edge,
      ];
    case "platinum":
      return [
        WHITE,
        mix(p.base, THEME.purpleRamp[200], 0.5),
        mix(p.edge, THEME.purpleRamp[700], 0.3),
      ];
    default:
      return [p.highlight, p.base, p.edge];
  }
}

// ── Signs ─────────────────────────────────────────────────────────────

/** One piece of a sign: a closed `form` (filled, with the lit line round
 *  it), an open `line`, or a `spot` filled with the line's colour. */
interface Part {
  d: string;
  kind: "form" | "line" | "spot";
  /** A part in another colour than the badge's family. */
  hue?: Hue;
  /** Its line this many times the usual width. */
  weight?: number;
  /** Turned this many degrees about a point: [degrees, x, y]. */
  turn?: readonly [number, number, number];
}

interface Sign {
  /** The box the parts are drawn in. */
  w: number;
  h: number;
  parts: Part[];
}

const form = (d: string, hue?: Hue): Part => ({ d, kind: "form", hue });
const line = (d: string, hue?: Hue, weight?: number): Part => ({
  d,
  kind: "line",
  hue,
  weight,
});
const spot = (d: string, hue?: Hue): Part => ({ d, kind: "spot", hue });

const circle = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;

const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${n(y)}H${n(x + w - r)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}V${n(y + h - r)}Q${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}H${n(x + r)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)}V${n(y + r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Z`;

/** An arc of the circle from `a0` to `a1` degrees, clockwise from the
 *  top. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const at = (a: number) => {
    const t = (a * Math.PI) / 180;
    return `${n(cx + r * Math.sin(t))} ${n(cy - r * Math.cos(t))}`;
  };
  return `M${at(a0)}A${n(r)} ${n(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${at(a1)}`;
};

/** A path of absolute points (M, C, L, Z only) moved by dx, dy. */
const shift = (d: string, dx: number, dy: number) => {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (m) =>
    n(Number(m) + (i++ % 2 ? dy : dx))
  );
};

/** A footprint: the sole and the heel in one form, toes up, its centre at
 *  (10, 26). */
const SOLE =
  "M10 12C5 12 3 17.5 3.4 23C3.7 27 5.6 29.5 6.2 32.5C6.8 35.5 6.6 39.5 10 40C13.4 40.5 14 36.5 14.2 33C14.4 30 17 27 17 22.5C17 16.5 14.8 12 10 12Z";

/** A small pointy-top hexagon, the badge's own shape. */
const hexagon = (cx: number, cy: number, r: number) => {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`;
  });
  return `M${pts.join("L")}Z`;
};

/** A bar loaded with `count` plates a side, the sign of the plate clubs. */
function plates(count: number): Sign {
  // Plates and nothing else on the bar: at 40 px a collar read as one
  // more plate, and the plates are the count.
  const parts: Part[] = [line("M3 24H85")];
  for (let i = 0; i < count; i++) {
    const x = 24 - i * 9.5;
    parts.push(form(rect(x, 2, 6.5, 44, 2.2)));
    parts.push(form(rect(88 - x - 6.5, 2, 6.5, 44, 2.2)));
  }
  return { w: 88, h: 48, parts };
}

/** The streak flame: StreakFlame's own outline, twice its 24-unit size. */
const FLAME_BODY =
  "M24 4C21 8.6 18 11.6 18 16 18 18.6 18.8 20 19.6 21.2 20.4 22.4 20 24 18.6 24.6 16.2 25.6 14.6 27.8 14.6 31A13.4 13.4 0 0 0 41.4 31C41.4 26.6 39 23.2 36 20 32.4 16.4 30 11.8 29 7 28.2 8.6 27 10 26 11Z";
const FLAME_CORE =
  "M24 26C22.8 28.2 21.2 30 21.2 32.6A6 6 0 0 0 26.8 38.6 5.4 5.4 0 0 0 30.8 30C29.4 28.2 28.6 26.6 28 24.4 27.2 25.4 26.6 26.4 26 27 25.4 26.6 24.8 26.4 24 26Z";

const SIGNS: Record<SignId, Sign> = {
  // Two footprints, the second a step ahead, each turned out a little.
  step: {
    w: 44,
    h: 50,
    parts: [
      { ...form(shift(SOLE, 2, 8)), turn: [-12, 12, 34] },
      { ...form(shift(SOLE, 22, -10)), turn: [12, 32, 16] },
    ],
  },
  flame: {
    w: 48,
    h: 48,
    parts: [form(FLAME_BODY), spot(FLAME_CORE)],
  },
  // The sun over the horizon.
  sunrise: {
    w: 56,
    h: 44,
    parts: [
      form("M12 32A16 16 0 0 1 44 32Z"),
      line("M3 32H53"),
      line("M14 40H42"),
      line("M28 4V9M8.6 12.6L12.2 16.2M47.4 12.6L43.8 16.2"),
    ],
  },
  // A bar going up: a new best.
  bestLift: {
    w: 60,
    h: 50,
    parts: [
      line("M18 13L30 2L42 13", undefined, 1.15),
      line("M3 38H57"),
      form(rect(9, 27, 6.5, 22, 2.2)),
      form(rect(44.5, 27, 6.5, 22, 2.2)),
    ],
  },
  plates1: plates(1),
  plates2: plates(2),
  plates3: plates(3),
  // The plan's weeks, every one done, under a tick.
  plan: {
    w: 60,
    h: 48,
    parts: [
      line("M17 15L26 24L44 5", undefined, 1.2),
      ...[0, 1, 2, 3, 4, 5].map((i) => form(rect(2 + i * 9.6, 34, 7, 12, 2.4))),
    ],
  },
  // A route, start ring to finish dot: what a run leaves on the map.
  route: {
    w: 50,
    h: 38,
    parts: [
      line("M10 31C18 31 17 19 25 19S31 28 37 24 40.5 13 40.5 11"),
      line(circle(7, 31, 4.2)),
      spot(circle(41, 8, 5.2)),
    ],
  },
  bolt: {
    w: 34,
    h: 48,
    parts: [form("M21 2L5 27H16L12 46L29 19H18L23 2Z")],
  },
  // The day's three macros, each closed on its target: Food's wheel.
  macros: {
    w: 48,
    h: 48,
    parts: [
      line(arc(24, 24, 19, 10, 110), undefined, 1.25),
      line(arc(24, 24, 19, 130, 230), undefined, 1.25),
      line(arc(24, 24, 19, 250, 350), undefined, 1.25),
    ],
  },
  // An egg, its yolk lit.
  egg: {
    w: 36,
    h: 40,
    parts: [
      form("M18 2C26 2 33 13 33 23.5S26.5 38 18 38 3 34 3 23.5 10 2 18 2Z"),
      spot(circle(18, 24.5, 9)),
    ],
  },
  // A plate between a knife and a fork.
  plateSetting: {
    w: 60,
    h: 40,
    parts: [
      form(circle(30, 20, 16)),
      line(circle(30, 20, 8.5)),
      line("M5 3V37"),
      line("M55 37V3C58 5 58.5 10 58.5 14S57.5 20 55 20"),
    ],
  },
  drop: {
    w: 34,
    h: 46,
    parts: [
      form("M17 3C17 3 4 17.5 4 28.5A13 13 0 0 0 30 28.5C30 17.5 17 3 17 3Z"),
    ],
  },
  // A bar over a route: a lift and a run in one week.
  liftAndRun: {
    w: 64,
    h: 52,
    parts: [
      line("M3 13H61", "lift"),
      form(rect(12, 2, 6.5, 22, 2.2), "lift"),
      form(rect(45.5, 2, 6.5, 22, 2.2), "lift"),
      line("M12 45C20 45 20 35 29 35S37 43 44 40 50 33 52 32", "run"),
      line(circle(8.5, 45, 3.8), "run"),
      spot(circle(54, 31.5, 4.8), "run"),
    ],
  },
  // Five lifts and five runs, as Home's week segments count them.
  fiveAndFive: {
    w: 60,
    h: 44,
    parts: [
      ...[0, 1, 2, 3, 4].map((i) =>
        form(rect(2 + i * 11.6, 3, 8.4, 16, 3), "lift")
      ),
      ...[0, 1, 2, 3, 4].map((i) =>
        form(rect(2 + i * 11.6, 25, 8.4, 16, 3), "run")
      ),
    ],
  },
  // A week of seven days: three lifts, three runs and one to rest.
  week3and3: {
    w: 68,
    h: 34,
    parts: [0, 1, 2, 3, 4, 5, 6].map((i) =>
      form(
        rect(2 + i * 9.4, 4, 7, 26, 3),
        i < 3 ? "lift" : i < 6 ? "run" : "dim"
      )
    ),
  },
  // Three targets in one day: lifting, running and food.
  threeRings: {
    w: 48,
    h: 48,
    parts: [
      line(circle(24, 24, 20.5), "lift"),
      line(circle(24, 24, 13.5), "run"),
      spot(circle(24, 24, 6.5), "food"),
    ],
  },
  // Badges themselves, gathered.
  hexes: {
    w: 56,
    h: 34,
    parts: [
      form(hexagon(11, 21, 10), "lift"),
      form(hexagon(45, 21, 10), "run"),
      form(hexagon(28, 13, 11.5)),
    ],
  },
};

// ── Layout ────────────────────────────────────────────────────────────

interface Zone {
  cx: number;
  cy: number;
  maxW: number;
  maxH: number;
  /** Stand the sign on the zone's foot rather than centre it: over a
   *  number, a wide sign stays low, clear of the narrowing top. */
  foot?: boolean;
}

function placeSign(sign: Sign, zone: Zone) {
  const s = Math.min(zone.maxW / sign.w, zone.maxH / sign.h);
  const x = zone.cx - (sign.w * s) / 2;
  const y = zone.foot
    ? zone.cy + zone.maxH / 2 - sign.h * s
    : zone.cy - (sign.h * s) / 2;
  return { s, transform: `translate(${n(x)} ${n(y)}) scale(${+s.toFixed(4)})` };
}

function drawSign(
  sign: Sign,
  zone: Zone,
  family: ArtFamily,
  state: BadgeArtState
): { glow: string; lines: string } {
  const { s, transform } = placeSign(sign, zone);
  const glow: string[] = [];
  const lines: string[] = [];
  for (const part of sign.parts) {
    const k = ink(part.hue ?? FAMILY_HUE[family], state);
    const width = +((LINE * (part.weight ?? 1)) / s).toFixed(3);
    const stroke =
      `stroke-width="${width}"` +
      (part.turn
        ? ` transform="rotate(${part.turn.map((v) => n(v)).join(" ")})"`
        : "");
    if (part.kind === "spot") {
      lines.push(`<path d="${part.d}" fill="${k.line}"/>`);
      if (k.glow) glow.push(`<path d="${part.d}" fill="${k.glow}"/>`);
      continue;
    }
    const fill = part.kind === "form" ? k.fill : "none";
    lines.push(
      `<path d="${part.d}" fill="${fill}" stroke="${k.line}" ${stroke}/>`
    );
    if (k.glow) {
      glow.push(
        `<path d="${part.d}" fill="none" stroke="${k.glow}" ${stroke}/>`
      );
    }
  }
  const attrs = `transform="${transform}" stroke-linecap="round" stroke-linejoin="round"`;
  return {
    glow: glow.length
      ? `<g ${attrs} filter="url(#g)" opacity="0.35">${glow.join("")}</g>`
      : "",
    lines: `<g ${attrs}>${lines.join("")}</g>`,
  };
}

// ── The badge ─────────────────────────────────────────────────────────

/** The art for one badge, earned or not yet, as an SVG document. */
export function drawBadge(
  id: string,
  tier: BadgeTier,
  state: BadgeArtState
): string {
  const spec = BADGE_ART_SPECS[id];
  if (!spec) throw new Error(`no badge art for "${id}"`);
  const familyHue = FAMILY_HUE[spec.family];
  const hue = HUE_BASE[familyHue];
  const locked = state === "locked";
  const rim = metal(tier, state);
  const [face, faceLight] = locked
    ? ["#2a2a2a", "#333333"]
    : faceColours(familyHue);
  const figure = locked ? "#9a9a9a" : mix(mix(hue, WHITE, 0.35), WHITE, 0.82);

  // The number and its unit first: the sign takes the room they leave.
  let numeral = "";
  let signZone: Zone = { cx: 50, cy: 50, maxW: 62, maxH: 50 };
  if (spec.numeral && spec.unit) {
    // A number with its unit fills the face: under a sign the unit was
    // too small to read at 40 px. The unit sits under the figure at about
    // half its height (§14m rule 8).
    const fig = numeralPath(spec.numeral, {
      cx: 50,
      baseline: 58,
      capHeight: 26,
      maxWidth: 68,
    });
    const unit = numeralPath(spec.unit, {
      cx: 50,
      baseline: 76,
      capHeight: (12 * BADGE_NUMERALS.capHeight) / BADGE_NUMERALS.xHeight,
      maxWidth: 40,
    });
    numeral =
      `<path d="${fig.d}" fill="${figure}"/>` +
      `<path d="${unit.d}" fill="${figure}" fill-opacity="0.85"/>`;
  } else if (spec.numeral) {
    const baseline = 76;
    const fig = numeralPath(spec.numeral, {
      cx: 50,
      baseline,
      capHeight: 26,
      maxWidth: 68,
    });
    numeral = `<path d="${fig.d}" fill="${figure}"/>`;
    const bottom = baseline - fig.capHeight - 5;
    const maxH = Math.min(33, bottom - 12);
    signZone = { cx: 50, cy: bottom - maxH / 2, maxW: 40, maxH, foot: true };
  }
  const sign = spec.sign
    ? drawSign(SIGNS[spec.sign], signZone, spec.family, state)
    : { glow: "", lines: "" };

  const defs =
    `<linearGradient id="r" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${rim[0]}"/><stop offset="0.45" stop-color="${rim[1]}"/><stop offset="1" stop-color="${rim[2]}"/></linearGradient>` +
    `<radialGradient id="f" cx="0.5" cy="${spec.numeral ? 0.4 : 0.5}" r="0.6"><stop offset="0" stop-color="${faceLight}"/><stop offset="1" stop-color="${face}"/></radialGradient>` +
    `<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WHITE}" stop-opacity="${locked ? 0.12 : 0.24}"/><stop offset="0.5" stop-color="${WHITE}" stop-opacity="0"/></linearGradient>` +
    (sign.glow
      ? '<filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter>'
      : "");
  const faceD = hexPath(RIM, 3.4);
  const body =
    `<path d="${hexPath(0, 5)}" fill="url(#r)"/>` +
    // Platinum's second line, inside the rim: not silver at 56 px.
    (tier === "platinum" && !locked
      ? `<path d="${hexPath(2.7, 4.2)}" fill="none" stroke="${rim[2]}" stroke-opacity="0.55" stroke-width="0.7"/>`
      : "") +
    `<path d="${faceD}" fill="url(#f)" stroke="${locked ? BLACK : rim[2]}" stroke-opacity="${locked ? 0.35 : 0.9}" stroke-width="0.8"/>` +
    // The lit edge (§14o): the face's upper edges catch the light.
    `<path d="${hexPath(RIM + 0.8, 2.8)}" fill="none" stroke="url(#e)" stroke-width="0.8"/>` +
    sign.glow +
    sign.lines +
    numeral;
  return svgDoc(body, defs);
}

/** Where a badge's art is published: public/badges/<file>. */
export function badgeArtFile(id: string, state: BadgeArtState): string {
  return state === "earned" ? `${id}.svg` : `${id}-locked.svg`;
}
