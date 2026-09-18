import type { SessionSegmentResult } from "./sessionExecution";

interface Target {
  kind: "duration" | "distance";
  value: number;
}
interface ExpectedSegment {
  type: string;
  target: Target;
  rep?: number;
  totalReps?: number;
  paceTarget?: number;
}

export interface IntervalExecutionInput {
  /** Saved launch segments, not today's catalogue or fitness profile. */
  segments: unknown;
  segmentResults: unknown;
  activityType: string;
  /** Caller must establish this from the run lifecycle. An old/resumed run
   * without a restored segment checkpoint cannot prove continuous recording. */
  recordingContinuity: "confirmed" | "unknown";
  routeConfidence: "good" | "patchy" | "poor" | null;
  durationSeconds: number;
  distanceMeters: number;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

export interface IntervalRepComparison {
  rep: number;
  index: number;
  outcome: SessionSegmentResult["outcome"] | "unrecorded";
  elapsedSeconds: number | null;
  distanceMeters: number | null;
  /** Available only for a completed rep with reliable GPS and measurements. */
  achievedPaceSPerKm: number | null;
  savedTargetPaceSPerKm: number | null;
  /** Positive means slower than the saved single target. Not a pace band,
   * grade, fitness estimate, or recommendation to change a prescription. */
  paceDifferenceSPerKm: number | null;
}

export type IntervalExecutionEvaluation =
  | {
      status: "unavailable";
      reason:
        | "unsupported_activity"
        | "invalid_run"
        | "continuity_unknown"
        | "missing_evidence"
        | "invalid_evidence";
    }
  | {
      status: "available";
      plannedReps: number;
      completedReps: number;
      skippedReps: number;
      partialReps: number;
      unrecordedReps: number;
      paceComparisonsAvailable: number;
      reps: IntervalRepComparison[];
    };

const MAX_SEGMENTS = 512;
const EPSILON = 0.000001;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function positive(value: unknown): value is number {
  return finiteNonNegative(value) && value > 0;
}
function readTarget(value: unknown): Target | null {
  const target = object(value);
  if (!target) return null;
  const amount = target.kind === "distance" ? target.meters : target.seconds;
  return (target.kind === "distance" || target.kind === "duration") &&
    finiteNonNegative(amount)
    ? { kind: target.kind, value: amount }
    : null;
}
function readExpected(value: unknown): ExpectedSegment | null {
  const segment = object(value);
  const target = readTarget(segment?.target);
  if (
    !segment ||
    !target ||
    !["warmup", "easy", "moderate", "hard", "recovery", "cooldown"].includes(
      String(segment.type)
    )
  )
    return null;
  for (const field of ["rep", "totalReps"] as const) {
    if (
      segment[field] !== undefined &&
      (!positive(segment[field]) || !Number.isInteger(segment[field]))
    )
      return null;
  }
  if (segment.paceTarget !== undefined && !positive(segment.paceTarget))
    return null;
  return {
    type: segment.type as string,
    target,
    rep: segment.rep as number | undefined,
    totalReps: segment.totalReps as number | undefined,
    paceTarget: segment.paceTarget as number | undefined,
  };
}

/** Descriptive comparison only. There is deliberately no current-fitness input,
 * automatic adaptation, tolerance percentage, or inference from average run
 * pace. Corrupt/legacy/discontinuous evidence stays unknown, not "failed". */
export function evaluateIntervalExecution(
  input: IntervalExecutionInput
): IntervalExecutionEvaluation {
  const unavailable = (
    reason: Extract<IntervalExecutionEvaluation, { status: "unavailable" }>["reason"]
  ): IntervalExecutionEvaluation => ({ status: "unavailable", reason });
  if (input.activityType !== "intervals") return unavailable("unsupported_activity");
  if (
    input.isInvalid ||
    input.savedAnyway ||
    !positive(input.durationSeconds) ||
    !finiteNonNegative(input.distanceMeters)
  )
    return unavailable("invalid_run");
  if (input.recordingContinuity !== "confirmed")
    return unavailable("continuity_unknown");
  if (
    !Array.isArray(input.segments) ||
    !input.segments.length ||
    !Array.isArray(input.segmentResults) ||
    !input.segmentResults.length
  )
    return unavailable("missing_evidence");
  if (
    input.segments.length > MAX_SEGMENTS ||
    input.segmentResults.length > input.segments.length
  )
    return unavailable("invalid_evidence");

  const expected: ExpectedSegment[] = [];
  for (const segment of input.segments) {
    const parsed = readExpected(segment);
    if (!parsed) return unavailable("invalid_evidence");
    expected.push(parsed);
  }
  const work = expected
    .map((segment, index) => ({ ...segment, index }))
    .filter((segment) => segment.type === "hard");
  if (
    !work.length ||
    work.some(
      (segment, i) =>
        segment.target.value <= 0 ||
        segment.rep !== i + 1 ||
        segment.totalReps !== work.length
    )
  )
    return unavailable("invalid_evidence");

  const results = new Map<number, SessionSegmentResult>();
  let lastIndex = -1;
  let elapsedSum = 0;
  let distanceSum = 0;
  for (let i = 0; i < input.segmentResults.length; i++) {
    const raw = object(input.segmentResults[i]);
    if (
      !raw ||
      !finiteNonNegative(raw.index) ||
      !Number.isInteger(raw.index) ||
      raw.index <= lastIndex ||
      raw.index >= expected.length ||
      raw.captureVersion !== 2 ||
      raw.measurementsReliable !== true ||
      !finiteNonNegative(raw.elapsedSeconds) ||
      !finiteNonNegative(raw.distanceMeters) ||
      !["completed", "skipped", "in_progress"].includes(String(raw.outcome)) ||
      (raw.outcome === "in_progress" && i !== input.segmentResults.length - 1)
    )
      return unavailable("invalid_evidence");
    // A missing positive-length segment before an observed later segment is
    // a gap, not permission to invent a completion or average over it.
    for (let gap = lastIndex + 1; gap < raw.index; gap++) {
      if (expected[gap].target.value > 0) return unavailable("invalid_evidence");
    }
    const prescribed = expected[raw.index];
    const target = readTarget(raw.target);
    if (
      !target ||
      target.kind !== prescribed.target.kind ||
      target.value !== prescribed.target.value ||
      raw.type !== prescribed.type ||
      raw.rep !== prescribed.rep ||
      raw.totalReps !== prescribed.totalReps ||
      raw.paceTarget !== prescribed.paceTarget
    )
      return unavailable("invalid_evidence");
    if (
      raw.outcome === "completed" &&
      (target.kind === "distance" ? raw.distanceMeters : raw.elapsedSeconds) +
        EPSILON < target.value
    )
      return unavailable("invalid_evidence");
    elapsedSum += raw.elapsedSeconds;
    distanceSum += raw.distanceMeters;
    if (
      elapsedSum > input.durationSeconds + EPSILON ||
      distanceSum > input.distanceMeters + EPSILON
    )
      return unavailable("invalid_evidence");
    results.set(raw.index, raw as unknown as SessionSegmentResult);
    lastIndex = raw.index;
  }

  const reps: IntervalRepComparison[] = work.map((segment) => {
    const result = results.get(segment.index);
    const pace =
      result?.outcome === "completed" &&
      input.routeConfidence === "good" &&
      result.elapsedSeconds > 0 &&
      result.distanceMeters > 0
        ? (result.elapsedSeconds * 1000) / result.distanceMeters
        : null;
    const finitePace = pace !== null && Number.isFinite(pace) ? pace : null;
    const target = result?.paceTarget ?? null;
    return {
      rep: segment.rep!,
      index: segment.index,
      outcome: result?.outcome ?? "unrecorded",
      elapsedSeconds: result?.elapsedSeconds ?? null,
      distanceMeters: result?.distanceMeters ?? null,
      achievedPaceSPerKm: finitePace,
      savedTargetPaceSPerKm: target,
      paceDifferenceSPerKm:
        finitePace !== null && target !== null ? finitePace - target : null,
    };
  });
  const count = (outcome: IntervalRepComparison["outcome"]) =>
    reps.filter((rep) => rep.outcome === outcome).length;
  return {
    status: "available",
    plannedReps: work.length,
    completedReps: count("completed"),
    skippedReps: count("skipped"),
    partialReps: count("in_progress"),
    unrecordedReps: count("unrecorded"),
    paceComparisonsAvailable: reps.filter((rep) => rep.paceDifferenceSPerKm !== null)
      .length,
    reps,
  };
}

export function intervalExecutionSummary(
  evaluation: IntervalExecutionEvaluation
): string | null {
  if (evaluation.status !== "available") return null;
  const parts = [
    `${evaluation.completedReps} of ${evaluation.plannedReps} reps recorded as completed`,
  ];
  if (evaluation.skippedReps) parts.push(`${evaluation.skippedReps} skipped`);
  if (evaluation.partialReps) parts.push(`${evaluation.partialReps} partially recorded`);
  if (evaluation.unrecordedReps) parts.push(`${evaluation.unrecordedReps} unrecorded`);
  return `${parts.join(" · ")}.`;
}
