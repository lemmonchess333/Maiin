/**
 * The seal's geometry — the pointy-top hexagon a new badge arrives inside
 * (BadgeEarnedModal), its insets, the six shards it breaks into and the
 * cracks that lead there. Data only; the drawing is BadgeSeal.tsx.
 */
export const SEAL_HEX = "50,3 93,28 93,72 50,97 7,72 7,28";
const V = [
  [50, 3],
  [93, 28],
  [93, 72],
  [50, 97],
  [7, 72],
  [7, 28],
] as const;

/** The hexagon scaled about its centre — the face and bevel are insets. */
function inset(k: number): readonly (readonly [number, number])[] {
  return V.map(([x, y]) => [50 + (x - 50) * k, 50 + (y - 50) * k] as const);
}
function pts(v: readonly (readonly [number, number])[]): string {
  return v.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
const BEVEL_K = 0.93;
const FACE_K = 0.87;
const FACE = inset(FACE_K);
const BEVEL = inset(BEVEL_K);
/** The upper half of the face — the sheen band. */
const SHEEN = pts([
  FACE[0],
  FACE[1],
  [FACE[1][0], 47],
  [50, 33],
  [FACE[5][0], 47],
  FACE[5],
]);

/** Six facets: centre → each face edge. Alternating tints cut the stone. */
const FACETS = FACE.map((v, i) => {
  const next = FACE[(i + 1) % FACE.length];
  return { points: `50,50 ${pts([v, next])}`, tint: i % 2 ? 0.05 : 0.015 };
});

/** Six shards (centre → each outer edge) and the direction each flies on
 *  the break: the outward normal of its outer edge. */
export const SEAL_SHARDS = V.map((v, i) => {
  const next = V[(i + 1) % V.length];
  const inner = [FACE[(i + 1) % FACE.length], FACE[i]] as const;
  const mx = (v[0] + next[0]) / 2 - 50;
  const my = (v[1] + next[1]) / 2 - 50;
  const len = Math.hypot(mx, my) || 1;
  return {
    /** The whole triangular piece. */
    points: `50,50 ${pts([v, next])}`,
    /** The rim band along its outer edge, so the piece keeps its metal edge. */
    rim: pts([v, next, inner[0], inner[1]]),
    dx: (mx / len) * 86,
    dy: (my / len) * 86,
    spin: (i % 2 ? 1 : -1) * (24 + i * 6),
  };
});

/** Jagged crack lines from the centre outward — revealed two per tap. */
export const SEAL_CRACKS = [
  "M50,50 L57,38 L53,29 L60,17 L57,5",
  "M50,50 L66,53 L78,47 L93,51",
  "M50,50 L55,65 L51,77 L58,95",
  "M50,50 L39,61 L29,58 L13,67",
  "M50,50 L43,41 L30,43 L16,33",
  "M50,50 L49,35 L40,27 L43,12",
];

/** Radius of the wax-seal medallion the lock sits on. */
export const SEAL_MEDALLION_R = 16;

export { FACE, BEVEL, SHEEN, FACETS, pts };
