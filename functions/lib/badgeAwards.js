"use strict";

/**
 * The badge award (App1 Q33: "Every badge is awarded by the server").
 *
 * The rules are `lib/badgeRules.js`; this module reads the facts each rule
 * needs from the document a trigger saw, and writes the award. The app
 * writes no earned badge: `firestore.rules` refuses a client change to
 * `streaks/data.badges`, `streaks/data.earlyLogDays` and the public
 * profile's `badgeSummary`, as it does for medals.
 *
 * Where each badge is decided (the trigger that sees its facts):
 *   - a saved workout (`onWorkoutCreated`): first_step, the plate clubs,
 *     first_pr, the hybrid windows, triple_threat, early_bird, and
 *     tonnage_100 through the lifetime total;
 *   - a saved run (`onRunCreated`, a run the challenges would credit):
 *     first_step, the distance and pace badges, the hybrid windows,
 *     triple_threat, early_bird, and century_km through the lifetime total;
 *   - a meal written (`onMealWritten`): first_step, meal_prep_master,
 *     macro_master, protein_pro, triple_threat, early_bird;
 *   - a day's water (`onWaterLogWritten`): hydration_hero;
 *   - a day's target snapshot (`onDailyNutritionWritten`): macro_master,
 *     protein_pro, triple_threat, judged again against the new target;
 *   - the streak's certificate (`onStreakWritten`, `streaks/data`): the
 *     streak badges, from first_step to year_long;
 *   - the plan moving on from a cycle's last week (`onProgramStateWritten`):
 *     programme_complete;
 *   - any award that brings the count to fifteen: ultimate_athlete, in the
 *     same transaction.
 *
 * Stored where they always were, so nothing is carried over: each badge is
 * an entry of `users/{uid}/streaks/data.badges` (`{ id, earnedAt }`, ISO),
 * mirrored to `users/{uid}/public/profile.badgeSummary` for other people,
 * and both are swept with the account (`streaks` and `public` are on the
 * deletion executor's list). An award made here also names the session
 * that earned it, `earnedBy: { kind, id }` (a workout, run or meal id; the
 * day of a water or target doc or of the streak; the plan's week), which is
 * how the app tells a badge awarded here from one it awarded itself before
 * this shipped. Those earlier entries stay exactly as they are.
 *
 * Every trigger is at-least-once and concurrent: the award is one
 * transaction on the live document that sets only what is not yet earned,
 * so a second delivery, or two sessions saved at once, award each badge
 * once with the first session to reach it.
 */

const rules = require("./badgeRules");
const accountDeletionLocks = require("./accountDeletionLocks");
const { isVolumeEligibleRun } = require("./runEligibility");
const { isActiveMealDoc } = require("./mealDocs");
const { isCalendarDate } = require("./dateUtils");

const KNOWN_IDS = new Set(rules.BADGE_IDS);
const HYBRID_IDS = rules.HYBRID_WINDOW_BADGES.map((b) => b.id);
/** The badges a day's food and its target decide. */
const TARGET_IDS = ["macro_master", "protein_pro", "triple_threat"];
/** The days either side of a session that every window it can complete
 *  fits in: the longest window is 14 days (balanced, meal_prep_master). */
const WINDOW_REACH_DAYS = 13;
/** The same for the 7-day nutrition streaks. */
const NUTRITION_REACH_DAYS = rules.NUTRITION_STREAK_DAYS - 1;

const streaksPath = (uid) => `users/${uid}/streaks/data`;

/** The ids earned in a stored `badges` array. */
function earnedIdsOf(badges) {
  const ids = new Set();
  for (const b of Array.isArray(badges) ? badges : []) {
    if (b && typeof b.id === "string" && b.earnedAt) ids.add(b.id);
  }
  return ids;
}

/** An earnedAt as the ISO string the app reads. */
function isoOf(value, fallback) {
  if (typeof value === "string") return value;
  if (value && typeof value.toDate === "function")
    return value.toDate().toISOString();
  return fallback;
}

/** The public mirror: ids and dates only, never the session. */
function badgeSummaryOf(badges, fallbackIso) {
  const earnedMap = {};
  for (const b of badges) {
    if (!b || typeof b.id !== "string" || !b.earnedAt) continue;
    earnedMap[b.id] = isoOf(b.earnedAt, fallbackIso);
  }
  return { earnedMap, count: Object.keys(earnedMap).length };
}

function cleanEarnedBy(earnedBy) {
  const kind = String((earnedBy && earnedBy.kind) || "session").slice(0, 20);
  const id = String((earnedBy && earnedBy.id) || "").slice(0, 200);
  return { kind, id };
}

/** Milliseconds of a Firestore Timestamp, a Date or a number; NaN else. */
function millisOf(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return NaN;
}

/**
 * Award the ids not yet earned, naming `earnedBy`, in one transaction on
 * `streaks/data` that also writes the public summary. `options.earlyDays`
 * are early-log days to keep on the document (`earlyLogDays`, early_bird's
 * count); keeping the fifth awards early_bird. Ultimate Athlete is checked
 * inside the same transaction, so the award that reaches fifteen gives it.
 *
 * A missing document is created, as a first session's award must be (the
 * app writes `streaks/data` only once its streak changes), so the deletion
 * guard runs first: a trigger must not re-create a document the deletion
 * executor has swept.
 *
 * @returns {Promise<string[]>} the ids this call awarded
 */
async function awardBadges(db, uid, ids, earnedBy, options = {}) {
  const wanted = [...new Set((ids || []).filter((id) => KNOWN_IDS.has(id)))];
  const earlyDays = Array.isArray(options.earlyDays) ? options.earlyDays : [];
  if (wanted.length === 0 && earlyDays.length === 0) return [];
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "awardBadges"
    ))
  ) {
    return [];
  }
  const ref = db.doc(streaksPath(uid));
  const publicRef = db.doc(`users/${uid}/public/profile`);
  const nowIso = new Date(options.nowMs ?? Date.now()).toISOString();
  const by = cleanEarnedBy(earnedBy);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = (snap.exists && snap.data()) || {};
    const badges = Array.isArray(stored.badges) ? stored.badges.slice() : [];
    const awarded = [];
    const award = (id) => {
      const idx = badges.findIndex((b) => b && b.id === id);
      if (idx === -1) {
        badges.push({ id, earnedAt: nowIso, earnedBy: by });
      } else if (!badges[idx].earnedAt) {
        badges[idx] = { ...badges[idx], earnedAt: nowIso, earnedBy: by };
      } else {
        return; // earned already: kept exactly as it is
      }
      awarded.push(id);
    };

    const want = wanted.slice();
    let keptEarly = null;
    if (earlyDays.length > 0) {
      const storedEarly = Array.isArray(stored.earlyLogDays)
        ? stored.earlyLogDays
        : [];
      const kept = rules.keptEarlyDays(storedEarly, earlyDays);
      if (JSON.stringify(kept) !== JSON.stringify(storedEarly)) keptEarly = kept;
      want.push(...rules.earlyBirdBadges(kept));
    }

    for (const id of want) award(id);
    const earned = earnedIdsOf(badges);
    if (!earned.has("ultimate_athlete") && rules.ultimateAthleteDue([...earned]))
      award("ultimate_athlete");

    if (awarded.length === 0 && !keptEarly) return [];
    tx.set(
      ref,
      {
        ...(awarded.length > 0 ? { badges } : {}),
        ...(keptEarly ? { earlyLogDays: keptEarly } : {}),
      },
      { merge: true }
    );
    if (awarded.length > 0) {
      tx.set(
        publicRef,
        { badgeSummary: badgeSummaryOf(badges, nowIso) },
        { merge: true }
      );
    }
    return awarded;
  });
}

/** What is earned already, so a trigger reads no facts for a badge it
 *  cannot award. The transaction re-reads it; this only saves reads. */
async function earnedBadgeIds(db, uid) {
  const snap = await db.doc(streaksPath(uid)).get();
  return earnedIdsOf(snap.exists ? (snap.data() || {}).badges : null);
}

async function timezoneOf(db, uid) {
  const snap = await db.doc(`users/${uid}`).get();
  const tz = snap.exists ? (snap.data() || {}).timezone : null;
  return typeof tz === "string" && tz ? tz : null;
}

/** early_bird's day for a log at `atMs`, while it is still to earn. */
async function earlyDaysFor(db, uid, earned, atMs) {
  if (earned.has("early_bird") || !Number.isFinite(atMs)) return [];
  const day = rules.earlyDayOf(atMs, await timezoneOf(db, uid));
  return day ? [day] : [];
}

/** The days with a saved workout, and with a run the challenges would
 *  credit, from `from` to `to` (day keys, inclusive). */
async function liftRunDays(db, uid, from, to) {
  const [workouts, runs] = await Promise.all([
    db
      .collection(`users/${uid}/workouts`)
      .where("date", ">=", from)
      .where("date", "<=", to)
      .get(),
    db
      .collection(`users/${uid}/runs`)
      .where("date", ">=", from)
      .where("date", "<=", to)
      .get(),
  ]);
  const liftDays = new Set();
  for (const doc of workouts.docs) {
    const date = (doc.data() || {}).date;
    if (isCalendarDate(date)) liftDays.add(date);
  }
  const runDays = new Set();
  for (const doc of runs.docs) {
    const data = doc.data() || {};
    if (isCalendarDate(data.date) && isVolumeEligibleRun(data))
      runDays.add(data.date);
  }
  return { liftDays, runDays };
}

function macro(value, legacy) {
  const n = Number(value ?? legacy);
  return Number.isFinite(n) ? n : 0;
}

/** The meals from `from` to `to`: the days with a meal holding food, and
 *  each day's intake (a deleted meal counts for neither). */
async function mealsBetween(db, uid, from, to) {
  const snap = await db
    .collection(`users/${uid}/meals`)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();
  const mealDays = new Set();
  const totalsByDay = new Map();
  for (const doc of snap.docs) {
    const m = doc.data() || {};
    if (!isActiveMealDoc(m) || !isCalendarDate(m.date)) continue;
    if (Array.isArray(m.items) && m.items.length > 0) mealDays.add(m.date);
    const day = totalsByDay.get(m.date) || { protein: 0, carbs: 0, fat: 0 };
    day.protein += macro(m.totalProtein, m.protein);
    day.carbs += macro(m.totalCarbs, m.carbs);
    day.fat += macro(m.totalFat, m.fat);
    totalsByDay.set(m.date, day);
  }
  return { mealDays, totalsByDay };
}

function dayKeysBetween(from, to) {
  const days = [];
  for (let day = from; day <= to; day = rules.addDays(day, 1)) days.push(day);
  return days;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Each day's target snapshot (`dailyNutrition/{date}`), as it stood. */
async function targetsBetween(db, uid, from, to) {
  const refs = dayKeysBetween(from, to).map((day) =>
    db.doc(`users/${uid}/dailyNutrition/${day}`)
  );
  const snaps = await db.getAll(...refs);
  const targets = new Map();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const raw = snap.data() || {};
    targets.set(snap.id, {
      protein: num(raw.targetProtein),
      carbs: num(raw.targetCarbs),
      fat: num(raw.targetFat),
    });
  }
  return targets;
}

/** Each day's water (`waterLog/{date}`): drunk and the target, in ml. */
async function waterBetween(db, uid, from, to) {
  const refs = dayKeysBetween(from, to).map((day) =>
    db.doc(`users/${uid}/waterLog/${day}`)
  );
  const snaps = await db.getAll(...refs);
  const water = new Map();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const raw = snap.data() || {};
    water.set(snap.id, {
      ml: rules.waterConsumedMl(raw),
      target: rules.waterTargetMl(raw),
    });
  }
  return water;
}

/**
 * The nutrition badges a change on `day` can complete: macro_master and
 * protein_pro over the days around it, and triple_threat on the day
 * itself (the day's other facts were judged when each of them was saved).
 */
async function nutritionAround(db, uid, day, earned, meals) {
  const needed = TARGET_IDS.filter((id) => !earned.has(id));
  if (needed.length === 0) return [];
  const from = rules.addDays(day, -NUTRITION_REACH_DAYS);
  const to = rules.addDays(day, NUTRITION_REACH_DAYS);
  const [food, targets] = await Promise.all([
    meals || mealsBetween(db, uid, from, to),
    targetsBetween(db, uid, from, to),
  ]);
  const totals = new Map(
    [...food.totalsByDay].filter(([d]) => d >= from && d <= to)
  );
  const days = rules.nutritionBadgeDays(totals, targets, new Map());
  // The sessions of the day itself only, so triple_threat is judged there.
  let lifts = [];
  let runs = [];
  if (needed.includes("triple_threat") && days.macroMasterDays.includes(day)) {
    const sessions = await liftRunDays(db, uid, day, day);
    lifts = [...sessions.liftDays];
    runs = [...sessions.runDays];
  }
  return rules
    .nutritionBadges(days, lifts, runs)
    .filter((id) => needed.includes(id));
}

/**
 * The badges a saved session's day can complete with the sessions around
 * it: the hybrid windows, and triple_threat when the day has a lift, a run
 * and every macro hit. `sport` is the session's own, counted even before a
 * query would see it.
 */
async function sessionDayBadges(db, uid, day, sport, earned) {
  const needHybrid = HYBRID_IDS.some((id) => !earned.has(id));
  const needTriple = !earned.has("triple_threat");
  if (!isCalendarDate(day) || (!needHybrid && !needTriple)) return [];
  const { liftDays, runDays } = await liftRunDays(
    db,
    uid,
    rules.addDays(day, -WINDOW_REACH_DAYS),
    rules.addDays(day, WINDOW_REACH_DAYS)
  );
  (sport === "lift" ? liftDays : runDays).add(day);
  const ids = needHybrid ? rules.hybridBadges(liftDays, runDays, day) : [];
  if (needTriple && liftDays.has(day) && runDays.has(day)) {
    const [food, targets] = await Promise.all([
      mealsBetween(db, uid, day, day),
      targetsBetween(db, uid, day, day),
    ]);
    const days = rules.nutritionBadgeDays(food.totalsByDay, targets, new Map());
    if (
      rules.nutritionBadges(days, liftDays, runDays).includes("triple_threat")
    )
      ids.push("triple_threat");
  }
  return ids;
}

/** A saved workout (`onWorkoutCreated`). */
async function awardForWorkout(db, uid, workoutId, data, options = {}) {
  const earned = await earnedBadgeIds(db, uid);
  const ids = [
    "first_step",
    ...rules.liftWeightMilestoneBadges(data.exercises),
    ...rules.firstPrBadges(data),
    ...(await sessionDayBadges(db, uid, data.date, "lift", earned)),
  ];
  const earlyDays = await earlyDaysFor(db, uid, earned, millisOf(data.createdAt));
  return awardBadges(
    db,
    uid,
    ids,
    { kind: "workout", id: workoutId },
    { earlyDays, nowMs: options.nowMs }
  );
}

/** A saved run the challenges would credit (`onRunCreated`); `day` is the
 *  day it belongs to (Lift3: the day it started). */
async function awardForRun(db, uid, runId, data, options = {}) {
  if (!isVolumeEligibleRun(data)) return [];
  const earned = await earnedBadgeIds(db, uid);
  const meters = Number(options.meters ?? data.distance) || 0;
  const ids = [
    "first_step",
    ...rules.runMilestoneBadges(meters, Number(data.duration) || 0),
    ...(await sessionDayBadges(db, uid, options.day, "run", earned)),
  ];
  const earlyDays = await earlyDaysFor(
    db,
    uid,
    earned,
    millisOf(data.completedAt)
  );
  return awardBadges(
    db,
    uid,
    ids,
    { kind: "run", id: runId },
    { earlyDays, nowMs: options.nowMs }
  );
}

const MEAL_FIELDS = [
  "totalProtein",
  "totalCarbs",
  "totalFat",
  "protein",
  "carbs",
  "fat",
];

/** Whether a meal's change can move a badge: created, moved to another
 *  day, deleted or restored, food added or taken away, macros changed. */
function mealChangeMayAward(before, after) {
  if (!after) return false;
  if (!before) return true;
  const items = (m) => (Array.isArray(m.items) ? m.items.length : 0);
  return (
    before.date !== after.date ||
    !!before.deletedAt !== !!after.deletedAt ||
    items(before) !== items(after) ||
    MEAL_FIELDS.some((f) => before[f] !== after[f])
  );
}

/** A meal written (`onMealWritten`). A deleted meal awards nothing, and
 *  takes nothing back: a badge, once earned, is kept. */
async function awardForMeal(db, uid, mealId, before, after, options = {}) {
  if (!after || !isActiveMealDoc(after) || !isCalendarDate(after.date))
    return [];
  if (!mealChangeMayAward(before, after)) return [];
  const day = after.date;
  const hasFood = Array.isArray(after.items) && after.items.length > 0;
  const earned = await earnedBadgeIds(db, uid);
  const ids = hasFood ? ["first_step"] : [];

  const needPrep = hasFood && !earned.has("meal_prep_master");
  const needTargets = TARGET_IDS.some((id) => !earned.has(id));
  if (needPrep || needTargets) {
    const reach = needPrep ? WINDOW_REACH_DAYS : NUTRITION_REACH_DAYS;
    const meals = await mealsBetween(
      db,
      uid,
      rules.addDays(day, -reach),
      rules.addDays(day, reach)
    );
    if (needPrep) ids.push(...rules.mealPrepBadges(meals.mealDays));
    if (needTargets)
      ids.push(...(await nutritionAround(db, uid, day, earned, meals)));
  }

  const earlyDays = await earlyDaysFor(
    db,
    uid,
    earned,
    millisOf(after.createdAt)
  );
  return awardBadges(
    db,
    uid,
    ids,
    { kind: "meal", id: mealId },
    { earlyDays, nowMs: options.nowMs }
  );
}

/** A day's target snapshot written (`onDailyNutritionWritten`): a target
 *  that moves after the meals (a workout logged later changes the day's
 *  carbs) can make the day a hit. */
async function awardForTargets(db, uid, day, before, after, options = {}) {
  if (!after || !isCalendarDate(day)) return [];
  const same = (f) => before && num(before[f]) === num(after[f]);
  if (same("targetProtein") && same("targetCarbs") && same("targetFat"))
    return [];
  const earned = await earnedBadgeIds(db, uid);
  const ids = await nutritionAround(db, uid, day, earned, null);
  return awardBadges(
    db,
    uid,
    ids,
    { kind: "targets", id: day },
    { nowMs: options.nowMs }
  );
}

/** A day's water written (`onWaterLogWritten`): hydration_hero, seven days
 *  in a row at or over the day's target. */
async function awardForWater(db, uid, day, before, after, options = {}) {
  if (!after || !isCalendarDate(day)) return [];
  const ml = rules.waterConsumedMl(after);
  const target = rules.waterTargetMl(after);
  if (!(ml >= target)) return [];
  if (
    before &&
    rules.waterConsumedMl(before) >= rules.waterTargetMl(before)
  )
    return []; // the day was a hit already, and was judged then
  const earned = await earnedBadgeIds(db, uid);
  if (earned.has("hydration_hero")) return [];
  const water = await waterBetween(
    db,
    uid,
    rules.addDays(day, -NUTRITION_REACH_DAYS),
    rules.addDays(day, NUTRITION_REACH_DAYS)
  );
  water.set(day, { ml, target });
  const days = rules.nutritionBadgeDays(new Map(), new Map(), water);
  const ids = rules
    .nutritionBadges(days, [], [])
    .filter((id) => id === "hydration_hero");
  return awardBadges(
    db,
    uid,
    ids,
    { kind: "water", id: day },
    { nowMs: options.nowMs }
  );
}

/** The streak a `streaks/data` document certifies: its anchor (the count
 *  ending on `anchorDate`) or the streak as shown, whichever is longer. */
function certifiedStreak(data) {
  if (!data) return 0;
  const whole = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return Math.max(whole(data.currentStreak), whole(data.anchorStreak));
}

/**
 * The streak's certificate written (`onStreakWritten`). Only a streak that
 * grew can reach a new badge, so a write that leaves it as it was (this
 * module's own award, a recount of the same streak) reads nothing.
 */
async function awardForStreak(db, uid, before, after, options = {}) {
  const streak = certifiedStreak(after);
  if (streak <= certifiedStreak(before)) return [];
  const day = isCalendarDate(after.anchorDate)
    ? after.anchorDate
    : isCalendarDate(after.lastActiveDate)
      ? after.lastActiveDate
      : "";
  return awardBadges(
    db,
    uid,
    rules.streakBadges(streak),
    { kind: "streak", id: day },
    { nowMs: options.nowMs }
  );
}

/** The plan written (`onProgramStateWritten`): programme_complete when it
 *  moved on from a finished cycle's last week. */
async function awardForProgramme(db, uid, before, after, options = {}) {
  const ids = rules.programmeCompleteBadges(before, after);
  if (ids.length === 0) return [];
  return awardBadges(
    db,
    uid,
    ids,
    { kind: "programme", id: `week-${before.weekNumber}` },
    { nowMs: options.nowMs }
  );
}

module.exports = {
  awardBadges,
  awardForWorkout,
  awardForRun,
  awardForMeal,
  awardForTargets,
  awardForWater,
  awardForStreak,
  awardForProgramme,
  mealChangeMayAward,
  certifiedStreak,
};
