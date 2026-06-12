import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Plus, Minus, LocateFixed, Compass } from "lucide-react";
import type { GPSPoint } from "../../lib/gps";
import { THEME } from "../../lib/theme";
import { IconButton } from "@/components/ui/IconButton";

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
  /**
   * Live-run controls: enables "follow mode" (auto-centre on the runner that
   * suspends the moment they pan/pinch by hand) plus an on-map control stack
   * (zoom +/- and a Recenter button that reappears once following is
   * suspended). Off for the static post-run maps, which only need pinch/pan.
   * Requires `interactive` to actually receive gestures.
   */
  liveControls?: boolean;
  /**
   * Numbered waypoints at each whole kilometre along the route (matches the
   * km-based run stats). Append-only — new markers appear as the run passes
   * each km. Skipped while replaying (replayIndex set). Off by default.
   */
  distanceMarkers?: boolean;
  /**
   * A route to follow, drawn as a faded "ghost" line beneath the live track.
   * Static for the run; populate once (e.g. re-running a past run's polyline).
   */
  targetRoute?: GPSPoint[];
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
  liveControls = false,
  distanceMarkers = false,
  targetRoute,
}: RunMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Live "follow mode": true means the camera auto-centres on the runner on
  // every fix. A hand pan/pinch flips it false (and reveals Recenter); the
  // Recenter button flips it back on. A ref (not state) so the per-fix route
  // effect reads the live value without re-subscribing.
  const followingRef = useRef(true);
  const [showRecenter, setShowRecenter] = useState(false);
  // Map orientation. headingUp rotates the map so the travel direction is up
  // (Garmin/NRC staple); off = north-up. headingRef holds the latest travel
  // bearing so follow easeTo and the toggle can rotate to it.
  const headingUpRef = useRef(false);
  const [headingUp, setHeadingUp] = useState(false);
  const headingRef = useRef(0);
  // True when the basemap tiles can't load (offline / no signal). The route
  // line still draws on the dark canvas; we surface a plain note rather than
  // leaving a silent blank map.
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const coneRef = useRef<HTMLDivElement | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  // Numbered km waypoints, indexed by km-1 (kmMarkersRef[0] = the 1km mark).
  // Append-only: distance only grows live, and static routes compute once.
  const kmMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Initialize map — once per (interactive / paceColored / darkMode), NOT per
  // GPS fix. Listing points/currentPoint as deps re-ran init on every fix,
  // which `map.remove()`d and rebuilt the whole map each time — the root cause
  // of the jank, the route not persisting, and the camera not following. They
  // are read here ONLY for the initial centre (intentionally non-reactive), so
  // they're excluded from the dep array below.
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
      zoom: 16,
      attributionControl: false,
      interactive: interactive,
      dragRotate: false,
      pitchWithRotate: false,
    });

    const onLoad = () => {
      // Target route (the plan you're following) — a faded line drawn FIRST so
      // your live coloured track sits on top of it, reading as progress along
      // the plan. Empty until `targetRoute` is provided; renders nothing then.
      map.addSource("target-route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: "target-route-line",
        type: "line",
        source: "target-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": THEME.brand,
          "line-width": 6,
          "line-opacity": 0.45,
          "line-dasharray": [2, 1.5],
        },
      });

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
          properties: {},
        },
      });

      // Casing under the route — a soft dark, slightly-blurred wider line so
      // the bright route reads clearly over busy streets (the "premium" route
      // look). Drawn first so the coloured line sits on top.
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#000000",
          "line-width": 9,
          "line-opacity": 0.28,
          "line-blur": 1,
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
          "line-opacity": 0.95,
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
            "line-opacity": 0.95,
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

    // Follow-mode suspend: any HAND gesture (pan / pinch-zoom / rotate) carries
    // an `originalEvent`; our programmatic `easeTo`/`zoomIn` calls do not. So we
    // only drop out of follow on real user input — then surface the Recenter
    // button. No-op unless this is a live-controls map.
    const onUserGesture = (e: { originalEvent?: unknown }) => {
      if (!liveControls || !e.originalEvent) return;
      followingRef.current = false;
      setShowRecenter(true);
    };
    if (liveControls) {
      map.on("dragstart", onUserGesture);
      map.on("zoomstart", onUserGesture);
      map.on("rotatestart", onUserGesture);
    }

    mapRef.current = map;

    return () => {
      map.off("load", onLoad);
      map.off("dragstart", onUserGesture);
      map.off("zoomstart", onUserGesture);
      map.off("rotatestart", onUserGesture);
      map.remove();
      mapRef.current = null;
      // Null the marker refs too — they pointed at markers the removed map
      // owned. Without this, a re-init (theme/mode change) would try to
      // setLngLat on a dead marker instead of creating a fresh one.
      markerRef.current = null;
      coneRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      // km markers belonged to the removed map; drop the refs so a re-init
      // (theme/mode change) rebuilds them instead of touching dead markers.
      kmMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init runs once; points/currentPoint read only for the initial centre, updates handled by the route effect below
  }, [interactive, paceColored, darkMode, liveControls]);

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

      // Current position marker (live tracking) — a heading "puck": a dot with
      // a direction cone that rotates to the travel bearing (was a plain dot
      // with no direction).
      if (currentPoint) {
        if (!markerRef.current) {
          const outer = document.createElement("div");
          outer.style.cssText =
            "position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;";
          // Heading cone — hidden until we actually have a bearing so it
          // doesn't point a misleading direction while stationary.
          const cone = document.createElement("div");
          cone.style.cssText = `position:absolute;top:-2px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid ${THEME.teal};opacity:0;transition:opacity .2s;`;
          coneRef.current = cone;
          const halo = document.createElement("div");
          halo.style.cssText = `width:22px;height:22px;border-radius:50%;background:${THEME.teal}33;display:flex;align-items:center;justify-content:center;`;
          const inner = document.createElement("div");
          inner.style.cssText = `width:13px;height:13px;border-radius:50%;background:${THEME.teal};border:2.5px solid white;box-shadow:0 0 0 1px ${THEME.teal}55;`;
          halo.appendChild(inner);
          outer.appendChild(cone);
          outer.appendChild(halo);
          markerRef.current = new maplibregl.Marker({
            element: outer,
            rotationAlignment: "map",
          })
            .setLngLat([currentPoint.lon, currentPoint.lat])
            .addTo(map);
        } else {
          markerRef.current.setLngLat([currentPoint.lon, currentPoint.lat]);
        }

        // Heading: bearing from the previous recorded point to the latest,
        // but only once we've actually moved a few metres (so GPS jitter
        // while standing still doesn't spin the cone).
        if (visiblePoints.length >= 2) {
          const prev = visiblePoints[visiblePoints.length - 2];
          const last = visiblePoints[visiblePoints.length - 1];
          const moved = haversineQuick(prev.lat, prev.lon, last.lat, last.lon);
          if (moved > 3) {
            const b = bearingDeg(prev.lat, prev.lon, last.lat, last.lon);
            markerRef.current.setRotation(b);
            headingRef.current = b;
            if (coneRef.current) coneRef.current.style.opacity = "1";
          }
        }

        // Only chase the runner while following is active. Once they've panned
        // away by hand we leave the camera where they put it (until Recenter).
        if (followingRef.current) {
          map.easeTo({
            center: [currentPoint.lon, currentPoint.lat],
            // heading-up rotates to travel bearing; north-up pins to 0.
            bearing: headingUpRef.current ? headingRef.current : 0,
            duration: 500,
          });
        }
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

      // Numbered km waypoints. Append-only: figure out how many whole km the
      // route now covers and add any markers we don't have yet (positions
      // interpolated along the polyline). Skipped during replay.
      if (distanceMarkers && replayIndex === undefined && visiblePoints.length > 1) {
        let total = 0;
        for (let i = 1; i < visiblePoints.length; i++) {
          total += haversineQuick(
            visiblePoints[i - 1].lat,
            visiblePoints[i - 1].lon,
            visiblePoints[i].lat,
            visiblePoints[i].lon
          );
        }
        const desired = Math.floor(total / 1000);
        for (let km = kmMarkersRef.current.length + 1; km <= desired; km++) {
          const pos = positionAtDistance(visiblePoints, km * 1000);
          if (!pos) break;
          const el = document.createElement("div");
          el.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.75);border:1.5px solid white;color:white;font-size:10px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;";
          el.textContent = String(km);
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([pos[0], pos[1]])
            .addTo(map);
          kmMarkersRef.current.push(marker);
        }
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
  }, [
    points,
    currentPoint,
    paceColored,
    avgPaceSecPerKm,
    replayIndex,
    distanceMarkers,
  ]);

  // Target route (static) — drawn independently of the live track so it shows
  // from the first frame, before any GPS fix has landed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !targetRoute || targetRoute.length < 2) return;
    const apply = () => {
      const src = map.getSource("target-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: targetRoute.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      });
    };
    if (map.loaded()) {
      apply();
      return;
    }
    map.on("load", apply);
    return () => {
      map.off("load", apply);
    };
  }, [targetRoute]);

  const recenter = () => {
    followingRef.current = true;
    setShowRecenter(false);
    const map = mapRef.current;
    if (map && currentPoint) {
      map.easeTo({
        center: [currentPoint.lon, currentPoint.lat],
        bearing: headingUpRef.current ? headingRef.current : 0,
        duration: 400,
      });
    }
  };

  const toggleHeadingUp = () => {
    const next = !headingUpRef.current;
    headingUpRef.current = next;
    setHeadingUp(next);
    mapRef.current?.easeTo({
      bearing: next ? headingRef.current : 0,
      ...(currentPoint
        ? { center: [currentPoint.lon, currentPoint.lat] as [number, number] }
        : {}),
      duration: 400,
    });
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${height} ${className}`}
    >
      {liveControls && (
        // On-map control stack (right edge, clear of the top GPS pills and the
        // bottom stats sheet). Glass zoom +/- always; Recenter appears only
        // once follow has been suspended by a hand gesture. Coral = running.
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
          <IconButton
            aria-label="Zoom in"
            icon={<Plus />}
            onClick={() => mapRef.current?.zoomIn()}
            className="border border-border bg-card/85 text-foreground shadow-sm backdrop-blur"
          />
          <IconButton
            aria-label="Zoom out"
            icon={<Minus />}
            onClick={() => mapRef.current?.zoomOut()}
            className="border border-border bg-card/85 text-foreground shadow-sm backdrop-blur"
          />
          <IconButton
            aria-label={
              headingUp ? "Switch map to north-up" : "Switch map to heading-up"
            }
            icon={<Compass />}
            onClick={toggleHeadingUp}
            className={
              headingUp
                ? "bg-running text-white shadow-sm"
                : "border border-border bg-card/85 text-foreground shadow-sm backdrop-blur"
            }
          />
          {showRecenter && (
            <IconButton
              aria-label="Recenter map on your location"
              icon={<LocateFixed />}
              onClick={recenter}
              className="bg-running text-white shadow-sm"
            />
          )}
        </div>
      )}

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

/**
 * Interpolate the [lon, lat] a given distance (metres) along a polyline.
 * Returns null if the route is shorter than `target`. Used to place the
 * numbered km waypoints exactly on the route line, not at a recorded fix.
 */
function positionAtDistance(
  pts: GPSPoint[],
  target: number
): [number, number] | null {
  let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = haversineQuick(
      pts[i - 1].lat,
      pts[i - 1].lon,
      pts[i].lat,
      pts[i].lon
    );
    if (cum + seg >= target) {
      const frac = seg > 0 ? (target - cum) / seg : 0;
      return [
        pts[i - 1].lon + (pts[i].lon - pts[i - 1].lon) * frac,
        pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * frac,
      ];
    }
    cum += seg;
  }
  return null;
}

/** Initial bearing from point 1 → point 2, degrees clockwise from north. */
function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
