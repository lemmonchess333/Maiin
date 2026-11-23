/**
 * Segments (Run26 call 3), as the app reads and asks for them.
 *
 * A segment is a stretch of road or path a runner cut from one of their own
 * saved runs. Every run saved after it is timed over it on the server
 * (`functions/lib/segments.js`, `functions/lib/segmentMatch.js`), and each
 * timed pass is an effort. This module holds what the app needs of that:
 *
 * - the stretch rule the maker checks before it asks, a copy of
 *   `functions/lib/segmentGeometry.js` pinned to it by
 *   `src/lib/__tests__/segments.cross.test.ts`;
 * - the stored shapes, read at the boundary (`parseSegment`,
 *   `parseEffort`, `parseBoardEntry`);
 * - an effort's place among the person's own (`ownRank`, `rankWords`), and
 *   the run finish's placings (`segmentPlacings`);
 * - the three callables: make, delete, and read a board.
 *
 * Who sees what is the server's: a board comes only from
 * `getSegmentBoard`, which shows the people you follow and nobody else.
 */
import { httpsCallable } from "firebase/functions";
import { describeRejection, stripCallablePrefix } from "./callableErrors";
import { functions } from "./firebase";
import { haversine } from "./gps";
import { formatClock } from "@/utils/formatters";
import { placingSentence, type RunPlacing } from "./runPlacings";
import type { RouteCoordinate } from "./routeSegments";

/** The shortest segment, in metres (a Tropos heuristic, as the server's). */
export const MIN_SEGMENT_METRES = 400;
/** The longest segment (a Tropos heuristic, as the server's). */
const MAX_SEGMENT_KM = 50;
export const MAX_SEGMENT_METRES = MAX_SEGMENT_KM * 1000;
/** The longest name, in characters. */
export const SEGMENT_NAME_MAX = 60;

/** What a refused stretch is told: the server's own words. */
export const STRETCH_REFUSALS = {
  range: "Pick a start before the end.",
  gap: "A segment can’t cross a gap in the route.",
  short: `A segment needs to be at least ${MIN_SEGMENT_METRES} m.`,
  // The server's sentence, word for word (segments.cross.test.ts).
  long: `A segment can be at most ${MAX_SEGMENT_KM} km.`,
} as const;

export type StretchRefusal = keyof typeof STRETCH_REFUSALS;

export type Stretch =
  | { ok: true; metres: number }
  | { ok: false; reason: StretchRefusal; refusal: string };

interface TracePoint {
  lat: number;
  lon: number;
  breakBefore?: boolean;
}

function isCoordinate(p: unknown): p is TracePoint {
  const point = p as Partial<TracePoint> | null;
  return (
    !!point &&
    typeof point.lat === "number" &&
    typeof point.lon === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

/**
 * Metres along a saved trace from its first point to each point, joining
 * each to the next, as the server measures a stretch. A point that begins a
 * new piece adds nothing: no stretch can cross it.
 */
export function metresAlong(points: readonly TracePoint[]): number[] {
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const step =
      isCoordinate(a) && isCoordinate(b) && !b.breakBefore
        ? haversine(a.lat, a.lon, b.lat, b.lon)
        : 0;
    along.push(along[i - 1] + step);
  }
  return along;
}

/**
 * Whether the stretch of a saved run's points from `startIndex` to
 * `endIndex`, both included, can be made a segment, and how long it is.
 * The same rule as the server's `stretchOf`.
 */
export function stretchOf(
  points: readonly TracePoint[],
  startIndex: number,
  endIndex: number
): Stretch {
  const refuse = (reason: StretchRefusal): Stretch => ({
    ok: false,
    reason,
    refusal: STRETCH_REFUSALS[reason],
  });
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex >= points.length ||
    endIndex <= startIndex
  )
    return refuse("range");
  const stretch = points.slice(startIndex, endIndex + 1);
  if (!stretch.every(isCoordinate)) return refuse("gap");
  if (stretch.slice(1).some((p) => p.breakBefore === true))
    return refuse("gap");
  let metres = 0;
  for (let i = 1; i < stretch.length; i++)
    metres += haversine(
      stretch[i - 1].lat,
      stretch[i - 1].lon,
      stretch[i].lat,
      stretch[i].lon
    );
  if (metres < MIN_SEGMENT_METRES) return refuse("short");
  if (metres > MAX_SEGMENT_METRES) return refuse("long");
  return { ok: true, metres };
}

/** A stretch of a saved trace, by point index, both ends included. */
export interface PointRange {
  from: number;
  to: number;
}

/** The stretch the maker opens on: from the first point to the first one a
 *  kilometre along (a Tropos default, longer than the shortest segment), or
 *  the whole trace when it is shorter. */
export function defaultStretch(points: readonly TracePoint[]): PointRange {
  const last = Math.max(1, points.length - 1);
  const along = metresAlong(points);
  const to = along.findIndex((m) => m >= 1000);
  return { from: 0, to: to > 0 ? to : last };
}

/** The index of the saved point nearest `at`. */
export function nearestPointIndex(
  points: readonly TracePoint[],
  at: { lat: number; lon: number }
): number {
  let best = 0;
  let bestMetres = Infinity;
  points.forEach((p, i) => {
    if (!isCoordinate(p)) return;
    const metres = haversine(p.lat, p.lon, at.lat, at.lon);
    if (metres < bestMetres) {
      bestMetres = metres;
      best = i;
    }
  });
  return best;
}

/** A tap on the map at point `index` moves whichever end of the stretch is
 *  nearer it along the run, never past the other end. */
export function moveNearerEnd(range: PointRange, index: number): PointRange {
  const toStart = Math.abs(index - range.from);
  const toEnd = Math.abs(index - range.to);
  if (toStart <= toEnd)
    return { ...range, from: Math.min(index, range.to - 1) };
  return { ...range, to: Math.max(index, range.from + 1) };
}

/** A segment's name as the server keeps it: spaces collapsed, trimmed. */
export function cleanSegmentName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The name's refusal before it is sent, or null. The word filter is the
 *  server's, which answers in its own words. */
export function segmentNameRefusal(value: string): string | null {
  const name = cleanSegmentName(value);
  if (!name) return "Give the segment a name.";
  if ([...name].length > SEGMENT_NAME_MAX)
    return `A name can be at most ${SEGMENT_NAME_MAX} characters.`;
  return null;
}

/* ───────────── Stored shapes ───────────── */

export interface Segment {
  id: string;
  name: string;
  lengthMeters: number;
  points: RouteCoordinate[];
}

export interface SegmentEffort {
  id: string;
  segmentId: string;
  runId: string;
  lap: number;
  elapsedSeconds: number;
  /** When the effort started, epoch ms; 0 when it can't be read. */
  startedAtMs: number;
  /** The local day of the run it came from, "YYYY-MM-DD", or null. */
  day: string | null;
}

/** A row of a segment's board, as `getSegmentBoard` returns it. */
export interface BoardEntry {
  uid: string;
  name: string | null;
  photoURL: string | null;
  elapsedSeconds: number;
  day: string | null;
  activityId: string | null;
}

const isFinitePositive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (v: unknown): string | null =>
  typeof v === "string" && DAY_KEY.test(v) ? v : null;

export function parseSegment(
  id: string,
  data: Record<string, unknown> | undefined
): Segment | null {
  if (!data) return null;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const points = Array.isArray(data.points)
    ? data.points.filter(isCoordinate).map((p) => ({ lat: p.lat, lon: p.lon }))
    : [];
  if (!name || !isFinitePositive(data.lengthMeters) || points.length < 2)
    return null;
  return { id, name, lengthMeters: data.lengthMeters, points };
}

export function parseEffort(
  id: string,
  data: Record<string, unknown> | undefined
): SegmentEffort | null {
  if (!data) return null;
  if (
    typeof data.segmentId !== "string" ||
    !data.segmentId ||
    typeof data.runId !== "string" ||
    !isFinitePositive(data.elapsedSeconds)
  )
    return null;
  return {
    id,
    segmentId: data.segmentId,
    runId: data.runId,
    lap: isFinitePositive(data.lap) ? Math.round(data.lap) : 1,
    elapsedSeconds: data.elapsedSeconds,
    startedAtMs: isFinitePositive(data.startedAtMs) ? data.startedAtMs : 0,
    day: dayOf(data.day),
  };
}

export function parseBoardEntry(value: unknown): BoardEntry | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row.uid !== "string" || !row.uid) return null;
  if (!isFinitePositive(row.elapsedSeconds)) return null;
  return {
    uid: row.uid,
    name: typeof row.name === "string" && row.name ? row.name : null,
    photoURL:
      typeof row.photoURL === "string" && row.photoURL ? row.photoURL : null,
    elapsedSeconds: row.elapsedSeconds,
    day: dayOf(row.day),
    activityId:
      typeof row.activityId === "string" && row.activityId
        ? row.activityId
        : null,
  };
}

/* ───────────── An effort among your own ───────────── */

/** Fastest first; of two the same, the earlier. The server's order. */
export function fasterFirst(a: SegmentEffort, b: SegmentEffort): number {
  return (
    a.elapsedSeconds - b.elapsedSeconds ||
    a.startedAtMs - b.startedAtMs ||
    a.id.localeCompare(b.id)
  );
}

/** Where an effort stands among the person's own on its segment: 1 for
 *  their fastest. */
export function ownRank(
  effort: SegmentEffort,
  own: readonly SegmentEffort[]
): number {
  const sorted = [...own].sort(fasterFirst);
  const at = sorted.findIndex((e) => e.id === effort.id);
  return at === -1 ? sorted.length + 1 : at + 1;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** An effort's place in words: "Your first time" for the only one, else
 *  "Your best", "Your 2nd best" and on. */
export function rankWords(rank: number, of: number): string {
  if (of <= 1) return "Your first time";
  if (rank <= 1) return "Your best";
  return `Your ${ordinal(rank)} best`;
}

/* ───────────── An effort's place, as the run finish says it ───────────── */

/** How long the run finish listens for a saved run's efforts, from when
 *  the run is on the server: the server times it a few seconds after
 *  (onRunCreated). A Tropos heuristic: long enough for the function to
 *  start cold, short enough that no row lands long after the screen is
 *  read. */
export const FINISH_SEGMENT_WAIT_MS = 15_000;

/** A run's segment effort that placed 1st to 3rd among your own (Run30
 *  call 1), as the run finish lists it beside your top three. */
export interface SegmentPlacing {
  segmentId: string;
  name: string;
  lengthMeters: number;
  /** The effort's time. */
  seconds: number;
  place: 1 | 2 | 3;
  /** The fastest effort before it on the segment. */
  bestSeconds: number;
}

/** What a placing is read from: one of the run's efforts, its segment, and
 *  every effort the person has on that segment. */
export interface PlaceableEffort {
  effort: SegmentEffort;
  segment: Segment;
  own: readonly SegmentEffort[];
}

/** The order efforts were run in: the earlier start first, then the id. */
function runOrder(a: SegmentEffort, b: SegmentEffort): number {
  return a.startedAtMs - b.startedAtMs || a.id.localeCompare(b.id);
}

/**
 * The run's segment efforts that place 1st to 3rd, by Run29's rule for
 * distances, copied from Strava: an effort's place is its rank among your
 * efforts on the segment up to and including it (an equal earlier time
 * staying ahead), so a later run's effort moves nothing. The first effort
 * on a segment has no place: Strava marks no first effort on the activity.
 * Of two laps of one segment the better placed is kept, the earlier at a
 * tie, so a segment is listed once. Ordered by place, then as they were
 * run.
 */
export function segmentPlacings(
  efforts: readonly PlaceableEffort[]
): SegmentPlacing[] {
  const bySegment = new Map<
    string,
    { placing: SegmentPlacing; effort: SegmentEffort }
  >();
  for (const { effort, segment, own } of efforts) {
    const earlier = own.filter(
      (e) => e.id !== effort.id && runOrder(e, effort) < 0
    );
    if (earlier.length === 0) continue;
    const place =
      earlier.filter((e) => e.elapsedSeconds <= effort.elapsedSeconds).length +
      1;
    if (place > 3) continue;
    const placing: SegmentPlacing = {
      segmentId: segment.id,
      name: segment.name,
      lengthMeters: segment.lengthMeters,
      seconds: effort.elapsedSeconds,
      place: place as 1 | 2 | 3,
      bestSeconds: Math.min(...earlier.map((e) => e.elapsedSeconds)),
    };
    const held = bySegment.get(segment.id);
    if (
      !held ||
      placing.place < held.placing.place ||
      (placing.place === held.placing.place &&
        runOrder(effort, held.effort) < 0)
    )
      bySegment.set(segment.id, { placing, effort });
  }
  return [...bySegment.values()]
    .sort(
      (a, b) =>
        a.placing.place - b.placing.place || runOrder(a.effort, b.effort)
    )
    .map((held) => held.placing);
}

/** The finish's sentence on a segment: the first listed, in the words the
 *  finish says a distance in ("Ran Hill Road in 3:37, your 2nd fastest.",
 *  and for a 1st finishMoment's "your fastest yet."). Null with none. */
export function segmentPlacingSentence(
  placings: readonly SegmentPlacing[]
): string | null {
  const first = placings[0];
  if (!first) return null;
  const words =
    first.place === 1
      ? "your fastest yet"
      : first.place === 2
        ? "your 2nd fastest"
        : "your 3rd fastest";
  return `Ran ${first.name} in ${formatClock(first.seconds)}, ${words}.`;
}

/**
 * The Results block's one sentence (Run30 call 1, owner 23 November 2026):
 * the strongest place leads, across distances and segments, so a segment's
 * 1st outranks a 2nd or 3rd at 1K, 5K or 10K, and a distance leads only
 * at an equal place. A distance's 1st is the hero's reward
 * (`finishMoment`), so when it leads the block says nothing. The caller
 * says none at all under the hero's reward.
 */
export function resultsSentence(
  placings: readonly RunPlacing[],
  segments: readonly SegmentPlacing[]
): string | null {
  const distancePlace = placings.length
    ? Math.min(...placings.map((p) => p.place))
    : null;
  const segmentPlace = segments.length
    ? Math.min(...segments.map((s) => s.place))
    : null;
  if (
    distancePlace !== null &&
    (segmentPlace === null || distancePlace <= segmentPlace)
  )
    return placingSentence(placings);
  return segmentPlacingSentence(segments);
}

/* ───────────── A board as the viewer reads it ───────────── */

/** A board row: someone the viewer follows, or the viewer's own best. */
export interface BoardRow {
  uid: string;
  self: boolean;
  name: string;
  photoURL: string | null;
  elapsedSeconds: number;
  day: string | null;
  /** Where the row opens: the post it came from, or the viewer's run. */
  href: string | null;
}

/**
 * The board as the viewer reads it: the people they follow (the server
 * has already left out anyone they may not see), their own best among
 * them, fastest first, ranked in that order. Someone blocked since the
 * board was read is left out here too, as on every social surface.
 */
export function boardRows(
  entries: readonly BoardEntry[],
  own: SegmentEffort | null,
  uid: string | null,
  blocked: ReadonlySet<string>
): BoardRow[] {
  const rows: BoardRow[] = entries
    .filter((e) => e.uid !== uid && !blocked.has(e.uid))
    .map((e) => ({
      uid: e.uid,
      self: false,
      name: e.name ?? "Runner",
      photoURL: e.photoURL,
      elapsedSeconds: e.elapsedSeconds,
      day: e.day,
      href: e.activityId ? `/activity/${e.activityId}` : null,
    }));
  if (own && uid)
    rows.push({
      uid,
      self: true,
      name: "You",
      photoURL: null,
      elapsedSeconds: own.elapsedSeconds,
      day: own.day,
      href: `/run/${own.runId}`,
    });
  return rows.sort(
    (a, b) =>
      a.elapsedSeconds - b.elapsedSeconds || Number(b.self) - Number(a.self)
  );
}

/* ───────────── The callables ───────────── */

/** What a refused make or delete says: the server's own sentence for each
 *  refusal it words (a stretch, a name, a run gone, too many), else null
 *  for the caller's own fallback. */
export function segmentRejection(err: unknown): string | null {
  const described = describeRejection(err);
  if (described) return described;
  const code = String((err as { code?: unknown })?.code ?? "");
  const message = stripCallablePrefix(
    String((err as { message?: unknown })?.message ?? "")
  );
  if (!message) return null;
  return /(invalid-argument|resource-exhausted|not-found)$/.test(code)
    ? message
    : null;
}

export interface MakeSegment {
  runId: string;
  startIndex: number;
  endIndex: number;
  name: string;
}

/** Makes a segment from a stretch of the person's run; resolves with its
 *  id. A refusal rejects with the server's sentence, for the maker to say. */
export async function makeSegment(input: MakeSegment): Promise<string> {
  const call = httpsCallable<MakeSegment, { segmentId: string }>(
    functions,
    "createSegment"
  );
  const { data } = await call({ ...input, name: cleanSegmentName(input.name) });
  return data.segmentId;
}

/** Deletes a segment its maker made, with every effort on it. */
export async function removeSegment(segmentId: string): Promise<void> {
  const call = httpsCallable<{ segmentId: string }, { deleted: boolean }>(
    functions,
    "deleteSegment"
  );
  await call({ segmentId });
}

/** The board of the people the signed-in person follows, fastest first. */
export async function fetchSegmentBoard(
  segmentId: string
): Promise<BoardEntry[]> {
  const call = httpsCallable<{ segmentId: string }, { entries: unknown[] }>(
    functions,
    "getSegmentBoard"
  );
  const { data } = await call({ segmentId });
  return (Array.isArray(data?.entries) ? data.entries : [])
    .map(parseBoardEntry)
    .filter((e): e is BoardEntry => e !== null);
}
