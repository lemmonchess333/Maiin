import { useId, useState } from "react";
import { MapPin, Mountain, Clock } from "lucide-react";
import {
  routeTotalDistance,
  totalElevationGain,
  type GPSPoint,
} from "../../lib/gps";
import type { SavedRouteSource } from "../../lib/savedRoutes";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import RunMap from "./RunMapLazy";

interface RoutePreviewSheetProps {
  open: boolean;
  onClose: () => void;
  points: GPSPoint[];
  defaultName: string;
  source: SavedRouteSource;
  /** Show the name field + Save action. False when previewing an already-saved route. */
  showSave: boolean;
  onFollow: (points: GPSPoint[], source: SavedRouteSource) => void;
  onSave: (
    name: string,
    points: GPSPoint[],
    source: SavedRouteSource
  ) => Promise<boolean>;
  darkMode?: boolean;
}

/** Default assumed pace (6:30/km) for the est-time when the route has no times. */
const DEFAULT_PACE_SEC_PER_KM = 390;

function estDuration(points: GPSPoint[]): { sec: number; estimated: boolean } {
  const t0 = points[0]?.timestamp ?? 0;
  const tN = points[points.length - 1]?.timestamp ?? 0;
  if (t0 && tN && tN > t0) return { sec: (tN - t0) / 1000, estimated: false };
  const km = routeTotalDistance(points) / 1000;
  return { sec: km * DEFAULT_PACE_SEC_PER_KM, estimated: true };
}

function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="font-mono text-base font-bold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * Preview a route before following it — map line + distance / elevation / est.
 * time, with Follow now (+ Save to library when it's a fresh import). The
 * "don't load a route blind" quality step (Komoot/Strava pattern).
 */
export default function RoutePreviewSheet({
  open,
  onClose,
  points,
  defaultName,
  source,
  showSave,
  onFollow,
  onSave,
  darkMode,
}: RoutePreviewSheetProps) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const titleId = useId();

  const dist = routeTotalDistance(points);
  const elev = totalElevationGain(points);
  const { sec, estimated } = estDuration(points);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(name.trim() || defaultName, points, source);
    setSaving(false);
    toast[ok ? "success" : "error"](ok ? "Route saved" : "Couldn't save route");
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <div className="p-5">
        <h3 id={titleId} className="mb-3 text-base font-bold text-foreground">
          Route preview
        </h3>

        {points.length > 1 && (
          <div className="mb-4 h-44 overflow-hidden rounded-xl">
            <RunMap
              points={points}
              currentPoint={null}
              interactive={true}
              height="h-full"
              darkMode={!!darkMode}
            />
          </div>
        )}

        <div className="mb-4 flex rounded-xl bg-muted/50 py-3">
          <Stat
            icon={<MapPin className="size-4" />}
            value={`${(dist / 1000).toFixed(1)} km`}
            label="Distance"
          />
          <Stat
            icon={<Mountain className="size-4" />}
            value={`${elev} m`}
            label="Elev gain"
          />
          <Stat
            icon={<Clock className="size-4" />}
            value={`${estimated ? "~" : ""}${fmtDuration(sec)}`}
            label="Est. time"
          />
        </div>

        {showSave && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Route name"
            className="mb-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        )}

        <div className="flex gap-2">
          {showSave && (
            <Button
              variant="outline"
              className="flex-1"
              loading={saving}
              onClick={handleSave}
            >
              Save
            </Button>
          )}
          <Button
            variant="sport"
            className="flex-1"
            onClick={() => {
              onFollow(points, source);
              onClose();
            }}
          >
            Follow now
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
