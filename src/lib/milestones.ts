/**
 * The chronology — one list of the things worth remembering, newest first.
 *
 * The app already recognises achievements in several places, each of which
 * answers "how am I doing right now": the PRs tab holds current bests, the
 * badge grid holds a collection, the performance index holds a weekly
 * score. None of them answers "what has happened", and endings in
 * particular — a first session, a best that has since been beaten — have
 * nowhere to land once they stop being current.
 *
 * This is deliberately NOT a score, a dashboard or a second badge
 * collection. Every entry traces to a record the app already holds;
 * historical lift improvements use the shared e1RM comparison.
 *
 * Pure by design — no React, no Firestore — so the ordering, the dedupe
 * and the wording rules are testable without a render.
 */
import type { Workout } from "@/hooks/useWorkouts";
import { distanceLabel, finishTimeLabel } from "./runLabels";
import type { DistanceUnit } from "./distanceUnits";
import { epley1RMExact } from "./analytics";
import { EXERCISES } from "./exercises";
import { localDateString, parseLocalDate } from "./dateHelpers";
import type { TrainingBlock } from "@/features/program/trainingBlock";
import type { MilestoneRace } from "./recordedRaceMilestones";

/**
 * No `run-pr` yet, deliberately. A running best is only a best if the run
 * was pace-eligible — outdoor GPS, valid, above the volume floor — and
 * those rules live in the History page's own PR computation. Producing a
 * second, laxer copy here would let a treadmill entry claim a pace record,
 * which is the exact mistake the eligibility filter exists to prevent. The
 * chronology carries the first run today; run bests wait for that
 * computation to be lifted into a shared module.
 */
export type MilestoneKind =
  | "first-workout"
  | "first-run"
  | "lift-pr"
  | "badge"
  | "block-complete"
  | "race-complete";

export interface Milestone {
  /** Stable across recomputes — used as a React key and to dedupe. */
  id: string;
  kind: MilestoneKind;
  /** Local "yyyy-MM-dd". Sortable as a string by construction. */
  date: string;
  title: string;
  /** One supporting line, or null when the title says everything. */
  detail: string | null;
  /** Only genuine source records get a destination. */
  href?: string;
  blockId?: string;
}

/** A run reduced to what the chronology needs. */
export interface MilestoneRun {
  id: string;
  date: string;
  distanceMetres: number;
}

/**
 * Legacy/projected callers can supply a current best without its saved
 * session. Full workout records take priority for the chronology so an
 * older strength best is not erased when the current one changes.
 */
export interface MilestoneLiftBest {
  name: string;
  weight: number;
  reps: number;
  date: string;
}

/** An earned badge reduced to what the chronology needs. */
export interface MilestoneBadge {
  id: string;
  name: string;
  description: string;
  /** Local "yyyy-MM-dd", already resolved from whatever the store held. */
  earnedOn: string;
}

function hasLocalDate(date: string | undefined): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return localDateString(parseLocalDate(date)) === date;
}

export interface MilestoneSources {
  workouts: readonly Workout[];
  runs: readonly MilestoneRun[];
  liftBests: readonly MilestoneLiftBest[];
  badges: readonly MilestoneBadge[];
  blocks?: readonly TrainingBlock[];
  races?: readonly MilestoneRace[];
  /**
   * Required, not defaulted. A default would silently render km to a miles
   * reader, which is the failure the distance-unit gate exists to prevent —
   * and it caught exactly that in this module's first draft.
   */
  unit: DistanceUnit;
}

/**
 * A session's best set can be displaced without its date disappearing.
 * Walk the saved sessions in date/creation order and retain each genuine
 * improvement. The first observation establishes a baseline; it is not
 * labelled a strength gain. No new record writes or full-history reads.
 */
function historicalLiftBests(workouts: readonly Workout[]): Milestone[] {
  const out: Milestone[] = [];
  const scores = new Map<string, number>();
  const bodyweight = new Set(
    EXERCISES.filter((ex) => ex.equipment === "Bodyweight").map((ex) => ex.name)
  );
  const ordered = workouts
    .filter((w) => hasLocalDate(w.date))
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0) ||
        a.id.localeCompare(b.id)
    );
  for (const workout of ordered) {
    const sessionBests = new Map<
      string,
      { name: string; weight: number; reps: number; score: number }
    >();
    for (const exercise of workout.exercises ?? []) {
      if (exercise.repUnit === "seconds") continue;
      for (const set of exercise.sets ?? []) {
        if (
          set.type === "warmup" ||
          !Number.isFinite(set.weightKg) ||
          !Number.isFinite(set.reps) ||
          set.reps <= 0 ||
          set.weightKg < 0
        )
          continue;
        const unloaded =
          set.weightKg === 0 && bodyweight.has(exercise.exerciseName);
        if (set.weightKg === 0 && !unloaded) continue;
        // Reps alone and loaded e1RM are different measurements; never
        // compare 20 pull-ups with a 20 kg weighted set as equal scores.
        const key = `${exercise.exerciseId || exercise.exerciseName}:${unloaded ? "reps" : "load"}`;
        const score = unloaded
          ? set.reps
          : epley1RMExact(set.weightKg, set.reps);
        if (score > (sessionBests.get(key)?.score ?? 0)) {
          sessionBests.set(key, {
            name: exercise.exerciseName,
            weight: set.weightKg,
            reps: set.reps,
            score,
          });
        }
      }
    }
    for (const [key, best] of sessionBests) {
      const previous = scores.get(key);
      if (previous !== undefined && best.score <= previous) continue;
      scores.set(key, best.score);
      out.push({
        id: `lift-pr:${workout.id}:${key}`,
        kind: "lift-pr",
        date: workout.date,
        title: `${best.name} · ${previous === undefined ? "first logged best" : "new best"}`,
        detail:
          best.weight === 0
            ? `${best.reps} reps`
            : `${best.weight} kg × ${best.reps}`,
        href: `/workout/${encodeURIComponent(workout.id)}`,
      });
    }
  }
  return out;
}

/**
 * Earliest-dated record in a list, or undefined when the list is empty.
 * Not `sort()[0]` — sorting to read one element mutates the caller's array
 * and costs more than a scan on the longest histories this has to serve.
 */
function earliest<T extends { date: string }>(
  items: readonly T[]
): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (!hasLocalDate(item.date)) continue;
    if (!best || item.date < best.date) best = item;
  }
  return best;
}

/**
 * Build the chronology.
 *
 * Ordering is newest-first by date, and ties are broken by a stable rank
 * rather than left to the sort: two records sharing a date is the norm (a
 * PR is set during a session, and a badge is often earned by that same
 * session), and an unstable order there would reshuffle the list on every
 * render for no reason the user could see. Firsts sort last within a day
 * because they are the origin of everything else that day.
 */
export function buildMilestones(sources: MilestoneSources): Milestone[] {
  const out: Milestone[] = [];

  const firstWorkout = earliest(sources.workouts);
  if (firstWorkout) {
    out.push({
      id: `first-workout:${firstWorkout.id}`,
      kind: "first-workout",
      date: firstWorkout.date,
      title: "First workout logged",
      detail: null,
      href: `/workout/${encodeURIComponent(firstWorkout.id)}`,
    });
  }

  const firstRun = earliest(sources.runs);
  if (firstRun) {
    out.push({
      id: `first-run:${firstRun.id}`,
      kind: "first-run",
      date: firstRun.date,
      title: "First run logged",
      detail: distanceLabel(firstRun.distanceMetres, sources.unit),
      href: `/run/${encodeURIComponent(firstRun.id)}`,
    });
  }

  const historical = historicalLiftBests(sources.workouts);
  const recordedNames = new Set(
    sources.workouts.flatMap((w) =>
      (w.exercises ?? []).map((ex) => ex.exerciseName)
    )
  );
  out.push(...historical);
  for (const best of sources.liftBests) {
    if (!hasLocalDate(best.date)) continue;
    // Legacy/projected callers can still supply a dated best without full
    // workout records. Never duplicate a best reconstructed from its source.
    if (recordedNames.has(best.name)) continue;
    out.push({
      id: `lift-pr:${best.name}`,
      kind: "lift-pr",
      date: best.date,
      title: `${best.name} — best lift`,
      detail: `${best.weight} kg × ${best.reps}`,
    });
  }

  for (const block of sources.blocks ?? []) {
    if (
      block.status !== "completed" ||
      !block.endedAt ||
      !Number.isFinite(block.endedAt)
    )
      continue;
    const ended = new Date(block.endedAt);
    if (!Number.isFinite(ended.getTime())) continue;
    out.push({
      id: `block-complete:${block.id}`,
      kind: "block-complete",
      date: localDateString(ended),
      title: `${block.title} · block complete`,
      detail: `${block.durationWeeks}-week block`,
      blockId: block.id,
    });
  }

  for (const race of sources.races ?? []) {
    if (
      !hasLocalDate(race.date) ||
      !Number.isFinite(race.distanceMetres) ||
      race.distanceMetres <= 0 ||
      !Number.isFinite(race.durationSeconds) ||
      race.durationSeconds <= 0
    )
      continue;
    out.push({
      id: `race-complete:${race.id}`,
      kind: "race-complete",
      date: race.date,
      title: "Race logged",
      detail: `${distanceLabel(race.distanceMetres, sources.unit)} · ${finishTimeLabel(race.durationSeconds)}`,
      href: `/run/${encodeURIComponent(race.id)}`,
    });
  }

  for (const badge of sources.badges) {
    if (!hasLocalDate(badge.earnedOn)) continue;
    out.push({
      id: `badge:${badge.id}`,
      kind: "badge",
      date: badge.earnedOn,
      title: badge.name,
      detail: badge.description,
    });
  }

  const rank: Record<MilestoneKind, number> = {
    badge: 0,
    "block-complete": 0,
    "race-complete": 0,
    "lift-pr": 1,
    "first-run": 2,
    "first-workout": 3,
  };

  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
    return a.id < b.id ? -1 : 1;
  });
}
