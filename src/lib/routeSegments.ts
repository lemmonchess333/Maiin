/** A flat Firestore-safe route preserves gaps with a flag on the next point. */
export interface RouteCoordinate {
  lat: number;
  lon: number;
  breakBefore?: boolean;
}

export function splitRouteSegments<T extends { breakBefore?: boolean }>(
  points: T[]
): T[][] {
  const segments: T[][] = [];
  for (const point of points) {
    if (segments.length === 0 || point.breakBefore) segments.push([]);
    segments[segments.length - 1].push(point);
  }
  return segments;
}

/** Keep the point budget and both endpoints of every represented segment.
 * If the budget cannot represent all disconnected pieces, omit whole pieces
 * rather than joining across a cut. The share preview uses this exact result. */
export function sampleRoute<T extends RouteCoordinate>(
  points: T[],
  limit: number
): T[] {
  const budget = Math.max(0, Math.floor(limit));
  if (points.length <= budget) return points;
  if (budget < 2) return [];
  const segments = splitRouteSegments(points)
    .filter((segment) => segment.length > 1)
    .slice(0, Math.floor(budget / 2));
  let remaining = budget;
  return segments.flatMap((segment, index) => {
    const reserved = (segments.length - index - 1) * 2;
    const count = Math.min(segment.length, remaining - reserved);
    remaining -= count;
    const step = (segment.length - 1) / (count - 1);
    return Array.from(
      { length: count },
      (_, i) => segment[Math.round(i * step)]
    );
  });
}
