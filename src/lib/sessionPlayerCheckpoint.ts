import type { SessionSegment } from "./runSegments";

export type SessionDistanceMode = "gps" | "manual";

export interface SessionAnchor {
  readonly elapsed: number;
  readonly distance: number;
}

/** Optional extension to run-resume v2; old time/route snapshots stay valid. */
export interface SessionPlayerCheckpoint {
  readonly version: 1;
  readonly signature: string;
  readonly index: number;
  /** Includes the current start, or the terminal boundary when complete. */
  readonly segmentStarts: readonly SessionAnchor[];
}

/** Execution identity excludes unit labels, rotated cue copy and presentation. */
export function sessionPlayerSignature(
  segments: readonly SessionSegment[],
  distanceMode: SessionDistanceMode = "gps"
): string {
  return JSON.stringify([
    distanceMode,
    segments.map((segment) => [
      segment.type,
      segment.target.kind,
      segment.target.kind === "distance"
        ? segment.target.meters
        : segment.target.seconds,
      segment.rep ?? null,
      segment.totalReps ?? null,
    ]),
  ]);
}

function isAnchor(value: unknown): value is SessionAnchor {
  if (!value || typeof value !== "object") return false;
  const anchor = value as Record<string, unknown>;
  return (
    typeof anchor.elapsed === "number" &&
    Number.isFinite(anchor.elapsed) &&
    anchor.elapsed >= 0 &&
    typeof anchor.distance === "number" &&
    Number.isFinite(anchor.distance) &&
    anchor.distance >= 0
  );
}

/** Invalid optional coaching data must never discard the base run snapshot. */
export function parseSessionPlayerCheckpoint(
  value: unknown
): SessionPlayerCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  const checkpoint = value as Record<string, unknown>;
  if (
    checkpoint.version !== 1 ||
    typeof checkpoint.signature !== "string" ||
    !Number.isInteger(checkpoint.index) ||
    (checkpoint.index as number) < 0 ||
    !Array.isArray(checkpoint.segmentStarts) ||
    checkpoint.segmentStarts.length !== (checkpoint.index as number) + 1 ||
    !checkpoint.segmentStarts.every(isAnchor)
  ) {
    return null;
  }
  const starts = checkpoint.segmentStarts as SessionAnchor[];
  if (starts[0].elapsed !== 0 || starts[0].distance !== 0) return null;
  if (
    starts.some(
      (anchor, i) =>
        i > 0 &&
        (anchor.elapsed < starts[i - 1].elapsed ||
          anchor.distance < starts[i - 1].distance)
    )
  ) {
    return null;
  }
  return {
    version: 1,
    signature: checkpoint.signature,
    index: checkpoint.index as number,
    segmentStarts: starts.map((anchor) => ({ ...anchor })),
  };
}

export function validateSessionPlayerCheckpoint(
  value: unknown,
  segments: readonly SessionSegment[],
  elapsed: number,
  distance: number,
  distanceMode: SessionDistanceMode = "gps"
): SessionPlayerCheckpoint | null {
  const checkpoint = parseSessionPlayerCheckpoint(value);
  if (
    !checkpoint ||
    !segments.length ||
    checkpoint.index > segments.length ||
    checkpoint.signature !== sessionPlayerSignature(segments, distanceMode) ||
    !Number.isFinite(elapsed) ||
    !Number.isFinite(distance) ||
    checkpoint.segmentStarts.some(
      (anchor) => anchor.elapsed > elapsed || anchor.distance > distance
    )
  ) {
    return null;
  }
  return checkpoint;
}
