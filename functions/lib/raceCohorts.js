"use strict";

/**
 * Plan groups (Soc15): how many people on Tropos are training for one race.
 *
 * A race goal binds to a race space through `users/{uid}.raceGoal
 * .eventSpaceId`, which only its owner reads. A race's plan group is
 * everyone whose goal is bound to that space and whose race day is still
 * ahead. They share the race's date, so they are all the same number of
 * weeks out. `raceCohorts/{spaceId}` holds the group's size and nothing
 * else, `{ count, updatedAt }`: any signed-in person reads it, and only
 * this module writes it.
 *
 * - The count is a count aggregation over `users`, never an increment. It
 *   is taken again for the old space and the new one whenever a write to a
 *   user document sets, moves or clears a bound goal (`onRaceGoalWritten`,
 *   which also sees the user document deleted with its account), and each
 *   night for every race still ahead (`dailyRaceCohortRecount`). A retried
 *   or doubled delivery counts the same people and stores the same number.
 * - `updatedAt` is when the count was true, the aggregation's read time.
 *   Two recounts can finish out of order, so a count read before the one
 *   stored is dropped: the MAX rule `recomputeParticipantCount` follows.
 * - Nobody is left out. The count names no one, so a restricted account or
 *   one on the discovery-hidden list counts as a number like anyone else.
 * - "Still ahead" is judged a day late in UTC (`cutoffKey`). A race day is
 *   a local date, and somewhere it is still that day until a day after it
 *   began in UTC. A goal from a race's last edition, which stays bound
 *   through its recovery weeks, is months behind and drops out.
 * - The count needs the composite index on `users` (raceGoal.eventSpaceId,
 *   raceGoal.targetDate) in firestore.indexes.json. The emulator serves the
 *   query without it and production refuses it, so the index is pinned in
 *   __tests__/raceCohorts.test.js.
 */

const { SPACE_IDS } = require("./spaceIds");

const COLLECTION = "raceCohorts";
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const KNOWN_SPACES = new Set(SPACE_IDS);

function isDateKey(value) {
  return typeof value === "string" && DATE_KEY.test(value);
}

/**
 * Where a user document's race goal places its owner: the race space and
 * the race day, or null for no goal, a goal bound to no space, or a space
 * id the app does not know.
 */
function cohortOf(userData) {
  const goal = userData && userData.raceGoal;
  if (!goal || typeof goal !== "object" || Array.isArray(goal)) return null;
  const spaceId = goal.eventSpaceId;
  if (typeof spaceId !== "string" || !KNOWN_SPACES.has(spaceId)) return null;
  return {
    spaceId,
    targetDate: isDateKey(goal.targetDate) ? goal.targetDate : null,
  };
}

/**
 * The spaces whose count a write to `users/{uid}` may have moved: the old
 * space and the new one, each once. Empty when the goal's space and race
 * day are unchanged, which is almost every write to that document.
 */
function spacesToRecount(beforeData, afterData) {
  const before = cohortOf(beforeData);
  const after = cohortOf(afterData);
  if (
    before &&
    after &&
    before.spaceId === after.spaceId &&
    before.targetDate === after.targetDate
  )
    return [];
  return [
    ...new Set([before && before.spaceId, after && after.spaceId]),
  ].filter(Boolean);
}

/** The earliest race day still counted at `now`: yesterday, in UTC. */
function cutoffKey(now) {
  return new Date(now - DAY_MS).toISOString().slice(0, 10);
}

/** A stored time as milliseconds: a Firestore Timestamp, a Date or a number. */
function millisOf(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

/**
 * Should a count read at `observedMs` replace one read at `storedMs`?
 * Nothing stored, or no usable time, writes. An equal time writes too: it
 * is the same read delivered again, and writing it keeps the document
 * self-healing.
 */
function shouldStoreCount(observedMs, storedMs) {
  if (!observedMs || !storedMs) return true;
  return observedMs >= storedMs;
}

/** How many people are in `spaceId`'s plan group at `now`, and when that was read. */
async function countCohort(db, spaceId, now) {
  const snap = await db
    .collection("users")
    .where("raceGoal.eventSpaceId", "==", spaceId)
    .where("raceGoal.targetDate", ">=", cutoffKey(now))
    .count()
    .get();
  return {
    count: snap.data().count,
    observedMs: millisOf(snap.readTime) || now,
  };
}

/**
 * Count `spaceId`'s plan group and store it, unless a later count is
 * stored already. Resolves to `{ spaceId, count, written }`.
 */
async function recountRaceCohort(db, spaceId, { now = Date.now() } = {}) {
  if (!KNOWN_SPACES.has(spaceId)) return { spaceId, count: 0, written: false };
  const { count, observedMs } = await countCohort(db, spaceId, now);
  const ref = db.collection(COLLECTION).doc(spaceId);
  const written = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() || {} : {};
    if (!shouldStoreCount(observedMs, millisOf(stored.updatedAt))) return false;
    tx.set(ref, { count, updatedAt: new Date(observedMs) });
    return true;
  });
  return { spaceId, count, written };
}

/**
 * The race spaces whose race is still ahead at `now`, from the race
 * catalogue the app reads (`config/raceEvents.events`, mirrored from
 * spaceDefs.ts and kept current by the daily date refresher), sorted by id
 * so each night's run goes through them in the same order.
 */
function upcomingRaceSpaceIds(events, now) {
  if (!events || typeof events !== "object" || Array.isArray(events))
    return [];
  const cutoff = cutoffKey(now);
  return Object.entries(events)
    .filter(
      ([spaceId, event]) =>
        KNOWN_SPACES.has(spaceId) &&
        event &&
        typeof event === "object" &&
        isDateKey(event.dateKey) &&
        event.dateKey >= cutoff
    )
    .map(([spaceId]) => spaceId)
    .sort();
}

/**
 * The nightly recount (`dailyRaceCohortRecount`): every race still ahead,
 * one at a time. It puts right a count whose trigger gave up, and drops the
 * goals whose race has passed. A race already past is not counted again:
 * nobody is shown its group. Each race is tried whatever happens to the
 * others, then the run fails if any did, so `jobRuns` records it.
 */
async function sweepRaceCohorts(db, { now = Date.now(), log = console } = {}) {
  const config = await db.collection("config").doc("raceEvents").get();
  const events = config.exists ? (config.data() || {}).events : undefined;
  if (!events) {
    log.warn("raceCohorts.sweep: config/raceEvents has no events");
    return { races: 0, recounted: 0, catalogue: false };
  }
  const spaceIds = upcomingRaceSpaceIds(events, now);
  const failed = [];
  let recounted = 0;
  for (const spaceId of spaceIds) {
    try {
      await recountRaceCohort(db, spaceId, { now });
      recounted += 1;
    } catch (err) {
      failed.push(spaceId);
      log.error("raceCohorts.sweep: recount failed", {
        spaceId,
        message: err && err.message,
      });
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `raceCohorts.sweep: ${failed.length} of ${spaceIds.length} races failed (${failed.join(", ")})`
    );
  }
  return { races: spaceIds.length, recounted, catalogue: true };
}

module.exports = {
  COLLECTION,
  cohortOf,
  spacesToRecount,
  cutoffKey,
  millisOf,
  shouldStoreCount,
  recountRaceCohort,
  upcomingRaceSpaceIds,
  sweepRaceCohorts,
};
