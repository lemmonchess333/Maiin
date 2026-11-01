/**
 * Route Planner — build a route BEFORE running (running roadmap P2).
 *
 * Tap the map to drop waypoints; segments are straight lines with a live
 * point-to-point distance readout, undo/clear, one-tap "close the loop",
 * and save-as-named-route. There is no road routing: the straight-line
 * contract is deliberate (routePlanner.ts), and no provider geometry is
 * fetched or stored. Saved plans land in the existing savedRoutes store
 * (source "planned") and are followed exactly like a GPX import: the run
 * map draws them as the ghost guide line.
 *
 * Own minimal MapLibre instance (RunMap's basemap, credit and dark-mode
 * pattern, from @/lib/basemap) — RunMap is display-oriented and pulling
 * gesture editing into it would tangle the live-run map. Lazy-imported by
 * RouteSetupSection so the maplibre chunk loads only when the planner opens.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { Feature } from "geojson";
import * as maplibregl from "maplibre-gl";
import "@/lib/maplibreWorker";
import "maplibre-gl/dist/maplibre-gl.css";
import { Undo2, Trash2, LocateFixed, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { distanceLabel2 } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
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
import { addBasemapCredit, basemapStyle } from "@/lib/basemap";

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

export default function RoutePlannerSheet({
  open,
  onClose,
  darkMode = true,
  initialCenter = null,
  onSave,
  onFollow,
}: RoutePlannerSheetProps) {
  const unit = useDistanceUnit();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
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

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle(darkMode),
        center: initialCenter
          ? [initialCenter.lon, initialCenter.lat]
          : [-0.1276, 51.5072],
        zoom: initialCenter ? 15 : 2,
        // Off here so the credit can be placed: addBasemapCredit adds it.
        attributionControl: false,
      });
    } catch {
      // This setState stays in the effect. The outcome belongs to the
      // external system: MapLibre can only be built on the committed
      // container, and a WebGL failure throws right here, so no render can
      // know it first.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setMapUnavailable(true);
      return;
    }
    setMapUnavailable(false);
    mapRef.current = map;
    // The basemap's credit, bottom-left: the Locate button is top-right.
    const removeCredit = addBasemapCredit(map, "bottom-left");

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
      removeCredit();
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
    setName(`Planned route · ${distanceLabel2(distanceM, unit)}`);
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
              {mapUnavailable
                ? "Close the planner to return to your run."
                : "Tap the map to drop points along your route."}
            </p>
          </div>
          <p className="shrink-0 font-figure text-lg font-extrabold tabular-nums text-running-strong">
            {distanceLabel2(distanceM, unit)}
          </p>
        </div>

        <div className="relative h-[50vh] min-h-[280px]">
          <div
            ref={containerRef}
            data-map-theme={darkMode ? "dark" : "light"}
            className="absolute inset-0"
          />
          {mapUnavailable && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-foreground"
            >
              Map unavailable
            </div>
          )}
          <div className="absolute right-2 top-2 flex flex-col gap-1.5">
            <IconButton
              aria-label="Centre on my location"
              disabled={mapUnavailable}
              icon={<LocateFixed />}
              onClick={recenter}
              className="bg-card/90 text-foreground shadow-md"
            />
          </div>
        </div>

        <div className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">
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
            aria-label="Route name"
            className="ds-input mb-4 text-sm"
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
  const features: Feature[] = wps.map((w, i) => ({
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
