/**
 * Bottom-sheet snap projection for the active-run panel.
 *
 * Given where the sheet's top edge is right now (px), the release velocity
 * (px/s, +down), and the candidate snap tops, project a short distance along
 * the throw and return the index of the nearest snap. Pulled out as a pure
 * function so the momentum behaviour is unit-tested (the drag itself is
 * pointer-driven and can't be exercised in jsdom).
 */
export function projectAndSnap(
  currentTop: number,
  velocity: number,
  snapTops: number[],
  projectionSeconds = 0.12
): number {
  const projected = currentTop + velocity * projectionSeconds;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < snapTops.length; i++) {
    const d = Math.abs(projected - snapTops[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
