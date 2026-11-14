/**
 * Finishing a run: the saved run, the save itself (resumed by id after a
 * failure), and the post it can share.
 *
 * RunSummary did all of it in one handler of about 300 lines, nine steps
 * in order, and nothing could test the save without rendering the page and
 * pressing Save, which no unit test did. The page now gathers what the run
 * was and hands it here. It keeps what belongs to the screen: the receipt
 * in its history entry, the save status, the shoe's miles (once a run) and
 * the first-run event.
 */
import { collection, doc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { localDateString } from "@/lib/dateHelpers";
import { flushQueue, queueDurableWrite } from "@/lib/offlineQueue";
import {
  KEPT_ROUTE_POINTS,
  sampleRoute,
  type RouteCoordinate,
} from "@/lib/routeSegments";
import { clipRouteEnds, DEFAULT_CLIP_METERS } from "@/lib/shareCard/polyline";
import { ROUTE_WITHHELD_NOTE } from "@/lib/privacyZones";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { createSessionShare, type SessionShareAction } from "@/lib/sessionPost";
import type { ActivityPreview, ShareDecision } from "@/lib/shareComposer";
import type { ActivityPost } from "@/lib/activityPost";
import {
  runHistoryOf,
  runPostMoments,
  type RunHistory,
  type RunMomentContext,
} from "@/lib/postMoments";
import { isPaceEligible, isVolumeEligible } from "@/lib/runStatsEligibility";
import type { SavedRun } from "@/lib/savedRuns";
import type { GPSPoint, Split } from "@/lib/gps";
import type { RouteQuality } from "@/lib/routeQuality";
import type { RunConfig } from "@/components/run/RunSetupModal";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { distanceLabel2 } from "@/lib/runLabels";
import { runNameOf } from "@/lib/runName";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import type { RunSessionIdentity } from "@/lib/runSessionIdentity";
import type { HeartRateSummary } from "@/lib/hrZones";

/** A finished run, as the finish screen holds it. */
export interface FinishedRun {
  /** Stable phone-owned identity, allocated before recording. */
  identity?: RunSessionIdentity;
  /** The trace, after privacy zones are cut out of it. */
  points: GPSPoint[];
  /** Original first-fix epoch, before privacy zones remove any points.
   *  Absent for older callers and runs with no recorded trace. */
  startedAt?: number;
  /** Actual first timer start, after GPS acquisition/countdown. Apple Health
   *  uses this with the active `elapsed` duration; the run's original day
   *  remains pinned to `identity.startedAt`. */
  recordingStartedAt?: number;
  /** Actual recording end, independent of when Save is tapped. */
  finishedAt?: number;
  /** Watch-derived summary; raw samples never enter the run document. */
  heartRate?: HeartRateSummary | null;
  /** Metres: the distance edited on the finish screen, else as tracked. */
  distance: number;
  /** Seconds. */
  elapsed: number;
  /** Seconds a kilometre. */
  avgPaceSeconds: number;
  calories: number;
  elevationGain: number;
  splits: Split[];
  runConfig?: RunConfig | null;
  intervalData?: RunConfig["intervals"];
  notes: string;
  relativeEffort: "easier" | "matched" | "harder" | null;
  /** The verdict on the session's target, if it had one. */
  paceVerdictTone: string | null;
  isInvalid: boolean;
  invalidReason: string | null;
  routeQuality: RouteQuality | null;
  /** The time and distance in the session's work segments, which a tempo
   *  is judged by (`plannedRunVerdict`); null for a run with none. */
  workPortion?: { seconds: number; meters: number } | null;
  /** The shoe the run's distance goes on: the one picked at the start,
   *  else the default. */
  shoeId: string | null;
  /** The quickest 1K, 5K and 10K in the full trace, as the finish screen
   *  lists them (`detectBestEfforts`). */
  bestEfforts: { distance: number; time: number; label: string }[];
  /** The name the runner gave it on the finish screen. Empty or absent,
   *  the run takes `runPostName`'s (`runName.ts`). */
  name?: string;
  /** What the finish screen knew beyond the run (Soc15): the earlier runs
   *  it is compared with, the streak, whether it is the first session.
   *  Read for the post's moments, never saved on the run. */
  moments?: RunMomentContext;
}

/** Privacy cuts change the route, not when the run started. Older callers
 *  fall back to their first point, or now for a run with no trace. */
function startOf(run: FinishedRun, now: Date): Date {
  const first = run.startedAt ?? run.points[0]?.timestamp;
  return first ? new Date(first) : now;
}

/** When the run started: its identity's start, else its first point. */
function runStart(run: FinishedRun, now: Date): Date {
  return run.identity ? new Date(run.identity.startedAt) : startOf(run, now);
}

/**
 * The local day a run belongs to (Lift3): the day it started, not the day
 * Save was tapped, so a run begun before midnight counts on the day it
 * began. The saved run's `date`, and the day its streak counts.
 */
export function runDay(run: FinishedRun, now: Date = new Date()): string {
  return run.identity?.startLocalDate ?? localDateString(runStart(run, now));
}

/**
 * The earlier runs a run's moments compare it with: every saved run that
 * counts (`isVolumeEligible`: not invalid, not saved anyway), less the run
 * itself, once saved. Read from the history the finish screen already
 * holds. The fastest times are compared across the outdoor runs Bests
 * takes its fastest 1K, 5K and 10K from (`isPaceEligible`), so a run
 * called the fastest yet holds that row on Bests (App1 Q15).
 */
export function earlierRunHistory(
  runs: readonly SavedRun[],
  runId: string | null | undefined
): RunHistory {
  const counted = runs.filter(
    (run) => run.id !== runId && isVolumeEligible(run)
  );
  return runHistoryOf(counted, counted.filter(isPaceEligible));
}

/** The saved run, as `users/{uid}/runs/{id}` holds it. */
export function runDocument(run: FinishedRun, now: Date = new Date()) {
  // Legacy paths and fixtures that bypass Run.tsx can arrive without
  // plan metadata: they are saved as freeform, so the block is always
  // well formed.
  const plan = run.runConfig?.planMetadata ?? freeformPlanMetadata("freeform");
  const startedAt = runStart(run, now);
  const recordingStartedAt =
    typeof run.recordingStartedAt === "number" &&
    Number.isFinite(run.recordingStartedAt) &&
    run.recordingStartedAt > 0 &&
    (run.finishedAt === undefined || run.recordingStartedAt <= run.finishedAt)
      ? run.recordingStartedAt
      : null;
  return {
    // The name it is posted under, kept with the run.
    name: runNameOf(run, now),
    distance: run.distance,
    duration: run.elapsed,
    avgPace: run.avgPaceSeconds,
    calories: run.calories,
    elevationGain: run.elevationGain,
    points: sampleRoute(run.points, KEPT_ROUTE_POINTS),
    splits: run.splits,
    // A run saved despite invalid figures has no efforts worth naming, as
    // its finish screen named none.
    bestEfforts: run.isInvalid ? [] : run.bestEfforts,
    startedAt: Timestamp.fromDate(startedAt),
    ...(recordingStartedAt !== null
      ? { recordingStartedAt: Timestamp.fromMillis(recordingStartedAt) }
      : {}),
    completedAt: Timestamp.fromDate(now),
    ...(run.finishedAt !== undefined
      ? { recordingEndedAt: Timestamp.fromMillis(run.finishedAt) }
      : {}),
    ...(run.identity
      ? {
          sessionId: run.identity.sessionId,
          originTimeZone: run.identity.originTimeZone,
        }
      : {}),
    ...(run.heartRate ? { heartRate: run.heartRate } : {}),
    // Lift3: a run belongs to the local day it started (`runDay`). The
    // server's sweeps and the recovery path query by it.
    date: runDay(run, now),
    notes: run.notes.trim(),
    // RUN-03 and A6: null, not absent, when skipped or not judged, so
    // the field's shape does not split.
    relativeEffort: run.relativeEffort,
    paceVerdictTone: run.paceVerdictTone,
    visibility: "followers" as const,
    type: "run",
    // The session, the plan's type for a planned run, wherever it was run.
    activityType: run.runConfig?.activityType || "freerun",
    // Pgm8: where it was run, "treadmill" or null, not absent, so the
    // field's shape does not split.
    place: run.runConfig?.place ?? null,
    target: run.runConfig?.target,
    intervalData: run.intervalData,
    runConfig: run.runConfig,
    // Top-level, so the shoes' mileage recount has one field to read
    // however the run was started.
    shoeId: run.shoeId,
    // The validity verdict, so every reader filters on a stored boolean.
    // A valid run says so explicitly; nulls survive `stripUndefined`.
    isInvalid: run.isInvalid,
    invalidReason: run.invalidReason,
    savedAnyway: run.isInvalid,
    routeQuality: run.routeQuality,
    // Null, not absent, for a run with no work segments, as the verdict's
    // tone is.
    workPortion: run.workPortion ?? null,
    // Phase B1: plan adherence at the top level, the field adherence
    // queries filter on. P0-6: `scheduledRunId` names the planned run it
    // was.
    planMode: plan.planMode,
    planSource: plan.planSource,
    plannedRunDayIndex: plan.plannedRunDayIndex,
    plannedTemplateId: plan.plannedTemplateId,
    plannedTemplateType: plan.plannedTemplateType,
    actualTemplateId: plan.actualTemplateId,
    matchedPlanExact: plan.matchedPlanExact,
    matchedPlanType: plan.matchedPlanType,
    offPlan: plan.offPlan,
    planWeekIndex: plan.planWeekIndex,
    planTotalWeeks: plan.planTotalWeeks,
    scheduledRunId: plan.scheduledRunId,
  };
}

/** The route a run's post carries, and the line the share sheet shows
 *  under it. */
export interface RunPostRoute {
  /** The post's own copy of the route: 20 points, drawn by the card. */
  routePreview: RouteCoordinate[];
  /** The same shared route at the map's resolution (`ROUTE_MAP_POINTS`),
   *  for the map image made after the post exists (`routeMapUpload.ts`).
   *  Never written to the post: the image is what carries it. */
  mapLine: RouteCoordinate[];
  note: string;
}

/** How many points of the shared route the map image draws: enough for a
 *  smooth line on a street map, where 20 cut every corner. */
export const ROUTE_MAP_POINTS = 400;

/**
 * The part of a run's trace a post may show, the one rule for every
 * picture of it: nothing while the privacy settings are loading or
 * unread, and otherwise the trace (privacy zones already cut out by the
 * caller) with its ends clipped unless the user chose to show them. The
 * post's 20-point preview and the map image are both samples of what
 * this returns, so neither can show a point the other may not.
 */
export function sharedRouteTrace<T extends RouteCoordinate>(
  points: T[],
  options: { withheld: boolean; showEnds: boolean }
): T[] {
  if (options.withheld) return [];
  return options.showEnds
    ? points.slice()
    : clipRouteEnds(points, DEFAULT_CLIP_METERS);
}

/** A sample of the shared trace, as the post stores points. */
function routeSample(
  shared: RouteCoordinate[],
  limit: number
): RouteCoordinate[] {
  return sampleRoute(shared, limit).map((p) => ({
    lat: p.lat,
    lon: p.lon,
    ...(p.breakBefore ? { breakBefore: true } : {}),
  }));
}

/**
 * The route a post may carry (`sharedRouteTrace`), at the preview's 20
 * points and at the map's resolution. Worked out once, before any choice,
 * so the route previewed is the route posted and the route on the map.
 */
export function runPostRoute(
  points: GPSPoint[],
  options: { withheld: boolean; showEnds: boolean }
): RunPostRoute {
  const shared = sharedRouteTrace(points, options);
  return {
    routePreview: routeSample(shared, 20),
    mapLine: routeSample(shared, ROUTE_MAP_POINTS),
    note: options.withheld
      ? ROUTE_WITHHELD_NOTE
      : "This is the route included in your post.",
  };
}

/** What the share sheet shows before a run is posted, in the runner's
 *  unit: it said kilometres to a runner who reads miles. */
export function runPostPreview(
  run: FinishedRun,
  route: RunPostRoute,
  unit: DistanceUnit
): ActivityPreview {
  const mins = Math.floor(run.elapsed / 60);
  const secs = Math.round(run.elapsed % 60);
  return {
    type: "run",
    title: runNameOf(run),
    routePreview: route.routePreview,
    routePrivacyNote: route.note,
    meta: [
      distanceLabel2(run.distance, unit),
      `${mins}:${secs.toString().padStart(2, "0")}`,
      run.calories ? `${Math.round(run.calories)} ${CALORIE_UNIT}` : "",
    ].filter(Boolean),
  };
}

/** The post for a saved run. */
export function runPost(
  author: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  },
  run: FinishedRun,
  route: RunPostRoute,
  decision: Pick<ShareDecision, "visibility"> & { caption?: string }
): ActivityPost {
  const name = runNameOf(run);
  const caption = decision.caption?.trim();
  // A run saved despite invalid figures is never offered for sharing, and
  // its efforts are not kept; it names no moment either way.
  const moments = run.isInvalid ? [] : runPostMoments(run, run.moments);
  return {
    authorId: author.uid,
    authorName: author.displayName || "Athlete",
    ...(author.photoURL ? { authorPhotoURL: author.photoURL } : {}),
    type: "run",
    visibility: decision.visibility,
    ...(caption ? { caption } : {}),
    runName: name,
    activityTitle: name,
    distance: run.distance,
    duration: run.elapsed,
    // Seconds a kilometre, so each reader's card shows it in their unit.
    avgPace: run.avgPaceSeconds,
    elevationGain: run.elevationGain,
    calories: run.calories,
    routePreview: route.routePreview,
    ...(moments.length > 0 ? { moments } : {}),
  };
}

export interface RunCompletion {
  /** The id the run is saved under. A retry keeps it. */
  runId: string;
  /** True when this save resumed one whose run was already queued, after
   *  a later step failed. */
  resumed: boolean;
  /** Posts the run. None for a run saved anyway: it is never offered. */
  share?: SessionShareAction;
}

/** Mint a canonical run ID at Start, before recording or review. */
export function allocateRunId(uid: string): string {
  return doc(collection(db, "users", uid, "runs")).id;
}

/**
 * Saves a finished run through the durable queue and builds its post.
 *
 * The device's copy is written before any server write; the queue
 * survives leaving the page and retries under the same id until the
 * server has the run. A save resumed after a later step failed passes
 * `alreadySaved` and writes nothing again: a second document would credit
 * the run's distance twice everywhere the server counts it.
 */
export function completeRun({
  uid,
  author,
  runId,
  alreadySaved,
  run,
  route,
  unit,
  now = new Date(),
}: {
  uid: string;
  author: { displayName?: string | null; photoURL?: string | null };
  /** The id the run is saved under, once there is one. */
  runId: string | null;
  /** The run is already queued under `runId`. */
  alreadySaved: boolean;
  run: FinishedRun;
  route: RunPostRoute;
  /** The runner's distance unit, for the share sheet. */
  unit: DistanceUnit;
  now?: Date;
}): RunCompletion {
  if (
    run.identity &&
    (run.identity.uid !== uid ||
      (runId !== null && runId !== run.identity.runId))
  )
    throw new Error("Run identity does not match the signed-in account.");
  const id = run.identity?.runId ?? runId ?? allocateRunId(uid);
  if (!alreadySaved)
    queueDurableWrite(uid, `users/${uid}/runs`, id, runDocument(run, now));
  if (navigator.onLine) void flushQueue(db, uid).catch(() => {});
  return {
    runId: id,
    resumed: alreadySaved,
    ...(run.isInvalid
      ? {}
      : {
          share: createSessionShare({
            uid,
            type: "run",
            source: { kind: "run", id },
            preview: () => runPostPreview(run, route, unit),
            payload: (decision) =>
              runPost({ uid, ...author }, run, route, decision),
            // The post's map image, made in the background once the post
            // exists, its code loaded only then. A post queued offline
            // keeps the drawn route: the queue's drain is where a later
            // map would hook in.
            afterPost: (activityId) =>
              void import("@/lib/routeMapUpload")
                .then(({ attachRouteMap }) =>
                  attachRouteMap({ uid, activityId, route })
                )
                .catch(() => {}),
          }),
        }),
  };
}
