/**
 * The map image a run post names for each theme (`routeMap`, Soc15 call
 * 5). The rules take only the author's own `route-maps/` download URLs,
 * so a reader checks the shape and nothing more.
 */

/** The image a post names for the theme on screen, if it names one. */
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
