/**
 * Per-interval and manual lap splits for running sessions.
 *
 * Pure derivation from session segments + start anchors (for structured
 * workouts) or manual lap anchors (recorded on tap during freeform / open
 * runs), plus a defensive Firestore / localStorage parser so legacy or
 * malformed documents fall back cleanly to an empty list.
 */
import type { SegmentType } from "./guidedRun";
import type { SessionSegment } from "./runSegments";

export type RunLapKind = "warmup" | "work" | "recovery" | "cooldown" | "manual";

export interface RunLapSplit {
  index: number;
  label: string;
  kind: RunLapKind;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
}

export interface LapAnchor {
  readonly elapsed: number;
  readonly distance: number;
}

/** Minimum metres covered in a lap before computing a pace rate. Standing
 *  recoveries and short GPS jitter produce nonsensical paces otherwise. */
export const MIN_LAP_PACE_METERS = 20;

/** Trailing stretch after the final manual lap button press must clear at
 *  least this time or distance to count as its own closing lap. */
const MIN_TRAILING_MANUAL_SECONDS = 3;
const MIN_TRAILING_MANUAL_METERS = 20;

export function lapPaceSecondsPerKm(
  distanceMeters: number,
  durationSeconds: number
): number | null {
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    distanceMeters < MIN_LAP_PACE_METERS ||
    durationSeconds <= 0
  ) {
    return null;
  }
  const pace = Math.round(durationSeconds / (distanceMeters / 1000));
  return Number.isFinite(pace) && pace > 0 ? pace : null;
}

export function lapKindForSegment(type: SegmentType): RunLapKind {
  switch (type) {
    case "warmup":
      return "warmup";
    case "cooldown":
      return "cooldown";
    case "hard":
    case "moderate":
      return "work";
    default:
      return "recovery";
  }
}

/**
 * Convert a structured session's recorded segment starts into per-segment lap
 * rows. Degenerate zero-time / zero-distance skipped segments are omitted so
 * the table reflects only segments the runner actually entered.
 */
export function buildSegmentLapSplits(
  segments: readonly SessionSegment[],
  segmentStarts: readonly LapAnchor[],
  totalElapsed: number,
  totalDistance: number
): RunLapSplit[] {
  if (segments.length === 0 || segmentStarts.length === 0) return [];
  const rows: RunLapSplit[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const start = segmentStarts[i];
    if (!start) break;
    const end = segmentStarts[i + 1] ?? {
      elapsed: totalElapsed,
      distance: totalDistance,
    };
    const durationSeconds = Math.max(
      0,
      Math.round(end.elapsed - start.elapsed)
    );
    const distanceMeters = Math.max(
      0,
      Math.round(end.distance - start.distance)
    );
    if (durationSeconds === 0 && distanceMeters === 0) continue;
    const seg = segments[i];
    const index = rows.length + 1;
    rows.push({
      index,
      label: seg.label.trim() || `Lap ${index}`,
      kind: lapKindForSegment(seg.type),
      distanceMeters,
      durationSeconds,
      paceSecondsPerKm: lapPaceSecondsPerKm(distanceMeters, durationSeconds),
    });
  }
  return rows;
}

/**
 * Convert manual Lap button presses into lap splits. Returns an empty list
 * when the runner never pressed Lap. Includes the closing segment from the
 * final tap to finish when it covers meaningful time or distance.
 */
export function buildManualLapSplits(
  anchors: readonly LapAnchor[],
  totalElapsed: number,
  totalDistance: number
): RunLapSplit[] {
  if (anchors.length === 0) return [];
  const rows: RunLapSplit[] = [];
  let prevElapsed = 0;
  let prevDistance = 0;

  for (const anchor of anchors) {
    const elapsed = Math.max(prevElapsed, anchor.elapsed);
    const distance = Math.max(prevDistance, anchor.distance);
    const durationSeconds = Math.max(0, Math.round(elapsed - prevElapsed));
    const distanceMeters = Math.max(0, Math.round(distance - prevDistance));
    if (durationSeconds > 0 || distanceMeters > 0) {
      const index = rows.length + 1;
      rows.push({
        index,
        label: `Lap ${index}`,
        kind: "manual",
        distanceMeters,
        durationSeconds,
        paceSecondsPerKm: lapPaceSecondsPerKm(distanceMeters, durationSeconds),
      });
    }
    prevElapsed = elapsed;
    prevDistance = distance;
  }

  const tailElapsed = Math.max(0, Math.round(totalElapsed - prevElapsed));
  const tailDistance = Math.max(0, Math.round(totalDistance - prevDistance));
  if (
    tailElapsed >= MIN_TRAILING_MANUAL_SECONDS ||
    tailDistance >= MIN_TRAILING_MANUAL_METERS
  ) {
    const index = rows.length + 1;
    rows.push({
      index,
      label: `Lap ${index}`,
      kind: "manual",
      distanceMeters: tailDistance,
      durationSeconds: tailElapsed,
      paceSecondsPerKm: lapPaceSecondsPerKm(tailDistance, tailElapsed),
    });
  }

  return rows;
}

const VALID_LAP_KINDS: ReadonlySet<string> = new Set<RunLapKind>([
  "warmup",
  "work",
  "recovery",
  "cooldown",
  "manual",
]);

/** Safe reader for persisted `lapSplits` arrays on run docs or resume blobs. */
export function parseRunLapSplits(raw: unknown): RunLapSplit[] {
  if (!Array.isArray(raw)) return [];
  const out: RunLapSplit[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const kind =
      typeof r.kind === "string" && VALID_LAP_KINDS.has(r.kind)
        ? (r.kind as RunLapKind)
        : "manual";
    const distanceMeters =
      typeof r.distanceMeters === "number" &&
      Number.isFinite(r.distanceMeters) &&
      r.distanceMeters >= 0
        ? Math.round(r.distanceMeters)
        : null;
    const durationSeconds =
      typeof r.durationSeconds === "number" &&
      Number.isFinite(r.durationSeconds) &&
      r.durationSeconds >= 0
        ? Math.round(r.durationSeconds)
        : null;
    if (distanceMeters === null || durationSeconds === null) continue;
    if (distanceMeters === 0 && durationSeconds === 0) continue;
    const paceSecondsPerKm =
      typeof r.paceSecondsPerKm === "number" &&
      Number.isFinite(r.paceSecondsPerKm) &&
      r.paceSecondsPerKm > 0
        ? Math.round(r.paceSecondsPerKm)
        : lapPaceSecondsPerKm(distanceMeters, durationSeconds);
    const index = out.length + 1;
    out.push({
      index,
      label: label || `Lap ${index}`,
      kind,
      distanceMeters,
      durationSeconds,
      paceSecondsPerKm,
    });
  }
  return out;
}
