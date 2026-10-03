// @vitest-environment jsdom
/**
 * The one saved-workout reader, against the Firestore fake: which documents
 * are saved workouts, which day each belongs to, which window it falls in,
 * and how a workout finished on this phone joins the list before it syncs.
 * (jsdom: the offline queue lives in localStorage.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));

import {
  fetchSavedWorkouts,
  parseSavedWorkout,
  workoutDay,
} from "../savedWorkouts";
import { queueDurableWrite } from "../offlineQueue";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";

const UID = "lifter";
const ids = (workouts: { id: string }[]) => workouts.map((w) => w.id);

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("workoutDay", () => {
  it("keeps a stored day key", () => {
    expect(workoutDay("2026-06-03")).toBe("2026-06-03");
  });

  it("reads an older ISO timestamp as the local day it names", () => {
    // 09:00 local, stored the way old saves stored it: as UTC. In zones far
    // from UTC that string starts with the day before or after.
    const iso = new Date(2026, 5, 3, 9, 0).toISOString();
    expect(workoutDay(iso)).toBe("2026-06-03");
  });

  it("reads a Timestamp as its local day", () => {
    expect(workoutDay(Timestamp.fromDate(new Date(2026, 5, 3, 21, 0)))).toBe(
      "2026-06-03"
    );
  });

  it("names no day for anything else", () => {
    for (const value of [undefined, "", "2026-02-30", "soon", 12]) {
      expect(workoutDay(value)).toBeNull();
    }
  });
});

describe("parseSavedWorkout", () => {
  it("keeps every stored field and guarantees a day and an exercise list", () => {
    const workout = parseSavedWorkout("w1", {
      date: "2026-06-03",
      notes: "Pull — Programme Week 2",
      completionId: "c-9",
    });
    expect(workout).toMatchObject({
      id: "w1",
      date: "2026-06-03",
      exercises: [],
      notes: "Pull — Programme Week 2",
      completionId: "c-9",
    });
  });

  it("is not a saved workout when it names no day", () => {
    expect(parseSavedWorkout("w", { date: "later" })).toBeNull();
    expect(parseSavedWorkout("w", { exercises: [] })).toBeNull();
  });
});

describe("fetchSavedWorkouts", () => {
  it("windows by day, including an older ISO date that sorts across the bound", async () => {
    seedFirestore({
      [`users/${UID}/workouts/before`]: savedWorkoutDoc("2026-06-01"),
      [`users/${UID}/workouts/first`]: savedWorkoutDoc("2026-06-02"),
      [`users/${UID}/workouts/legacy`]: savedWorkoutDoc("2026-06-03", {
        date: new Date(2026, 5, 3, 9, 0).toISOString(),
      }),
      [`users/${UID}/workouts/last`]: savedWorkoutDoc("2026-06-04"),
      [`users/${UID}/workouts/after`]: savedWorkoutDoc("2026-06-05"),
    });

    const week = await fetchSavedWorkouts(UID, {
      since: "2026-06-02",
      until: "2026-06-04",
    });
    expect(ids(week)).toEqual(["last", "legacy", "first"]);
    expect(week.find((w) => w.id === "legacy")?.date).toBe("2026-06-03");

    // A window of the legacy workout's own day. Its stored string is longer
    // than the day key, so it sorts after "2026-06-03" (west of UTC and at
    // UTC) or starts with "2026-06-02" (east of UTC): an exact query misses
    // it in every zone.
    const day = await fetchSavedWorkouts(UID, {
      since: "2026-06-03",
      until: "2026-06-03",
    });
    expect(ids(day)).toEqual(["legacy"]);
  });

  it("takes exactly the newest N before a day", async () => {
    seedFirestore({
      [`users/${UID}/workouts/a`]: savedWorkoutDoc("2026-06-01"),
      [`users/${UID}/workouts/b`]: savedWorkoutDoc("2026-06-03"),
      [`users/${UID}/workouts/c`]: savedWorkoutDoc("2026-06-05"),
      [`users/${UID}/workouts/d`]: savedWorkoutDoc("2026-06-08"),
    });

    const baseline = await fetchSavedWorkouts(UID, {
      latest: 2,
      before: "2026-06-08",
    });

    expect(ids(baseline)).toEqual(["c", "b"]);
  });

  it("includes a workout finished on this phone in the windows it belongs to", async () => {
    seedFirestore({
      [`users/${UID}/workouts/synced`]: savedWorkoutDoc("2026-06-02"),
    });
    queueDurableWrite(
      UID,
      `users/${UID}/workouts`,
      "offline",
      savedWorkoutDoc("2026-06-03")
    );

    expect(ids(await fetchSavedWorkouts(UID, { since: "2026-06-01" }))).toEqual(
      ["offline", "synced"]
    );
    expect(ids(await fetchSavedWorkouts(UID, { since: "2026-06-04" }))).toEqual(
      []
    );
    // Another account has nothing queued on this phone.
    expect(
      ids(await fetchSavedWorkouts("someone-else", { all: true }))
    ).toEqual([]);
  });
});
