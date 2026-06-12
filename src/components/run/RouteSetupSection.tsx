import { useId, useState } from "react";
import { Trash2 } from "lucide-react";
import type { GPSPoint } from "@/lib/gps";
import { routeTotalDistance } from "@/lib/gps";
import {
  coordsToPoints,
  type SavedRouteSource,
} from "@/lib/savedRoutes";
import { useSavedRoutes } from "@/hooks/useSavedRoutes";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/lib/toast";
import GpxImportButton from "./GpxImportButton";

interface RouteSetupSectionProps {
  targetRoute: GPSPoint[] | null;
  routeSource: SavedRouteSource | null;
  onLoadRoute: (points: GPSPoint[], source: SavedRouteSource) => void;
  onClearRoute: () => void;
}

function km(metres: number): string {
  return `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Run-setup route controls: import a GPX or pick a saved route to follow, or —
 * once a route is loaded — show "Following · X km" with Save / Clear. Saving
 * snapshots the current route (GPX or re-run) into users/{uid}/savedRoutes so
 * it can be re-followed later.
 */
export default function RouteSetupSection({
  targetRoute,
  routeSource,
  onLoadRoute,
  onClearRoute,
}: RouteSetupSectionProps) {
  const { routes, save, remove } = useSavedRoutes();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const titleId = useId();

  const openSave = () => {
    if (!targetRoute) return;
    setName(`Route · ${km(routeTotalDistance(targetRoute))}`);
    setSaveOpen(true);
  };

  const confirmSave = async () => {
    if (!targetRoute) return;
    setSaving(true);
    const ok = await save({
      name: name.trim() || "Saved route",
      points: targetRoute,
      source: routeSource ?? "gpx",
    });
    setSaving(false);
    setSaveOpen(false);
    toast[ok ? "success" : "error"](
      ok ? "Route saved" : "Couldn't save route"
    );
  };

  if (targetRoute) {
    return (
      <>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-running/8 px-3 py-2">
          <span className="text-sm font-medium text-running">
            Following a route ·{" "}
            <span className="font-mono tabular-nums">
              {km(routeTotalDistance(targetRoute))}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openSave}
              className="min-h-[44px] px-2 text-xs font-semibold text-running"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClearRoute}
              className="min-h-[44px] px-2 text-xs text-muted-foreground underline"
            >
              Clear
            </button>
          </div>
        </div>

        <Dialog
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          labelledBy={titleId}
          size="sm"
        >
          <div className="p-5">
            <h3 id={titleId} className="mb-3 text-base font-bold text-foreground">
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
      </>
    );
  }

  return (
    <div className="space-y-3">
      <GpxImportButton
        className="w-full"
        onRoute={(points) => onLoadRoute(points, "gpx")}
      />

      {routes.length > 0 && (
        <div>
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saved routes
          </p>
          <ul className="space-y-1.5">
            {routes.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-1 rounded-xl bg-card px-2 card-shadow"
              >
                <button
                  type="button"
                  onClick={() => onLoadRoute(coordsToPoints(r.coords), r.source)}
                  className="flex min-h-[48px] flex-1 items-center justify-between gap-2 px-1 text-left"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {r.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {km(r.distanceMeters)}
                  </span>
                </button>
                <IconButton
                  size="sm"
                  aria-label={`Delete route ${r.name}`}
                  icon={<Trash2 />}
                  className="text-muted-foreground"
                  onClick={() => remove(r.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
