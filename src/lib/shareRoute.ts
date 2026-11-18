import { haptic } from "./haptic";
import { rawTrace, toGPX, type GPSPoint } from "./gps";
import { splitRouteSegments } from "./routeSegments";
import { applyPrivacyZones, type PrivacyZone } from "./privacyZones";
import { shareFile } from "./shareFile";
import { toast } from "./toast";

export type ShareRouteResult = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * The points a GPX export writes: the raw fixes (`rawTrace`), with every
 * privacy-zone crossing removed on those same coordinates. A raw fix can
 * sit a few metres nearer a zone than its smoothed point, so the cut is
 * made on what the file carries, not on what the map drew.
 */
export function exportTrace(
  points: GPSPoint[],
  zones: PrivacyZone[]
): GPSPoint[] {
  const raw = rawTrace(points);
  return zones.length === 0 ? raw : applyPrivacyZones(raw, zones);
}

/**
 * The export's points (`exportTrace`), preserving gaps in the track.
 * Returns null when the whole route sits inside a zone (nothing safe to share)
 * so callers can refuse rather than leak.
 */
export function resolveShareRoute(
  points: GPSPoint[],
  zones: PrivacyZone[]
): GPSPoint[] | null {
  const trimmed = exportTrace(points, zones);
  if (zones.length === 0) return trimmed;
  return splitRouteSegments(trimmed).some((segment) => segment.length >= 2)
    ? trimmed
    : null;
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

/** A .gpx file, the one place its type is set. */
export function gpxFile(gpx: string, filename: string): File {
  return new File([gpx], filename, { type: "application/gpx+xml" });
}

/**
 * Hand a GPX document to the person: the share sheet (AirDrop, Messages,
 * Save to Files, Open in Strava…), or a download on the web. The native
 * app has no download, so there a file the sheet cannot take fails rather
 * than reporting a download that never happened (see shareFile). A GPX is
 * built from points already in memory, so the tap that asked is still
 * fresh and a "blocked" sheet is simply a failure.
 *
 * "cancelled" (the sheet was dismissed) is not an error.
 */
export async function shareGpx(
  gpx: string,
  filename: string,
  title?: string
): Promise<ShareRouteResult> {
  const outcome = await shareFile(
    gpxFile(gpx, filename),
    title ? { title } : {}
  );
  if (outcome === "shared") haptic("success");
  return outcome === "blocked" ? "failed" : outcome;
}

/**
 * Share a route as a .gpx named for it. The GPX carries the route name in
 * <name> so a receiving Tropos restores it on import.
 */
export async function shareRoute(
  name: string,
  points: GPSPoint[]
): Promise<ShareRouteResult> {
  if (
    !points ||
    !splitRouteSegments(points).some((segment) => segment.length >= 2)
  )
    return "failed";

  return shareGpx(toGPX(points, name), `${routeSlug(name)}.gpx`, name);
}

/**
 * What a route export says when it ends. A share says nothing: the sheet
 * was the confirmation. A download is confirmed, a failure said, and a
 * dismissed sheet left alone.
 */
export function announceRouteShare(result: ShareRouteResult): void {
  if (result === "downloaded") toast.success("Route downloaded");
  else if (result === "failed") toast.error("Couldn’t share route");
}
