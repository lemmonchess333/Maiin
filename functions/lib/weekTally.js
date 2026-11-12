"use strict";

/**
 * One person's week, counted from their saved sessions.
 *
 * A session counts as the challenges count it, so the league, the
 * challenges and the week's done count agree on what a session is: every
 * saved workout, and every run the challenges would credit (eligible, and
 * a distance sharedCreditBounds accepts). Distance and volume are the
 * bounded figures the challenges and lifetime totals use.
 *
 * The week is the person's own: Monday to Sunday of their saved day keys
 * (each session's `date` is its local start day), and "this week" is the
 * one holding today in their timezone, UTC when they have none.
 * `weekEndsAt` is when it ends there.
 *
 * The league reads it (lib/leagues.js). It was written for the friends
 * board (Polish2 call 5), which kept a tally in `friendsBoard/{uid}` for
 * someone who chose Show my week. The board went on 12 November 2026
 * (Trim1 call 3(a)): its collection, its writers and its callable are
 * gone, and this file kept the counting the league shares. Account
 * deletion still deletes a `friendsBoard/{uid}` left from before, and
 * scripts/purgeFriendsBoardDocs.js deletes the ones still stored.
 */

const { isVolumeEligibleRun } = require("./runEligibility");
const { liftVolumeKgFor, runMetersFor } = require("./lifetimeAccrual");
const { localDateKeyInTz } = require("./streakNudge");

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

module.exports = {
  weekKeyOf,
  localMidnightMs,
  currentWeek,
  tallyWeek,
};
