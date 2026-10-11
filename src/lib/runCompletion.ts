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
import { KEPT_ROUTE_POINTS, sampleRoute } from "@/lib/routeSegments";
import { clipRouteEnds, DEFAULT_CLIP_METERS } from "@/lib/shareCard/polyline";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { createSessionShare, type SessionShareAction } from "@/lib/sessionPost";
import type { ActivityPreview, ShareDecision } from "@/lib/shareComposer";
import type { ActivityPost } from "@/lib/activityPost";
import type { GPSPoint, Split } from "@/lib/gps";
import type { RouteQuality } from "@/lib/routeQuality";
import type { RunConfig } from "@/components/run/RunSetupModal";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { distanceLabel2 } from "@/lib/runLabels";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

/** A finished run, as the finish screen holds it. */
export interface FinishedRun {
  /** The trace, after privacy zones are cut out of it. */
  points: GPSPoint[];
  /** Metres: the distance edited on the finish screen, else as tracked. */
  distance: number;
  /** Seconds. */
  elapsed: number;
  /** Seconds a kilometre. */
  avgPaceSeconds: number;
  /** The pace as the post shows it ("5:12"). */
  avgPace: string;
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
}

/** The run's start: its first point, or now for a run with no trace. */
function startOf(run: FinishedRun, now: Date): Date {
  const first = run.points[0]?.timestamp;
  return first ? new Date(first) : now;
}

/** The saved run, as `users/{uid}/runs/{id}` holds it. */
export function runDocument(run: FinishedRun, now: Date = new Date()) {
  // Legacy paths and fixtures that bypass Run.tsx can arrive without
  // plan metadata: they are saved as freeform, so the block is always
  // well formed.
  const plan = run.runConfig?.planMetadata ?? freeformPlanMetadata("freeform");
  const startedAt = startOf(run, now);
  return {
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
    completedAt: Timestamp.fromDate(now),
    // Lift3: a run belongs to the local day it started, not the day Save
    // was tapped, so a run begun before midnight counts on the day it
    // began. The server's sweeps and the recovery path query by it.
    date: localDateString(startedAt),
    notes: run.notes.trim(),
    // RUN-03 and A6: null, not absent, when skipped or not judged, so
    // the field's shape does not split.
    relativeEffort: run.relativeEffort,
    paceVerdictTone: run.paceVerdictTone,
    visibility: "followers" as const,
    type: "run",
    activityType: run.runConfig?.activityType || "freerun",
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
  routePreview: { lat: number; lon: number; breakBefore?: boolean }[];
  note: string;
}

/**
 * The route a post may carry: none while the privacy settings are loading
 * or unread, and otherwise the trace with its ends clipped unless the user
 * chose to show them. Worked out once, before any choice, so the route
 * previewed is the route posted.
 */
export function runPostRoute(
  points: GPSPoint[],
  options: { withheld: boolean; showEnds: boolean }
): RunPostRoute {
  const shared = options.withheld
    ? []
    : options.showEnds
      ? points
      : clipRouteEnds(points, DEFAULT_CLIP_METERS);
  return {
    routePreview: sampleRoute(shared, 20).map((p) => ({
      lat: p.lat,
      lon: p.lon,
      ...(p.breakBefore ? { breakBefore: true } : {}),
    })),
    note: options.withheld
      ? "Route withheld because privacy settings are unavailable."
      : "This is the route included in your post.",
  };
}

/** The run's name on its post. */
export function runPostName(run: Pick<FinishedRun, "runConfig">): string {
  const type = run.runConfig?.activityType;
  return type === "intervals"
    ? "Interval Run"
    : type === "guided"
      ? "Guided Run"
      : "Run";
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
    title: runPostName(run),
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
  const name = runPostName(run);
  const caption = decision.caption?.trim();
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
    avgPace: run.avgPace,
    elevationGain: run.elevationGain,
    calories: run.calories,
    routePreview: route.routePreview,
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
  const id = runId ?? doc(collection(db, "users", uid, "runs")).id;
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
          }),
        }),
  };
}
