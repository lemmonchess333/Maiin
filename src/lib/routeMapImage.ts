/**
 * A run post's map image (Soc15 call 5): the shared route on the basemap,
 * drawn once when the post is made, as Strava, Nike Run Club and Garmin
 * draw a run in the feed. A live map per card would load MapLibre and a
 * dozen tiles for every run on the screen; an image is one small file.
 *
 * MapLibre draws the map in a hidden box the image's size, at twice its
 * resolution. The route is drawn as the card's drawing draws it (one
 * coral line, layered for its glow, a hollow start ring and a solid
 * finish dot), the camera framing the route alone. Once every tile is in
 * (`idle`), the canvas is copied to a 2D canvas, the map's credit is
 * drawn into its corner (`burnBasemapCredit`: the image has no control to
 * hold it), and the result is encoded as a JPEG.
 *
 * Loaded only by `import()` from routeMapUpload.ts, so MapLibre stays out
 * of every chunk that loads at start. Anything that goes wrong (no WebGL,
 * a tile that fails, ten seconds without the map settling) gives null,
 * and the card keeps its drawn route.
 */
import * as maplibregl from "maplibre-gl";
import "@/lib/maplibreWorker";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  basemapCreditText,
  basemapStyle,
  burnBasemapCredit,
} from "@/lib/basemap";
import type { RouteCoordinate } from "@/lib/routeSegments";
import {
  ROUTE_MAP_CSS_SIZE,
  ROUTE_MAP_MAX_ZOOM,
  ROUTE_MAP_PADDING,
  ROUTE_MAP_PIXEL_RATIO,
  ROUTE_MAP_THEMES,
  routeMapBounds,
  routeMapEnds,
  routeMapLines,
  type RouteMapTheme,
} from "@/lib/routeMapGeometry";
import { THEME } from "@/lib/theme";

/** How long the map may take to settle before the image is given up. */
const SETTLE_TIMEOUT_MS = 10_000;
const JPEG_QUALITY = 0.82;

/** The card's own ground under the start ring and round the finish dot,
 *  as RouteScene draws them on the card. */
const CARD_GROUND: Record<RouteMapTheme, string> = {
  light: "white",
  dark: THEME.surface,
};

/** RouteScene's three strokes (glow, bloom, core), at a map's scale. */
const ROUTE_STROKES = [
  { id: "glow", width: 11, opacity: 0.16 },
  { id: "bloom", width: 6.5, opacity: 0.35 },
  { id: "core", width: 3, opacity: 1 },
] as const;

/** Resolves true once the map has drawn the route with every tile in,
 *  false when anything failed or it took too long. */
function drawRoute(
  map: maplibregl.Map,
  line: readonly RouteCoordinate[],
  theme: RouteMapTheme
): Promise<boolean> {
  const lines = routeMapLines(line);
  const ends = routeMapEnds(line);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), SETTLE_TIMEOUT_MS);
    // A tile, glyph or sprite that fails leaves a hole in the image.
    map.on("error", () => finish(false));
    map.once("load", () => {
      if (!ends) return finish(false);
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "MultiLineString", coordinates: lines },
          properties: {},
        },
      });
      for (const stroke of ROUTE_STROKES) {
        map.addLayer({
          id: `route-${stroke.id}`,
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": THEME.running,
            "line-width": stroke.width,
            "line-opacity": stroke.opacity,
          },
        });
      }
      map.addSource("ends", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: ends.start },
              properties: { end: "start" },
            },
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: ends.finish },
              properties: { end: "finish" },
            },
          ],
        },
      });
      // Start = hollow ring, finish = solid dot, as on the card.
      map.addLayer({
        id: "route-start",
        type: "circle",
        source: "ends",
        filter: ["==", ["get", "end"], "start"],
        paint: {
          "circle-radius": 4.5,
          "circle-color": CARD_GROUND[theme],
          "circle-stroke-color": THEME.running,
          "circle-stroke-width": 2.2,
        },
      });
      map.addLayer({
        id: "route-finish",
        type: "circle",
        source: "ends",
        filter: ["==", ["get", "end"], "finish"],
        paint: {
          "circle-radius": 4.2,
          "circle-color": THEME.running,
          "circle-stroke-color": CARD_GROUND[theme],
          "circle-stroke-width": 1.6,
        },
      });
      map.once("idle", () => finish(true));
    });
  });
}

/** The map's canvas with the credit drawn in, as a JPEG. */
function encodeImage(
  map: maplibregl.Map,
  theme: RouteMapTheme
): Promise<Blob | null> {
  const source = map.getCanvas();
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0);
  burnBasemapCredit(ctx, basemapCreditText(map), {
    width: out.width,
    height: out.height,
    scale: out.width / ROUTE_MAP_CSS_SIZE.width,
    dark: theme === "dark",
  });
  return new Promise((resolve) =>
    out.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY)
  );
}

/** One map image of the line in one theme, or null. */
export async function renderRouteMapImage(
  line: readonly RouteCoordinate[],
  theme: RouteMapTheme
): Promise<Blob | null> {
  const bounds = routeMapBounds(line);
  if (!bounds) return null;
  /* Off the screen, never on it: MapLibre needs a box with a size to
     draw in, and nothing here is for the person to see or reach. */
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.inert = true;
  Object.assign(box.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${ROUTE_MAP_CSS_SIZE.width}px`,
    height: `${ROUTE_MAP_CSS_SIZE.height}px`,
    pointerEvents: "none",
  });
  document.body.appendChild(box);
  let map: maplibregl.Map | null = null;
  try {
    map = new maplibregl.Map({
      container: box,
      style: basemapStyle(theme === "dark"),
      bounds,
      fitBoundsOptions: {
        padding: { ...ROUTE_MAP_PADDING },
        maxZoom: ROUTE_MAP_MAX_ZOOM,
      },
      // Off: an image has no control to hold the credit, so it is drawn
      // into the image (burnBasemapCredit, in encodeImage).
      attributionControl: false,
      interactive: false,
      pixelRatio: ROUTE_MAP_PIXEL_RATIO,
      // Labels drawn at once, not faded in after the map has settled.
      fadeDuration: 0,
      // Kept after drawing, so the canvas can be read back.
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    if (!(await drawRoute(map, line, theme))) return null;
    return await encodeImage(map, theme);
  } catch {
    return null;
  } finally {
    map?.remove();
    box.remove();
  }
}

/** The map in both themes, one after the other (one WebGL context at a
 *  time), or null when either could not be made. */
export async function renderRouteMapImages(
  line: readonly RouteCoordinate[]
): Promise<Record<RouteMapTheme, Blob> | null> {
  const images: Partial<Record<RouteMapTheme, Blob>> = {};
  for (const theme of ROUTE_MAP_THEMES) {
    const image = await renderRouteMapImage(line, theme);
    if (!image) return null;
    images[theme] = image;
  }
  return images as Record<RouteMapTheme, Blob>;
}
