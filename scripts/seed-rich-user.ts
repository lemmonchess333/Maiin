#!/usr/bin/env node
/**
 * Rich-data seed for the E2E user — complements seed-e2e-user.ts (which
 * provisions a *cold-start* user) by populating the activity collections
 * so the data-heavy surfaces actually render: History (Analytics charts +
 * PRs), Home performance, Food (logged meals), run history.
 *
 * The plain QA walk only ever sees cold-start state; this unlocks the
 * "rich" column of the scenario matrix (see QA-SCENARIO-GOAL.md).
 *
 * Idempotent: writes use deterministic doc ids so re-runs overwrite
 * rather than duplicate.
 *
 * Operator setup (same as seed-e2e-user.ts):
 *   firebase emulators:start --only auth,firestore
 *   export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   GCLOUD_PROJECT=demo-tropos npm run seed:rich
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";
import {
  computePerformanceIndex,
  getWeekKey,
} from "../src/lib/performanceEngine";
import { vdotFromRace } from "../src/lib/runPaces";
import type {
  WeeklyAggregates,
  PerformanceSignals,
} from "../src/lib/performanceTypes";

assertEmulatorEnvOrExit();

const EMAIL = "e2e-test@tropos.test";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "adaptive-fitness-af8bb";
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const user = await auth.getUserByEmail(EMAIL);
  const uid = user.uid;
  const base = db.collection("users").doc(uid);

  // ── Profile overlay: promote the cold-start seed user to a *mature*
  //    profile. seed-e2e deliberately omits age/sex (drives the cold-start
  //    "Personalise your calorie targets" nag); a rich/alive user has them,
  //    so merge them in here. Keeps seed-e2e as the pure cold-start fixture. ──
  await base.set(
    {
      age: 31,
      sex: "male",
      // Adaptive-paces benchmark matching the best seeded run below (6 km at
      // 324 s/km) — lights up the Analytics Race Predictions card and the
      // personalized session paces without waiting for the client-side
      // auto-derive (which only fires on a Programme-page visit).
      runFitness: {
        benchmark: { distanceM: 6000, timeS: 1944 },
        vdot: Math.round(vdotFromRace(6000, 1944) * 10) / 10,
        source: "derived",
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );

  // ── Workouts: 12 sessions over ~8 weeks, bench progressing 60→82.5kg
  //    (drives lifting volume charts + a Bench Press PR ladder). ──
  const lifts = [
    { id: "bench-press", name: "Bench Press", cat: "push" },
    { id: "barbell-row", name: "Barbell Row", cat: "pull" },
    { id: "back-squat", name: "Back Squat", cat: "legs" },
  ];
  let wIdx = 0;
  for (let wk = 8; wk >= 0; wk--) {
    for (const dayOffset of [wk * 7 + 5, wk * 7 + 2]) {
      const benchWeight = 60 + (8 - wk) * 2.5; // progressive → PRs
      const d = day(dayOffset);
      const exercises = lifts.map((l, i) => ({
        exerciseId: l.id,
        exerciseName: l.name,
        category: l.cat,
        caloriesBurned: 0,
        sets: Array.from({ length: 4 }, (_, s) => ({
          setNumber: s + 1,
          reps: 8,
          weightKg: l.id === "bench-press" ? benchWeight : 50 + i * 10,
        })),
      }));
      const tonnage = exercises.reduce(
        (t, e) => t + e.sets.reduce((s, x) => s + x.weightKg * x.reps, 0),
        0
      );
      await base
        .collection("workouts")
        .doc(`rich-w${wIdx}`)
        .set({
          date: ymd(d),
          exercises,
          totalCalories: 320,
          durationMinutes: 48,
          notes: `Seeded session ${wIdx + 1}`,
          source: "programme",
          createdAt: Timestamp.fromDate(d),
          tonnageKg: tonnage,
        });
      wIdx++;
    }
  }

  // ── Runs: 10 runs over ~6 weeks, varying distance + improving pace
  //    (drives run history, weekly distance, best-pace PRs). ──
  for (let i = 0; i < 10; i++) {
    const d = day(i * 4 + 1);
    const distanceKm = 5 + (i % 4); // 5–8 km
    // `distance` is stored in METRES — isVolumeEligible's floor is 50m,
    // so seeding km here (5–8) silently excludes every run from stats.
    const distanceM = distanceKm * 1000;
    const avgPace = 360 - i * 4; // sec/km, improving
    await base
      .collection("runs")
      .doc(`rich-r${i}`)
      .set({
        distance: distanceM,
        duration: Math.round(distanceKm * avgPace),
        avgPace,
        elevationGain: 30 + i * 5,
        calories: Math.round(distanceKm * 62),
        activityType: i % 3 === 0 ? "tempo" : "freerun",
        completedAt: Timestamp.fromDate(d),
        points: [
          { lat: 51.5 + i * 0.001, lon: -0.12 },
          { lat: 51.501 + i * 0.001, lon: -0.121 },
          { lat: 51.502 + i * 0.001, lon: -0.122 },
        ],
      });
  }

  // ── Meals: last 3 days × 4 meals (drives Food rich state + history). ──
  const mealPlan: [string, number, number, number, number][] = [
    ["Oats & berries", 420, 14, 68, 9],
    ["Chicken & rice", 650, 52, 70, 14],
    ["Greek yogurt", 180, 18, 12, 5],
    ["Salmon & veg", 540, 41, 22, 28],
  ];
  const slots = ["breakfast", "lunch", "snack", "dinner"];
  for (let dd = 0; dd < 3; dd++) {
    const d = day(dd);
    mealPlan.forEach((m, mi) => {
      base
        .collection("meals")
        .doc(`rich-m${dd}-${mi}`)
        .set({
          date: ymd(d),
          mealType: slots[mi],
          // Top-level total* fields are what the app sums (mealTotals.ts reads
          // `totalCalories ?? calories`, never items[].calories) — without
          // these Home's Today's Energy stays at 0 despite logged meals.
          totalCalories: m[1],
          totalProtein: m[2],
          totalCarbs: m[3],
          totalFat: m[4],
          items: [
            {
              name: m[0],
              calories: m[1],
              protein: m[2],
              carbs: m[3],
              fat: m[4],
            },
          ],
          createdAt: Timestamp.fromDate(d),
        });
    });
  }

  // ── Performance: 6 weekly rollup docs scored through the REAL engine
  //    (computePerformanceIndex), so the Home Performance hero card lights
  //    up with a truthful PI, load band, and week-over-week delta — not a
  //    hand-faked number. Aggregates trend gently upward (a healthy build);
  //    the engine derives the score, band, and deload flag from them. ──
  const profile = {
    goal: "recomp",
    weeklyWorkoutsTarget: 4,
    targetCalories: 2400,
    targetProtein: 150,
  };
  const NUM_PERF_WEEKS = 6;
  // weekKeys oldest→newest, anchored on the seeded activity window.
  const weekKeys: string[] = [];
  for (let i = NUM_PERF_WEEKS - 1; i >= 0; i--) {
    weekKeys.push(getWeekKey(day(i * 7)));
  }
  const priorAggs: WeeklyAggregates[] = [];
  let prevPI: number | undefined;
  for (let w = 0; w < weekKeys.length; w++) {
    const t = w / (weekKeys.length - 1); // 0→1 progression
    const agg: WeeklyAggregates = {
      weekKey: weekKeys[w],
      liftTonnage: Math.round(12000 + t * 4500),
      liftHardSets: 12 + Math.round(t * 4),
      liftSessions: 2,
      runKm: Math.round(18 + t * 9),
      runLongKm: Math.round(8 + t * 5),
      runQualityCount: 1,
      runSessions: 3,
      mealDaysLogged: 6,
      avgDailyCalories: 2380,
      avgDailyProtein: 152,
      bwCurrent7dAvg: 70.6 - t * 0.8,
      bwPrevious7dAvg: 70.9 - t * 0.8,
    };
    const doc = computePerformanceIndex(
      agg,
      priorAggs.slice(),
      profile,
      prevPI
    );
    const signals: PerformanceSignals = {
      bothLoadsStrong: doc.loadBand === "high" || doc.loadBand === "overreach",
      liftAheadOfBaseline: 0,
      runAheadOfBaseline: 0,
      recoveryWeak: false,
      adherenceWeak: false,
      deloadFlag: doc.deloadRecommended,
      lifetimeWeeks: w + 1, // ≥4 by the latest week → full-confidence card
      daysSinceLastTraining: 1,
    };
    await base
      .collection("performance")
      .doc(weekKeys[w])
      .set({ ...doc, signals });
    priorAggs.push(agg);
    prevPI = doc.performanceIndex;
  }

  console.log(
    `[seed-rich] ${uid}: ${wIdx} workouts, 10 runs, 12 meals, ` +
      `${weekKeys.length} performance weeks written.`
  );
}

main().catch((e) => {
  console.error("[seed-rich] failed:", e);
  process.exit(1);
});
