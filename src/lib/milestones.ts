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
 * collection. It computes nothing new: every entry is a record the app
 * already holds, placed in time next to the others.
 *
 * Pure by design — no React, no Firestore — so the ordering, the dedupe
 * and the wording rules are testable without a render.
 */
import type { Workout } from "@/hooks/useWorkouts";
import { distanceLabel } from "./runLabels";
import type { DistanceUnit } from "./distanceUnits";

/**
 * No `run-pr` yet, deliberately. A running best is only a best if the run
 * was pace-eligible — outdoor GPS, valid, above the volume floor — and
 * those rules live in the History page's own PR computation. Producing a
 * second, laxer copy here would let a treadmill entry claim a pace record,
 * which is the exact mistake the eligibility filter exists to prevent. The
 * chronology carries the first run today; run bests wait for that
 * computation to be lifted into a shared module.
 */
export type MilestoneKind = "first-workout" | "first-run" | "lift-pr" | "badge";

export interface Milestone {
  /** Stable across recomputes — used as a React key and to dedupe. */
  id: string;
  kind: MilestoneKind;
  /** Local "yyyy-MM-dd". Sortable as a string by construction. */
  date: string;
  title: string;
  /** One supporting line, or null when the title says everything. */
  detail: string | null;
}

/** A run reduced to what the chronology needs. */
export interface MilestoneRun {
  id: string;
  date: string;
  distanceMetres: number;
}

/**
 * One lifetime best per exercise, in the shape the History page ALREADY
 * computes for its PRs tab. Taking the computed values rather than a PR
 * map keeps a single derivation: a second pass over the same sets here
 * could drift from the one the PRs tab shows, and the two would disagree
 * about the same lift on the same screen.
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

export interface MilestoneSources {
  workouts: readonly Workout[];
  runs: readonly MilestoneRun[];
  liftBests: readonly MilestoneLiftBest[];
  badges: readonly MilestoneBadge[];
  /**
   * Required, not defaulted. A default would silently render km to a miles
   * reader, which is the failure the distance-unit gate exists to prevent —
   * and it caught exactly that in this module's first draft.
   */
  unit: DistanceUnit;
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
    if (!item.date) continue;
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
    });
  }

  for (const best of sources.liftBests) {
    if (!best.date) continue;
    out.push({
      id: `lift-pr:${best.name}`,
      kind: "lift-pr",
      date: best.date,
      title: `${best.name} — best lift`,
      detail: `${best.weight} kg × ${best.reps}`,
    });
  }

  for (const badge of sources.badges) {
    if (!badge.earnedOn) continue;
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
