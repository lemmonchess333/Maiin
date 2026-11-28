/**
 * Orchestrates exporting a saved run as Garmin TCX (`.tcx`) from RunDetail,
 * applying privacy-zone trimming for outdoor GPS runs and handling indoor
 * treadmill or manual runs directly.
 */
import type { GPSPoint } from "./gps";
import type { PrivacyZone } from "./privacyZones";
import { resolveShareRoute } from "./shareRoute";
import { buildRunTcx, tcxFile } from "./tcxExport";
import { shareFile } from "./shareFile";
import { haptic } from "./haptic";
import { toast } from "./toast";

export interface ExportRunTcxParams {
  heading: string;
  fileLabel: string;
  hasGpsTrace: boolean;
  points: GPSPoint[];
  privacy: {
    zones: PrivacyZone[];
    loading: boolean;
    error: unknown;
  };
  startedAtMs: number;
  distanceMeters: number;
  durationSeconds: number;
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
}

export async function exportRunTcx(params: ExportRunTcxParams): Promise<void> {
  let exportPoints: GPSPoint[] = [];
  if (params.hasGpsTrace) {
    if (params.privacy.loading || params.privacy.error) {
      toast.error(
        params.privacy.loading
          ? "Privacy settings are still loading"
          : "Couldn’t check your privacy settings. Try again"
      );
      return;
    }
    const safe = resolveShareRoute(params.points, params.privacy.zones);
    if (!safe) {
      toast.error(
        "That route is inside a privacy zone, so there’s nothing to export"
      );
      return;
    }
    exportPoints = safe;
  }

  const xml = buildRunTcx({
    name: params.heading,
    startedAtMs: params.startedAtMs,
    distanceMeters: params.distanceMeters,
    durationSeconds: params.durationSeconds,
    calories: params.calories,
    avgHeartRate: params.avgHeartRate,
    maxHeartRate: params.maxHeartRate,
    points: exportPoints,
  });

  const outcome = await shareFile(tcxFile(xml, params.fileLabel), {
    title: params.fileLabel,
  });
  if (outcome === "shared") haptic("success");
  else if (outcome === "downloaded") toast.success("Run exported as TCX");
  else if (outcome === "failed" || outcome === "blocked") {
    toast.error("Couldn’t export TCX");
  }
}
