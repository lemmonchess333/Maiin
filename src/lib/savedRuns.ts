/**
 * Saved runs, read one way.
 *
 * Twenty modules used to reach into `users/{uid}/runs` directly, each with
 * its own query, its own projection and its own idea of which day a run
 * belongs to. That is how two readers came to order by `createdAt`, a field
 * no saved run has, and read nothing from May to October 2026, and how
 * Lift3's start-date rule reached History and the recap but not the streak,
 * Food's burn or the training-load chart.
 *
 * This module is the one place that knows the stored shape:
 * - the field a query orders and windows by (`completedAt`, which every
 *   saved run carries);
 * - how the stored timestamp becomes a `Date`, and the old field forms;
 * - the day a run belongs to: Lift3, the day it STARTED (`date`, written
 *   from the first GPS point), falling back to the day it completed for
 *   runs saved before `date` existed;
 * - how runs accepted on this phone but not yet synced join the list.
 *
 * Readers ask for a window of days and get `SavedRun`s. Eligibility stays a
 * reader's call (`runStatsEligibility.ts` keeps its three policies apart on
 * purpose); every `SavedRun` carries the fields those policies read.
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { db } from "./firebase";
import { parseLocalDate } from "./dateHelpers";
import { pendingDocumentWrites } from "./offlineQueue";
import {
  isRunDateKey,
  readRunExecutionTarget,
  runEvidenceDate,
  type RunExecutionTarget,
} from "./runExecutionEvidence";
import { sampleRoute, type RouteCoordinate } from "./routeSegments";

export interface RunSummaryItem {
  id: string;
  distance: number; // metres
  duration: number; // seconds
  avgPace: number; // sec/km
  elevationGain: number;
  calories: number;
  activityType: string;
  completedAt: Date;
  date?: string;
  executionTarget?: RunExecutionTarget | null;
  routeQuality?: string | null;
  /** Post-run effort check-in (#1523). null when skipped. Read by the
   *  Run14 ease-week nudge (harder-streak trigger). */
  relativeEffort: "easier" | "matched" | "harder" | null;
  /** A6: persisted pace-verdict tone. null when the session had no
   *  judgeable target (freeform / custom / pre-A6 runs). Read by the
   *  adaptive-intensity trigger + post-ease bounce check. Optional so
   *  existing item builders (tests, fixtures) stay assignable — the
   *  parser always sets it. */
  paceVerdictTone?: "on" | "fast" | "easy-too-fast" | "slow" | null;
  routePreview?: RouteCoordinate[];
  /* Validity metadata persisted by PR #480. Carried on the item so
     downstream UI (Recent Runs badges) can render transparency
     labels without re-querying. Stat aggregations consult these
     via the eligibility helpers. Optional because legacy docs
     (pre-#480) don't have the fields. */
  isInvalid?: boolean;
  savedAnyway?: boolean;
  /** Each whole kilometre's time in seconds, in order, as the run saved
   *  them (`splits[].time`; a saved run's splits are always kilometres).
   *  Empty for a run that saved none: treadmill, manual, and runs from
   *  before splits were kept. Analytics' fastest kilometres read these. */
  kmSplitSeconds?: number[];
}

/** A saved run as every reader sees it. */
export interface SavedRun extends RunSummaryItem {
  /** The local "YYYY-MM-DD" the run belongs to (Lift3): the day it started,
   *  or the day it completed for a run saved before `date` existed. Count,
   *  bucket and match a run by this, never by `completedAt`'s own day. */
  day: string;
  /** What was RUN: `actualTemplateId`, else `plannedTemplateId`, else the
   *  legacy `templateId`. Saved runs carry no plain `templateId`. */
  templateId?: string;
  /** Legacy run type, read by the claim map's race-day check. */
  type?: string;
  /** When the run was saved, in epoch seconds: a legacy `createdAt` where
   *  one exists, else `completedAt`. Orders claims. */
  savedAtSeconds: number;
  /** The shoe the run is logged against, if any: the top-level `shoeId`
   *  every run has saved since the field existed, else the shoe its launch
   *  config named. */
  shoeId?: string;
}

/**
 * Which runs a reader wants. `since` and `until` are session days (local
 * "YYYY-MM-DD", inclusive), so a window means "runs that belong to these
 * days" under the same rule every surface uses.
 */
export type RunWindow =
  | { since: string; until?: string; cap?: number }
  | { latest: number }
  | { all: true };

function toDate(value: unknown): Date | null {
  let date: Date | null = null;
  if (value instanceof Timestamp) date = value.toDate();
  else if (value instanceof Date) date = value;
  else if (typeof value === "number") date = new Date(value);
  else if (
    value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (
    value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    // A Timestamp that lost its class on the way: structured clone (router
    // state) and JSON keep only `{ seconds, nanoseconds }`.
    date = new Date((value as { seconds: number }).seconds * 1000);
  }
  return date && Number.isFinite(date.getTime()) ? date : null;
}

/**
 * One saved split's time, or 0 when it cannot be read as a kilometre. A
 * kilometre's time in seconds IS its pace per km (`paceSeconds`), so a row
 * where the two disagree was cut on some other lap and would put a mile
 * into a "5K".
 */
function kmSplitSecondsOf(split: unknown): number {
  if (!split || typeof split !== "object") return 0;
  const { time, paceSeconds } = split as {
    time?: unknown;
    paceSeconds?: unknown;
  };
  if (typeof time !== "number" || !Number.isFinite(time) || time <= 0) return 0;
  if (
    typeof paceSeconds === "number" &&
    Number.isFinite(paceSeconds) &&
    paceSeconds > 0 &&
    Math.abs(paceSeconds - time) > 2
  ) {
    return 0;
  }
  return time;
}

const finite = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * A stored run document as a `SavedRun`, or null when it has no readable
 * completion time (such a document cannot be windowed or dated).
 */
export function parseSavedRun(id: string, data: DocumentData): SavedRun | null {
  const completedAt = toDate(data.completedAt);
  if (!completedAt) return null;
  const date = isRunDateKey(data.date) ? data.date : undefined;
  const savedAt = toDate(data.createdAt) ?? completedAt;

  return {
    id,
    distance: finite(data.distance),
    duration: finite(data.duration),
    avgPace: finite(data.avgPace),
    elevationGain: finite(data.elevationGain),
    calories: finite(data.calories),
    activityType: data.activityType || "freerun",
    completedAt,
    date,
    day: runEvidenceDate({ date, completedAt }),
    executionTarget: readRunExecutionTarget(data),
    routeQuality:
      typeof data.routeQuality?.confidence === "string"
        ? data.routeQuality.confidence
        : typeof data.routeQuality === "string"
          ? data.routeQuality
          : null,
    relativeEffort:
      data.relativeEffort === "easier" ||
      data.relativeEffort === "matched" ||
      data.relativeEffort === "harder"
        ? data.relativeEffort
        : null,
    paceVerdictTone:
      data.paceVerdictTone === "on" ||
      data.paceVerdictTone === "fast" ||
      data.paceVerdictTone === "easy-too-fast" ||
      data.paceVerdictTone === "slow"
        ? data.paceVerdictTone
        : null,
    isInvalid: data.isInvalid === true,
    savedAnyway: data.savedAnyway === true,
    kmSplitSeconds: Array.isArray(data.splits)
      ? (data.splits as unknown[]).map(kmSplitSecondsOf)
      : [],
    routePreview:
      data.points?.length > 1
        ? sampleRoute(data.points as RouteCoordinate[], 20).map((p) => ({
            lat: p.lat,
            lon: p.lon,
            ...(p.breakBefore ? { breakBefore: true } : {}),
          }))
        : data.routePreview,
    templateId:
      text(data.actualTemplateId) ??
      text(data.plannedTemplateId) ??
      text(data.templateId),
    type: text(data.type),
    savedAtSeconds: Math.floor(savedAt.getTime() / 1000),
    shoeId: text(data.shoeId) ?? text(data.runConfig?.shoeId),
  };
}

/** Whether a run belongs to the window's days. */
export function inRunWindow(run: SavedRun, window: RunWindow): boolean {
  if (!("since" in window)) return true;
  return (
    run.day >= window.since && (window.until == null || run.day <= window.until)
  );
}

function dayStart(key: string): Date {
  return parseLocalDate(key);
}

/**
 * The query for a window. Windows are by day but the stored field is the
 * completion time, so the query is a little wider than the window and
 * `inRunWindow` trims it: a run that belongs to `since` completed on or
 * after `since` began, and a run that belongs to `until` may complete after
 * midnight, so the upper bound reaches one day past it.
 */
export function savedRunsQuery(uid: string, window: RunWindow): Query {
  const runs = collection(db, "users", uid, "runs");
  if ("latest" in window) {
    return query(runs, orderBy("completedAt", "desc"), limit(window.latest));
  }
  if ("all" in window) return query(runs, orderBy("completedAt", "desc"));
  const lower = where(
    "completedAt",
    ">=",
    Timestamp.fromDate(dayStart(window.since))
  );
  const capped = window.cap != null ? [limit(window.cap)] : [];
  if (window.until == null)
    return query(runs, lower, orderBy("completedAt", "desc"), ...capped);
  const afterUntil = dayStart(window.until);
  afterUntil.setDate(afterUntil.getDate() + 2);
  return query(
    runs,
    lower,
    where("completedAt", "<", Timestamp.fromDate(afterUntil)),
    orderBy("completedAt", "desc"),
    ...capped
  );
}

/** Fields that, when a queued merge write touches none of them, leave the
 *  run's launch target as it was. A queued effort or shoe update must not
 *  erase what the run was planned to be. */
const EXECUTION_FIELDS = [
  "runConfig",
  "planMode",
  "planSource",
  "matchedPlanExact",
  "offPlan",
  "scheduledRunId",
  "activityType",
];

/**
 * The runs a reader loaded, with the runs this phone has accepted but not
 * yet synced laid over them, kept to the window and newest first. A run
 * saved offline is the user's run from the moment Save is tapped: every
 * surface shows it, not only the one that saved it.
 */
export function withQueuedRuns(
  uid: string | null | undefined,
  loaded: readonly SavedRun[],
  window: RunWindow
): SavedRun[] {
  const byId = new Map(loaded.map((run) => [run.id, run]));
  if (uid) {
    for (const entry of pendingDocumentWrites(uid, `users/${uid}/runs`)) {
      const base = entry.merge ? byId.get(entry.id) : undefined;
      if (entry.merge && !base) continue;
      const run = parseSavedRun(entry.id, { ...base, ...entry.data });
      if (!run) continue;
      if (base) {
        // A parsed run is not a stored document: what the parser derived
        // from fields the merge write did not touch is carried over as-is.
        const touched = (key: string) => Object.hasOwn(entry.data, key);
        if (!EXECUTION_FIELDS.some(touched))
          run.executionTarget = base.executionTarget ?? null;
        if (!touched("splits")) run.kmSplitSeconds = base.kmSplitSeconds;
        if (!touched("createdAt") && !touched("completedAt"))
          run.savedAtSeconds = base.savedAtSeconds;
      }
      byId.set(entry.id, run);
    }
  }
  const runs = [...byId.values()]
    .filter((run) => inRunWindow(run, window))
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  if ("latest" in window) return runs.slice(0, window.latest);
  return "cap" in window && window.cap != null
    ? runs.slice(0, window.cap)
    : runs;
}

/** Whether this phone holds a run that has not synced yet. */
export function hasQueuedRunCreate(uid: string | null | undefined): boolean {
  return (
    !!uid &&
    pendingDocumentWrites(uid, `users/${uid}/runs`).some(
      (entry) => !entry.merge
    )
  );
}

/** Whether any write to this account's runs is still waiting to sync. */
export function hasQueuedRunWrites(uid: string | null | undefined): boolean {
  return !!uid && pendingDocumentWrites(uid, `users/${uid}/runs`).length > 0;
}

/** Parse a query's documents, dropping any that cannot be read. */
export function parseSavedRunDocs(
  docs: readonly { id: string; data: () => DocumentData }[]
): SavedRun[] {
  const runs: SavedRun[] = [];
  for (const d of docs) {
    const run = parseSavedRun(d.id, d.data());
    if (run) runs.push(run);
  }
  return runs;
}

/**
 * One read of a window, for readers that do not stay subscribed. Runs saved
 * on this phone and not yet synced are included when `uid` is the signed-in
 * account (another account has none queued here).
 */
export async function fetchSavedRuns(
  uid: string,
  window: RunWindow
): Promise<SavedRun[]> {
  const snap = await getDocs(savedRunsQuery(uid, window));
  const loaded = parseSavedRunDocs(snap.docs).filter((run) =>
    inRunWindow(run, window)
  );
  return withQueuedRuns(uid, loaded, window);
}
