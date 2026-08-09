/**
 * runSegments — the canonical session-structure model (roadmap A1,
 * STRUCT-SESS-01).
 *
 * Before this, session structure lived in FIVE disjoint shapes: the
 * guided-run `RunSegment[]` (the only ordered, self-describing one), the
 * interval config (structure hardcoded in the player's control flow), the
 * `intervalSteps` display adapter, `SessionStructureView`'s local interval
 * spec, and — worst — the tempo templates' PROSE ("5 min warmup → 20 min
 * tempo → 5 min cooldown") that nothing implemented. This module is the one
 * derivation: config in, ordered `SessionSegment[]` out.
 *
 * Design constraints, from the player trace:
 *  - interval work steps can be DISTANCE-based, so the target is a union —
 *    the guided model's `durationSeconds` alone cannot express intervals;
 *  - labels and instructions live IN the segment (the old `IntervalStep`
 *    carried only `{kind, rep}` and every consumer re-read the config);
 *  - `rep`/`totalReps` survive so the cue vocabulary can keep announcing
 *    "Rep 3 of 5" when the players adopt this model (the follow-up slice —
 *    this slice is the model + the pre-run preview, zero player risk).
 *
 * Totals are conserved: a builder's segments sum to the session's
 * `estimatedDuration` where the template declares one (pinned in tests) —
 * strides and tempo structure REPLACE minutes, never extend the session.
 */
import type { GuidedRunWorkout, SegmentType } from "./guidedRun";
import { paceMinSec } from "./runLabels";

export type SegmentTarget =
  | { kind: "duration"; seconds: number }
  | { kind: "distance"; meters: number };

export interface SessionSegment {
  /** Visual/coaching class — reuses the guided-run vocabulary so
   *  `getSegmentColor` works unchanged. */
  type: SegmentType;
  label: string;
  instruction: string;
  target: SegmentTarget;
  /** s/km, for work segments with a personalized pace. */
  paceTarget?: number;
  rep?: number;
  totalReps?: number;
}

export interface IntervalShape {
  reps: number;
  workDistance?: number;
  workDuration?: number;
  workPace?: number;
  restDuration: number;
  warmupDuration?: number;
  cooldownDuration?: number;
}

export interface TempoShape {
  warmupSec: number;
  /** One entry per tempo block; multiple entries are separated by floats. */
  workSecs: number[];
  /** Easy float between tempo blocks (only meaningful with 2+ blocks). */
  floatSec?: number;
  cooldownSec: number;
}

export interface StridesShape {
  reps: number;
  workSeconds: number;
}

/** Walk-back recovery between strides. Part of the strides dose, so it is
 *  carved out of the easy block along with the stride itself. */
export const STRIDE_RECOVERY_SECONDS = 60;

const min = (s: number) => Math.round(s / 60);

function workLabel(shape: IntervalShape): string {
  if (shape.workDistance && shape.workDistance >= 1000) {
    const km = shape.workDistance / 1000;
    return `${km.toFixed(shape.workDistance % 1000 === 0 ? 0 : 1)}K`;
  }
  if (shape.workDistance) return `${shape.workDistance}m`;
  if (shape.workDuration) return `${min(shape.workDuration)} min`;
  return "interval";
}

export function segmentsFromIntervals(
  shape: IntervalShape
): SessionSegment[] {
  const out: SessionSegment[] = [];
  if (shape.warmupDuration) {
    out.push({
      type: "warmup",
      label: "Warm-up",
      instruction: "Easy jogging",
      target: { kind: "duration", seconds: shape.warmupDuration },
    });
  }
  const pace = shape.workPace ? ` @ ${paceMinSec(shape.workPace)}/km` : "";
  for (let rep = 1; rep <= shape.reps; rep++) {
    out.push({
      type: "hard",
      label: `${workLabel(shape)}${pace}`,
      instruction: `Rep ${rep} of ${shape.reps}`,
      target: shape.workDistance
        ? { kind: "distance", meters: shape.workDistance }
        : { kind: "duration", seconds: shape.workDuration ?? 0 },
      ...(shape.workPace ? { paceTarget: shape.workPace } : {}),
      rep,
      totalReps: shape.reps,
    });
    if (rep < shape.reps) {
      out.push({
        type: "recovery",
        label: "Recover",
        instruction: "Easy jog or walk",
        target: { kind: "duration", seconds: shape.restDuration },
        rep,
        totalReps: shape.reps,
      });
    }
  }
  if (shape.cooldownDuration) {
    out.push({
      type: "cooldown",
      label: "Cool-down",
      instruction: "Easy jogging",
      target: { kind: "duration", seconds: shape.cooldownDuration },
    });
  }
  return out;
}

export function segmentsFromTempo(
  shape: TempoShape,
  paceTarget?: number
): SessionSegment[] {
  const out: SessionSegment[] = [];
  out.push({
    type: "warmup",
    label: "Warm-up",
    instruction: "Easy jogging",
    target: { kind: "duration", seconds: shape.warmupSec },
  });
  const pace = paceTarget ? ` @ ${paceMinSec(paceTarget)}/km` : "";
  shape.workSecs.forEach((seconds, i) => {
    if (i > 0 && shape.floatSec) {
      out.push({
        type: "recovery",
        label: "Float",
        instruction: `${min(shape.floatSec)} min easy between tempo blocks`,
        target: { kind: "duration", seconds: shape.floatSec },
      });
    }
    out.push({
      type: "moderate",
      label: `${min(seconds)} min tempo${pace}`,
      instruction: "Comfortably hard — hold the rhythm",
      target: { kind: "duration", seconds },
      ...(paceTarget ? { paceTarget } : {}),
      ...(shape.workSecs.length > 1
        ? { rep: i + 1, totalReps: shape.workSecs.length }
        : {}),
    });
  });
  out.push({
    type: "cooldown",
    label: "Cool-down",
    instruction: "Easy jogging",
    target: { kind: "duration", seconds: shape.cooldownSec },
  });
  return out;
}

/**
 * An easy run closing with strides. The strides block (stride + walk-back,
 * per rep) is carved OUT of the stated duration, so the session total is
 * unchanged — the template-duration contract from WAVE1-STRIDES.
 */
export function segmentsFromEasyWithStrides(
  totalMinutes: number,
  strides: StridesShape
): SessionSegment[] {
  const stridesBlockSec =
    strides.reps * (strides.workSeconds + STRIDE_RECOVERY_SECONDS);
  const easySec = Math.max(0, totalMinutes * 60 - stridesBlockSec);
  const out: SessionSegment[] = [
    {
      type: "easy",
      label: `Easy ${min(easySec)} min`,
      instruction: "Conversational pace",
      target: { kind: "duration", seconds: easySec },
    },
  ];
  for (let rep = 1; rep <= strides.reps; rep++) {
    out.push({
      type: "hard",
      label: `Stride ${rep} of ${strides.reps}`,
      instruction: "Relaxed fast — smooth, not sprinting",
      target: { kind: "duration", seconds: strides.workSeconds },
      rep,
      totalReps: strides.reps,
    });
    out.push({
      type: "recovery",
      label: "Walk back",
      instruction: "Full recovery",
      target: { kind: "duration", seconds: STRIDE_RECOVERY_SECONDS },
      rep,
      totalReps: strides.reps,
    });
  }
  return out;
}

export function segmentsFromGuided(
  workout: GuidedRunWorkout
): SessionSegment[] {
  return workout.segments.map((seg) => ({
    type: seg.type,
    label: seg.label,
    instruction: seg.instruction,
    target: { kind: "duration", seconds: seg.durationSeconds },
  }));
}

/** Display helper: "20 min" / "1K". */
export function segmentTargetLabel(target: SegmentTarget): string {
  if (target.kind === "distance") {
    return target.meters >= 1000
      ? `${(target.meters / 1000).toFixed(target.meters % 1000 === 0 ? 0 : 1)}K`
      : `${target.meters}m`;
  }
  if (target.seconds < 60) return `${target.seconds}s`;
  return `${min(target.seconds)} min`;
}

/** Total planned seconds across duration-based segments (distance segments
 *  contribute 0 — callers wanting an estimate must supply a pace). */
export function segmentsDurationSeconds(
  segments: readonly SessionSegment[]
): number {
  return segments.reduce(
    (a, s) => a + (s.target.kind === "duration" ? s.target.seconds : 0),
    0
  );
}
