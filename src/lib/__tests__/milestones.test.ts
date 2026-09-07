/**
 * The chronology's ordering and wording rules.
 *
 * Two things carry real risk here and are pinned deliberately:
 *
 *   - THE TIE-BREAK. Records sharing a date is the normal case, not an
 *     edge case — a PR is set during a session and a badge is often earned
 *     by that same session. If ties fell through to the sort's own order
 *     the list would reshuffle between renders for no reason the user
 *     could see, so the order within a day is asserted explicitly.
 *   - THE ABSENCE OF INVENTION. Every entry must trace to a record the app
 *     already holds. A dateless PR or badge is dropped rather than dated
 *     with a guess, which is what the "no fabricated history" rule means
 *     in practice.
 */
import { describe, it, expect } from "vitest";
import { buildMilestones, type MilestoneSources } from "../milestones";
import type { Workout } from "@/hooks/useWorkouts";
import { Timestamp } from "firebase/firestore";

function workout(id: string, date: string): Workout {
  return {
    id,
    date,
    exercises: [],
    totalCalories: 0,
    durationMinutes: 0,
    notes: "",
    createdAt: Timestamp.fromMillis(0),
  };
}

const empty: MilestoneSources = {
  workouts: [],
  runs: [],
  liftBests: [],
  badges: [],
  unit: "km",
};

describe("buildMilestones", () => {
  it("is empty for an account with no history", () => {
    expect(buildMilestones(empty)).toEqual([]);
  });

  it("takes the FIRST workout, not the first one in the array", () => {
    const result = buildMilestones({
      ...empty,
      // Deliberately unsorted, and the earliest is last — the ordering the
      // page happens to hold must not decide which session counts as first.
      workouts: [
        workout("b", "2026-03-02"),
        workout("c", "2026-05-20"),
        workout("a", "2026-01-15"),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "first-workout",
      date: "2026-01-15",
      id: "first-workout:a",
      title: "First workout logged",
    });
  });

  it("reports the first run with its distance in spaced units", () => {
    const result = buildMilestones({
      ...empty,
      runs: [
        { id: "r2", date: "2026-04-01", distanceMetres: 8200 },
        { id: "r1", date: "2026-02-10", distanceMetres: 5000 },
      ],
    });
    expect(result[0]).toMatchObject({
      kind: "first-run",
      date: "2026-02-10",
      detail: "5.0 km",
    });
  });

  it("renders the first run in the reader's own unit", () => {
    // The first draft of this module formatted metres to km by hand and
    // would have shown km to a miles reader. `distanceUnitGate` caught it;
    // this keeps it caught, since a default unit would reintroduce it
    // silently.
    const runs = [{ id: "r", date: "2026-02-10", distanceMetres: 5000 }];
    expect(buildMilestones({ ...empty, runs, unit: "km" })[0].detail).toBe(
      "5.0 km"
    );
    expect(buildMilestones({ ...empty, runs, unit: "mi" })[0].detail).toBe(
      "3.1 mi"
    );
  });

  it("carries each lift best with the date the map already holds", () => {
    const result = buildMilestones({
      ...empty,
      liftBests: [
        { name: "Barbell Row", weight: 60, reps: 5, date: "2026-06-01" },
        { name: "Bench Press", weight: 50, reps: 8, date: "2026-05-01" },
      ],
    });
    expect(result.map((m) => m.date)).toEqual(["2026-06-01", "2026-05-01"]);
    expect(result[0]).toMatchObject({
      kind: "lift-pr",
      title: "Barbell Row — best lift",
      detail: "60 kg × 5",
    });
  });

  it("orders newest first across every kind", () => {
    const result = buildMilestones({
      workouts: [workout("w", "2026-01-01")],
      runs: [{ id: "r", date: "2026-02-01", distanceMetres: 5000 }],
      liftBests: [{ name: "Squat", weight: 100, reps: 5, date: "2026-03-01" }],
      badges: [
        {
          id: "first-pr",
          name: "First PR",
          description: "Set your first personal record",
          earnedOn: "2026-04-01",
        },
      ],
      unit: "km",
    });
    expect(result.map((m) => m.date)).toEqual([
      "2026-04-01",
      "2026-03-01",
      "2026-02-01",
      "2026-01-01",
    ]);
  });

  it("breaks a same-day tie by kind, so the list cannot reshuffle", () => {
    // The realistic case: one session sets a PR and earns the badge for it,
    // and it is also the account's first session.
    const day = "2026-07-04";
    const result = buildMilestones({
      workouts: [workout("w", day)],
      runs: [{ id: "r", date: day, distanceMetres: 5000 }],
      liftBests: [{ name: "Squat", weight: 100, reps: 5, date: day }],
      badges: [
        {
          id: "first-pr",
          name: "First PR",
          description: "Set your first personal record",
          earnedOn: day,
        },
      ],
      unit: "km",
    });
    expect(result.map((m) => m.kind)).toEqual([
      "badge",
      "lift-pr",
      "first-run",
      "first-workout",
    ]);
  });

  it("is stable — the same sources produce the same order twice", () => {
    const day = "2026-07-04";
    const sources: MilestoneSources = {
      ...empty,
      liftBests: [
        { name: "Squat", weight: 140, reps: 1, date: day },
        { name: "Deadlift", weight: 180, reps: 3, date: day },
        { name: "Bench Press", weight: 100, reps: 5, date: day },
      ],
    };
    expect(buildMilestones(sources).map((m) => m.id)).toEqual(
      buildMilestones(sources).map((m) => m.id)
    );
  });

  it("drops records with no date rather than dating them with a guess", () => {
    const result = buildMilestones({
      ...empty,
      liftBests: [{ name: "Squat", weight: 100, reps: 5, date: "" }],
      badges: [{ id: "b", name: "Badge", description: "d", earnedOn: "" }],
    });
    expect(result).toEqual([]);
  });
});
