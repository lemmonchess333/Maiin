#!/usr/bin/env node
/**
 * Visual-audit seed — supplements seed-e2e-user.ts + seed-rich-user.ts so
 * EVERY audited surface renders its rich state:
 *   - hybrid profile (lift + run) with an active RACE plan → Programme page
 *     race cockpit, week strip, run cards all render
 *   - programState/current with lift workouts + this week's runDays
 *   - 3 proper meals TODAY (correct Meal shape: foodName + totals) + 3 food
 *     favourites → Food page + pantry typeahead render
 *   - bodyweight logs → trend surfaces render
 *   - one completed run with a real GPS trail → RunSummary / RunDetail map
 *
 * Run AFTER the two existing seeds, against the emulators only (the shared
 * assertEmulatorEnvOrExit gate refuses anything else).
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";

assertEmulatorEnvOrExit();

const EMAIL = "e2e-test@tropos.test";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "adaptive-fitness-af8bb";
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

/* Local-date helpers mirroring src/lib/dateHelpers (Sunday-start week). */
const pad = (n: number) => String(n).padStart(2, "0");
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const today = new Date();
const sunday = addDays(today, -today.getDay());
const weekKey = ymdLocal(sunday);

function exercise(
  name: string,
  exerciseId: string,
  movementCategory: string,
  sets = 3,
  reps = 8,
  weight = 60
) {
  return {
    name,
    exerciseId,
    movementCategory,
    sets,
    reps,
    weight,
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
}

async function main() {
  const user = await auth.getUserByEmail(EMAIL);
  const uid = user.uid;
  const base = db.collection("users").doc(uid);
  const raceDate = ymdLocal(addDays(today, 35));

  // ── Profile: hybrid + active race goal (mirrors the programState). ──
  await base.set(
    {
      athleteType: "Hybrid",
      primaryGoal: "hypertrophy",
      weeklyWorkoutsTarget: 3,
      weeklyRunsTarget: 3,
      weeklyRunDaysTarget: 3,
      runMode: "race_prep",
      raceGoal: { distance: "10k", targetDate: raceDate },
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "run" },
        { day: 3, type: "lift" },
        { day: 4, type: "run" },
        { day: 5, type: "both" },
        { day: 6, type: "rest" },
      ],
      lastActiveAt: Timestamp.now(),
    },
    { merge: true }
  );

  // ── programState/current: lift programme + this week's race-prep runs. ──
  const runDayDefs = [
    { dayIndex: 2, templateId: "easy_30", type: "easy" },
    { dayIndex: 4, templateId: "tempo_20", type: "tempo" },
    { dayIndex: 5, templateId: "long_10k", type: "long" },
  ];
  await base
    .collection("programState")
    .doc("current")
    .set({
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 2,
      splitType: "upper_lower",
      primaryGoal: "hypertrophy",
      fatigueScore: 0,
      updatedAt: Date.now(),
      programSchemaVersion: 2,
      workouts: [
        {
          dayName: "Upper A",
          dayType: "lift",
          completed: false,
          exercises: [
            exercise("Bench Press", "bench_press", "horizontal_push", 4, 8, 70),
            exercise("Barbell Row", "barbell_row", "horizontal_pull", 4, 8, 65),
            exercise(
              "Overhead Press",
              "overhead_press",
              "vertical_push",
              3,
              10,
              40
            ),
          ],
        },
        {
          dayName: "Lower A",
          dayType: "lift",
          completed: false,
          exercises: [
            exercise("Back Squat", "back_squat", "knee_dominant", 4, 6, 100),
            exercise(
              "Romanian Deadlift",
              "romanian_deadlift",
              "hip_dominant",
              3,
              10,
              80
            ),
          ],
        },
        {
          dayName: "Upper B",
          dayType: "lift",
          completed: false,
          exercises: [
            exercise(
              "Incline DB Press",
              "incline_db_press",
              "horizontal_push",
              3,
              10,
              26
            ),
            exercise(
              "Lat Pulldown",
              "lat_pulldown",
              "vertical_pull",
              3,
              12,
              55
            ),
          ],
        },
      ],
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: raceDate },
        totalWeeks: 8,
        currentWeek: 3,
      },
      runDays: runDayDefs.map((rd, i) => ({
        id: `audit-rd-${i}`,
        weekKey,
        date: ymdLocal(addDays(sunday, rd.dayIndex)),
        dayIndex: rd.dayIndex,
        templateId: rd.templateId,
        type: rd.type,
        completed: false,
        status: "planned",
      })),
    });

  // ── Meals TODAY in the CORRECT Meal shape (the rich seed's items-only
  //    docs lack foodName/totals and render empty). ──
  const meals: [string, string, number, number, number, number][] = [
    ["Oats & blueberries", "breakfast", 420, 14, 68, 9],
    ["Chicken burrito bowl", "lunch", 680, 48, 72, 18],
    ["Greek yogurt + honey", "snacks", 210, 18, 24, 5],
  ];
  for (const [foodName, slot, cals, p, c, f] of meals) {
    await base
      .collection("meals")
      .doc(`audit-${slot}`)
      .set({
        date: ymdLocal(today),
        foodName,
        meal: slot,
        items: [
          { name: foodName, calories: cals, protein: p, carbs: c, fat: f },
        ],
        totalCalories: cals,
        totalProtein: p,
        totalCarbs: c,
        totalFat: f,
        confidence: "high",
        createdAt: Timestamp.now(),
      });
  }

  // ── Food favourites (drives the pantry typeahead — "pi" → Pizza slice). ──
  const favs: [string, number, number, number, number, string][] = [
    ["Pizza slice", 285, 12, 36, 10, "1 slice"],
    ["Protein shake", 180, 32, 8, 3, "1 scoop + milk"],
    ["Banana", 105, 1, 27, 0, "1 medium"],
  ];
  for (const [name, cals, p, c, f, serving] of favs) {
    await base
      .collection("foodFavourites")
      .doc(`audit-${name.toLowerCase().replace(/\W+/g, "-")}`)
      .set({
        name,
        calories: cals,
        protein: p,
        carbs: c,
        fat: f,
        servingSize: serving,
        lastUsed: Timestamp.now(),
        useCount: 5,
        timeOfDay: "any",
        source: "manual",
      });
  }

  // ── Bodyweight logs: 10 over 30 days, gentle downtrend. ──
  for (let i = 0; i < 10; i++) {
    const d = addDays(today, -i * 3);
    await base
      .collection("bodyweightLogs")
      .doc(ymdLocal(d))
      .set({ date: ymdLocal(d), weight: +(70 - (9 - i) * 0.15).toFixed(1) });
  }

  // ── One completed run with a REAL GPS trail (40 points along a loop)
  //    so RunSummary / RunDetail render an actual route map. ──
  const pts: { lat: number; lon: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    pts.push({
      lat: +(51.5074 + Math.sin(t) * 0.004).toFixed(6),
      lon: +(-0.1278 + Math.cos(t) * 0.006).toFixed(6),
    });
  }
  await base
    .collection("runs")
    .doc("audit-gps")
    .set({
      distance: 6200,
      duration: 2170,
      avgPace: 350,
      elevationGain: 42,
      calories: 380,
      activityType: "freerun",
      date: ymdLocal(addDays(today, -1)),
      completedAt: Timestamp.fromDate(addDays(today, -1)),
      points: pts,
    });

  console.log(
    `[seed-visual-audit] ${uid}: hybrid profile + race plan, programState, 3 meals, 3 favourites, 10 bodyweight logs, GPS run written.`
  );
}

main().catch((e) => {
  console.error("[seed-visual-audit] failed:", e);
  process.exit(1);
});
