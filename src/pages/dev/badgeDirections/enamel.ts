/**
 * Direction A, "Lit enamel": the badge stays the object the seal opens to
 * show, a dark enamel hexagon in its tier's metal, and the art is light on
 * it. The family's sign is drawn as a lit line in the family's colour, and
 * the number the badge is for stands under it in the display cut, white.
 * On dark, colour as strokes and glows on a near-neutral ground (§14m rule
 * 14), the glow kept soft so it stays a light and not neon (§14o); the
 * gradient on the face stays in the family's hue and fades into the
 * enamel (rule 13).
 */
import { THEME } from "@/lib/theme";
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

const WHITE = "#ffffff";
const ENAMEL = THEME.bg;

/** Lit-line signs, drawn as strokes in the 100-unit box. A sign above a
 *  number sits in y 17..44; a sign alone fills the face. */
const SIGNS: Record<SampleId, string> = {
  // The streak flame (StreakFlame's body and core), 24 units tall.
  week_warrior:
    '<g transform="translate(32 14.2) scale(1.5)"><path d="M12 2c-1.5 2.3-3 3.8-3 6 0 1.3.4 2 .8 2.6.4.6.2 1.4-.5 1.7-1.2.5-2 1.6-2 3.2a6.7 6.7 0 0 0 13.4 0c0-2.2-1.2-3.9-2.7-5.5-1.8-1.8-3-4.1-3.5-6.5-.4.8-1 1.5-1.5 2z" stroke-width="1.9"/><path d="M12 13c-.6 1.1-1.2 1.8-1.2 2.9a2.2 2.2 0 0 0 4.4 0c0-1-.7-1.8-1.2-2.6" stroke-width="1.5"/></g>',
  // A bar with two plates a side: the count is drawn, in plates, so it
  // holds in kilograms and in pounds.
  two_plate:
    '<path d="M12 50H88" stroke-width="3.2"/><rect x="20" y="31" width="6" height="38" rx="2"/><rect x="28.5" y="31" width="6" height="38" rx="2"/><rect x="65.5" y="31" width="6" height="38" rx="2"/><rect x="74" y="31" width="6" height="38" rx="2"/><path d="M37.5 44.5V55.5M62.5 44.5V55.5" stroke-width="3"/>',
  // A route, start ring to finish dot: what a run leaves on the map.
  first_5k:
    '<path d="M32 40C38 40 38 31 45 31S52 38 58 34 63 23 67.5 21.5"/><circle cx="31" cy="40" r="2.6" stroke-width="2.2"/><circle cx="68.5" cy="21" r="3.2" class="dot"/>',
  marathon:
    '<path d="M32 40C38 40 38 31 45 31S52 38 58 34 63 23 67.5 21.5"/><circle cx="31" cy="40" r="2.6" stroke-width="2.2"/><circle cx="68.5" cy="21" r="3.2" class="dot"/>',
  // A plate between a fork and a knife.
  meal_prep_master:
    '<circle cx="50" cy="31" r="11.5"/><circle cx="50" cy="31" r="6" stroke-width="2"/><path d="M33.5 19V25.5C33.5 27.5 34.5 28.5 35.6 28.8M37.7 19V25.5C37.7 27.5 36.7 28.5 35.6 28.8V43M35.6 19V25" stroke-width="2.2"/><path d="M65.5 43V19.5C67.8 20.5 68.8 24 68.8 27.5S67.6 32 65.5 32" stroke-width="2.2"/>',
  // A drop.
  hydration_hero:
    '<path d="M50 17.5C50 17.5 41 27.5 41 34.5A9 9 0 0 0 59 34.5C59 27.5 50 17.5 50 17.5Z"/><path d="M45.5 35.5A4.5 4.5 0 0 0 49 39.5" stroke-width="2"/>',
};

interface Paint {
  rim: [string, string, string];
  faceGlow: string;
  face: string;
  line: string;
  glow: string | null;
  figure: string;
}

function paint(sample: Sample, state: BadgeState): Paint {
  if (state === "locked") {
    // Not yet earned: the same drawing in greys, no light in it.
    return {
      rim: ["#a4a4ab", "#7c7c84", "#55555c"],
      faceGlow: "#26262c",
      face: "#1b1b20",
      line: "#6e6e76",
      glow: null,
      figure: "#8a8a92",
    };
  }
  const h = FAMILY_HUE[sample.family];
  const metal = TIER_PALETTES[sample.tier];
  return {
    rim: [metal.highlight, metal.base, metal.edge],
    faceGlow: mix(ENAMEL, h.base, 0.34),
    face: mix(ENAMEL, h.base, 0.04),
    line: h.light,
    glow: h.base,
    figure: mix(h.light, WHITE, 0.82),
  };
}

export function drawEnamel(sample: Sample, state: BadgeState): string {
  const p = paint(sample, state);
  const sign = SIGNS[sample.id];
  const fig = sample.numeral
    ? numeralPath(sample.numeral, {
        cx: 50,
        baseline: 77,
        capHeight: 24,
        maxWidth: 60,
      }).d
    : null;
  const defs =
    `<linearGradient id="r" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${p.rim[0]}"/><stop offset="0.45" stop-color="${p.rim[1]}"/><stop offset="1" stop-color="${p.rim[2]}"/></linearGradient>` +
    `<radialGradient id="f" cx="0.5" cy="${fig ? 0.36 : 0.5}" r="0.62"><stop offset="0" stop-color="${p.faceGlow}"/><stop offset="1" stop-color="${p.face}"/></radialGradient>` +
    (p.glow
      ? '<filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter>'
      : "");
  const strokeAttrs = `fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.8"`;
  const signGlow = p.glow
    ? `<g ${strokeAttrs} stroke="${p.glow}" filter="url(#g)" opacity="0.6">${sign.replace(/class="dot"/g, `fill="${p.glow}"`)}</g>`
    : "";
  const signLine = `<g ${strokeAttrs} stroke="${p.line}">${sign.replace(/class="dot"/g, `fill="${p.line}"`)}</g>`;
  const figure = fig ? `<path d="${fig}" fill="${p.figure}"/>` : "";
  const body =
    `<path d="${hexPath(0, 5)}" fill="url(#r)"/>` +
    `<path d="${hexPath(4.4, 3.6)}" fill="url(#f)"/>` +
    `<path d="${hexPath(4.4, 3.6)}" fill="none" stroke="${WHITE}" stroke-opacity="0.1" stroke-width="0.7"/>` +
    signGlow +
    signLine +
    figure;
  return svgDoc(body, defs);
}

export const ENAMEL_DIRECTION: Direction = {
  key: "enamel",
  name: "A · Lit enamel",
  summary:
    "Dark enamel in the tier’s metal, the family’s sign lit in its colour, the number in white.",
  draw: drawEnamel,
};
