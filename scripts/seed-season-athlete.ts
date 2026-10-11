#!/usr/bin/env node
/**
 * A season of training for one athlete, written the way the app writes
 * it, so Analytics can be judged against a user who has used the app for
 * sixteen weeks rather than one who logged a single session yesterday.
 *
 * The rich seed (seed-rich-user.ts) exists for the other surfaces and is
 * thin exactly where Analytics is thick: five days of food, runs with no
 * splits and no local date, no weigh-ins at all, and performance documents
 * keyed by WEEK when production writes one per compute DAY. Every one of
 * those gaps hid a defect: the Performance card compared today with
 * yesterday and called it last week, and the Body page showed a goal the
 * user never set, and neither could be seen on a fixture that did not
 * have the shape.
 *
 * What this account has, all dated back from the day it runs:
 *   - three lifting sessions a week (push, pull, legs) over sixteen weeks,
 *     with progressive overload, a deload in week 8, and a squat that
 *     stalls for the last four weeks;
 *   - three runs a week: an easy run, a tempo or intervals session, and a
 *     long run that grows from 10 to 18 km, with per-km splits computed
 *     by the app's own `calculateSplits` over a generated GPS trace, and
 *     a 10K race in week 12;
 *   - weigh-ins on most mornings, trending from 86 kg toward the 78 kg
 *     goal the profile sets at 0.4 kg a week;
 *   - food on most days, higher at weekends, with the day's targets
 *     snapshotted as the app does;
 *   - a performance document for each of the last 42 days, scored by the
 *     real engine from these sessions' own aggregates.
 *
 * Deterministic: a seeded generator, so two runs write the same account
 * and captures stay comparable. Idempotent: fixed document ids.
 *
 *   GCLOUD_PROJECT=demo-tropos npm run seed:season
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type WriteBatch,
} from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";
import { mulberry32 } from "../src/test/prng";
import { computePerformanceIndex } from "../src/lib/performanceEngine";
import { localDateString } from "../src/lib/dateHelpers";
import {
  calculateSplits,
  totalDistance,
  totalElevationGain,
  type GPSPoint,
} from "../src/lib/gps";
import { vdotFromRace } from "../src/lib/runPaces";
import { inferMovementCategory } from "../src/lib/exerciseMovementCategory";
import type {
  PerformanceSignals,
  WeeklyAggregates,
} from "../src/lib/performanceTypes";

assertEmulatorEnvOrExit();

export const SEASON_USER = {
  email: "season-athlete@tropos.test",
  password: "test-password-123",
  displayName: "Sam Rivera",
} as const;

const PROJECT_ID = process.env.GCLOUD_PROJECT || "adaptive-fitness-af8bb";
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

const WEEKS = 16;
const DAYS = WEEKS * 7;

/* ── Deterministic randomness ─────────────────────────────────────── */

/* The repo's one seeded generator; it draws the same sequence the inline
   copy this replaced did (checked over 2 million draws per seed). */
const rand = mulberry32(20260928);
const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
const noise = (spread: number) => (rand() - 0.5) * 2 * spread;

/* ── Dates ────────────────────────────────────────────────────────── */

/** Local midnight `n` days before today. */
function daysAgo(n: number, hour = 0, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}
const keyOf = (d: Date) => localDateString(d);
/** Monday = 0 … Sunday = 6, for the local day `n` days ago. */
const weekdayOf = (n: number) => (daysAgo(n).getDay() + 6) % 7;

/* ── Lifting ──────────────────────────────────────────────────────── */

interface LiftPlan {
  id: string;
  name: string;
  sets: number;
  reps: number;
  /** Working weight in week `w` (0 = first week). */
  kg: (w: number) => number;
}

const roundTo = (kg: number, step: number) => Math.round(kg / step) * step;
const DELOAD_WEEK = 7; // week 8, counted from 0
const deload = (w: number, kg: number) =>
  w === DELOAD_WEEK ? roundTo(kg * 0.8, 2.5) : kg;

const PUSH: LiftPlan[] = [
  {
    id: "bench-press",
    name: "Bench Press",
    sets: 4,
    reps: 6,
    kg: (w) => deload(w, roundTo(70 + w * 0.85, 2.5)),
  },
  {
    id: "overhead-press",
    name: "Overhead Press",
    sets: 3,
    reps: 8,
    kg: (w) => deload(w, roundTo(40 + w * 0.35, 2.5)),
  },
  {
    id: "incline-db-press",
    name: "Incline Dumbbell Press",
    sets: 3,
    reps: 10,
    kg: (w) => deload(w, roundTo(24 + w * 0.3, 2)),
  },
  {
    id: "lateral-raise",
    name: "Lateral Raise",
    sets: 3,
    reps: 15,
    kg: (w) => deload(w, roundTo(8 + w * 0.12, 1)),
  },
];

const PULL: LiftPlan[] = [
  {
    id: "deadlift",
    name: "Deadlift",
    sets: 3,
    reps: 5,
    kg: (w) => deload(w, roundTo(120 + w * 1.6, 2.5)),
  },
  {
    id: "barbell-row",
    name: "Barbell Row",
    sets: 4,
    reps: 8,
    kg: (w) => deload(w, roundTo(60 + w * 0.7, 2.5)),
  },
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    sets: 3,
    reps: 10,
    kg: (w) => deload(w, roundTo(55 + w * 0.6, 2.5)),
  },
  {
    id: "face-pulls",
    name: "Face Pulls",
    sets: 3,
    reps: 15,
    kg: (w) => deload(w, roundTo(20 + w * 0.2, 2.5)),
  },
  {
    id: "barbell-curl",
    name: "Barbell Curl",
    sets: 3,
    reps: 10,
    kg: (w) => deload(w, roundTo(25 + w * 0.3, 2.5)),
  },
];

const LEGS: LiftPlan[] = [
  {
    id: "squat",
    name: "Barbell Squat",
    sets: 4,
    reps: 5,
    // Climbs, then holds at 105 kg for the last four weeks: a stall.
    kg: (w) => deload(w, Math.min(105, roundTo(90 + w * 1.4, 2.5))),
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    sets: 3,
    reps: 8,
    kg: (w) => deload(w, roundTo(80 + w * 0.9, 2.5)),
  },
  {
    id: "leg-press",
    name: "Leg Press",
    sets: 3,
    reps: 12,
    kg: (w) => deload(w, roundTo(140 + w * 2.5, 5)),
  },
  {
    id: "seated-leg-curl",
    name: "Seated Leg Curl",
    sets: 3,
    reps: 12,
    kg: (w) => deload(w, roundTo(40 + w * 0.5, 2.5)),
  },
  {
    id: "calf-raise",
    name: "Calf Raise",
    sets: 3,
    reps: 15,
    kg: (w) => deload(w, roundTo(60 + w * 0.8, 5)),
  },
];

interface SeededWorkout {
  id: string;
  date: string;
  tonnage: number;
  hardSets: number;
  doc: Record<string, unknown>;
}

function buildWorkouts(): SeededWorkout[] {
  const out: SeededWorkout[] = [];
  const days: { weekday: number; plan: LiftPlan[]; name: string }[] = [
    { weekday: 0, plan: PUSH, name: "Push" },
    { weekday: 2, plan: PULL, name: "Pull" },
    { weekday: 4, plan: LEGS, name: "Legs" },
  ];
  for (let n = DAYS - 1; n >= 0; n--) {
    const day = days.find((d) => d.weekday === weekdayOf(n));
    if (!day) continue;
    const week = Math.floor((DAYS - 1 - n) / 7);
    // A skipped Friday in week 5, as happens.
    if (week === 5 && day.weekday === 4) continue;
    const date = daysAgo(n, 18, 10);
    const exercises = day.plan.map((lift) => {
      const kg = lift.kg(week);
      return {
        exerciseId: lift.id,
        exerciseName: lift.name,
        category: inferMovementCategory(lift.name, lift.id),
        caloriesBurned: 0,
        sets: Array.from({ length: lift.sets }, (_, s) => ({
          setNumber: s + 1,
          // The last set of a heavy lift sometimes falls a rep short.
          reps:
            s === lift.sets - 1 && lift.reps <= 6 && rand() < 0.3
              ? lift.reps - 1
              : lift.reps,
          weightKg: kg,
          type: "working",
          plannedReps: lift.reps,
          plannedWeightKg: kg,
        })),
      };
    });
    const tonnage = exercises.reduce(
      (t, e) => t + e.sets.reduce((s, x) => s + x.weightKg * x.reps, 0),
      0
    );
    const durationMinutes = Math.round(between(52, 68));
    const id = `season-w-${keyOf(date)}`;
    out.push({
      id,
      date: keyOf(date),
      tonnage,
      hardSets: exercises.length,
      doc: {
        date: keyOf(date),
        exercises,
        totalCalories: Math.round(durationMinutes * 6.5),
        durationMinutes,
        totalVolume: tonnage,
        notes: `${day.name} — Programme Week ${week + 1}`,
        createdAt: Timestamp.fromDate(date),
        source: "programme",
      },
    });
  }
  return out;
}

/* ── Running ──────────────────────────────────────────────────────── */

type RunKind = "easy" | "tempo" | "intervals" | "long" | "race";

interface SeededRun {
  id: string;
  date: string;
  km: number;
  kind: RunKind;
  doc: Record<string, unknown>;
}

/** Pace in s/km for each whole kilometre, plus the part-km remainder. */
function pacePlan(kind: RunKind, km: number, week: number): number[] {
  const fitter = week * 1.6; // a second and a half a kilometre, each week
  const kms = Math.ceil(km);
  return Array.from({ length: kms }, (_, i) => {
    switch (kind) {
      case "easy":
        return 372 - fitter + noise(6);
      case "long":
        // Settles in, then fades a little late on.
        return 380 - fitter + (i > kms * 0.7 ? 8 : 0) + noise(6);
      case "tempo":
        // Warm-up, three to four fast kilometres, cool-down.
        return i === 0 || i === kms - 1
          ? 375 - fitter + noise(5)
          : 312 - fitter * 0.8 + noise(4);
      case "intervals":
        return i === 0 || i === kms - 1
          ? 378 - fitter + noise(5)
          : (i % 2 === 1 ? 292 : 345) - fitter * 0.8 + noise(4);
      case "race":
        return 291 + noise(3) - (i === kms - 1 ? 6 : 0);
    }
  });
}

/**
 * A loop of `metres`, walked at the planned paces, as the GPS would.
 *
 * The loop wiggles, which makes it longer than a circle of the same
 * radius, so it is drawn once, measured, and drawn again at the radius
 * that makes its measured length the distance the run records. Without
 * that, the splits the app cuts from the trace ran four per cent short of
 * the run's own distance, and a 48:48 10K held a 46:43 best 10K.
 */
function tracePoints(
  metres: number,
  paces: number[],
  start: Date,
  centre: { lat: number; lon: number }
): GPSPoint[] {
  const first = loopPoints(
    metres,
    metres / (2 * Math.PI),
    paces,
    start,
    centre
  );
  const scale = metres / totalDistance(first);
  return loopPoints(
    metres,
    (metres / (2 * Math.PI)) * scale,
    paces,
    start,
    centre
  );
}

function loopPoints(
  metres: number,
  radius: number,
  paces: number[],
  start: Date,
  centre: { lat: number; lon: number }
): GPSPoint[] {
  const stepM = 25;
  const steps = Math.max(2, Math.round(metres / stepM));
  const latPerM = 1 / 111_320;
  const lonPerM = 1 / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  const points: GPSPoint[] = [];
  let t = start.getTime();
  for (let i = 0; i <= steps; i++) {
    const along = (i / steps) * metres;
    const angle = (along / metres) * 2 * Math.PI;
    const wiggle = 1 + 0.08 * Math.sin(angle * 5);
    const lat = centre.lat + radius * wiggle * Math.sin(angle) * latPerM;
    const lon = centre.lon + radius * wiggle * Math.cos(angle) * lonPerM;
    if (i > 0) {
      const km = Math.min(paces.length - 1, Math.floor((along - 1) / 1000));
      t += ((paces[km] * (metres / steps)) / 1000) * 1000;
    }
    points.push({
      lat,
      lon,
      altitude: 32 + 14 * Math.sin(angle * 3) + 6 * Math.sin(angle * 7),
      accuracy: 5,
      speed: null,
      timestamp: Math.round(t),
      rawLat: lat,
      rawLon: lon,
    });
  }
  return points;
}

function buildRuns(): SeededRun[] {
  const out: SeededRun[] = [];
  const centre = { lat: 51.4613, lon: -0.1156 };
  for (let n = DAYS - 1; n >= 0; n--) {
    const weekday = weekdayOf(n);
    const week = Math.floor((DAYS - 1 - n) / 7);
    let kind: RunKind | null = null;
    let km = 0;
    if (weekday === 1) {
      kind = "easy";
      km = Math.round(between(6, 8) * 10) / 10;
    } else if (weekday === 3) {
      kind = week % 2 === 0 ? "tempo" : "intervals";
      km = Math.round(between(7, 9) * 10) / 10;
    } else if (weekday === 5) {
      if (week === 11) {
        kind = "race";
        km = 10.05;
      } else {
        kind = "long";
        // 10 km building to 18, a cut-back every fourth week.
        const build = Math.min(18, 10 + week * 0.6);
        km = Math.round((week % 4 === 3 ? build * 0.75 : build) * 10) / 10;
      }
    }
    if (!kind) continue;
    // A missed easy run in the deload week.
    if (week === DELOAD_WEEK && kind === "easy") continue;

    const start = daysAgo(n, kind === "long" || kind === "race" ? 8 : 7, 5);
    const paces = pacePlan(kind, km, week);
    const metres = Math.round(km * 1000);
    const points = tracePoints(metres, paces, start, {
      lat: centre.lat + (week % 3) * 0.004,
      lon: centre.lon,
    });
    const splits = calculateSplits(points, 1000);
    const duration = Math.round(
      (points[points.length - 1].timestamp - points[0].timestamp) / 1000
    );
    const avgPace = Math.round(duration / (metres / 1000));
    const completedAt = new Date(points[points.length - 1].timestamp + 60_000);
    // The climb the app saves for a run it recorded (Run.tsx), measured on
    // the whole trace. Counting only rises of over 2 m between points read
    // 0 m for nearly every run: points are 25 m apart, and the trace rarely
    // rises 2 m in 25 m.
    const elevationGain = totalElevationGain(points);
    const id = `season-r-${keyOf(start)}`;
    out.push({
      id,
      date: keyOf(start),
      km: metres / 1000,
      kind,
      doc: {
        distance: metres,
        duration,
        avgPace,
        calories: Math.round((metres / 1000) * 64),
        elevationGain,
        points: points
          .filter((_, i) => i % 2 === 0 || i === points.length - 1)
          .map((p) => ({
            lat: p.lat,
            lon: p.lon,
            altitude: p.altitude,
            timestamp: p.timestamp,
          })),
        splits,
        startedAt: Timestamp.fromDate(start),
        completedAt: Timestamp.fromDate(completedAt),
        date: keyOf(start),
        notes: kind === "race" ? "Riverside 10K" : "",
        relativeEffort: null,
        paceVerdictTone: null,
        visibility: "followers",
        type: "run",
        activityType: kind,
        isInvalid: false,
        invalidReason: null,
        savedAnyway: false,
        routeQuality: {
          backgroundGapMs: 0,
          gapCount: 0,
          rejectedFixCount: 0,
          medianAccuracyM: 5,
          worstAccuracyM: 9,
          confidence: "good",
        },
        planMode: "freeform",
        planSource: "manual",
        offPlan: true,
      },
    });
  }
  return out;
}

/* ── Body weight ──────────────────────────────────────────────────── */

const START_KG = 86;
const WEEKLY_LOSS_KG = 0.26;

function buildWeighIns(): { date: string; weight: number }[] {
  const out: { date: string; weight: number }[] = [];
  for (let n = DAYS - 1; n >= 0; n--) {
    // Most mornings, not all.
    if (rand() < 0.14 && n > 0) continue;
    const weeksIn = (DAYS - 1 - n) / 7;
    const trend = START_KG - weeksIn * WEEKLY_LOSS_KG;
    const weekend = weekdayOf(n) >= 5 ? 0.35 : 0; // salt and a later dinner
    out.push({
      date: keyOf(daysAgo(n)),
      weight: Math.round((trend + weekend + noise(0.45)) * 10) / 10,
    });
  }
  return out;
}

/* ── Food ─────────────────────────────────────────────────────────── */

const TARGET = { calories: 2350, protein: 165, carbs: 240, fat: 70 };

const MEALS: { slot: string; hour: number; foods: [string, number][] }[] = [
  {
    slot: "breakfast",
    hour: 7,
    foods: [
      ["Oats, whey and berries", 540],
      ["Eggs on sourdough", 510],
      ["Greek yogurt and granola", 480],
    ],
  },
  {
    slot: "lunch",
    hour: 13,
    foods: [
      ["Chicken, rice and greens", 690],
      ["Tuna and bean salad", 610],
      ["Turkey wrap and fruit", 640],
    ],
  },
  {
    slot: "snacks",
    hour: 16,
    foods: [
      ["Protein shake and banana", 330],
      ["Cottage cheese and pineapple", 260],
      ["Rice cakes and peanut butter", 300],
    ],
  },
  {
    slot: "dinner",
    hour: 19,
    foods: [
      ["Salmon, potatoes and veg", 720],
      ["Beef chilli and rice", 780],
      ["Chicken stir-fry", 690],
    ],
  },
];

interface SeededMealDay {
  date: string;
  calories: number;
  protein: number;
  meals: { id: string; doc: Record<string, unknown> }[];
}

function buildMeals(): SeededMealDay[] {
  const out: SeededMealDay[] = [];
  for (let n = DAYS - 1; n >= 0; n--) {
    // Logged on most days; a lapse is likelier at weekends.
    const weekend = weekdayOf(n) >= 5;
    if (n > 0 && rand() < (weekend ? 0.22 : 0.08)) continue;
    const meals: { id: string; doc: Record<string, unknown> }[] = [];
    let calories = 0;
    let protein = 0;
    // Today is part-logged, as it would be at capture time.
    const slots = n === 0 ? MEALS.slice(0, 2) : MEALS;
    slots.forEach((meal, mi) => {
      const [name, base] = meal.foods[Math.floor(rand() * meal.foods.length)];
      const kcal =
        Math.round(
          (base + noise(60) + (weekend && meal.slot === "dinner" ? 380 : 0)) / 5
        ) * 5;
      const p = Math.round((kcal / 100) * between(6.4, 8.4));
      const f = Math.round((kcal * between(0.24, 0.32)) / 9);
      const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
      calories += kcal;
      protein += p;
      const at = daysAgo(n, meal.hour, 10 + mi * 3);
      meals.push({
        id: `season-m-${keyOf(at)}-${mi}`,
        doc: {
          date: keyOf(at),
          foodName: name,
          meal: meal.slot,
          totalCalories: kcal,
          totalProtein: p,
          totalCarbs: c,
          totalFat: f,
          items: [
            {
              name,
              portionSize: "1 serving",
              calories: kcal,
              protein: p,
              carbs: c,
              fat: f,
            },
          ],
          confidence: "manual",
          createdAt: Timestamp.fromDate(at),
        },
      });
    });
    out.push({ date: keyOf(daysAgo(n)), calories, protein, meals });
  }
  return out;
}

/* ── Performance, one document per compute day ────────────────────── */

function aggregatesFor(
  endN: number,
  workouts: SeededWorkout[],
  runs: SeededRun[],
  foodDays: SeededMealDay[],
  weighIns: { date: string; weight: number }[]
): WeeklyAggregates {
  const endKey = keyOf(daysAgo(endN));
  const startKey = keyOf(daysAgo(endN + 6));
  const prevStartKey = keyOf(daysAgo(endN + 13));
  const inWindow = (d: string) => d >= startKey && d <= endKey;
  const lifts = workouts.filter((w) => inWindow(w.date));
  const windowRuns = runs.filter((r) => inWindow(r.date));
  const food = foodDays.filter((f) => inWindow(f.date));
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return {
    weekKey: endKey,
    liftTonnage: Math.round(lifts.reduce((s, w) => s + w.tonnage, 0)),
    liftHardSets: lifts.reduce((s, w) => s + w.hardSets, 0),
    liftSessions: lifts.length,
    runKm: Math.round(windowRuns.reduce((s, r) => s + r.km, 0) * 10) / 10,
    runLongKm:
      Math.round(Math.max(0, ...windowRuns.map((r) => r.km)) * 10) / 10,
    runQualityCount: windowRuns.filter((r) =>
      ["tempo", "intervals", "race"].includes(r.kind)
    ).length,
    runSessions: windowRuns.length,
    mealDaysLogged: food.length,
    avgDailyCalories: food.length
      ? Math.round(food.reduce((s, f) => s + f.calories, 0) / food.length)
      : 0,
    avgDailyProtein: food.length
      ? Math.round(food.reduce((s, f) => s + f.protein, 0) / food.length)
      : 0,
    bwCurrent7dAvg: avg(
      weighIns.filter((w) => inWindow(w.date)).map((w) => w.weight)
    ),
    bwPrevious7dAvg: avg(
      weighIns
        .filter((w) => w.date >= prevStartKey && w.date < startKey)
        .map((w) => w.weight)
    ),
  };
}

function buildPerformance(
  workouts: SeededWorkout[],
  runs: SeededRun[],
  foodDays: SeededMealDay[],
  weighIns: { date: string; weight: number }[]
): { key: string; doc: Record<string, unknown> }[] {
  const profile = {
    goal: "cut",
    weeklyWorkoutsTarget: 3,
    targetCalories: TARGET.calories,
    targetProtein: TARGET.protein,
  };
  const out: { key: string; doc: Record<string, unknown> }[] = [];
  const piByN = new Map<number, number>();
  const sessionDates = [...workouts, ...runs].map((s) => s.date).sort();
  for (let n = 55; n >= 0; n--) {
    const current = aggregatesFor(n, workouts, runs, foodDays, weighIns);
    const prior = [1, 2, 3, 4].map((k) =>
      aggregatesFor(n + 7 * k, workouts, runs, foodDays, weighIns)
    );
    const doc = computePerformanceIndex(
      current,
      prior,
      profile,
      piByN.get(n + 7),
      piByN.get(n + 14)
    );
    piByN.set(n, doc.performanceIndex);
    if (n > 41) continue; // the older ones only feed the ones written
    const endKey = keyOf(daysAgo(n));
    const lastSession = sessionDates.filter((d) => d <= endKey).pop();
    const daysSince = lastSession
      ? Math.round(
          (daysAgo(n).getTime() -
            new Date(lastSession + "T00:00:00").getTime()) /
            86_400_000
        )
      : 99;
    const ratio = (a: number, b: number) =>
      b > 0 && a / b - 1 >= 0.05 ? Math.round((a / b - 1) * 100) / 100 : 0;
    const signals: PerformanceSignals = {
      bothLoadsStrong: doc.liftLoadScore >= 70 && doc.runLoadScore >= 70,
      liftAheadOfBaseline: ratio(current.liftTonnage, doc.baseline.liftTonnage),
      runAheadOfBaseline: ratio(current.runKm, doc.baseline.runKm),
      recoveryWeak: doc.recoveryScore < 50,
      adherenceWeak: doc.adherenceScore < 50,
      deloadFlag: doc.deloadRecommended,
      lifetimeWeeks: Math.min(
        4,
        prior.filter((p) => p.liftSessions + p.runSessions > 0).length
      ),
      daysSinceLastTraining: daysSince,
    };
    out.push({
      key: endKey,
      doc: {
        ...doc,
        weekKey: endKey,
        computedAt: daysAgo(n, 2, 10).toISOString(),
        signals,
      },
    });
  }
  return out;
}

/* ── Writing ──────────────────────────────────────────────────────── */

async function commitAll(
  writes: ((batch: WriteBatch) => void)[]
): Promise<void> {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => w(batch));
    await batch.commit();
  }
}

async function ensureUser(): Promise<string> {
  try {
    return (await auth.getUserByEmail(SEASON_USER.email)).uid;
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  const created = await auth.createUser({
    email: SEASON_USER.email,
    password: SEASON_USER.password,
    displayName: SEASON_USER.displayName,
    emailVerified: true,
  });
  return created.uid;
}

async function main() {
  const uid = await ensureUser();
  const base = db.collection("users").doc(uid);

  const workouts = buildWorkouts();
  const runs = buildRuns();
  const weighIns = buildWeighIns();
  const foodDays = buildMeals();
  const performance = buildPerformance(workouts, runs, foodDays, weighIns);
  const latestWeight = weighIns[weighIns.length - 1].weight;
  const race = runs.find((r) => r.kind === "race")!;
  const raceTime = race.doc.duration as number;

  await base.set(
    {
      uid,
      displayName: SEASON_USER.displayName,
      email: SEASON_USER.email,
      photoURL: null,
      athleteType: "Hybrid",
      onboardingComplete: true,
      subscriptionTier: "free",
      darkMode: false,
      preferredWeightUnit: "kg",
      preferredHeightUnit: "cm",
      preferredDistanceUnit: "km",
      weightKg: latestWeight,
      heightCm: 180,
      age: 33,
      sex: "male",
      activityLevel: "moderate",
      primaryGoal: "hypertrophy",
      experience: "intermediate",
      daysPerWeek: 3,
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 3,
      weeklyRunsTarget: 3,
      weeklyMealsTarget: 21,
      // In day order, Sunday first, as the app writes a week. `buildPlan`
      // refuses any other order and keeps a stored week whose counts are
      // unchanged, so saving a race goal in the Run plan editor failed
      // while this list started on Monday.
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "run" },
        { day: 3, type: "lift" },
        { day: 4, type: "run" },
        { day: 5, type: "lift" },
        { day: 6, type: "run" },
      ],
      weekScheduleVersion: 1,
      runMode: "freeform",
      // The user's own goal: 78 kg, losing 0.4 kg a week.
      goalWeightKg: 78,
      weeklyRateKg: -0.4,
      program: { goal: "cut", startWeight: START_KG, currentPhase: "base" },
      targetCalories: TARGET.calories,
      targetProtein: TARGET.protein,
      targetCarbs: TARGET.carbs,
      targetFat: TARGET.fat,
      adjustCaloriesForTraining: false,
      runFitness: {
        benchmark: { distanceM: 10050, timeS: raceTime },
        vdot: Math.round(vdotFromRace(10050, raceTime) * 10) / 10,
        source: "race",
        updatedAt: new Date(race.date + "T12:00:00").toISOString(),
      },
      currentStreak: 0,
      longestStreak: 0,
      lastLogDate: null,
    },
    { merge: true }
  );
  await base.collection("public").doc("profile").set(
    {
      uid,
      displayName: SEASON_USER.displayName,
      displayNameLower: SEASON_USER.displayName.toLowerCase(),
      photoURL: null,
      athleteType: "Hybrid",
      currentStreak: 0,
      longestStreak: 0,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const writes: ((batch: WriteBatch) => void)[] = [];
  for (const w of workouts)
    writes.push((b) => b.set(base.collection("workouts").doc(w.id), w.doc));
  for (const r of runs)
    writes.push((b) => b.set(base.collection("runs").doc(r.id), r.doc));
  for (const w of weighIns)
    writes.push((b) =>
      b.set(base.collection("bodyweightLogs").doc(w.date), {
        date: w.date,
        weight: w.weight,
        source: "manual",
        updatedAt: Timestamp.fromDate(new Date(w.date + "T07:30:00")),
      })
    );
  for (const day of foodDays) {
    for (const m of day.meals)
      writes.push((b) => b.set(base.collection("meals").doc(m.id), m.doc));
    writes.push((b) =>
      b.set(base.collection("dailyNutrition").doc(day.date), {
        date: day.date,
        targetCalories: TARGET.calories,
        targetProtein: TARGET.protein,
        targetCarbs: TARGET.carbs,
        targetFat: TARGET.fat,
        snappedAt: Timestamp.fromDate(new Date(day.date + "T06:00:00")),
      })
    );
  }
  for (const p of performance)
    writes.push((b) => b.set(base.collection("performance").doc(p.key), p.doc));
  await commitAll(writes);

  console.log(
    `[seed-season] ${SEASON_USER.email}: ${workouts.length} workouts, ` +
      `${runs.length} runs, ${weighIns.length} weigh-ins, ` +
      `${foodDays.length} food days, ${performance.length} performance days`
  );
}

main().catch((err) => {
  console.error("[seed-season] Failed:", err);
  process.exit(1);
});
