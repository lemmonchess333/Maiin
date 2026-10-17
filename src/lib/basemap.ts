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

/**
 * How long the credit stays open once it shows. The OSMF's attribution
 * guidelines let a credit fold away after five seconds or on the first
 * interaction, provided it can be found again; MapLibre folds it on the
 * first drag by itself, and the folded control is an (i) that opens it.
 * The live run map is rarely dragged, so without the timer its credit
 * would sit open under the run's own status chips for the whole run.
 */
export const CREDIT_OPEN_MS = 5000;

/** MapLibre's class for a compact credit that is open. */
const CREDIT_OPEN_CLASS = "maplibregl-compact-show";

/**
 * Put the basemap's credit on a map: MapLibre's attribution control in its
 * compact form, in the corner the caller keeps clear of its own overlays.
 * It opens with the credit showing, as soon as the style's source names
 * it, and folds to its (i) CREDIT_OPEN_MS later, or on a tap on the map.
 *
 * The clock starts when the credit shows, not at the map's `load`: `load`
 * waits for every tile, so on the patchy connection a run often starts on
 * it kept the credit open, wrapped over two lines under the status chips,
 * for as long as the tiles took.
 *
 * The map must be built with `attributionControl: false`, or MapLibre adds
 * a second control of its own in the bottom-right corner.
 *
 * Returns a cleanup for the fold timer and the listeners; call it before
 * `map.remove()`.
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
  const fold = () => credit._updateCompactMinimize();
  /* The control fills its text on these same events and is added first,
     so its own listener has run by the time this one reads the class. */
  const foldLater = () => {
    if (!credit._container?.classList.contains(CREDIT_OPEN_CLASS)) return;
    map.off("styledata", foldLater);
    map.off("sourcedata", foldLater);
    timer = setTimeout(fold, CREDIT_OPEN_MS);
  };
  map.on("styledata", foldLater);
  map.on("sourcedata", foldLater);
  map.on("click", fold);
  return () => {
    clearTimeout(timer);
    map.off("styledata", foldLater);
    map.off("sourcedata", foldLater);
    map.off("click", fold);
  };
}
