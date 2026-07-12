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
  // Field shape mirrors REAL app writes (Food.tsx performNLSave):
  // `foodName` (the diary groups/renders on it — docs without it all
  // collapse to one "Meal" row), `meal` with the app's valid slot
  // values ("snacks", not the legacy "mealType: snack"), and staggered
  // wall-clock times so the diary timeline orders like a real day.
  //
  // Two of today's meals carry a `photoUrl` so the diary timeline's
  // photo cards ("photos big, text compact") show up in design-review
  // captures. Production photoUrl is a Storage download URL (see
  // src/lib/foodPhotoUpload.ts); the emulator set here has no Storage,
  // so the seed uses a small inline-SVG plate illustration — clearly a
  // placeholder, but exercises the exact same render path.
  const FOOD_PHOTO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#3a2f28"/><stop offset="1" stop-color="#1d1a17"/>' +
      "</linearGradient></defs>" +
      '<rect width="640" height="440" fill="url(#g)"/>' +
      '<circle cx="320" cy="230" r="150" fill="#e8e2d9"/>' +
      '<circle cx="320" cy="230" r="132" fill="#f4efe7"/>' +
      '<ellipse cx="290" cy="215" rx="60" ry="38" fill="#d9884e"/>' +
      '<ellipse cx="360" cy="250" rx="52" ry="30" fill="#7da05b"/>' +
      '<ellipse cx="340" cy="195" rx="34" ry="22" fill="#b8563e"/>' +
      "</svg>"
  )}`;
  const slots = ["breakfast", "lunch", "snacks", "dinner"];
  const slotHours = [8, 13, 16, 19];
  for (let dd = 0; dd < 3; dd++) {
    mealPlan.forEach((m, mi) => {
      const at = day(dd);
      at.setHours(slotHours[mi], 10 + mi * 7, 0, 0);
      base
        .collection("meals")
        .doc(`rich-m${dd}-${mi}`)
        .set({
          date: ymd(at),
          foodName: m[0],
          meal: slots[mi],
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
          createdAt: Timestamp.fromDate(at),
          ...(dd === 0 && (mi === 1 || mi === 3)
            ? { photoUrl: FOOD_PHOTO_DATA_URI }
            : {}),
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

  // ── Public feed activities from a second author (Social uplift v1):
  //    without these the seeded user's Explore feed is empty and the
  //    social capture only ever shows the solo-first stack — the
  //    ActivityCard hero panels (route scene / muscle figure) are
  //    invisible to the screenshot channel. authorId needs no auth
  //    record (admin writes bypass rules; the card renders name +
  //    initials avatar straight off the doc). ──
  const feedAuthor = { authorId: "rich-feed-author", authorName: "Maya Chen" };
  const loop = (lat0: number, lon0: number, n = 36) =>
    Array.from({ length: n + 1 }, (_, i) => {
      // Open loop (0.15π → 1.85π) so the start ring and finish dot
      // don't sit on top of each other in the route scene.
      const t = 0.15 * Math.PI + (i / n) * 1.7 * Math.PI;
      return {
        lat: lat0 + 0.0045 * Math.sin(t) + 0.0009 * Math.sin(3 * t),
        lon: lon0 + 0.0065 * Math.cos(t) + 0.0012 * Math.sin(2 * t),
      };
    });
  const hoursAgo = (h: number) =>
    Timestamp.fromDate(new Date(Date.now() - h * 3600e3));
  const feedActivities: Record<string, Record<string, unknown>> = {
    "rich-feed-run": {
      ...feedAuthor,
      type: "run",
      visibility: "public",
      activityTitle: "Morning run",
      distance: 8240,
      avgPace: 318,
      duration: 2621,
      elevationGain: 64,
      routePreview: loop(51.5074, -0.1657),
      kudosCount: 3,
      commentCount: 1,
      createdAt: hoursAgo(3),
    },
    "rich-feed-push": {
      ...feedAuthor,
      type: "workout",
      visibility: "public",
      activityTitle: "Push day",
      muscleGroups: ["horizontal_push", "vertical_push", "arms_triceps"],
      exercises: [
        {
          name: "Bench Press",
          summary: "4×8 @ 65kg",
          setCount: 4,
          targetReps: 8,
          targetWeightKg: 65,
        },
        {
          name: "Overhead Press",
          summary: "3×10 @ 40kg",
          setCount: 3,
          targetReps: 10,
          targetWeightKg: 40,
        },
        {
          name: "Tricep Pushdown",
          summary: "3×12 @ 25kg",
          setCount: 3,
          targetReps: 12,
          targetWeightKg: 25,
        },
      ],
      totalVolume: 6420,
      exerciseCount: 5,
      prCount: 2,
      prHit: true,
      prExercise: "Bench Press",
      prWeight: 65,
      duration: 3480,
      kudosCount: 5,
      commentCount: 2,
      createdAt: hoursAgo(9),
    },
    "rich-feed-pull": {
      ...feedAuthor,
      type: "workout",
      visibility: "public",
      activityTitle: "Pull day",
      muscleGroups: ["vertical_pull", "horizontal_pull", "hip_dominant"],
      exercises: [
        {
          name: "Pull-Up",
          summary: "4×8 BW",
          setCount: 4,
          targetReps: 8,
          targetWeightKg: 0,
        },
        {
          name: "Barbell Row",
          summary: "4×10 @ 55kg",
          setCount: 4,
          targetReps: 10,
          targetWeightKg: 55,
        },
        {
          name: "Romanian Deadlift",
          summary: "3×10 @ 80kg",
          setCount: 3,
          targetReps: 10,
          targetWeightKg: 80,
        },
      ],
      totalVolume: 7980,
      exerciseCount: 5,
      prCount: 0,
      duration: 3600,
      kudosCount: 2,
      commentCount: 0,
      createdAt: hoursAgo(26),
    },
    "rich-feed-hybrid": {
      ...feedAuthor,
      type: "workout",
      visibility: "public",
      activityTitle: "Brick session",
      distance: 5030,
      avgPace: 331,
      duration: 1665,
      routePreview: loop(51.5312, -0.1216, 28),
      muscleGroups: ["knee_dominant", "core"],
      exercises: [
        {
          name: "Goblet Squat",
          summary: "3×12 @ 24kg",
          setCount: 3,
          targetReps: 12,
          targetWeightKg: 24,
        },
        {
          name: "Plank",
          summary: "3×60s",
          setCount: 3,
          targetReps: 1,
          targetWeightKg: 0,
        },
      ],
      totalVolume: 1240,
      exerciseCount: 2,
      kudosCount: 1,
      commentCount: 0,
      createdAt: hoursAgo(50),
    },
  };
  for (const [id, docData] of Object.entries(feedActivities)) {
    await db.collection("activities").doc(id).set(docData);
  }
  // ── Challenge fixtures (Social uplift v2): the Crews-tab challenge
  //    cards were invisible to the screenshot channel (production
  //    challenges are materialised by the rolloverChallenges cron,
  //    which never runs against the emulator). One joined-with-
  //    progress km challenge (coral accent + tier ladder) and one
  //    available volume challenge (purple accent + Join CTA) cover
  //    both card states. ──
  const in3Weeks = Timestamp.fromDate(new Date(Date.now() + 21 * 86_400e3));
  const weekAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 86_400e3));
  await db
    .collection("challenges")
    .doc("seed-monthly-km")
    .set({
      name: "July Distance Club",
      description: "Run your way through the month — every eligible km counts.",
      metric: "total_km",
      icon: "footprints",
      tiers: { bronze: 20, silver: 40, gold: 75 },
      startDate: weekAgo,
      endDate: in3Weeks,
      participantCount: 128,
      season: "Summer",
    });
  await db
    .collection("challenges")
    .doc("seed-monthly-km")
    .collection("participants")
    .doc(uid)
    .set({
      currentValue: 26.4,
      tierAchieved: "bronze",
      joinedAt: weekAgo,
      displayName: "E2E Test",
      uid,
    });
  await db
    .collection("challenges")
    .doc("seed-monthly-volume")
    .set({
      name: "Tonnage Trials",
      description: "Stack total volume across every lift this month.",
      metric: "total_volume",
      icon: "trophy",
      tiers: { bronze: 20000, silver: 45000, gold: 80000 },
      startDate: weekAgo,
      endDate: in3Weeks,
      participantCount: 84,
    });

  // One follow relationship: Social's solo-first gate (isNewUser =
  // 0 follows + no crew) suppresses the activity list entirely, so
  // without this the seeded cards above never render on any sub-tab.
  // The rich user is by definition established — a 1-follow graph is
  // the honest fixture (Following stays locked until 3, Explore shows
  // the community cards).
  const followedAt = Timestamp.now();
  await db
    .collection("following")
    .doc(uid)
    .collection("users")
    .doc(feedAuthor.authorId)
    .set({ followedAt });
  await db
    .collection("followers")
    .doc(feedAuthor.authorId)
    .collection("users")
    .doc(uid)
    .set({ followedAt });

  // ── Community Spaces fixtures (Spc1 PR2): memberships + pinned
  //    Tropos Team intro posts so the Space pages and captures show
  //    the designed populated state (admin writes bypass rules; in
  //    prod the Team badge is gated on system/config.officialUids). ──
  const teamAuthor = { authorId: "tropos-team", authorName: "Tropos Team" };
  for (const sid of ["womens-running", "hybrid-training"]) {
    await db
      .collection("spaces")
      .doc(sid)
      .collection("members")
      .doc(uid)
      .set({ joinedAt: Timestamp.now() });
    await db
      .collection("spaces")
      .doc(sid)
      .collection("posts")
      .doc("seed-team-intro")
      .set({
        ...teamAuthor,
        title: "Introduce yourself!",
        body: "Welcome in — say hi, share what you're training for, and ask anything. Every athlete here started at zero.",
        official: true,
        pinned: true,
        likeCount: 4,
        commentCount: 2,
        createdAt: hoursAgo(30),
      });
  }
  await db
    .collection("spaces")
    .doc("womens-running")
    .collection("posts")
    .doc("seed-maya")
    .set({
      authorId: feedAuthor.authorId,
      authorName: feedAuthor.authorName,
      title: "6 weeks in!",
      body: "Started with a 30-minute jog, just finished my first 10K. Honestly surprised at the progress — half marathon next?",
      likeCount: 6,
      commentCount: 1,
      createdAt: hoursAgo(8),
    });

  console.log(
    `[seed-rich] ${uid}: ${wIdx} workouts, 10 runs, 12 meals, ` +
      `${weekKeys.length} performance weeks, ` +
      `${Object.keys(feedActivities).length} public feed activities written.`
  );
}

main().catch((e) => {
  console.error("[seed-rich] failed:", e);
  process.exit(1);
});
