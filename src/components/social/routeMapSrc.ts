/**
 * The map image a run post names for each theme (`routeMap`, Soc15 call
 * 5). This returns an identity, including older download URLs. It must
 * go through useActivityMedia, never directly into an image source.
 */

/** The identity a post names for the theme on screen, if it names one. */
export function routeMapSrc(routeMap: unknown, dark: boolean): string | null {
  if (!routeMap || typeof routeMap !== "object") return null;
  const url = (routeMap as Record<string, unknown>)[dark ? "dark" : "light"];
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/** Whether a post names its map in both themes, as every map is made. */
export function hasRouteMap(routeMap: unknown): boolean {
  return (
    routeMapSrc(routeMap, false) !== null &&
    routeMapSrc(routeMap, true) !== null
  );
}
