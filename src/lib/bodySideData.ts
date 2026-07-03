/**
 * Side-view (profile) body for the exercise demos.
 *
 * CONSTRUCTED, not hand-drawn. Earlier passes hand-placed every facet
 * vertex and read as wobbly programmer-art next to the vendored figure
 * (product owner: proportions weird, facet shapes weird). The vendored
 * art's signature is PRECISION — parallel gaps, deliberate edges — so
 * this file defines each piece as BACK/FRONT contour polylines plus cut
 * fractions, and GENERATES the facets between them with exact uniform
 * insets (0.6 per side → 1.2-unit gaps, ~2-unit row gaps). Proportions
 * live in the contours; crispness is by construction.
 *
 * Rig architecture (unchanged): each piece paints a stage-coloured
 * UNDERLAY (its silhouette) and its muscle FACETS on top — the underlay
 * shows through as the gaps (identical language to the vendored mosaic
 * on the dark stage) and keeps overlaps opaque so joints never crack
 * under rotation.
 *
 * The figure faces RIGHT. Same 200-unit height and landmark rows as the
 * vendored figure (shoulder ≈45, elbow ≈71, hip ≈100, knee ≈152,
 * ankle ≈193). Facet muscle names reuse the library vocabulary so demo
 * tints and glow work unchanged; profile-only parts ("pelvis", "shin",
 * "foot", "jaw") are never tinted.
 *
 * Paint order (fixed): shank → thigh → head → torso → forearm → upper
 * arm. Legs tuck under the torso, the elbow tucks under the upper arm,
 * the near arm reads in front of the torso — exactly how a profile
 * layers.
 */

import type { GroupName } from "./bodyRig";

type Pt = [number, number];
/** Contour sample: [y, x]. */
type C = [number, number][];

export interface SidePiece {
  group: GroupName;
  /** Piece silhouette — painted in the stage colour as the underlay. */
  outline: Pt[];
  /** Muscle facets painted over the underlay; the visible mosaic. */
  facets: { muscle: string; points: Pt[] }[];
}

/* ── Facet construction ──────────────────────────────────────────── */

const GAP = 0.6; // per-side inset → 1.2-unit gaps, like the vendored art

function xAt(contour: C, y: number): number {
  if (y <= contour[0][0]) return contour[0][1];
  for (let i = 1; i < contour.length; i++) {
    const [y1, x1] = contour[i - 1];
    const [y2, x2] = contour[i];
    if (y <= y2) return x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
  }
  return contour[contour.length - 1][1];
}

/** Facet between the back/front contours from yTop..yBot, spanning the
 *  cut fractions tL..tR (0 = back contour, 1 = front contour), edges
 *  inset by GAP. Vertical edges sample the contours so facets follow
 *  the body's curves. */
function band(
  B: C,
  F: C,
  yTop: number,
  yBot: number,
  tL: number,
  tR: number
): Pt[] {
  const at = (y: number, t: number) => {
    const b = xAt(B, y);
    return b + t * (xAt(F, y) - b);
  };
  const left = (y: number) => (tL === 0 ? xAt(B, y) : at(y, tL)) + GAP;
  const right = (y: number) => (tR === 1 ? xAt(F, y) : at(y, tR)) - GAP;
  const steps = Math.max(1, Math.round((yBot - yTop) / 8));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = yTop + ((yBot - yTop) * i) / steps;
    pts.push([right(y), y]);
  }
  for (let i = steps; i >= 0; i--) {
    const y = yTop + ((yBot - yTop) * i) / steps;
    pts.push([left(y), y]);
  }
  return pts;
}

/** Piece silhouette from its contours (back edge down, front edge up). */
function silhouette(B: C, F: C): Pt[] {
  return [
    ...B.map(([y, x]) => [x, y] as Pt),
    ...[...F].reverse().map(([y, x]) => [x, y] as Pt),
  ];
}

/* ── Contours (the proportions live here) ────────────────────────── */

/* Torso: strong trap slope, deep heroic chest (depth ≈29 at the pecs),
 * lumbar curve, tight glute that creases at ~110. */
const TORSO_B: C = [
  [30, 44.5],
  [36, 39.6],
  [44, 37],
  [54, 35.8],
  [64, 36.4],
  [74, 37.4],
  [82, 37],
  [90, 34.6],
  [98, 32],
  [104, 31.4],
  [110, 33.6],
  [113.5, 38],
  [114.5, 43.6],
];
const TORSO_F: C = [
  [31, 48.5],
  [33.5, 51],
  [38, 57.5],
  [42, 62.8],
  [47.5, 64.8],
  [53.5, 61.8],
  [60, 59.2],
  [70, 59.6],
  [78, 58.8],
  [88, 56.8],
  [96, 54],
  [103, 50.4],
  [109, 46],
  [113, 44.4],
];

/* Thigh: quad sweep peaking mid-thigh, hamstring belly behind. */
const THIGH_B: C = [
  [97, 43.5],
  [104, 41.2],
  [116, 39.8],
  [128, 39.6],
  [140, 41.4],
  [150, 44.4],
  [156, 45.8],
];
const THIGH_F: C = [
  [95.5, 52.5],
  [103, 57.8],
  [112, 60.6],
  [124, 60.2],
  [138, 57.6],
  [148, 55.3],
  [156, 55.5],
];

/* Shank: gastroc bulge behind, straight shin, achilles taper. */
const SHANK_B: C = [
  [150, 41.6],
  [160, 39.2],
  [168, 38.2],
  [178, 40.9],
  [186, 43.2],
  [192, 44.5],
];
const SHANK_F: C = [
  [148.5, 54.2],
  [158, 52.9],
  [170, 51.5],
  [182, 50.2],
  [191, 49.6],
];

/* Upper arm: round delt cap flowing into the bi/tri columns. */
const ARM_B: C = [
  [38, 40.5],
  [44, 38.9],
  [50, 41],
  [56, 42.6],
  [66, 43.6],
  [73.5, 44.9],
];
const ARM_F: C = [
  [38, 53.6],
  [44.5, 55.3],
  [51, 53.9],
  [60, 53.2],
  [73.5, 52.6],
];

/* Forearm: tapers toward the wrist. */
const FORE_B: C = [
  [68.6, 44.6],
  [76, 45.4],
  [88, 46.3],
  [98.4, 48.4],
];
const FORE_F: C = [
  [68.4, 52.4],
  [78, 54.1],
  [88, 53.9],
  [98.2, 52.2],
];

/* ── Pieces ──────────────────────────────────────────────────────── */

const FOOT: Pt[] = [
  [44, 193.4],
  [49.6, 192],
  [57, 195.8],
  [63.6, 199.2],
  [62.8, 201.8],
  [44.2, 201.8],
  [42.8, 196.8],
];

export const SIDE_PIECES: SidePiece[] = [
  {
    group: "shankL",
    outline: [
      ...silhouette(SHANK_B, SHANK_F).slice(0, 6),
      // splice the foot into the silhouette bottom
      [49.6, 191.5],
      [57.2, 195.4],
      [64.4, 199],
      [63.4, 202.4],
      [43.6, 202.4],
      [42, 196.6],
      [44.2, 192.6],
    ],
    facets: [
      { muscle: "calves", points: band(SHANK_B, SHANK_F, 151, 176.5, 0, 0.5) },
      {
        muscle: "calves",
        points: band(SHANK_B, SHANK_F, 178.5, 191, 0, 0.44),
      },
      { muscle: "shin", points: band(SHANK_B, SHANK_F, 150, 190, 0.56, 1) },
      { muscle: "foot", points: FOOT },
    ],
  },
  {
    group: "thighL",
    outline: silhouette(THIGH_B, THIGH_F),
    facets: [
      {
        muscle: "quadriceps",
        points: band(THIGH_B, THIGH_F, 97.5, 144.5, 0.5, 1),
      },
      { muscle: "hamstring", points: band(THIGH_B, THIGH_F, 101, 143, 0, 0.5) },
      { muscle: "knees", points: band(THIGH_B, THIGH_F, 147, 155, 0.3, 0.92) },
    ],
  },
  {
    group: "head",
    outline: [
      [45.4, 4.4],
      [51.6, 3],
      [56.4, 4.4],
      [59.2, 8.2],
      [60.4, 11.4],
      [58, 15.9],
      [55, 18],
      [55.2, 21],
      [54.8, 26],
      [53.4, 34.8],
      [45, 35],
      [45.9, 26],
      [46.6, 21],
      [44.4, 12.4],
      [44.6, 7.4],
    ],
    facets: [
      {
        muscle: "head",
        points: [
          [46, 5],
          [51.5, 3.6],
          [55.8, 5],
          [58.6, 8.6],
          [59.6, 11.2],
          [58, 13.8],
          [57.2, 15.6],
          [53.6, 17.6],
          [48.8, 17.4],
          [46, 14.6],
          [44.9, 10.4],
          [45, 7.2],
        ],
      },
      {
        muscle: "jaw",
        points: [
          [49, 18.6],
          [54.6, 17.9],
          [53.6, 20.4],
          [49.6, 20.9],
        ],
      },
      {
        muscle: "neck",
        points: [
          [47, 22],
          [53.4, 21.4],
          [54.2, 30.5],
          [52.8, 34],
          [45.6, 34.6],
          [46.4, 27],
        ],
      },
    ],
  },
  {
    group: "torso",
    outline: silhouette(TORSO_B, TORSO_F),
    facets: [
      { muscle: "trapezius", points: band(TORSO_B, TORSO_F, 30.5, 37, 0, 1) },
      { muscle: "chest", points: band(TORSO_B, TORSO_F, 38.5, 56, 0.34, 1) },
      {
        muscle: "upper-back",
        points: band(TORSO_B, TORSO_F, 38.5, 67.5, 0, 0.34),
      },
      { muscle: "abs", points: band(TORSO_B, TORSO_F, 58, 75, 0.64, 1) },
      { muscle: "abs", points: band(TORSO_B, TORSO_F, 77, 89.5, 0.64, 1) },
      {
        muscle: "obliques",
        points: band(TORSO_B, TORSO_F, 58, 74, 0.34, 0.64),
      },
      {
        muscle: "obliques",
        points: band(TORSO_B, TORSO_F, 76, 90, 0.34, 0.64),
      },
      {
        muscle: "lower-back",
        points: band(TORSO_B, TORSO_F, 69.5, 88, 0, 0.34),
      },
      {
        muscle: "gluteal",
        points: [
          [36, 90.5],
          [43.8, 89.6],
          [45.6, 94.4],
          [44.6, 104],
          [42, 111.6],
          [37.2, 112.6],
          [33, 106.6],
          [32.2, 99],
          [33.8, 93.6],
        ],
      },
      {
        muscle: "pelvis",
        points: [
          [49.8, 89.4],
          [55.6, 89.8],
          [52.9, 97.8],
          [48.6, 101.8],
          [46.6, 96.4],
          [47.6, 92],
        ],
      },
    ],
  },
  {
    group: "foreArmL",
    outline: silhouette(FORE_B, FORE_F),
    facets: [
      { muscle: "forearm", points: band(FORE_B, FORE_F, 69.2, 80.5, 0, 1) },
      { muscle: "forearm", points: band(FORE_B, FORE_F, 82.5, 97.6, 0, 1) },
    ],
  },
  {
    group: "upperArmL",
    outline: silhouette(ARM_B, ARM_F),
    facets: [
      {
        muscle: "front-deltoids",
        points: band(ARM_B, ARM_F, 38.6, 50.6, 0, 1),
      },
      { muscle: "triceps", points: band(ARM_B, ARM_F, 52.4, 72.8, 0, 0.46) },
      { muscle: "biceps", points: band(ARM_B, ARM_F, 52.4, 72.8, 0.54, 1) },
    ],
  },
];

/* Measured joint anchors for the side rig. */
export const SIDE_ANCHORS = {
  neck: [48, 32] as Pt,
  shoulder: [47.5, 45] as Pt,
  elbow: [48.6, 71.5] as Pt,
  hand: [50.3, 98] as Pt,
  hip: [42, 100.5] as Pt,
  knee: [50, 152] as Pt,
  ankle: [46.6, 193] as Pt,
};
