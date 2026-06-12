import { logger } from "./logger";
import { haptic } from "./haptic";
import { toGPX, type GPSPoint } from "./gps";
import { applyPrivacyZones, type PrivacyZone } from "./privacyZones";

export type ShareRouteResult = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * Privacy-trim a route for sharing: with zones set, drop the start/end points
 * that fall inside a privacy zone (hides home/work) via applyPrivacyZones.
 * Returns null when the whole route sits inside a zone (nothing safe to share)
 * so callers can refuse rather than leak. No zones → the route unchanged.
 */
export function resolveShareRoute(
  points: GPSPoint[],
  zones: PrivacyZone[]
): GPSPoint[] | null {
  if (zones.length === 0) return points;
  const trimmed = applyPrivacyZones(points, zones);
  return trimmed.length >= 2 ? trimmed : null;
}

/** Filesystem-safe slug for the .gpx filename, derived from the route name. */
export function routeSlug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "route";
}

function canShareFile(file: File): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Share a route as a .gpx via the native share sheet, falling back to a file
 * download on platforms without Web Share file support (desktop browsers).
 *
 * Same mechanism as sharePhoto.ts: the Web Share API triggers the real iOS
 * share sheet inside the Capacitor WKWebView (AirDrop / Messages / Save to
 * Files / Open in Strava…), so no native plugin is needed. The GPX carries the
 * route name in <name> so a receiving Tropos restores it on import.
 *
 * Returns the outcome so callers can toast appropriately; "cancelled" (user
 * dismissed the sheet) is not an error.
 */
export async function shareRoute(
  name: string,
  points: GPSPoint[]
): Promise<ShareRouteResult> {
  if (!points || points.length < 2) return "failed";

  const gpx = toGPX(points, name);
  const filename = `${routeSlug(name)}.gpx`;
  const file = new File([gpx], filename, { type: "application/gpx+xml" });

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: name });
      haptic("success");
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      logger.warn("[shareRoute] share failed; trying download", err);
      // fall through to the download path
    }
  }

  try {
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
      return "failed";
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch (err) {
    logger.error("[shareRoute] download fallback failed", err);
    return "failed";
  }
}
