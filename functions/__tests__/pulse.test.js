/**
 * The live pulse (Soc15, lib/pulse.js): every saved session the challenges
 * would credit adds one to its own day's count, once, and a deleted one
 * comes back off it.
 *
 * Driven through the in-memory Firestore, which applies transactions,
 * merges and increments as Firestore does. Days come from the clock, so
 * the run with the clock 90 days ahead reads the same days. The emulator
 * suite (integration/pulse.test.js) drives the same paths through the real
 * session triggers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { memoryFirestore, increment } = require("./helpers/memoryFirestore.cjs");
const {
  KEEP_DAYS,
  pulseExpiresAt,
  dayIsOpen,
  sessionCounts,
  creditSessionToPulse,
  reverseSessionFromPulse,
} = require("../lib/pulse");
const { tallyWeek } = require("../lib/friendsBoard");
const { USER_SUBCOLLECTIONS } = require("../accountDeletion");

const fieldValue = { increment, serverTimestamp: () => "now" };
const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const NOW = Date.now();
/** UTC's today, and n days either side of it. */
const dayFrom = (n) => isoDay(NOW + n * DAY);
const TODAY = dayFrom(0);

let db;
beforeEach(() => {
  db = memoryFirestore();
});

const pulse = (day = TODAY) => db.data.get(`pulse/${day}`);
const credit = (uid, id) => db.data.get(`users/${uid}/pulseCredits/${id}`);

const workout = (date = TODAY) => ({ date, durationMinutes: 45 });
const run = (date = TODAY, distance = 5000, duration = distance * 0.3) => ({
  date,
  distance,
  duration,
});

async function save(uid, kind, id, data, { nowMs = NOW } = {}) {
  const path = `users/${uid}/${kind === "run" ? "runs" : "workouts"}/${id}`;
  db.data.set(path, data);
  return creditSessionToPulse(db, {
    uid,
    kind,
    sessionId: id,
    data,
    sourceRef: db.doc(path),
    fieldValue,
    nowMs,
  });
}

async function remove(uid, kind, id, { nowMs = NOW } = {}) {
  db.data.delete(`users/${uid}/${kind === "run" ? "runs" : "workouts"}/${id}`);
  return reverseSessionFromPulse(db, {
    uid,
    kind,
    sessionId: id,
    fieldValue,
    nowMs,
  });
}

describe("what counts", () => {
  it("is every saved workout, and a run the challenges would credit", () => {
    expect(sessionCounts("workout", workout())).toBe(true);
    expect(sessionCounts("run", run())).toBe(true);
    // Flagged, saved anyway, too short, past 500 km, faster than on foot.
    expect(sessionCounts("run", { ...run(), isInvalid: true })).toBe(false);
    expect(sessionCounts("run", { ...run(), savedAnyway: true })).toBe(false);
    expect(sessionCounts("run", run(TODAY, 40, 60))).toBe(false);
    expect(sessionCounts("run", run(TODAY, 600000, 300000))).toBe(false);
    expect(sessionCounts("run", run(TODAY, 20000, 480))).toBe(false);
    expect(sessionCounts("meal", workout())).toBe(false);
    expect(sessionCounts("workout", null)).toBe(false);
  });

  it("agrees with the friends board on every run", () => {
    const runs = [
      run(),
      run(TODAY, 40, 60),
      run(TODAY, 600000, 300000),
      run(TODAY, 20000, 480),
      { ...run(), isInvalid: true },
      { ...run(), savedAnyway: true },
      { date: TODAY, distanceKm: 5, duration: 1500 },
      { date: TODAY, distance: 5000 },
    ];
    for (const r of runs) {
      expect(sessionCounts("run", r), JSON.stringify(r)).toBe(
        tallyWeek([], [r]).runs === 1
      );
    }
    expect(tallyWeek([workout()], []).sessions).toBe(1);
  });
});

describe("which days", () => {
  it("takes a day some clock has reached and still kept, and no other", () => {
    // UTC+14 is already on UTC's tomorrow; nowhere is on the day after.
    expect(dayIsOpen(dayFrom(1), NOW)).toBe(true);
    expect(dayIsOpen(dayFrom(2), NOW)).toBe(false);
    expect(dayIsOpen(TODAY, NOW)).toBe(true);
    // Kept for eight days from its start.
    expect(dayIsOpen(dayFrom(-(KEEP_DAYS - 1)), NOW)).toBe(true);
    expect(dayIsOpen(dayFrom(-KEEP_DAYS), NOW)).toBe(false);
    expect(dayIsOpen("not-a-day", NOW)).toBe(false);
    expect(dayIsOpen(null, NOW)).toBe(false);
  });

  it("expires a day eight days after it starts", () => {
    expect(pulseExpiresAt(TODAY).getTime()).toBe(
      Date.parse(`${TODAY}T00:00:00Z`) + 8 * DAY
    );
  });
});

describe("a saved session", () => {
  it("adds one to its own day, with its credit, both expiring", async () => {
    await expect(save("ana", "workout", "w1", workout())).resolves.toBe(true);
    await expect(save("ben", "run", "r1", run())).resolves.toBe(true);
    const expiresAt = pulseExpiresAt(TODAY);
    expect(pulse()).toEqual({ sessions: 2, updatedAt: "now", expiresAt });
    expect(credit("ana", "workout_w1")).toEqual({
      kind: "workout",
      sessionId: "w1",
      dateKey: TODAY,
      appliedAt: "now",
      expiresAt,
    });
    expect(credit("ben", "run_r1")).toMatchObject({
      kind: "run",
      dateKey: TODAY,
      expiresAt,
    });
  });

  it("counts on its own day, not the day it reached the server", async () => {
    const yesterday = dayFrom(-1);
    await save("ana", "workout", "w1", workout(yesterday));
    expect(pulse(yesterday).sessions).toBe(1);
    expect(pulse()).toBeUndefined();
  });

  it("counts a workout and a run that share an id as two sessions", async () => {
    await save("ana", "workout", "programme-1", workout());
    await save("ana", "run", "programme-1", run());
    expect(pulse().sessions).toBe(2);
  });

  it("adds nothing when the trigger is delivered again", async () => {
    const w = workout();
    await save("ana", "workout", "w1", w);
    await expect(save("ana", "workout", "w1", w)).resolves.toBe(false);
    await expect(save("ana", "workout", "w1", w)).resolves.toBe(false);
    expect(pulse().sessions).toBe(1);
  });

  it("adds nothing for a run the challenges would not credit", async () => {
    await expect(
      save("ana", "run", "flagged", { ...run(), isInvalid: true })
    ).resolves.toBe(false);
    await save("ana", "run", "far", run(TODAY, 600000, 300000));
    await save("ana", "run", "fast", run(TODAY, 20000, 480));
    await save("ana", "run", "short", run(TODAY, 40, 60));
    expect(pulse()).toBeUndefined();
    expect(credit("ana", "run_flagged")).toBeUndefined();
  });

  it("adds nothing from a restricted account", async () => {
    db.data.set("globalRestrictedUids/ana", { restrictedAt: "x" });
    await expect(save("ana", "workout", "w1", workout())).resolves.toBe(false);
    expect(pulse()).toBeUndefined();
    expect(credit("ana", "workout_w1")).toBeUndefined();
  });

  it("adds nothing from an account being deleted", async () => {
    db.data.set("accountDeletionRequests/ana", { status: "running" });
    db.data.set("deletedAccounts/ben", {
      expiresAt: NOW + 30 * DAY,
    });
    await expect(save("ana", "workout", "w1", workout())).resolves.toBe(false);
    await expect(save("ben", "run", "r1", run())).resolves.toBe(false);
    expect(pulse()).toBeUndefined();
    expect(credit("ana", "workout_w1")).toBeUndefined();
    expect(credit("ben", "run_r1")).toBeUndefined();
    // Someone else's session that day still counts.
    await expect(save("cal", "workout", "w1", workout())).resolves.toBe(true);
    expect(pulse().sessions).toBe(1);
  });

  it("adds nothing for a session deleted before its credit lands", async () => {
    await expect(
      creditSessionToPulse(db, {
        uid: "ana",
        kind: "workout",
        sessionId: "gone",
        data: workout(),
        sourceRef: db.doc("users/ana/workouts/gone"),
        fieldValue,
        nowMs: NOW,
      })
    ).resolves.toBe(false);
    expect(pulse()).toBeUndefined();
  });

  it("adds nothing for a day no clock has reached, or one no longer kept", async () => {
    await save("ana", "workout", "future", workout(dayFrom(2)));
    await save("ana", "workout", "old", workout(dayFrom(-KEEP_DAYS)));
    expect(pulse(dayFrom(2))).toBeUndefined();
    expect(pulse(dayFrom(-KEEP_DAYS))).toBeUndefined();
    // UTC's tomorrow is someone's today.
    await save("ana", "workout", "kiritimati", workout(dayFrom(1)));
    expect(pulse(dayFrom(1)).sessions).toBe(1);
  });

  it("adds nothing for a session with no day at all", async () => {
    await expect(
      save("ana", "workout", "w1", { durationMinutes: 30 })
    ).resolves.toBe(false);
    expect([...db.data.keys()].some((k) => k.startsWith("pulse/"))).toBe(false);
  });
});

describe("a deleted session", () => {
  it("comes back off its day, and its credit goes", async () => {
    await save("ana", "workout", "w1", workout());
    await save("ben", "run", "r1", run());
    await expect(remove("ana", "workout", "w1")).resolves.toBe(true);
    expect(pulse().sessions).toBe(1);
    expect(credit("ana", "workout_w1")).toBeUndefined();
    await remove("ben", "run", "r1");
    expect(pulse().sessions).toBe(0);
  });

  it("takes nothing off when the delete is delivered again", async () => {
    await save("ana", "workout", "w1", workout());
    await save("ben", "workout", "w1", workout());
    await remove("ana", "workout", "w1");
    await expect(remove("ana", "workout", "w1")).resolves.toBe(false);
    await expect(remove("ana", "workout", "w1")).resolves.toBe(false);
    expect(pulse().sessions).toBe(1);
  });

  it("takes nothing off for a session that never counted", async () => {
    await save("ana", "workout", "w1", workout());
    await save("ben", "run", "r1", { ...run(), savedAnyway: true });
    await expect(remove("ben", "run", "r1")).resolves.toBe(false);
    expect(pulse().sessions).toBe(1);
  });

  it("comes off the day it was added to, whatever the session says now", async () => {
    await save("ana", "workout", "w1", workout());
    await save("ben", "workout", "w1", workout());
    // Moved to yesterday after it counted; the credit holds the day.
    db.data.set("users/ana/workouts/w1", workout(dayFrom(-1)));
    await remove("ana", "workout", "w1");
    expect(pulse().sessions).toBe(1);
    expect(pulse(dayFrom(-1))).toBeUndefined();
  });

  it("counts afresh when saved again under the same id", async () => {
    await save("ana", "workout", "w1", workout());
    await remove("ana", "workout", "w1");
    await save("ana", "workout", "w1", workout());
    expect(pulse().sessions).toBe(1);
  });

  it("comes off after the account is restricted", async () => {
    await save("ana", "workout", "w1", workout());
    db.data.set("globalRestrictedUids/ana", { restrictedAt: "x" });
    await remove("ana", "workout", "w1");
    expect(pulse().sessions).toBe(0);
  });

  it("leaves a day past its keeping as it stands, and drops the credit", async () => {
    await save("ana", "workout", "w1", workout());
    await save("ben", "workout", "w1", workout());
    const later = NOW + KEEP_DAYS * DAY;
    await expect(
      remove("ana", "workout", "w1", { nowMs: later })
    ).resolves.toBe(true);
    expect(pulse().sessions).toBe(2);
    expect(credit("ana", "workout_w1")).toBeUndefined();
  });

  it("fails, for a retry, when the day could not be written", async () => {
    await save("ana", "workout", "w1", workout());
    db.failures.set(`set:pulse/${TODAY}`, new Error("ABORTED: contention"));
    await expect(remove("ana", "workout", "w1")).rejects.toThrow(/ABORTED/);
    // Nothing committed: the credit is still there, so the retry lands once.
    expect(credit("ana", "workout_w1")).toBeDefined();
    db.failures.clear();
    await expect(remove("ana", "workout", "w1")).resolves.toBe(true);
    expect(pulse().sessions).toBe(0);
  });
});

describe("old days go", () => {
  /** Whether firestore.indexes.json deletes `group` documents once
   *  `field` has passed: a field nothing deletes on is only a date. */
  const ttlOn = (group, field) =>
    JSON.parse(
      readFileSync(new URL("../../firestore.indexes.json", import.meta.url))
    ).fieldOverrides.some(
      (o) =>
        o.collectionGroup === group && o.fieldPath === field && o.ttl === true
    );

  it("both the day and each credit are under a TTL policy on expiresAt", () => {
    expect(ttlOn("pulse", "expiresAt")).toBe(true);
    expect(ttlOn("pulseCredits", "expiresAt")).toBe(true);
  });
});

describe("wiring", () => {
  const INDEX = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const slice = (name) => {
    const start = INDEX.indexOf(`exports.${name} = functions`);
    expect(start).toBeGreaterThan(-1);
    return INDEX.slice(start, INDEX.indexOf("\nexports.", start + 1));
  };

  it("the workout trigger credits every workout", () => {
    expect(slice("onWorkoutCreated")).toMatch(
      /pulse\.creditSessionToPulse\(db, \{\s+uid,\s+kind: "workout",/
    );
  });

  it("the run trigger credits the run inside its eligibility gate", () => {
    const trigger = slice("onRunCreated");
    const gate = trigger.indexOf("if (isCountable) {");
    const credit = trigger.indexOf("pulse.creditSessionToPulse(");
    const otherwise = trigger.indexOf("} else {", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(credit).toBeGreaterThan(gate);
    expect(credit).toBeLessThan(otherwise);
  });

  it("the delete triggers take each one back off", () => {
    expect(slice("onWorkoutDeleted")).toMatch(
      /pulse\.reverseSessionFromPulse\(db, \{\s+uid,\s+kind: "workout",/
    );
    expect(slice("onRunDeleted")).toMatch(
      /pulse\.reverseSessionFromPulse\(db, \{\s+uid,\s+kind: "run",/
    );
  });

  it("account deletion sweeps the person's credits", () => {
    expect(USER_SUBCOLLECTIONS).toContain("pulseCredits");
  });
});
