/**
 * Route Planner — build a route BEFORE running (running roadmap P2, v1).
 *
 * Tap the map to drop waypoints; segments are straight lines (no external
 * routing service — see routePlanner.ts for the deliberate v1 contract),
 * with a live point-to-point distance readout, undo/clear, one-tap "close
 * the loop", and save-as-named-route. Saved plans land in the existing
 * savedRoutes store (source "planned") and are followed exactly like a GPX
 * import: the run map draws them as the ghost guide line.
 *
 * Own minimal MapLibre instance (mirrors RunMap's basemap + dark-mode
 * pattern) — RunMap is display-oriented and pulling gesture editing into it
 * would tangle the live-run map. Lazy-imported by RouteSetupSection so the
 * maplibre chunk loads only when the planner opens.
 */
import { useEffect, useId, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Undo2, Trash2, LocateFixed, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import type { GPSPoint } from "@/lib/gps";
import {
  closeLoop,
  isLoopClosed,
  plannerDistanceM,
  waypointsToRoute,
  type Waypoint,
} from "@/lib/routePlanner";

const TILE_STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

interface RoutePlannerSheetProps {
  open: boolean;
  onClose: () => void;
  darkMode?: boolean;
  /** Best-known current position (e.g. the run page's GPS fix) — initial map
   *  centre. Falls back to a one-shot geolocation attempt, else a wide view. */
  initialCenter?: { lat: number; lon: number } | null;
  /** Persist the plan (savedRoutes). Returns success. */
  onSave: (name: string, points: GPSPoint[]) => Promise<boolean>;
  /** Follow the plan now (loads it as the run's target route). */
  onFollow: (points: GPSPoint[]) => void;
}

function km(m: number): string {
  return `${(m / 1000).toFixed(2)} km`;
}

export default function RoutePlannerSheet({
  open,
  onClose,
  darkMode = true,
  initialCenter = null,
  onSave,
  onFollow,
}: RoutePlannerSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const nameId = useId();

  const distanceM = plannerDistanceM(waypoints);

  // ── Map lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkMode ? TILE_STYLES.dark : TILE_STYLES.light,
      center: initialCenter
        ? [initialCenter.lon, initialCenter.lat]
        : [-0.1276, 51.5072],
      zoom: initialCenter ? 15 : 2,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("plan", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "plan-line",
        type: "line",
        source: "plan",
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": THEME.running,
          "line-width": 4,
          "line-dasharray": [1.5, 1.5],
        },
      });
      map.addLayer({
        id: "plan-points",
        type: "circle",
        source: "plan",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": THEME.running,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    });

    map.on("click", (e) => {
      haptic("light");
      setWaypoints((prev) => [
        ...prev,
        { lat: e.lngLat.lat, lon: e.lngLat.lng },
      ]);
    });

    // No initial centre from the caller → one-shot geolocation attempt.
    if (!initialCenter && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mapRef.current?.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 15,
            duration: 800,
          });
        },
        () => {
          /* denied/unavailable — keep the wide view; the user can pan. */
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 120_000 }
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per open; style swaps remount via `open`
  }, [open, darkMode]);

  // Redraw the plan whenever waypoints change (defer until the style has
  // loaded if a tap somehow lands before the layers exist).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) syncPlanSource(map, waypoints);
    else map.once("idle", () => syncPlanSource(map, waypoints));
  }, [waypoints]);

  const undo = () => {
    haptic("light");
    setWaypoints((prev) => prev.slice(0, -1));
  };
  const clear = () => {
    haptic("light");
    setWaypoints([]);
  };
  const handleCloseLoop = () => {
    haptic("light");
    setWaypoints((prev) => closeLoop(prev));
  };
  const recenter = () => {
    if (!("geolocation" in navigator)) return;
    haptic("light");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 15,
          duration: 600,
        }),
      () => toast.error("Couldn't get your location")
    );
  };

  const openSave = () => {
    setName(`Planned route · ${km(distanceM)}`);
    setSaveOpen(true);
  };
  const confirmSave = async () => {
    const points = waypointsToRoute(waypoints);
    setSaving(true);
    const ok = await onSave(name.trim() || "Planned route", points);
    setSaving(false);
    if (!ok) {
      toast.error("Couldn't save route");
      return;
    }
    setSaveOpen(false);
    toast.success("Route saved");
    onFollow(points);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="lg">
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <IconButton
            aria-label="Close route planner"
            icon={<X />}
            onClick={onClose}
            className="-ml-1.5 shrink-0 text-foreground"
          />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-base font-bold text-foreground">
              Plan a route
            </h3>
            <p className="text-xs text-muted-foreground">
              Tap the map to drop points along your route.
            </p>
          </div>
          <p className="shrink-0 font-mono text-lg font-extrabold tabular-nums text-running">
            {km(distanceM)}
          </p>
        </div>

        <div className="relative h-[50vh] min-h-[280px]">
          <div ref={containerRef} className="absolute inset-0" />
          <div className="absolute right-2 top-2 flex flex-col gap-1.5">
            <IconButton
              aria-label="Centre on my location"
              icon={<LocateFixed />}
              onClick={recenter}
              className="bg-card/90 text-foreground shadow-md"
            />
          </div>
        </div>

        <div className="space-y-2 p-4">
          <p className="text-[11px] text-muted-foreground">
            Point-to-point distance — segments don&apos;t follow roads.
          </p>
          <div className="flex items-center gap-2">
            {/* Undo/clear act on dropped points, so they only appear once
                there's something to act on. Shown-but-disabled at 0 points
                read as broken navigation (users tapped them expecting a way
                OUT of the planner) — the header's Close X is the exit. */}
            {waypoints.length > 0 && (
              <>
                <IconButton
                  aria-label="Undo last point"
                  icon={<Undo2 />}
                  onClick={undo}
                  className="text-foreground"
                />
                <IconButton
                  aria-label="Clear route"
                  icon={<Trash2 />}
                  onClick={clear}
                  className="text-muted-foreground"
                />
              </>
            )}
            {waypoints.length >= 3 && !isLoopClosed(waypoints) && (
              <Button
                variant="sport-tinted"
                size="sm"
                onClick={handleCloseLoop}
              >
                Close the loop
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="sport"
              onClick={openSave}
              disabled={waypoints.length < 2}
            >
              Save &amp; follow
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        labelledBy={nameId}
        size="sm"
      >
        <div className="p-5">
          <h3 id={nameId} className="mb-3 text-base font-bold text-foreground">
            Save route
          </h3>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Route name"
            className="mb-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="sport"
              className="flex-1"
              loading={saving}
              onClick={confirmSave}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}

/** Push the current waypoints into the map's GeoJSON source. */
function syncPlanSource(map: maplibregl.Map, wps: Waypoint[]) {
  const source = map.getSource("plan") as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const features: GeoJSON.Feature[] = wps.map((w, i) => ({
    type: "Feature",
    properties: { index: i },
    geometry: { type: "Point", coordinates: [w.lon, w.lat] },
  }));
  if (wps.length >= 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: wps.map((w) => [w.lon, w.lat]),
      },
    });
  }
  source.setData({ type: "FeatureCollection", features });
}
