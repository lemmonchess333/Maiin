"use strict";

/**
 * The friends board's weekly tally (Polish2 call 5).
 *
 * `friendsBoard/{uid}` holds one person's current week: how many sessions,
 * how far they ran, how much they lifted. Only for someone who said yes
 * (`users/{uid}.showWeekOnBoard === true`, set by the setBoardSharing
 * callable): nothing is computed or stored for anyone else. Their
 * followers read it, a blocked pair cannot (firestore.rules); the server
 * alone writes it.
 *
 * A session counts as the challenges count it, so the board, the
 * challenges and the week's done count agree on what a session is: every
 * saved workout, and every run the challenges would credit (eligible, and
 * a distance sharedCreditBounds accepts). Distance and volume are the
 * bounded figures the challenges and lifetime totals use.
 *
 * The week is the person's own: Monday to Sunday of their saved day keys
 * (each session's `date` is its local start day), and "this week" is the
 * one holding today in their timezone, UTC when they have none.
 * `weekEndsAt` is when it ends there, so a reader can tell a tally from a
 * week already over from this week's.
 *
 * Recomputed from the sources, never incremented: the session triggers
 * call refreshBoardWeek with the days an event touched, and a recompute
 * of the same facts writes nothing new. The sources are read inside the
 * transaction that writes the tally, so a stale read cannot overwrite a
 * later one.
 */

const { isVolumeEligibleRun } = require("./runEligibility");
const { liftVolumeKgFor, runMetersFor } = require("./lifetimeAccrual");
const { localDateKeyInTz } = require("./streakNudge");
const { isValidDateKey } = require("./challengeActivityWindow");
const accountDeletionLocks = require("./accountDeletionLocks");

const COLLECTION = "friendsBoard";
const DAY_MS = 86400000;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function dayMs(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDays(dayKey, n) {
  return isoDay(dayMs(dayKey) + n * DAY_MS);
}

/** The Monday of the week holding `dayKey`. */
function weekKeyOf(dayKey) {
  const ms = dayMs(dayKey);
  const back = (new Date(ms).getUTCDay() + 6) % 7;
  return isoDay(ms - back * DAY_MS);
}

/** How far `timezone` is ahead of UTC at `ms`, in ms. */
function zoneOffsetMs(timezone, ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant midnight starts `dayKey` in `timezone` (UTC without one, or
 *  with one Intl does not know). Checked twice, so a day a clock change
 *  falls next to is still right. */
function localMidnightMs(dayKey, timezone) {
  const midnightUtc = dayMs(dayKey);
  if (!timezone) return midnightUtc;
  try {
    const first = midnightUtc - zoneOffsetMs(timezone, midnightUtc);
    return midnightUtc - zoneOffsetMs(timezone, first);
  } catch {
    return midnightUtc;
  }
}

/** The person's current week, and when it ends where they are. */
function currentWeek(timezone, now = Date.now()) {
  const today = localDateKeyInTz(new Date(now), timezone) || isoDay(now);
  const weekKey = weekKeyOf(today);
  return {
    weekKey,
    weekEndsAt: new Date(localMidnightMs(addDays(weekKey, 7), timezone)),
  };
}

/** One week's figures from its saved sessions. */
function tallyWeek(workouts, runs) {
  let lifts = 0;
  let runCount = 0;
  let distanceM = 0;
  let volumeKg = 0;
  for (const data of workouts) {
    lifts += 1;
    volumeKg += liftVolumeKgFor(data);
  }
  for (const data of runs) {
    if (!isVolumeEligibleRun(data)) continue;
    const meters = runMetersFor(data);
    if (!(meters > 0)) continue;
    runCount += 1;
    distanceM += meters;
  }
  return {
    sessions: lifts + runCount,
    lifts,
    runs: runCount,
    distanceM: Math.round(distanceM),
    volumeKg: Math.round(volumeKg),
  };
}

/** Recompute and store `week` for `uid` from the sessions saved in it. */
async function writeBoardWeek(db, uid, week) {
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "friendsBoard"
    ))
  )
    return;
  const user = db.collection("users").doc(uid);
  const endKey = addDays(week.weekKey, 7);
  const inWeek = (kind) =>
    user
      .collection(kind)
      .where("date", ">=", week.weekKey)
      .where("date", "<", endKey);
  const ref = db.collection(COLLECTION).doc(uid);
  await db.runTransaction(async (tx) => {
    const [owner, stored, workouts, runs] = await Promise.all([
      tx.get(user),
      tx.get(ref),
      tx.get(inWeek("workouts")),
      tx.get(inWeek("runs")),
    ]);
    // The answer is read again here, with the sources: a "no" that lands
    // while a trigger is recomputing must not have its tally written back
    // after setBoardSharing deleted it.
    if (!owner.exists || owner.data().showWeekOnBoard !== true) return;
    const tally = tallyWeek(
      workouts.docs.map((d) => d.data()),
      runs.docs.map((d) => d.data())
    );
    const prev = stored.exists ? stored.data() : null;
    if (
      prev &&
      prev.weekKey === week.weekKey &&
      Object.keys(tally).every((k) => prev[k] === tally[k])
    )
      return;
    tx.set(ref, {
      uid,
      weekKey: week.weekKey,
      weekEndsAt: week.weekEndsAt,
      ...tally,
      updatedAt: new Date(),
    });
  });
}

/**
 * For a session trigger: the days its event touched (old and new). Writes
 * only for someone who shares their week, and only when one of those days
 * is in their current week; a session from a week already over changes
 * nothing anyone is shown.
 */
async function refreshBoardWeek(db, uid, activityDays, { now = Date.now() } = {}) {
  const days = (activityDays || []).filter(isValidDateKey);
  if (!uid || days.length === 0) return;
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  if (user.showWeekOnBoard !== true) return;
  const week = currentWeek(user.timezone, now);
  if (!days.some((day) => weekKeyOf(day) === week.weekKey)) return;
  await writeBoardWeek(db, uid, week);
}

/**
 * The person's answer (the setBoardSharing callable). Yes stores the
 * answer and this week at once; no stores the answer and deletes the tally,
 * so nothing of their week is left to read.
 */
async function setBoardSharing(db, uid, share, { now = Date.now() } = {}) {
  const userRef = db.collection("users").doc(uid);
  await userRef.set({ showWeekOnBoard: share }, { merge: true });
  if (!share) {
    await db.collection(COLLECTION).doc(uid).delete();
    return;
  }
  const userSnap = await userRef.get();
  const timezone = userSnap.exists ? userSnap.data().timezone : null;
  await writeBoardWeek(db, uid, currentWeek(timezone, now));
}

module.exports = {
  COLLECTION,
  weekKeyOf,
  localMidnightMs,
  currentWeek,
  tallyWeek,
  writeBoardWeek,
  refreshBoardWeek,
  setBoardSharing,
};
