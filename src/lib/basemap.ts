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

export const BASEMAP_ORIGIN = "https://tiles.openfreemap.org";

export const BASEMAP_STYLES = {
  light: `${BASEMAP_ORIGIN}/styles/positron`,
  dark: `${BASEMAP_ORIGIN}/styles/dark`,
} as const;

export function basemapStyle(darkMode: boolean): string {
  return darkMode ? BASEMAP_STYLES.dark : BASEMAP_STYLES.light;
}

/**
 * How long the credit stays open once the map has loaded. The OSMF's
 * attribution guidelines let a credit fold away after five seconds or on
 * the first interaction, provided it can be found again; MapLibre folds it
 * on the first drag by itself, and the folded control is an (i) that opens
 * it. The live run map is rarely dragged, so without the timer its credit
 * would sit open under the run's own status chips for the whole run.
 */
export const CREDIT_OPEN_MS = 5000;

/**
 * Put the basemap's credit on a map: MapLibre's attribution control in its
 * compact form, in the corner the caller keeps clear of its own overlays.
 * It opens with the credit showing and folds to its (i) CREDIT_OPEN_MS
 * after the map loads.
 *
 * The map must be built with `attributionControl: false`, or MapLibre adds
 * a second control of its own in the bottom-right corner.
 *
 * Returns a cleanup for the fold timer; call it before `map.remove()`.
 */
export function addBasemapCredit(
  map: MapLibreMap,
  position: ControlPosition
): () => void {
  const credit = new AttributionControl({ compact: true });
  map.addControl(credit, position);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /* MapLibre's own fold, the one a drag runs. It only ever closes the
     credit, and only once the control has gone compact. */
  const foldLater = () => {
    timer = setTimeout(() => credit._updateCompactMinimize(), CREDIT_OPEN_MS);
  };
  map.once("load", foldLater);
  return () => {
    clearTimeout(timer);
    map.off("load", foldLater);
  };
}
