/**
 * The water tile's fill colour: deep at the bottom of the water, light at
 * its surface.
 *
 * The fill is drawn the tile's full height and slid down by `translateY`
 * so its rise runs on the compositor (WaterCard). Only its top
 * `fillPercent` shows, so the gradient is laid over that part alone: the
 * surface's light tint at the element's top, the deep tint at the water's
 * bottom, `fillPercent` down. Spread over the whole element, the deep end
 * sat below the tile and a quarter-full glass showed only the faint top.
 */
export function waterFillBackground(fillPercent: number): string {
  const depth = Math.min(100, Math.max(0, fillPercent));
  if (depth <= 0) return "transparent";
  const mid = (depth * 0.6).toFixed(2);
  return `linear-gradient(180deg, rgba(82, 163, 189, 0.08) 0%, rgba(58, 153, 186, 0.15) ${mid}%, rgba(30, 120, 155, 0.25) ${depth.toFixed(2)}%)`;
}
