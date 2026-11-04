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
 *
 * A run post's map is an image of a map (routeMapImage.ts), with no
 * control to hold the credit, so the credit is drawn into the image
 * (`burnBasemapCredit`). basemap.test.ts holds every map to one or the
 * other.
 */
import {
  AttributionControl,
  type ControlPosition,
  type Map as MapLibreMap,
} from "maplibre-gl";
// The credit's placement and dark styling, loaded with the maps.
import "./basemapCredit.css";
import { THEME } from "./theme";

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

/**
 * The credit as the live map's control shows it: the basemap's TileJSON
 * attribution (`tiles.openfreemap.org/planet`) as text. The run card's map
 * image carries it in its corner (`burnBasemapCredit`), where no control
 * can.
 */
export const BASEMAP_CREDIT =
  "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";

/** HTML attribution as the text the control shows. */
function creditText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&copy;|&#169;/g, "©")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The credit a loaded map's sources name, as its attribution control would
 * show it, so an image made from the map says what the map would. Falls
 * back to BASEMAP_CREDIT when the sources name none, or name one without
 * OpenStreetMap, whose credit is required on every map.
 */
export function basemapCreditText(
  map: Pick<MapLibreMap, "getStyle" | "getSource">
): string {
  const names: string[] = [];
  for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
    const html = map.getSource(id)?.attribution;
    if (!html) continue;
    const text = creditText(html);
    if (text && !names.includes(text)) names.push(text);
  }
  const credit = names.join(" ");
  return /OpenStreetMap/.test(credit) ? credit : BASEMAP_CREDIT;
}

/**
 * Draw the credit into the bottom-right corner of an image made from a
 * map: small type on a pill of the map's own ground, as the live control
 * sits on the map. `scale` is the image's pixels per CSS pixel.
 */
export function burnBasemapCredit(
  ctx: Pick<
    CanvasRenderingContext2D,
    | "font"
    | "fillStyle"
    | "textBaseline"
    | "measureText"
    | "fillText"
    | "beginPath"
    | "roundRect"
    | "rect"
    | "fill"
  >,
  credit: string,
  {
    width,
    height,
    scale,
    dark,
  }: { width: number; height: number; scale: number; dark: boolean }
): void {
  const fontPx = 9 * scale;
  const padX = 5 * scale;
  const padY = 3 * scale;
  const inset = 4 * scale;
  ctx.font = `500 ${fontPx}px "Plus Jakarta Sans", -apple-system, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const textWidth = Math.min(
    ctx.measureText(credit).width,
    width - 2 * (inset + padX)
  );
  const pillWidth = textWidth + 2 * padX;
  const pillHeight = fontPx + 2 * padY;
  const x = width - inset - pillWidth;
  const y = height - inset - pillHeight;
  ctx.fillStyle = dark ? `${THEME.surface}CC` : "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  // Safari before 16 (the app runs from iOS 15.4) has no roundRect.
  if (typeof ctx.roundRect === "function")
    ctx.roundRect(x, y, pillWidth, pillHeight, pillHeight / 2);
  else ctx.rect(x, y, pillWidth, pillHeight);
  ctx.fill();
  ctx.fillStyle = dark ? THEME.textPrimary : THEME.bg;
  ctx.fillText(credit, x + padX, y + pillHeight / 2, textWidth);
}
