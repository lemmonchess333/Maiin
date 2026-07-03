/**
 * Side-view (profile) body for the exercise demos.
 *
 * ARCHITECTURE — rig-safe pieces, TRUE facet-mosaic surface.
 * The vendored front/back art is a mosaic of individually shaped muscle
 * facets with the background showing through the gaps. A rigged profile
 * additionally needs pieces that rotate without opening cracks. Both at
 * once: each piece paints a stage-coloured UNDERLAY (its silhouette) and
 * then its muscle FACETS on top, inset so the underlay shows through as
 * the gaps — pixel-identical language to the vendored mosaic on the dark
 * stage, while the solid underlays keep overlaps opaque and joints
 * crack-free under rotation. (v1 drew a smooth outline with seam strokes
 * — it read as a mannequin with lines drawn on, product owner rejected.)
 *
 * The figure faces RIGHT. Same 200-unit height and landmark rows as the
 * vendored figure (shoulder ≈45, elbow ≈71, hip ≈97, knee ≈152,
 * ankle ≈194). Facet muscle names reuse the library vocabulary so demo
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

export interface SidePiece {
  group: GroupName;
  /** Piece silhouette — painted in the stage colour as the underlay. */
  outline: Pt[];
  /** Muscle facets painted over the underlay; the visible mosaic. */
  facets: { muscle: string; points: Pt[] }[];
}

export const SIDE_PIECES: SidePiece[] = [
  {
    group: "shankL",
    outline: [
      [45, 150],
      [55, 148],
      [54, 160],
      [52.5, 176],
      [51, 190],
      [63, 197],
      [65.5, 200.5],
      [64.5, 202.5],
      [43, 202.5],
      [41.5, 196.5],
      [45, 190],
      [42.5, 178],
      [39.5, 166],
      [41, 155],
    ],
    facets: [
      {
        muscle: "calves",
        points: [
          [41.4, 153.9],
          [46.9, 151.9],
          [47.7, 160.4],
          [46.4, 171.4],
          [42.9, 175.4],
          [39.9, 168.4],
          [39.4, 159.9],
        ],
      },
      {
        muscle: "calves",
        points: [
          [43.4, 177.9],
          [46.2, 174.4],
          [45.9, 186.4],
          [44.4, 191.9],
          [42.6, 187.4],
          [42.4, 181.4],
        ],
      },
      {
        muscle: "shin",
        points: [
          [48.4, 152.4],
          [53.2, 150.4],
          [52.9, 162.4],
          [51.4, 177.4],
          [49.9, 189.9],
          [47.4, 189.4],
          [47.9, 171.4],
          [48.1, 160.4],
        ],
      },
      {
        muscle: "foot",
        points: [
          [43.9, 193.4],
          [49.4, 191.9],
          [56.4, 195.9],
          [63.4, 199.4],
          [62.4, 201.9],
          [44.4, 201.9],
          [42.9, 196.9],
        ],
      },
    ],
  },
  {
    group: "thighL",
    outline: [
      [42, 97],
      [53, 95.5],
      [58.5, 103],
      [61, 112],
      [60, 126],
      [57, 141],
      [55.2, 149],
      [55.4, 156],
      [50, 158.5],
      [46.2, 155],
      [45, 147],
      [43, 136],
      [41, 122],
      [39.8, 108],
    ],
    facets: [
      {
        muscle: "quadriceps",
        points: [
          [46.9, 99.4],
          [53.4, 97.2],
          [58.2, 103.9],
          [60.2, 112.9],
          [59.7, 124.4],
          [56.9, 134.4],
          [52.4, 128.4],
          [48.4, 112.4],
          [46.2, 103.4],
        ],
      },
      {
        muscle: "quadriceps",
        points: [
          [55.9, 137.9],
          [56.4, 144.4],
          [55.2, 153.9],
          [50.9, 157.4],
          [47.4, 153.4],
          [49.9, 143.4],
          [53.4, 136.4],
        ],
      },
      {
        muscle: "hamstring",
        points: [
          [40.9, 105.9],
          [44.4, 101.4],
          [45.9, 112.4],
          [48.4, 126.4],
          [46.4, 140.4],
          [43.2, 144.9],
          [40.4, 141.4],
          [39.4, 128.4],
          [39.7, 114.4],
        ],
      },
    ],
  },
  {
    group: "head",
    outline: [
      [47, 6.2],
      [53, 5],
      [57.5, 7.2],
      [59.8, 11.2],
      [59.1, 13.5],
      [61.1, 15.5],
      [58.5, 18.8],
      [55.7, 21.6],
      [54.4, 25.2],
      [54.7, 30.2],
      [53.9, 36.2],
      [53.1, 39.8],
      [44.6, 39.4],
      [46.1, 30.2],
      [47.2, 23.2],
      [45.9, 14.2],
    ],
    facets: [
      {
        muscle: "head",
        points: [
          [47.6, 6.8],
          [52.9, 5.7],
          [56.9, 7.8],
          [59.1, 11.4],
          [58.4, 13.6],
          [60.3, 15.6],
          [58, 17.9],
          [53.4, 18.4],
          [47.9, 17.4],
          [46.5, 13.1],
          [46.7, 8.8],
        ],
      },
      {
        muscle: "jaw",
        points: [
          [48.4, 19.1],
          [52.4, 19.4],
          [56.4, 19.6],
          [55.2, 21.4],
          [49.9, 22.1],
        ],
      },
      {
        muscle: "neck",
        points: [
          [47.1, 23.4],
          [53.9, 23.1],
          [53.6, 30.6],
          [52.9, 38.1],
          [45.4, 38.6],
          [46.4, 31.1],
        ],
      },
    ],
  },
  {
    group: "torso",
    outline: [
      [48.5, 31],
      [50.5, 33.5],
      [56.5, 37.5],
      [62, 41],
      [63.8, 47],
      [60.5, 54],
      [58.5, 64],
      [59, 76],
      [57, 88],
      [54.5, 96],
      [50, 103.5],
      [46.5, 111.5],
      [41.5, 114.5],
      [36, 112],
      [32.5, 107],
      [31.5, 100],
      [34, 92],
      [37, 84],
      [37.5, 76],
      [36.5, 66],
      [35.5, 54],
      [36.8, 44],
      [40, 36],
      [44.5, 30],
    ],
    facets: [
      {
        muscle: "trapezius",
        points: [
          [45.2, 30.9],
          [48.6, 32.4],
          [52.9, 35.2],
          [49.4, 37.4],
          [43.4, 40.4],
          [40.9, 36.9],
        ],
      },
      {
        muscle: "chest",
        points: [
          [50.9, 38.9],
          [56.9, 38.7],
          [61.4, 41.6],
          [63.2, 46.9],
          [60.2, 53.4],
          [55.4, 55.9],
          [51.4, 54.4],
          [49.4, 46.9],
          [49.6, 41.9],
        ],
      },
      {
        muscle: "upper-back",
        points: [
          [36.9, 45.4],
          [39.6, 39.9],
          [43.9, 41.9],
          [44.4, 56.4],
          [42.9, 66.9],
          [38.9, 68.4],
          [36.4, 55.4],
        ],
      },
      {
        muscle: "abs",
        points: [
          [53.9, 57.4],
          [58.7, 57.9],
          [58.4, 66.4],
          [57.9, 74.9],
          [53.4, 74.4],
          [53.7, 65.9],
        ],
      },
      {
        muscle: "abs",
        points: [
          [53.2, 76.4],
          [57.7, 76.9],
          [56.4, 87.4],
          [52.4, 94.4],
          [49.9, 90.9],
          [52.7, 83.4],
        ],
      },
      {
        muscle: "obliques",
        points: [
          [45.9, 57.9],
          [52.4, 57.7],
          [52.2, 74.4],
          [51.4, 88.4],
          [47.4, 94.4],
          [44.9, 88.9],
          [45.2, 72.4],
        ],
      },
      {
        muscle: "lower-back",
        points: [
          [37.9, 70.4],
          [43.4, 68.9],
          [43.9, 88.4],
          [40.4, 90.4],
          [37.4, 84.9],
          [37.2, 77.4],
        ],
      },
      {
        muscle: "pelvis",
        points: [
          [49.4, 88.9],
          [55.9, 89.4],
          [53.4, 97.9],
          [48.9, 101.4],
          [46.9, 95.9],
          [47.7, 91.4],
        ],
      },
      {
        muscle: "gluteal",
        points: [
          [36.4, 92.4],
          [43.4, 90.9],
          [45.4, 95.9],
          [44.9, 105.4],
          [42.4, 112.9],
          [37.4, 113.4],
          [33.4, 107.4],
          [32.6, 99.4],
          [34.4, 94.4],
        ],
      },
    ],
  },
  {
    group: "foreArmL",
    outline: [
      [44.4, 68.5],
      [52.6, 68],
      [54.3, 80],
      [54.3, 90],
      [52.6, 98],
      [48.2, 99],
      [45.9, 90],
      [44.9, 79],
    ],
    facets: [
      {
        muscle: "forearm",
        points: [
          [45.9, 69.9],
          [51.4, 69.4],
          [52.9, 79.9],
          [47.2, 80.9],
          [45.7, 74.9],
        ],
      },
      {
        muscle: "forearm",
        points: [
          [47.6, 82.4],
          [53.2, 81.4],
          [53.1, 89.4],
          [51.7, 96.9],
          [48.9, 97.9],
          [47.1, 89.9],
        ],
      },
    ],
  },
  {
    group: "upperArmL",
    outline: [
      [40, 39],
      [47.5, 36.2],
      [54.5, 40],
      [55.5, 46.5],
      [53.3, 52],
      [52.8, 62],
      [52.3, 73.5],
      [44.7, 74.5],
      [42.7, 64],
      [41, 52],
      [38.5, 45],
    ],
    facets: [
      {
        muscle: "front-deltoids",
        points: [
          [41.4, 39.9],
          [47.4, 37.4],
          [53.4, 40.9],
          [54.4, 45.9],
          [52.4, 50.4],
          [46.4, 51.7],
          [41.2, 48.9],
          [39.9, 44.4],
        ],
      },
      {
        muscle: "triceps",
        points: [
          [42.2, 52.9],
          [45.4, 53.9],
          [45.6, 64.4],
          [45.9, 72.4],
          [43.6, 72.9],
          [42.2, 64.4],
          [41.6, 56.9],
        ],
      },
      {
        muscle: "biceps",
        points: [
          [46.9, 53.4],
          [51.6, 52.7],
          [52.1, 62.4],
          [51.7, 71.9],
          [47.4, 72.7],
          [46.7, 62.9],
        ],
      },
    ],
  },
];

/* Measured joint anchors for the side rig. */
export const SIDE_ANCHORS = {
  neck: [48, 32] as Pt,
  shoulder: [47.5, 45] as Pt,
  elbow: [48.6, 71] as Pt,
  hand: [50.4, 98] as Pt,
  hip: [42, 100.5] as Pt,
  knee: [50, 153] as Pt,
  ankle: [46.5, 194] as Pt,
};
