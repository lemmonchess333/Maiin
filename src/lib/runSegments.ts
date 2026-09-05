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
import {
  distanceIn,
  distanceUnitLabel,
  paceUnitLabel,
  type DistanceUnit,
} from "./distanceUnits";
import {
  cooldownCue,
  floatCue,
  intervalRecoveryCue,
  intervalRepCue,
  strideRepCue,
  walkBackCue,
  warmupCue,
} from "./runCueCopy";

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
  /** The effort half of the label without any pace suffix ("1K",
   *  "20 min tempo") — lets the in-run shell re-suffix with the live
   *  personalized BAND (#18's band-first display rule). */
  effort?: string;
  /** STRUCT-SESS-02: the spoken line announced when this segment starts.
   *  Authored by the builders (they own the copy); absent = silent. */
  cue?: string;
  /** A2: builder-authored eyebrow label for the in-run shell (e.g.
   *  "RACE PACE"). Absent = the shell derives one from type/rep. */
  eyebrow?: string;
  /** A2: true when this segment's `paceTarget` IS the prescription (the
   *  user's own goal pace) — the shell must NOT re-suffix it with the
   *  fitness-derived band (#18's band-first rule applies to template
   *  paces that a benchmark supersedes, not to a user-declared goal). */
  pacePinned?: boolean;
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
  shape: IntervalShape,
  unit: DistanceUnit,
  /** Rotates every variation pool so two RUNS of the same session don't
   *  speak an identical script (variant = seed + rep keeps the
   *  within-session no-repeat guarantee — a constant offset never maps
   *  two distinct indices onto one pool entry). Callers derive it from
   *  run identity; 0 keeps the historical script. */
  seed: number = 0
): SessionSegment[] {
  const out: SessionSegment[] = [];
  if (shape.warmupDuration) {
    out.push({
      type: "warmup",
      label: "Warm-up",
      instruction: "Easy jogging",
      target: { kind: "duration", seconds: shape.warmupDuration },
      cue: warmupCue(seed),
    });
  }
  const pace = shape.workPace
    ? ` @ ${paceMinSec(shape.workPace, unit)}${paceUnitLabel(unit)}`
    : "";
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
      effort: workLabel(shape),
      cue: intervalRepCue(rep, shape.reps, seed + rep),
    });
    if (rep < shape.reps) {
      out.push({
        type: "recovery",
        label: "Recover",
        instruction: "Easy jog or walk",
        target: { kind: "duration", seconds: shape.restDuration },
        rep,
        totalReps: shape.reps,
        cue: intervalRecoveryCue(rep, shape.reps, seed + rep),
      });
    }
  }
  if (shape.cooldownDuration) {
    out.push({
      type: "cooldown",
      label: "Cool-down",
      instruction: "Easy jogging",
      target: { kind: "duration", seconds: shape.cooldownDuration },
      cue: cooldownCue(seed),
    });
  }
  return out;
}

export function segmentsFromTempo(
  shape: TempoShape,
  unit: DistanceUnit,
  paceTarget?: number,
  opts?: {
    /** A2: the paceTarget is the user's GOAL race pace (half/marathon
     *  race prep), not a fitness-derived threshold — cues say so and
     *  the pace is pinned against band re-suffixing. */
    atGoalPace?: boolean;
  },
  /** Same cross-run rotation contract as segmentsFromIntervals. */
  seed: number = 0
): SessionSegment[] {
  const out: SessionSegment[] = [];
  out.push({
    type: "warmup",
    label: "Warm-up",
    instruction: "Easy jogging",
    target: { kind: "duration", seconds: shape.warmupSec },
    cue: warmupCue(seed),
  });
  const pace = paceTarget
    ? ` @ ${paceMinSec(paceTarget, unit)}${paceUnitLabel(unit)}`
    : "";
  shape.workSecs.forEach((seconds, i) => {
    if (i > 0 && shape.floatSec) {
      out.push({
        type: "recovery",
        label: "Float",
        instruction: `${min(shape.floatSec)} min easy between tempo blocks`,
        target: { kind: "duration", seconds: shape.floatSec },
        cue: floatCue(seed + i),
      });
    }
    const atGoal = opts?.atGoalPace && paceTarget;
    out.push({
      type: "moderate",
      label: atGoal
        ? `${min(seconds)} min @ goal pace${pace}`
        : `${min(seconds)} min tempo${pace}`,
      instruction: atGoal
        ? "Your goal race pace — hold the rhythm"
        : "Comfortably hard — hold the rhythm",
      target: { kind: "duration", seconds },
      ...(paceTarget ? { paceTarget } : {}),
      ...(atGoal ? { pacePinned: true } : {}),
      ...(shape.workSecs.length > 1
        ? { rep: i + 1, totalReps: shape.workSecs.length }
        : {}),
      effort: atGoal
        ? `${min(seconds)} min @ goal pace`
        : `${min(seconds)} min tempo`,
      cue: atGoal
        ? shape.workSecs.length > 1
          ? `Block ${i + 1} of ${shape.workSecs.length} at goal race pace. Settle into your race rhythm.`
          : "Goal race pace. Settle into your race rhythm."
        : shape.workSecs.length > 1
          ? `Tempo block ${i + 1} of ${shape.workSecs.length}. Comfortably hard — settle into the rhythm.`
          : "Tempo. Comfortably hard — settle into the rhythm.",
    });
  });
  out.push({
    type: "cooldown",
    label: "Cool-down",
    instruction: "Easy jogging",
    target: { kind: "duration", seconds: shape.cooldownSec },
    cue: cooldownCue(seed),
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
  strides: StridesShape,
  /** Same cross-run rotation contract as segmentsFromIntervals. */
  seed: number = 0
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
      cue: "Easy running. Conversational pace — strides at the end.",
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
      effort: `Stride ${rep} of ${strides.reps}`,
      cue: strideRepCue(rep, strides.reps, seed + rep),
    });
    out.push({
      type: "recovery",
      label: "Walk back",
      instruction: "Full recovery",
      target: { kind: "duration", seconds: STRIDE_RECOVERY_SECONDS },
      rep,
      totalReps: strides.reps,
      cue: walkBackCue(seed + rep),
    });
  }
  return out;
}

/**
 * A2 — race-pace block sizing for a build-phase long run (Pfitzinger's
 * marathon/half-marathon-pace long runs). One third of the run at goal
 * pace, whole kilometres, floored at 3K and capped per distance so the
 * dose stays conservative relative to the book prescriptions (Pfitzinger
 * runs up to ~16K at MP inside a 29K run; we stop well short of that).
 */
export function racePaceBlockKm(
  totalKm: number,
  distance: "half" | "marathon"
): number {
  const cap = distance === "marathon" ? 12 : 8;
  return Math.min(cap, Math.max(3, Math.round(totalKm / 3)));
}

/**
 * A2 — a long run finishing at goal race pace: easy majority, then the
 * final block at the user's own goal pace (finish-fast, per Pfitzinger's
 * race-pace long runs). Both segments are DISTANCE-based, so the player
 * walks them on GPS metres. Distance is conserved: the two segments sum
 * to exactly `totalKm` (pinned in tests).
 *
 * The goal pace is user-declared (raceGoal.targetTimeS), not derived
 * from a benchmark — so the RUN-EV-08 consent gate does not apply, and
 * the pace is `pacePinned` so the in-run shell never re-suffixes it
 * with the fitness band.
 */
export function segmentsFromLongWithRacePace(
  totalKm: number,
  blockKm: number,
  goalPaceS: number,
  unit: DistanceUnit
): SessionSegment[] {
  const easyKm = Math.max(0, totalKm - blockKm);
  const paceLabel = paceMinSec(Math.round(goalPaceS), unit);
  /* The block lengths are PLAN data in kilometres; only their labels move.
     The distance TARGETS below stay in metres either way, so a converted
     label never changes what the player actually measures. */
  /* The old metric labels used the "7K" suffix, which has no imperial
     analogue — "4.3M" reads as metres, or millions. Both units now name the
     unit explicitly, and a whole number keeps its compact form ("7 km",
     not "7.0 km"). */
  const compact = (km: number) =>
    distanceIn(km * 1000, unit)
      .toFixed(1)
      .replace(/\.0$/, "");
  const easyLabel = compact(easyKm);
  const blockLabel = compact(blockKm);
  const u = distanceUnitLabel(unit);
  return [
    {
      type: "easy",
      label: `Easy ${easyLabel} ${u}`,
      instruction: "Conversational pace — race pace comes at the end",
      target: { kind: "distance", meters: Math.round(easyKm * 1000) },
      cue: "Easy running. Settle in — the race-pace block comes at the end.",
    },
    {
      type: "moderate",
      label: `${blockLabel} ${u} @ ${paceLabel}${paceUnitLabel(unit)}`,
      instruction: "Your goal race pace — strong to the finish",
      target: { kind: "distance", meters: Math.round(blockKm * 1000) },
      paceTarget: goalPaceS,
      pacePinned: true,
      effort: `${blockKm}K @ goal pace`,
      eyebrow: "RACE PACE",
      cue: `Race-pace block. ${blockKm} kilometres at your goal pace — strong to the finish.`,
    },
  ];
}

export function segmentsFromGuided(
  workout: GuidedRunWorkout
): SessionSegment[] {
  return workout.segments.map((seg) => ({
    type: seg.type,
    label: seg.label,
    instruction: seg.instruction,
    target: { kind: "duration", seconds: seg.durationSeconds },
    cue: `${seg.label}. ${seg.instruction}`,
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
