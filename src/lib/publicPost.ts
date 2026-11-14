/**
 * A shared post's public page, read without signing in (App1 Q51).
 *
 * Firestore lets no signed-out visitor read a post, and that stays so.
 * Hosting sends `/activity/<id>` to `publicPostPage`
 * (functions/lib/publicPost.js), which answers with this app's page and
 * the post's public figures in a data block: only what the card draws,
 * only for a public post by a live, unrestricted account. The page reads
 * the block, and when it is not there (the GitHub Pages preview, a
 * visitor who signed out on the page) asks the same function for the
 * figures alone. `publicPost.cross.test.ts` holds this reader to what the
 * server writes.
 *
 * A run's route comes cut: its start and finish, and whatever lies in
 * its author's privacy zones, are taken off on the server
 * (functions/lib/publicRoute.js), and a route with too little left comes
 * as none. The page draws what it is given and cuts nothing itself.
 */
import type { ShareCardRenderData } from "@/components/share/ShareCardRenderer";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { LiftUnit } from "@/lib/liftLoad";
import type { RouteCoordinate } from "@/lib/routeSegments";
import { publicPostUrl } from "@/lib/publicLinks";
import { formatDayMonthYear } from "@/utils/formatters";

/** The data block's id in the page's head. */
export const PUBLIC_POST_DATA_ID = "tropos-public-post";

/** A post as its public page draws it, in its author's units. */
export interface PublicPostView {
  id: string;
  type: "run" | "workout";
  authorName: string;
  authorPhotoURL?: string;
  /** The post's own title ("Long run", "Push A"). */
  title?: string;
  /** Milliseconds. */
  createdAt?: number;
  unit: DistanceUnit;
  liftUnit: LiftUnit;
  /** The figures in one sentence, as the link's preview says them. */
  summary: string;
  durationSec?: number;
  distanceM?: number;
  paceSecPerKm?: number;
  elevationM?: number;
  totalVolumeKg?: number;
  exerciseCount?: number;
  prCount?: number;
  prExercise?: string;
  /** A run's route with its ends cut off, for the map under the card;
   *  absent when there is no map to draw. */
  route?: RouteCoordinate[];
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** The route as the server sends it, or undefined when it is not one: a
 *  line of two or more points, each a latitude and a longitude. A route
 *  with a point it cannot read is not drawn at all rather than drawn
 *  across the point. */
function route(value: unknown): RouteCoordinate[] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const points: RouteCoordinate[] = [];
  for (const raw of value) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const { lat, lon } = p;
    if (
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      return undefined;
    }
    points.push(
      p.breakBefore === true && points.length > 0
        ? { lat, lon, breakBefore: true }
        : { lat, lon }
    );
  }
  return points;
}

/**
 * The server's answer for one post: the post, null when it is not shown,
 * or undefined when the answer is not about this post or not an answer.
 */
function readAnswer(
  raw: unknown,
  activityId: string
): PublicPostView | null | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const answer = raw as { id?: unknown; available?: unknown; post?: unknown };
  if (answer.available === false) {
    return answer.id === activityId || answer.id === "" ? null : undefined;
  }
  if (answer.available !== true || answer.id !== activityId) return undefined;
  const p = (answer.post ?? {}) as Record<string, unknown>;
  const type = p.type === "run" || p.type === "workout" ? p.type : null;
  const authorName = str(p.authorName);
  const summary = str(p.summary);
  if (p.id !== activityId || !type || !authorName || !summary) {
    return undefined;
  }
  const view: PublicPostView = {
    id: activityId,
    type,
    authorName,
    summary,
    unit: p.unit === "mi" ? "mi" : "km",
    liftUnit: p.liftUnit === "lbs" ? "lbs" : "kg",
  };
  const strings = ["authorPhotoURL", "title", "prExercise"] as const;
  for (const key of strings) {
    const value = str(p[key]);
    if (value) view[key] = value;
  }
  const numbers = [
    "createdAt",
    "durationSec",
    "distanceM",
    "paceSecPerKm",
    "elevationM",
    "totalVolumeKg",
    "exerciseCount",
    "prCount",
  ] as const;
  for (const key of numbers) {
    const value = num(p[key]);
    if (value !== undefined) view[key] = value;
  }
  const line = type === "run" ? route(p.route) : undefined;
  if (line) view.route = line;
  return view;
}

/** The block the server put in this page for this post, taken once: a
 *  second look (the page opened again) asks the server afresh. */
function takeEmbedded(activityId: string): PublicPostView | null | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.getElementById(PUBLIC_POST_DATA_ID);
  if (!el) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(el.textContent ?? "");
  } catch {
    return undefined;
  }
  const view = readAnswer(parsed, activityId);
  if (view !== undefined) el.remove();
  return view;
}

/**
 * The post for its public page, or null when it is not shown. Throws when
 * the server cannot be reached or cannot tell, which the page offers to
 * try again.
 */
export async function loadPublicPost(
  activityId: string
): Promise<PublicPostView | null> {
  const embedded = takeEmbedded(activityId);
  if (embedded !== undefined) return embedded;
  const response = await fetch(`${publicPostUrl(activityId)}?format=json`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`public post answered ${response.status}`);
  const view = readAnswer(await response.json(), activityId);
  if (view === undefined) throw new Error("public post answer unreadable");
  return view;
}

/** The share card's drawing of the post (`ShareCardRenderer`), square, on
 *  the brand's stage. The figures only: a run's route is the map under
 *  the card, not a line on it. */
export function publicPostCard(post: PublicPostView): ShareCardRenderData {
  return {
    unit: post.unit,
    liftUnit: post.liftUnit,
    template: post.type === "run" ? "run" : "lift",
    format: "square",
    background: "brand",
    handle: post.authorName,
    date:
      post.createdAt !== undefined
        ? formatDayMonthYear(new Date(post.createdAt))
        : "",
    headline: post.title,
    distanceKm:
      post.distanceM !== undefined ? post.distanceM / 1000 : undefined,
    durationSec: post.durationSec,
    paceSecPerKm: post.paceSecPerKm,
    elevationM: post.elevationM,
    totalVolumeKg: post.totalVolumeKg,
    exerciseCount: post.exerciseCount,
    prCount: post.prCount,
    prExercise: post.prExercise,
  };
}
