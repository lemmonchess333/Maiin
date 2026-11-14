/**
 * Every badge's rule, on the server (App1 Q33: "Every badge is awarded by
 * the server").
 *
 * `functions/` is plain CommonJS and can't import the client catalogue
 * (`src/features/streaks/badges.ts`), so the ids and thresholds are
 * mirrored here. PARITY CONTRACT: the ids + intent MUST match
 * `BADGE_DEFINITIONS` and the client descriptions ("Complete a 5K run",
 * "3 lifts + 3 runs in one week", …) — pinned against the running copies by
 * `src/features/streaks/__tests__/badgeCatalogueParity.cross.test.ts` (the
 * ids) and `badgeRules.cross.test.ts` (the rules the app draws progress
 * rings from, ADR-0008).
 *
 * Pure: facts in, badge ids out. Which facts a trigger reads, and the one
 * transaction that writes an award, are `lib/badgeAwards.js`. Each rule
 * returns every id its facts qualify for; the award skips the ones already
 * earned, so a rule never needs to know what was earned before.
 *
 * Why the server: the client's streak snapshots are WINDOWED (90 days), so
 * a marathon run from two years ago, a lifetime total or a cycle finished
 * on another phone is out of its view; and an app-awarded badge could be
 * missed (offline, another device, an app that never opened), awarded twice
 * across devices, or awarded from a partial history. The triggers see each
 * session as it is saved, wherever it was saved from.
 */

// Single-run distance milestones, in METRES. Official race distances (a 21.1 km
// run clears the 21097 m half; a 42.2 km run clears the 42195 m marathon).
const RUN_DISTANCE_MILESTONES = [
  { id: "first_5k", minMeters: 5000 },
  { id: "10k_club", minMeters: 10000 },
  { id: "half_marathon", minMeters: 21097 },
  { id: "marathon", minMeters: 42195 },
];

// "Run a sub-5:00/km pace" — 5:00/km = 300 s/km. Require a real run (≥1 km) so
// a 50 m dash at the isCountable floor can't masquerade as a sub-5 pace.
const SPEED_DEMON_PACE_SEC_PER_KM = 300;
const SPEED_DEMON_MIN_METERS = 1000;

/**
 * The milestone badge ids a single run qualifies for. Distance in metres,
 * duration in seconds (the run doc's `distance` / `duration` fields).
 * Idempotent + side-effect-free — the caller decides which are already earned.
 */
function runMilestoneBadges(distanceMeters, durationSeconds) {
  const d = Number(distanceMeters) || 0;
  const t = Number(durationSeconds) || 0;
  const ids = [];

  for (const m of RUN_DISTANCE_MILESTONES) {
    if (d >= m.minMeters) ids.push(m.id);
  }

  if (d >= SPEED_DEMON_MIN_METERS && t > 0) {
    const paceSecPerKm = t / (d / 1000);
    if (paceSecPerKm < SPEED_DEMON_PACE_SEC_PER_KM) ids.push("speed_demon");
  }

  return ids;
}

// ── Lifetime-aggregate milestones ──────────────────────────────────────────
//
// Unlike the single-run milestones above, these depend on a CUMULATIVE total
// the trigger can't see in one doc — so the caller (onRun/onWorkoutCreated)
// maintains a per-user lifetime counter (idempotently, with a per-source
// marker) and passes the resulting total here. The thresholds match the
// client catalogue's descriptions: "Run 100 km lifetime distance" and "Move
// 100 tonnes total volume".
//
// Awarding is monotonic + idempotent downstream (the badge's `earnedAt` is set
// once), so this can simply return the id whenever the total is at/over the
// line — re-passing an already-crossed total is a harmless no-op award. No
// "crossed this time" detection needed here.
const LIFETIME_RUN_METERS_MILESTONE = 100000; // 100 km
const LIFETIME_LIFT_VOLUME_KG_MILESTONE = 100000; // 100 tonnes

/**
 * Lifetime-aggregate badge ids earned at a given running total.
 *   kind "run"  → century_km    once total run distance ≥ 100 km (metres)
 *   kind "lift" → tonnage_100   once total lift volume   ≥ 100 t  (kg)
 * Returns [] for an unknown kind or a sub-threshold / non-finite total.
 */
function lifetimeMilestoneBadges(kind, total) {
  const v = Number(total) || 0;
  if (kind === "run" && v >= LIFETIME_RUN_METERS_MILESTONE) {
    return ["century_km"];
  }
  if (kind === "lift" && v >= LIFETIME_LIFT_VOLUME_KG_MILESTONE) {
    return ["tonnage_100"];
  }
  return [];
}

// ── Lifting weight milestones (Plate Club) ─────────────────────────────────
//
// "Lift 60 / 100 / 140 kg on any compound." Plate-loading lingo — a milestone
// is only meaningful on a multi-joint BARBELL lift (loading 140 kg on a bicep
// curl isn't the intent), so this gates on a curated set of compound ids.
//
// PARITY: this set mirrors the multi-joint barbell movements in the client
// exercise DB (src/lib/exercises.ts) — functions/ can't import the TS. The
// membership test in functions/__tests__/badgeRules.test.js is the tripwire.
// Rule for adding an id: a multi-joint barbell lift where 60/100/140 kg are
// meaningful working loads. Deliberately EXCLUDES barbell isolation work
// (curls, shrugs, upright rows, skull-crushers) so three_plate stays earned,
// not gifted. Single-workout determinable, so awarded on onWorkoutCreated off
// the full workout doc (idempotent downstream via earnedAt) — same reason as
// the running distances: the client's windowed snapshots can't see an old PR.
const COMPOUND_LIFT_IDS = new Set([
  // Press (horizontal)
  "bench-press",
  "incline-bench",
  "decline-bench",
  "barbell-floor-press",
  "close-grip-bench",
  // Pull (hinge / row)
  "deadlift",
  "sumo-deadlift",
  "trap-bar-deadlift",
  "rack-pull",
  "romanian-deadlift",
  "barbell-row",
  "pendlay-row",
  "t-bar-row",
  "meadows-row",
  // Press (vertical)
  "overhead-press",
  "landmine-press",
  // Squat / hip
  "squat",
  "front-squat",
  "zercher-squat",
  "landmine-squat",
  "hip-thrust",
  "barbell-step-ups",
  // Full-body
  "clean-and-press",
  "thrusters",
]);

// Heaviest-set thresholds in KG, ascending.
const LIFT_WEIGHT_MILESTONES = [
  { id: "plate_club", minKg: 60 },
  { id: "two_plate", minKg: 100 },
  { id: "three_plate", minKg: 140 },
];

/**
 * The Plate-Club badge ids a single workout qualifies for. `exercises` is the
 * persisted workout doc's array — `{ exerciseId, sets: [{ weightKg }] }`. Only
 * compound-lift sets count; returns the tiers cleared by the heaviest such set.
 * Pure + side-effect-free — the caller decides which are already earned.
 */
function liftWeightMilestoneBadges(exercises) {
  if (!Array.isArray(exercises)) return [];
  let maxKg = 0;
  for (const ex of exercises) {
    if (!ex || !COMPOUND_LIFT_IDS.has(ex.exerciseId) || !Array.isArray(ex.sets))
      continue;
    for (const set of ex.sets) {
      const w = Number(set && set.weightKg) || 0;
      if (w > maxKg) maxKg = w;
    }
  }
  return LIFT_WEIGHT_MILESTONES.filter((m) => maxKg >= m.minKg).map((m) => m.id);
}

// ── Every other badge (App1 Q33) ───────────────────────────────────────

/** Every badge the catalogue holds, in its order. The award writes no id
 *  outside it (a stored id the catalogue does not know would be invisible
 *  forever), and the cross-test holds it to `BADGE_DEFINITIONS`. */
const BADGE_IDS = Object.freeze([
  "first_step",
  "three_day",
  "week_warrior",
  "two_week",
  "month_master",
  "two_month",
  "century_club",
  "year_long",
  "early_bird",
  "first_pr",
  "plate_club",
  "two_plate",
  "three_plate",
  "programme_complete",
  "tonnage_100",
  "first_5k",
  "10k_club",
  "half_marathon",
  "marathon",
  "speed_demon",
  "century_km",
  "macro_master",
  "protein_pro",
  "hydration_hero",
  "meal_prep_master",
  "hybrid_athlete",
  "balanced",
  "iron_runner",
  "triple_threat",
  "ultimate_athlete",
]);

const DAY_MS = 86400000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDayKey(value) {
  return typeof value === "string" && DAY_KEY.test(value);
}

/** Days since the epoch for a "YYYY-MM-DD" key: calendar arithmetic with
 *  no timezone in it, so a clock change cannot move a day. */
function dayNumber(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function addDays(key, n) {
  return new Date((dayNumber(key) + n) * DAY_MS).toISOString().slice(0, 10);
}

function dayKeySet(days) {
  const set = new Set();
  for (const day of days || []) if (isDayKey(day)) set.add(day);
  return set;
}

/** The streak badges: the streak reaching each count of days. */
const STREAK_BADGES = Object.freeze([
  { id: "first_step", days: 1 },
  { id: "three_day", days: 3 },
  { id: "week_warrior", days: 7 },
  { id: "two_week", days: 14 },
  { id: "month_master", days: 30 },
  { id: "two_month", days: 60 },
  { id: "century_club", days: 100 },
  { id: "year_long", days: 365 },
]);

/** The streak badges a streak of `streakDays` has reached. */
function streakBadges(streakDays) {
  const n = Number(streakDays);
  if (!Number.isFinite(n) || n <= 0) return [];
  return STREAK_BADGES.filter((b) => n >= b.days).map((b) => b.id);
}

/** Lifts and runs on distinct days within a window of `days` days. */
const HYBRID_WINDOW_BADGES = Object.freeze([
  { id: "hybrid_athlete", days: 7, lifts: 1, runs: 1 },
  { id: "iron_runner", days: 7, lifts: 3, runs: 3 },
  { id: "balanced", days: 14, lifts: 5, runs: 5 },
]);

function countBetween(set, first, last) {
  let n = 0;
  for (const day of set) if (day >= first && day <= last) n += 1;
  return n;
}

/**
 * The hybrid badges a window holding `focusDay` qualifies for: the
 * distinct days with a lift and with a run in some run of `days`
 * consecutive days that includes it. The trigger's focus is the day of
 * the session just saved, so a session backfilled into an old week is
 * judged in that week. With nothing after `focusDay`, the window ending
 * on it is the one that counts, which is the app's ring (a window ending
 * today).
 */
function hybridBadges(liftDays, runDays, focusDay) {
  if (!isDayKey(focusDay)) return [];
  const lifts = dayKeySet(liftDays);
  const runs = dayKeySet(runDays);
  const ids = [];
  for (const badge of HYBRID_WINDOW_BADGES) {
    for (let end = 0; end < badge.days; end++) {
      const last = addDays(focusDay, end);
      const first = addDays(last, -(badge.days - 1));
      if (
        countBetween(lifts, first, last) >= badge.lifts &&
        countBetween(runs, first, last) >= badge.runs
      ) {
        ids.push(badge.id);
        break;
      }
    }
  }
  return ids;
}

/** The longest run of consecutive calendar days among some day keys. */
function maxConsecutiveDayRun(days) {
  const sorted = Array.from(dayKeySet(days)).sort();
  if (sorted.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = dayNumber(sorted[i]) - dayNumber(sorted[i - 1]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  return longest;
}

/** "Log all meals for 14 days straight": a meal with items on each of 14
 *  consecutive days. Strict, no grace (the badge says straight). */
const MEAL_PREP_RUN_DAYS = 14;

function mealPrepBadges(mealDays) {
  return maxConsecutiveDayRun(mealDays) >= MEAL_PREP_RUN_DAYS
    ? ["meal_prep_master"]
    : [];
}

/** ±5% for `macro_master`: "hit all macros within 5% for a day". */
const MACRO_TARGET_BAND = 0.05;
/** "Hit protein/water target 7 days in a row." */
const NUTRITION_STREAK_DAYS = 7;

function withinBand(total, target, band) {
  if (!(target > 0)) return false;
  if (!Number.isFinite(total)) return false;
  return Math.abs(total - target) / target <= band;
}

/**
 * The days each nutrition badge counts, joining a day's intake totals
 * against the target snapshot kept for that day (`dailyNutrition/{date}`)
 * and its water doc. A day with no snapshot is judged against nothing.
 *
 * @param {Map<string,{protein:number,carbs:number,fat:number}>} mealTotalsByDay
 * @param {Map<string,{protein:number,carbs:number,fat:number}>} targetsByDay
 * @param {Map<string,{ml:number,target:number}>} waterByDay
 */
function nutritionBadgeDays(mealTotalsByDay, targetsByDay, waterByDay) {
  const macroMasterDays = [];
  const proteinHitDays = [];
  for (const [date, totals] of mealTotalsByDay) {
    const target = targetsByDay.get(date);
    if (!target) continue;
    // Protein is a floor: meeting or passing it.
    if (target.protein > 0 && totals.protein >= target.protein) {
      proteinHitDays.push(date);
    }
    if (
      withinBand(totals.protein, target.protein, MACRO_TARGET_BAND) &&
      withinBand(totals.carbs, target.carbs, MACRO_TARGET_BAND) &&
      withinBand(totals.fat, target.fat, MACRO_TARGET_BAND)
    ) {
      macroMasterDays.push(date);
    }
  }
  const waterHitDays = [];
  for (const [date, w] of waterByDay) {
    if (w.target > 0 && w.ml >= w.target) waterHitDays.push(date);
  }
  return { macroMasterDays, proteinHitDays, waterHitDays };
}

/**
 * The nutrition badges some judged days qualify for. `triple_threat` is
 * one day that hit every macro and has both a lift and a run on it.
 */
function nutritionBadges(days, liftDays, runDays) {
  const { macroMasterDays = [], proteinHitDays = [], waterHitDays = [] } =
    days || {};
  const ids = [];
  if (macroMasterDays.length > 0) ids.push("macro_master");
  if (maxConsecutiveDayRun(proteinHitDays) >= NUTRITION_STREAK_DAYS)
    ids.push("protein_pro");
  if (maxConsecutiveDayRun(waterHitDays) >= NUTRITION_STREAK_DAYS)
    ids.push("hydration_hero");
  const lifts = dayKeySet(liftDays);
  const runs = dayKeySet(runDays);
  if (macroMasterDays.some((d) => lifts.has(d) && runs.has(d)))
    ids.push("triple_threat");
  return ids;
}

/** A water doc's millilitres: `ml`, or the legacy glasses at 250 ml each.
 *  Mirror of `resolveConsumedMl` (src/lib/waterUnits.ts). */
const GLASS_ML = 250;
const DEFAULT_WATER_TARGET_ML = 2000;

function clampMl(ml) {
  if (!Number.isFinite(ml) || ml <= 0) return 0;
  return Math.round(ml);
}

function waterConsumedMl(raw) {
  const r = raw || {};
  if (typeof r.ml === "number" && Number.isFinite(r.ml)) return clampMl(r.ml);
  if (typeof r.glasses === "number" && Number.isFinite(r.glasses))
    return clampMl(r.glasses * GLASS_ML);
  return 0;
}

/** A water doc's target: `targetMl`, the legacy glasses, then 2 L. Mirror
 *  of `resolveTargetMl`. */
function waterTargetMl(raw) {
  const r = raw || {};
  if (typeof r.targetMl === "number" && Number.isFinite(r.targetMl) && r.targetMl > 0)
    return clampMl(r.targetMl);
  const glasses =
    (typeof r.targetGlasses === "number" ? r.targetGlasses : undefined) ??
    (typeof r.targetWaterGlasses === "number" ? r.targetWaterGlasses : undefined);
  if (typeof glasses === "number" && Number.isFinite(glasses) && glasses > 0)
    return clampMl(glasses * GLASS_ML);
  return DEFAULT_WATER_TARGET_ML;
}

/** "Log before 07:00 for 5 days": distinct days, not in a row. */
const EARLY_HOUR = 7;
const EARLY_BIRD_DAYS = 5;

/**
 * The person's local day of a log made before 07:00 where they are, or
 * null. Their timezone is the one the app captures on boot
 * (`users/{uid}.timezone`); without one there is no honest local hour.
 */
function earlyDayOf(atMs, timezone) {
  if (!timezone || !Number.isFinite(atMs)) return null;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
      })
        .formatToParts(new Date(atMs))
        .map((p) => [p.type, p.value])
    );
    if (Number(parts.hour) >= EARLY_HOUR) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
}

/** The early days to keep: distinct, earliest first, up to the five the
 *  badge needs, so a full list never changes again. */
function keptEarlyDays(...sources) {
  const days = new Set();
  for (const source of sources) for (const day of dayKeySet(source)) days.add(day);
  return Array.from(days).sort().slice(0, EARLY_BIRD_DAYS);
}

function earlyBirdBadges(days) {
  return dayKeySet(days).size >= EARLY_BIRD_DAYS ? ["early_bird"] : [];
}

/** "Earn 15 badges": fifteen others, never counting itself. */
const ULTIMATE_ATHLETE_COUNT = 15;

function ultimateAthleteDue(earnedIds) {
  const others = new Set(earnedIds || []);
  others.delete("ultimate_athlete");
  return others.size >= ULTIMATE_ATHLETE_COUNT;
}

/** "Set a personal record": a saved workout carrying the new bests its
 *  session showed (`newBests`, written by the app's completion). */
function firstPrBadges(workout) {
  return Number(workout && workout.newBests) > 0 ? ["first_pr"] : [];
}

/** A cycle ends on its lighter week, every 4th trained week. Mirror of
 *  `generateWeekPrescription`'s deload week (weekPrescription.ts). */
const PROGRAMME_CYCLE_WEEKS = 4;

function isCycleEndWeek(week) {
  return Number.isInteger(week) && week > 0 && week % PROGRAMME_CYCLE_WEEKS === 0;
}

/**
 * "Finish a full programme cycle": the plan moved on from a cycle's last
 * week with every lift day of it done or skipped (the gate the app's
 * advance holds to, `shouldAdvanceWeek`) and at least one done, so a week
 * skipped from end to end finishes nothing. A calendar rollover past a
 * week left undone is not a finish.
 */
function programmeCompleteBadges(before, after) {
  const week = Number(before && before.weekNumber);
  if (!isCycleEndWeek(week)) return [];
  if (Number(after && after.weekNumber) !== week + 1) return [];
  const days = before.workouts;
  if (!Array.isArray(days) || days.length === 0) return [];
  if (!days.every((d) => d && (d.completed || d.skipped))) return [];
  return days.some((d) => d && d.completed) ? ["programme_complete"] : [];
}

module.exports = {
  BADGE_IDS,
  STREAK_BADGES,
  HYBRID_WINDOW_BADGES,
  MEAL_PREP_RUN_DAYS,
  MACRO_TARGET_BAND,
  NUTRITION_STREAK_DAYS,
  EARLY_HOUR,
  EARLY_BIRD_DAYS,
  ULTIMATE_ATHLETE_COUNT,
  PROGRAMME_CYCLE_WEEKS,
  addDays,
  streakBadges,
  hybridBadges,
  maxConsecutiveDayRun,
  mealPrepBadges,
  nutritionBadgeDays,
  nutritionBadges,
  waterConsumedMl,
  waterTargetMl,
  earlyDayOf,
  keptEarlyDays,
  earlyBirdBadges,
  ultimateAthleteDue,
  firstPrBadges,
  isCycleEndWeek,
  programmeCompleteBadges,
  runMilestoneBadges,
  lifetimeMilestoneBadges,
  liftWeightMilestoneBadges,
  RUN_DISTANCE_MILESTONES,
  SPEED_DEMON_PACE_SEC_PER_KM,
  SPEED_DEMON_MIN_METERS,
  LIFETIME_RUN_METERS_MILESTONE,
  LIFETIME_LIFT_VOLUME_KG_MILESTONE,
  COMPOUND_LIFT_IDS,
  LIFT_WEIGHT_MILESTONES,
};
