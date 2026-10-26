/**
 * The basemap every map in the app draws on, and the credit it carries.
 *
 * OpenFreeMap's Positron (light) and Dark styles: free, commercial use
 * allowed, attribution required. A style's vector source names its own
 * credit ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap", with
 * OpenStreetMap's ODbL behind it) and MapLibre's attribution control is
 * what shows it, so every map adds that control through
 * `addBasemapCredit`. Until 2026-10 the maps drew CARTO's basemaps, whose
 * free tier is for non-commercial use only, with `attributionControl:
 * false`, which hid the credit both CARTO and OpenStreetMap require.
 *
 * Everything a style loads (the style itself, its TileJSON, the tiles,
 * glyphs and sprites) comes from BASEMAP_ORIGIN. index.html's CSP allows
 * that one origin, and basemap.test.ts holds the two together.
 */
import {
  AttributionControl,
  type ControlPosition,
  type Map as MapLibreMap,
} from "maplibre-gl";
// The credit's placement and dark styling, loaded with the maps.
import "./basemapCredit.css";

export const BASEMAP_ORIGIN = "https://tiles.openfreemap.org";

export const BASEMAP_STYLES = {
  light: `${BASEMAP_ORIGIN}/styles/positron`,
  dark: `${BASEMAP_ORIGIN}/styles/dark`,
} as const;

export function basemapStyle(darkMode: boolean): string {
  return darkMode ? BASEMAP_STYLES.dark : BASEMAP_STYLES.light;
}

/** MapLibre's class for a compact credit that is open. */
const CREDIT_OPEN_CLASS = "maplibregl-compact-show";

/**
 * Put the basemap's credit on a map: MapLibre's attribution control in its
 * compact form, in the corner the caller keeps clear of its own overlays.
 * It starts folded to its (i), which opens it, and a tap on the map folds
 * it again. Open, the credit wraps over a third of a phone's map, under
 * the live run's status chips; folded, the (i) is still on every map, as
 * the OSMF's attribution guidelines ask of a credit that folds away.
 *
 * MapLibre opens a compact credit itself the moment the style's source
 * names it, so this folds it on that same event, before it paints.
 *
 * The map must be built with `attributionControl: false`, or MapLibre adds
 * a second control of its own in the bottom-right corner.
 *
 * Returns a cleanup for the listeners; call it before `map.remove()`.
 */
export function addBasemapCredit(
  map: MapLibreMap,
  position: ControlPosition
): () => void {
  const credit = new AttributionControl({ compact: true });
  map.addControl(credit, position);
  /* MapLibre's own fold, the one a drag runs. It only ever closes the
     credit, and only once the control has gone compact. */
  const fold = () => credit._updateCompactMinimize();
  /* The control fills its text on these same events and is added first,
     so its own listener has run by the time this one reads the class. */
  const foldOnShow = () => {
    if (!credit._container?.classList.contains(CREDIT_OPEN_CLASS)) return;
    map.off("styledata", foldOnShow);
    map.off("sourcedata", foldOnShow);
    fold();
  };
  map.on("styledata", foldOnShow);
  map.on("sourcedata", foldOnShow);
  map.on("click", fold);
  return () => {
    map.off("styledata", foldOnShow);
    map.off("sourcedata", foldOnShow);
    map.off("click", fold);
  };
}
