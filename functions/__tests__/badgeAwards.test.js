/**
 * The badge award (App1 Q33, lib/badgeAwards.js): the one transaction that
 * writes an earned badge, and what each trigger reads to decide one.
 *
 * Driven against the memory Firestore (real paths, queries and
 * transactions), so each case asserts what lands on `streaks/data` and the
 * public summary, not which functions were called. Each "awards nothing"
 * case is paired with the write beside it that does award, so a path that
 * never wrote could not pass.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const awards = require("../lib/badgeAwards");
const { addDays } = require("../lib/badgeRules");

const UID = "u1";
const STREAKS = `users/${UID}/streaks/data`;
const PUBLIC = `users/${UID}/public/profile`;
const DAY = "2026-05-20";
const NOW = Date.parse("2026-05-20T12:00:00.000Z");

const stored = (db) => db.data.get(STREAKS) || {};
const earned = (db) =>
  (stored(db).badges || [])
    .filter((b) => b && b.earnedAt)
    .map((b) => b.id)
    .sort();
const entry = (db, id) => (stored(db).badges || []).find((b) => b.id === id);

/** `n` consecutive day keys ending on `end`, oldest first. */
const daysEnding = (end, n) =>
  Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));

const run = (date, over = {}) => ({
  date,
  distance: 3000,
  duration: 1200,
  ...over,
});
const meal = (date, over = {}) => ({
  date,
  items: [{ name: "Porridge" }],
  totalProtein: 40,
  totalCarbs: 60,
  totalFat: 15,
  ...over,
});

describe("awardBadges — the one transaction", () => {
  it("creates the record on a first award, naming the session, with the public summary", async () => {
    const db = memoryFirestore();
    const got = await awards.awardBadges(
      db,
      UID,
      ["first_step", "first_5k"],
      { kind: "run", id: "r1" },
      { nowMs: NOW }
    );
    expect(got).toEqual(["first_step", "first_5k"]);
    expect(entry(db, "first_5k")).toEqual({
      id: "first_5k",
      earnedAt: "2026-05-20T12:00:00.000Z",
      earnedBy: { kind: "run", id: "r1" },
    });
    expect(db.data.get(PUBLIC).badgeSummary).toEqual({
      earnedMap: {
        first_step: "2026-05-20T12:00:00.000Z",
        first_5k: "2026-05-20T12:00:00.000Z",
      },
      count: 2,
    });
  });

  it("awards each badge once: a redelivery writes nothing and moves no date", async () => {
    const db = memoryFirestore();
    await awards.awardBadges(
      db,
      UID,
      ["first_5k"],
      { kind: "run", id: "r1" },
      {
        nowMs: NOW,
      }
    );
    const writes = db.operations.length;
    const again = await awards.awardBadges(
      db,
      UID,
      ["first_5k"],
      { kind: "run", id: "r2" },
      { nowMs: NOW + 60_000 }
    );
    expect(again).toEqual([]);
    expect(db.operations.length).toBe(writes);
    expect(entry(db, "first_5k").earnedBy).toEqual({ kind: "run", id: "r1" });
  });

  it("keeps a badge the app awarded before, exactly as stored, and counts it", async () => {
    const legacy = {
      id: "week_warrior",
      name: "Week Warrior",
      earnedAt: "2026-01-01T00:00:00.000Z",
    };
    const db = memoryFirestore({
      [STREAKS]: {
        currentStreak: 9,
        badges: [legacy, { id: "three_day", earnedAt: null }],
      },
    });
    await awards.awardBadges(
      db,
      UID,
      ["three_day"],
      { kind: "streak", id: DAY },
      {
        nowMs: NOW,
      }
    );
    expect(entry(db, "week_warrior")).toEqual(legacy);
    expect(entry(db, "three_day").earnedBy).toEqual({
      kind: "streak",
      id: DAY,
    });
    expect(stored(db).currentStreak).toBe(9);
    expect(db.data.get(PUBLIC).badgeSummary.count).toBe(2);
  });

  it("writes no id the catalogue does not hold", async () => {
    const db = memoryFirestore();
    expect(
      await awards.awardBadges(db, UID, ["made_up"], { kind: "run", id: "r1" })
    ).toEqual([]);
    expect(db.data.has(STREAKS)).toBe(false);
  });

  it("gives ultimate_athlete in the award that reaches fifteen", async () => {
    const fourteen = [
      "first_step",
      "three_day",
      "week_warrior",
      "two_week",
      "month_master",
      "two_month",
      "century_club",
      "first_pr",
      "plate_club",
      "two_plate",
      "first_5k",
      "10k_club",
      "macro_master",
      "hybrid_athlete",
    ].map((id) => ({ id, earnedAt: "2026-01-01T00:00:00.000Z" }));
    const db = memoryFirestore({ [STREAKS]: { badges: fourteen } });
    const got = await awards.awardBadges(
      db,
      UID,
      ["balanced"],
      { kind: "workout", id: "w1" },
      { nowMs: NOW }
    );
    expect(got).toEqual(["balanced", "ultimate_athlete"]);
    expect(entry(db, "ultimate_athlete").earnedBy).toEqual({
      kind: "workout",
      id: "w1",
    });
  });

  it("keeps early days and awards early_bird on the fifth", async () => {
    const db = memoryFirestore({
      [STREAKS]: {
        earlyLogDays: ["2026-05-01", "2026-05-02", "2026-05-03"],
      },
    });
    await awards.awardBadges(
      db,
      UID,
      [],
      { kind: "meal", id: "m1" },
      {
        earlyDays: ["2026-05-04"],
        nowMs: NOW,
      }
    );
    expect(stored(db).earlyLogDays).toHaveLength(4);
    expect(earned(db)).toEqual([]);
    await awards.awardBadges(
      db,
      UID,
      [],
      { kind: "meal", id: "m2" },
      {
        earlyDays: ["2026-05-05"],
        nowMs: NOW,
      }
    );
    expect(stored(db).earlyLogDays).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
    ]);
    expect(entry(db, "early_bird").earnedBy).toEqual({
      kind: "meal",
      id: "m2",
    });
  });

  it("writes nothing for an account being deleted", async () => {
    const db = memoryFirestore({
      [`accountDeletionRequests/${UID}`]: { uid: UID, status: "running" },
    });
    expect(
      await awards.awardBadges(db, UID, ["first_step"], {
        kind: "run",
        id: "r1",
      })
    ).toEqual([]);
    expect(db.data.has(STREAKS)).toBe(false);
    expect(db.data.has(PUBLIC)).toBe(false);
    // The positive control: the same call once the deletion is gone.
    db.data.delete(`accountDeletionRequests/${UID}`);
    await awards.awardBadges(db, UID, ["first_step"], {
      kind: "run",
      id: "r1",
    });
    expect(earned(db)).toEqual(["first_step"]);
  });
});

describe("awardForWorkout", () => {
  it("a first workout: first_step, the plate clubs off its heaviest compound set, first_pr from its new bests", async () => {
    const db = memoryFirestore();
    const data = {
      date: DAY,
      newBests: 1,
      exercises: [
        { exerciseId: "squat", sets: [{ weightKg: 102.5, reps: 3 }] },
      ],
    };
    db.data.set(`users/${UID}/workouts/w1`, data);
    await awards.awardForWorkout(db, UID, "w1", data, { nowMs: NOW });
    expect(earned(db)).toEqual([
      "first_pr",
      "first_step",
      "plate_club",
      "two_plate",
    ]);
    expect(entry(db, "plate_club").earnedBy).toEqual({
      kind: "workout",
      id: "w1",
    });
  });

  it("completes a hybrid week with the runs around it", async () => {
    const db = memoryFirestore({
      [`users/${UID}/runs/r1`]: run("2026-05-18"),
      [`users/${UID}/runs/r2`]: run("2026-05-19"),
      [`users/${UID}/runs/r3`]: run("2026-05-17"),
      // Saved anyway: no credit, so no third run day from it.
      [`users/${UID}/runs/r4`]: run("2026-05-16", { savedAnyway: true }),
      [`users/${UID}/workouts/w1`]: { date: "2026-05-18" },
      [`users/${UID}/workouts/w2`]: { date: "2026-05-19" },
    });
    const data = { date: DAY };
    await awards.awardForWorkout(db, UID, "w3", data, { nowMs: NOW });
    expect(earned(db)).toEqual(["first_step", "hybrid_athlete", "iron_runner"]);
  });

  it("triple_threat: a lift and a run on a day every macro was hit", async () => {
    const target = { targetProtein: 150, targetCarbs: 250, targetFat: 70 };
    const db = memoryFirestore({
      [`users/${UID}/runs/r1`]: run(DAY),
      [`users/${UID}/meals/m1`]: meal(DAY, {
        totalProtein: 150,
        totalCarbs: 250,
        totalFat: 70,
      }),
      [`users/${UID}/dailyNutrition/${DAY}`]: { date: DAY, ...target },
    });
    await awards.awardForWorkout(db, UID, "w1", { date: DAY }, { nowMs: NOW });
    expect(earned(db)).toContain("triple_threat");
    // The same day without the run: no triple.
    const without = memoryFirestore({
      [`users/${UID}/meals/m1`]: meal(DAY, {
        totalProtein: 150,
        totalCarbs: 250,
        totalFat: 70,
      }),
      [`users/${UID}/dailyNutrition/${DAY}`]: { date: DAY, ...target },
    });
    await awards.awardForWorkout(
      without,
      UID,
      "w1",
      { date: DAY },
      { nowMs: NOW }
    );
    expect(earned(without)).toEqual(["first_step"]);
  });

  it("an early workout counts towards early_bird in the person's timezone", async () => {
    const db = memoryFirestore({
      [`users/${UID}`]: { timezone: "Europe/London" },
      [STREAKS]: {
        earlyLogDays: ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"],
      },
    });
    // 05:10 UTC is 06:10 in London.
    const createdAt = new Date("2026-05-20T05:10:00.000Z");
    await awards.awardForWorkout(
      db,
      UID,
      "w1",
      { date: DAY, createdAt },
      {
        nowMs: NOW,
      }
    );
    expect(earned(db)).toContain("early_bird");
    // At 07:10 there, nothing early.
    const late = memoryFirestore({
      [`users/${UID}`]: { timezone: "Europe/London" },
    });
    await awards.awardForWorkout(
      late,
      UID,
      "w1",
      { date: DAY, createdAt: new Date("2026-05-20T06:10:00.000Z") },
      { nowMs: NOW }
    );
    expect(stored(late).earlyLogDays).toBeUndefined();
    expect(earned(late)).toEqual(["first_step"]);
  });
});

describe("awardForRun", () => {
  it("a fast 5K: first_step, first_5k and speed_demon, named by the run", async () => {
    const db = memoryFirestore();
    // 5.2 km in 25:00 is 4:48 /km: under 5:00, so speed_demon too.
    const data = run(DAY, { distance: 5200, duration: 1500 });
    await awards.awardForRun(db, UID, "r1", data, { day: DAY, nowMs: NOW });
    expect(earned(db)).toEqual(["first_5k", "first_step", "speed_demon"]);
    expect(entry(db, "first_5k").earnedBy).toEqual({ kind: "run", id: "r1" });
  });

  it("a run the challenges would not credit earns nothing", async () => {
    const db = memoryFirestore();
    await awards.awardForRun(
      db,
      UID,
      "r1",
      run(DAY, { distance: 6000, isInvalid: true }),
      { day: DAY, nowMs: NOW }
    );
    expect(db.data.has(STREAKS)).toBe(false);
  });

  it("a run backfilled into an old week completes that week", async () => {
    const db = memoryFirestore({
      [`users/${UID}/workouts/w1`]: { date: "2026-05-01" },
      [`users/${UID}/workouts/w2`]: { date: "2026-05-02" },
      [`users/${UID}/workouts/w3`]: { date: "2026-05-03" },
      [`users/${UID}/runs/r1`]: run("2026-05-01"),
      [`users/${UID}/runs/r2`]: run("2026-05-02"),
    });
    await awards.awardForRun(db, UID, "r3", run("2026-05-03"), {
      day: "2026-05-03",
      nowMs: NOW,
    });
    expect(earned(db)).toContain("iron_runner");
  });
});

describe("awardForMeal", () => {
  it("a meal with food: first_step; an empty one, nothing", async () => {
    const db = memoryFirestore();
    await awards.awardForMeal(db, UID, "m0", null, meal(DAY, { items: [] }), {
      nowMs: NOW,
    });
    expect(earned(db)).toEqual([]);
    await awards.awardForMeal(db, UID, "m1", null, meal(DAY), { nowMs: NOW });
    expect(earned(db)).toEqual(["first_step"]);
    expect(entry(db, "first_step").earnedBy).toEqual({
      kind: "meal",
      id: "m1",
    });
  });

  it("a deleted meal awards nothing", async () => {
    const db = memoryFirestore();
    await awards.awardForMeal(
      db,
      UID,
      "m1",
      meal(DAY),
      meal(DAY, { deletedAt: new Date() }),
      { nowMs: NOW }
    );
    expect(db.data.has(STREAKS)).toBe(false);
  });

  it("meal_prep_master: the fourteenth day straight, logged in any order", async () => {
    const seed = {};
    // Thirteen days, the middle one missing: 6 + gap + 7.
    for (const d of daysEnding(DAY, 14)) {
      if (d !== "2026-05-13") seed[`users/${UID}/meals/${d}`] = meal(d);
    }
    const db = memoryFirestore(seed);
    await awards.awardForMeal(db, UID, "x", null, meal(DAY), { nowMs: NOW });
    expect(earned(db)).not.toContain("meal_prep_master");
    // The missing day backfilled closes the run.
    const filled = meal("2026-05-13");
    db.data.set(`users/${UID}/meals/2026-05-13`, filled);
    await awards.awardForMeal(db, UID, "2026-05-13", null, filled, {
      nowMs: NOW,
    });
    expect(earned(db)).toContain("meal_prep_master");
  });

  it("protein_pro: protein met seven days in a row against each day's target", async () => {
    const seed = {};
    for (const d of daysEnding(DAY, 7)) {
      seed[`users/${UID}/meals/${d}`] = meal(d, { totalProtein: 160 });
      seed[`users/${UID}/dailyNutrition/${d}`] = {
        date: d,
        targetProtein: 150,
        targetCarbs: 250,
        targetFat: 70,
      };
    }
    const db = memoryFirestore(seed);
    await awards.awardForMeal(
      db,
      UID,
      DAY,
      null,
      seed[`users/${UID}/meals/${DAY}`],
      {
        nowMs: NOW,
      }
    );
    expect(earned(db)).toContain("protein_pro");
    expect(earned(db)).not.toContain("macro_master");
  });

  it("an edit that changes nothing a badge reads reads nothing", async () => {
    const db = memoryFirestore();
    const before = meal(DAY, { photoNote: "a" });
    const after = meal(DAY, { photoNote: "b" });
    expect(awards.mealChangeMayAward(before, after)).toBe(false);
    expect(await awards.awardForMeal(db, UID, "m1", before, after)).toEqual([]);
    expect(db.data.has(STREAKS)).toBe(false);
    expect(
      awards.mealChangeMayAward(before, { ...after, totalProtein: 41 })
    ).toBe(true);
  });
});

describe("awardForWater", () => {
  const water = (ml) => ({ ml, targetMl: 2000 });

  it("hydration_hero on the seventh day in a row at the target", async () => {
    const seed = {};
    for (const d of daysEnding("2026-05-19", 6))
      seed[`users/${UID}/waterLog/${d}`] = water(2100);
    const db = memoryFirestore(seed);
    await awards.awardForWater(db, UID, DAY, water(1500), water(2000), {
      nowMs: NOW,
    });
    expect(earned(db)).toEqual(["hydration_hero"]);
    expect(entry(db, "hydration_hero").earnedBy).toEqual({
      kind: "water",
      id: DAY,
    });
  });

  it("a day short of its target, or already at it, reads nothing", async () => {
    const db = memoryFirestore();
    expect(await awards.awardForWater(db, UID, DAY, null, water(1999))).toEqual(
      []
    );
    expect(
      await awards.awardForWater(db, UID, DAY, water(2000), water(2500))
    ).toEqual([]);
    expect(db.data.has(STREAKS)).toBe(false);
  });
});

describe("awardForTargets", () => {
  it("a target that moves after the meals can make the day a hit", async () => {
    const db = memoryFirestore({
      [`users/${UID}/meals/m1`]: meal(DAY, {
        totalProtein: 150,
        totalCarbs: 220,
        totalFat: 70,
      }),
    });
    const before = {
      date: DAY,
      targetProtein: 150,
      targetCarbs: 250,
      targetFat: 70,
    };
    const after = { ...before, targetCarbs: 220 };
    db.data.set(`users/${UID}/dailyNutrition/${DAY}`, after);
    await awards.awardForTargets(db, UID, DAY, before, after, { nowMs: NOW });
    expect(earned(db)).toEqual(["macro_master"]);
    expect(entry(db, "macro_master").earnedBy).toEqual({
      kind: "targets",
      id: DAY,
    });
    // Rewritten with the same target: nothing read, nothing written.
    const writes = db.operations.length;
    await awards.awardForTargets(db, UID, DAY, after, { ...after });
    expect(db.operations.length).toBe(writes);
  });
});

describe("awardForStreak", () => {
  it("a streak that grew to 7: every threshold it crossed, named by its day", async () => {
    const db = memoryFirestore();
    await awards.awardForStreak(
      db,
      UID,
      { currentStreak: 6, anchorStreak: 6, anchorDate: "2026-05-19" },
      { currentStreak: 7, anchorStreak: 7, anchorDate: DAY },
      { nowMs: NOW }
    );
    expect(earned(db)).toEqual(["first_step", "three_day", "week_warrior"]);
    expect(entry(db, "week_warrior").earnedBy).toEqual({
      kind: "streak",
      id: DAY,
    });
  });

  it("reads the certificate the morning after a rest day, when the streak shows 0", async () => {
    const db = memoryFirestore();
    await awards.awardForStreak(db, UID, null, {
      currentStreak: 0,
      anchorStreak: 14,
      anchorDate: "2026-05-18",
    });
    expect(earned(db)).toContain("two_week");
  });

  it("a write that leaves the streak as it was, as the award's own does, writes nothing", async () => {
    const db = memoryFirestore();
    const doc = { currentStreak: 30, anchorStreak: 30, anchorDate: DAY };
    expect(
      await awards.awardForStreak(db, UID, doc, { ...doc, badges: [] })
    ).toEqual([]);
    expect(
      await awards.awardForStreak(db, UID, doc, { ...doc, currentStreak: 2 })
    ).toEqual([]);
    expect(db.data.has(STREAKS)).toBe(false);
  });
});

describe("awardForProgramme", () => {
  it("moving on from a finished cycle's last week: programme_complete, named by the week", async () => {
    const db = memoryFirestore();
    await awards.awardForProgramme(
      db,
      UID,
      { weekNumber: 4, workouts: [{ completed: true }, { skipped: true }] },
      { weekNumber: 5, workouts: [{}, {}] },
      { nowMs: NOW }
    );
    expect(earned(db)).toEqual(["programme_complete"]);
    expect(entry(db, "programme_complete").earnedBy).toEqual({
      kind: "programme",
      id: "week-4",
    });
    // Week 5 → 6 is mid-cycle: nothing.
    const mid = memoryFirestore();
    await awards.awardForProgramme(
      mid,
      UID,
      { weekNumber: 5, workouts: [{ completed: true }] },
      { weekNumber: 6, workouts: [] }
    );
    expect(mid.data.has(STREAKS)).toBe(false);
  });
});
