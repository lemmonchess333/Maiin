/**
 * A run post's map image, made and attached after the post exists
 * (Soc15 call 5).
 *
 * `completeRun` hands this the post's `RunPostRoute` once the post is
 * made online. It draws the route's `mapLine` (the shared route at the
 * map's resolution; `sharedRouteTrace` holds it to the post preview's
 * privacy) in both themes (routeMapImage.ts), uploads them to
 * `route-maps/{uid}/{activityId}/{light|dark}.jpg`, runs the same screen
 * as every photo other people see (`screenUploadedPhoto`: any client can
 * put any JPEG at its own path), and names the two download URLs on the
 * post as `routeMap`. The card shows the one for the reader's theme over
 * its drawn route.
 *
 * Nothing waits on it and nothing hears from it: offline, with no WebGL,
 * or on any failure it stops, and the post keeps its drawn route. No
 * upload is queued for later. The files go with the post
 * (onActivityDeleted) and with the account (the deletion executor's
 * `route-maps/{uid}/` sweep).
 *
 * Space posts that carry a run, share images and posts made before maps
 * draw the route as before; a backfill or a Space post's map would start
 * here.
 */
import { doc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import { screenUploadedPhoto } from "@/lib/photoScreen";
import type { RouteCoordinate } from "@/lib/routeSegments";
import {
  hasRouteMapLine,
  ROUTE_MAP_THEMES,
  type RouteMapTheme,
} from "@/lib/routeMapGeometry";

/** The largest image the app uploads. storage.rules refuses one at 512 KB;
 *  a map at its size is under 150 KB. */
export const ROUTE_MAP_MAX_BYTES = 400 * 1024;

/** The whole job's ceiling: drawing both maps, uploading and screening. */
const CEILING_MS = 60_000;

/** The download URL of each theme's image, as the post names them. */
export type RouteMap = Record<RouteMapTheme, string>;

/** What this reads of a post's `RunPostRoute` (runCompletion.ts). */
type SharedRoute = {
  routePreview: readonly RouteCoordinate[];
  mapLine: readonly RouteCoordinate[];
};

/** Posts whose map is being made in this app session: a post's map is
 *  made once. */
const started = new Set<string>();

/** Whether this device can draw a map at all. */
function canDrawMaps(): boolean {
  return (
    typeof document !== "undefined" &&
    (typeof WebGL2RenderingContext !== "undefined" ||
      typeof WebGLRenderingContext !== "undefined")
  );
}

/** The two images, uploaded, screened and named by download URL. */
async function uploadRouteMap(
  uid: string,
  activityId: string,
  images: Record<RouteMapTheme, Blob>
): Promise<RouteMap> {
  const urls: Partial<RouteMap> = {};
  for (const theme of ROUTE_MAP_THEMES) {
    const image = images[theme];
    if (image.size >= ROUTE_MAP_MAX_BYTES)
      throw new Error(`route map too large (${image.size} bytes)`);
    // One line, so the deletion drift scan (accountDeletionDrift) sees it.
    const file = ref(storage, `route-maps/${uid}/${activityId}/${theme}.jpg`);
    await uploadBytes(file, image, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });
    // Screened as a Space post's photo is, before the post names it.
    await screenUploadedPhoto(file.fullPath);
    urls[theme] = await getDownloadURL(file);
  }
  return urls as RouteMap;
}

async function makeRouteMap(
  uid: string,
  activityId: string,
  route: SharedRoute
): Promise<void> {
  const { renderRouteMapImages } = await import("@/lib/routeMapImage");
  const images = await renderRouteMapImages(route.mapLine);
  if (!images) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const routeMap = await uploadRouteMap(uid, activityId, images);
  await updateDocGuarded(doc(db, "activities", activityId), { routeMap });
}

/**
 * Make the map image of a just-made run post and name it on the post.
 * Resolves when it is done or has given up; never rejects.
 */
export async function attachRouteMap({
  uid,
  activityId,
  route,
}: {
  uid: string;
  activityId: string;
  route: SharedRoute;
}): Promise<void> {
  // A map only where the post shares a route: none withheld, none empty.
  if (route.routePreview.length < 2 || !hasRouteMapLine(route.mapLine)) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!canDrawMaps()) return;
  const key = `${uid}/${activityId}`;
  if (started.has(key)) return;
  started.add(key);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      makeRouteMap(uid, activityId, route),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("route map timed out")),
          CEILING_MS
        );
      }),
    ]);
  } catch (err) {
    logger.warn("[routeMap] no map for this post:", err);
  } finally {
    clearTimeout(timer);
  }
}
