import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GPSPoint } from "../../lib/gps";
import { THEME } from "../../lib/theme";

interface RunMapProps {
  points: GPSPoint[];
  currentPoint: GPSPoint | null;
  interactive?: boolean;
  height?: string;
  paceColored?: boolean;
  avgPaceSecPerKm?: number;
  className?: string;
  darkMode?: boolean;
  replayIndex?: number;
}

const TILE_STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

export default function RunMap({
  points,
  currentPoint,
  interactive = false,
  height = "h-full",
  paceColored = false,
  avgPaceSecPerKm,
  className = "",
  darkMode = true,
  replayIndex,
}: RunMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // True when the basemap tiles can't load (offline / no signal). The route
  // line still draws on the dark canvas; we surface a plain note rather than
  // leaving a silent blank map.
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = currentPoint
      ? [currentPoint.lon, currentPoint.lat]
      : points.length > 0
        ? [points[0].lon, points[0].lat]
        : [-0.09, 51.505];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkMode ? TILE_STYLES.dark : TILE_STYLES.light,
      center: initialCenter,
      zoom: 15,
      attributionControl: false,
      interactive: interactive,
      dragRotate: false,
      pitchWithRotate: false,
    });

    const onLoad = () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
          properties: {},
        },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": THEME.teal,
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

      if (paceColored) {
        map.addSource("pace-segments", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "pace-segments-line",
          type: "line",
          source: "pace-segments",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
        map.setLayoutProperty("route-line", "visibility", "none");
      }
    };
    map.on("load", onLoad);

    // Offline / tile-fetch failures: flag so we can show a plain note. Cleared
    // the moment any source actually loads (so a transient blip self-heals).
    map.on("error", () => setTilesUnavailable(true));
    map.on("sourcedata", (e) => {
      if (e.isSourceLoaded) setTilesUnavailable(false);
    });

    mapRef.current = map;

    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
    };
  }, [interactive, paceColored, darkMode, currentPoint, points]);

  // Update route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    const updateRoute = () => {
      const visiblePoints =
        replayIndex !== undefined ? points.slice(0, replayIndex + 1) : points;
      const coords = visiblePoints.map((p) => [p.lon, p.lat]);

      const routeSource = map.getSource("route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (routeSource) {
        routeSource.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        });
      }

      if (paceColored && avgPaceSecPerKm && visiblePoints.length > 1) {
        const features: {
          type: "Feature";
          geometry: { type: "LineString"; coordinates: number[][] };
          properties: { color: string };
        }[] = [];
        for (let i = 1; i < visiblePoints.length; i++) {
          const dist = haversineQuick(
            visiblePoints[i - 1].lat,
            visiblePoints[i - 1].lon,
            visiblePoints[i].lat,
            visiblePoints[i].lon
          );
          const timeDiff =
            (visiblePoints[i].timestamp - visiblePoints[i - 1].timestamp) /
            1000;
          const segPace =
            timeDiff > 0 && dist > 0
              ? (timeDiff / dist) * 1000
              : avgPaceSecPerKm;
          const ratio = segPace / avgPaceSecPerKm;

          let color: string;
          if (ratio < 0.92) color = THEME.paceFast;
          else if (ratio < 1.03) color = THEME.paceOnTarget;
          else if (ratio < 1.1) color = THEME.warning;
          else color = THEME.paceSlow;

          features.push({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: [
                [visiblePoints[i - 1].lon, visiblePoints[i - 1].lat],
                [visiblePoints[i].lon, visiblePoints[i].lat],
              ],
            },
            properties: { color },
          });
        }

        const paceSource = map.getSource("pace-segments") as
          | maplibregl.GeoJSONSource
          | undefined;
        if (paceSource) {
          paceSource.setData({ type: "FeatureCollection", features });
        }
      }

      // Current position marker (live tracking)
      if (currentPoint) {
        if (!markerRef.current) {
          // Safe DOM construction instead of innerHTML. The values
          // here come from THEME and aren't user-controlled, so the
          // XSS surface is zero today — but innerHTML is a habit we
          // don't want to carry into an app with UGC (runs, photos,
          // comments), because any future refactor that threads a
          // user string through this path would silently turn into
          // an XSS sink.
          const outer = document.createElement("div");
          outer.style.cssText = `width:24px;height:24px;border-radius:50%;background:${THEME.teal}33;display:flex;align-items:center;justify-content:center;`;
          const inner = document.createElement("div");
          inner.style.cssText = `width:12px;height:12px;border-radius:50%;background:${THEME.teal};border:2px solid white;`;
          outer.appendChild(inner);
          markerRef.current = new maplibregl.Marker({ element: outer })
            .setLngLat([currentPoint.lon, currentPoint.lat])
            .addTo(map);
        } else {
          markerRef.current.setLngLat([currentPoint.lon, currentPoint.lat]);
        }
        map.easeTo({
          center: [currentPoint.lon, currentPoint.lat],
          duration: 500,
        });
      }

      // Fit bounds for post-run static view
      if (!currentPoint && points.length > 1) {
        const lngs = points.map((p) => p.lon);
        const lats = points.map((p) => p.lat);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40, duration: 0 }
        );
      }

      // Start marker (green dot)
      if (points.length > 0 && !startMarkerRef.current) {
        const el = document.createElement("div");
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${THEME.success};border:2px solid white;`;
        startMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([points[0].lon, points[0].lat])
          .addTo(map);
      }

      // End marker (for post-run, hidden during replay)
      if (replayIndex !== undefined && endMarkerRef.current) {
        endMarkerRef.current.remove();
        endMarkerRef.current = null;
      }
      if (
        !currentPoint &&
        points.length > 1 &&
        !endMarkerRef.current &&
        replayIndex === undefined
      ) {
        const el = document.createElement("div");
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${THEME.danger};border:2px solid white;`;
        endMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([
            points[points.length - 1].lon,
            points[points.length - 1].lat,
          ])
          .addTo(map);
      }
    };

    if (map.loaded()) {
      updateRoute();
      return;
    }
    map.on("load", updateRoute);
    return () => {
      map.off("load", updateRoute);
    };
  }, [points, currentPoint, paceColored, avgPaceSecPerKm, replayIndex]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${height} ${className}`}
    >
      {tilesUnavailable && (
        // Centred, width-constrained pill rather than a full-width top bar.
        // The old `inset-x-2 top-2` strip spanned the whole top edge and
        // painted over the top-left back button on RunDetail (audit #3c).
        // max-w reserves ~8rem (2× a top-4 size-11 corner control) so the
        // pill can never sit under a corner button in any consumer; in the
        // active-run map it lines up with the existing centred GPS pills.
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-max max-w-[calc(100%-8rem)] rounded-lg bg-black/70 px-3 py-2 text-center text-xs text-white/90 backdrop-blur">
          Map can&apos;t load — you&apos;re offline. Your route is still being
          recorded.
        </div>
      )}
    </div>
  );
}

function haversineQuick(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
