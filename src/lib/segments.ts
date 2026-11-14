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
 * - an effort's place among the person's own (`ownRank`, `rankWords`);
 * - the three callables: make, delete, and read a board.
 *
 * Who sees what is the server's: a board comes only from
 * `getSegmentBoard`, which shows the people you follow and nobody else.
 */
import { httpsCallable } from "firebase/functions";
import { describeRejection, stripCallablePrefix } from "./callableErrors";
import { functions } from "./firebase";
import { haversine } from "./gps";
import type { RouteCoordinate } from "./routeSegments";

/** The shortest segment, in metres (a Tropos heuristic, as the server's). */
export const MIN_SEGMENT_METRES = 400;
/** The longest segment, in metres (a Tropos heuristic, as the server's). */
export const MAX_SEGMENT_METRES = 50000;
/** The longest name, in characters. */
export const SEGMENT_NAME_MAX = 60;

/** What a refused stretch is told: the server's own words. */
export const STRETCH_REFUSALS = {
  range: "Pick a start before the end.",
  gap: "A segment can’t cross a gap in the route.",
  short: `A segment needs to be at least ${MIN_SEGMENT_METRES} m.`,
  long: `A segment can be at most ${MAX_SEGMENT_METRES / 1000} km.`,
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
  if (toStart <= toEnd) return { ...range, from: Math.min(index, range.to - 1) };
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
