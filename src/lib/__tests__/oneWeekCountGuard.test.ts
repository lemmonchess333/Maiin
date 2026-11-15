/**
 * Every weekly count comes from one module (App1 Q14): a week's sessions
 * from `src/lib/trainingWeek.ts`, and what a food day is from
 * `src/lib/foodDay.ts`. This fails when a new counter is written anywhere
 * else.
 *
 * Before App1, six places counted a week's sessions, three supplied
 * "planned" and four decided what a food day was. Home said "Food logged
 * 5 of 7 days" for a week the weekly review called three days logged, the
 * Following feed's week card left out a run marked done by hand that
 * Home's week counted, and a weekly count kept in the daily-logs provider
 * had its own target (4 a week without one) and no reader at all.
 *
 * The checks are shapes, not a parse, so each allow-list says why its
 * file is not a counter, and each entry must still match (the
 * allow-list is honest), as `savedSessionsReaderGuard.test.ts` keeps its
 * own.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

const FILES = sourceFiles(srcRoot).map((file) => ({
  rel: relative(repoRoot, file).replaceAll("\\", "/"),
  src: readFileSync(file, "utf8"),
}));

const importsTrainingWeek = (src: string) =>
  /from\s+["'](?:@\/lib|\.)\/trainingWeek["']/.test(src);
const importsFoodDay = (src: string) =>
  /from\s+["'](?:@\/lib|\.)\/foodDay["']/.test(src);

/* ── Food days ─────────────────────────────────────────────────────── */

/** A figure compared with 800, either way round: the food-day line. */
const FOOD_DAY_LITERAL = /[<>]=?\s*800\b(?!\s*(?:ms|px))|\b800\s*[<>]/;

/** A file that names a count of days beside what a day held: its
 *  calories, or its meals (Home's week once counted a day with any meal). */
const DAY_COUNT_NAME =
  /\b(?:daysLogged|foodDays|mealDays|loggedDays|fullFoodDays|mealDaysLogged)\b/;
const CALORIES =
  /\btotalCalories\b|\.calories\b|\bcalories\b|\bmeals\b|\bmealCount\b/;

/** Files that name a day count beside meals and decide no food day. */
const DAY_COUNT_ALLOWLIST: Record<string, string> = {
  "src/lib/foodDay.ts": "the rule itself",
  "src/hooks/useWeeklyReview.ts":
    "totals each day's calories for the review's view model, which decides",
  "src/hooks/useLifetimeMealStats.ts":
    "reads the meals for lifetimeMealDays.ts, which decides",
  "src/components/home/WeekSummary.tsx": "draws weekSummary.ts's food days",
  "src/hooks/useDailyTargetsInRange.ts":
    "reads each day's calorie TARGET for foodDays.ts, which decides",
  "src/lib/foodWeek.ts":
    "Food's week strip: each day's ring against its target, not a count",
  "src/components/analytics/FoodDaysCard.tsx": "draws foodDays.ts's reading",
  "src/components/analytics/trendRows.ts":
    "words historyFigures.ts's days logged",
  "src/pages/History.tsx":
    "draws historyFigures.ts's and lifetimeMealDays.ts's days logged",
};

describe("a food day is decided in one place", () => {
  it("no file but foodDay.ts compares a figure with 800", () => {
    const offenders = FILES.filter(
      ({ rel, src }) =>
        rel !== "src/lib/foodDay.ts" && FOOD_DAY_LITERAL.test(src)
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "A food day is 800 kcal or more: use isFoodDay / FOOD_DAY_KCAL from " +
        "src/lib/foodDay.ts."
    ).toEqual([]);
  });

  it("the adaptive estimator's floor is read only where it is defined", () => {
    const offenders = FILES.filter(
      ({ rel, src }) =>
        rel !== "src/lib/adaptiveTdee.ts" &&
        /\bplausibilityFloorKcal\b/.test(src)
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "Its trusted day is a food day: read isFoodDay from src/lib/foodDay.ts."
    ).toEqual([]);
  });

  it("a file that counts days beside their meals uses the rule", () => {
    const offenders = FILES.filter(
      ({ rel, src }) =>
        !(rel in DAY_COUNT_ALLOWLIST) &&
        DAY_COUNT_NAME.test(src) &&
        CALORIES.test(src) &&
        !importsFoodDay(src)
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "Count food days with isFoodDay from src/lib/foodDay.ts, or add the " +
        "file to DAY_COUNT_ALLOWLIST with the reason it decides none."
    ).toEqual([]);
  });

  it("the allow-list is honest: each file still names a day count beside meals", () => {
    for (const rel of Object.keys(DAY_COUNT_ALLOWLIST)) {
      const file = FILES.find((f) => f.rel === rel);
      expect(file, `${rel} is allow-listed but gone; remove it.`).toBeTruthy();
      expect(
        DAY_COUNT_NAME.test(file!.src) && CALORIES.test(file!.src),
        `${rel} no longer names a day count beside meals; remove it.`
      ).toBe(true);
    }
  });
});

/* ── A week's sessions ─────────────────────────────────────────────── */

/** Reads saved sessions, through their readers or the hooks over them. */
const READS_SESSIONS =
  /\b(?:fetchSavedRuns|fetchSavedWorkouts|useSavedRuns|useSavedSessions|useWorkouts|useRunningStats)\s*\(/;
/** Works out a calendar week. */
const CALENDAR_WEEK =
  /\b(?:localWeekKey|startOfLocalWeek|weekDays|weekBounds)\s*\(|weekStartsOn:\s*1/;

/** Files that read sessions and work out a week, and count no week. */
const WEEK_READER_ALLOWLIST: Record<string, string> = {
  "src/hooks/useClaimMapForProgram.ts":
    "which planned run each saved run satisfies; the week bounds its read",
  "src/pages/TrainingPlan.tsx":
    "reads the week's lifts to mark the plan's days done",
  "src/pages/Program.tsx": "matches a saved lift to the plan day on screen",
};

/** A name for a count of a week's sessions. */
const WEEK_COUNT_NAME = /\b(?:runs|lifts|workouts|sessions)(?:This|In)Week\b/;

/** Files that name one and are not a count of the week's sessions. */
const WEEK_COUNT_NAME_ALLOWLIST: Record<string, string> = {
  "src/features/program/starterPlan.ts":
    "the starter's stage counts run DAYS, its progression rule",
  "src/features/program/starterProgress.ts":
    "the starter's stage counts run DAYS, its progression rule",
  "src/components/program/StarterGoalCard.tsx":
    "draws starterProgress.ts's run days",
};

describe("a week's sessions are counted in one place", () => {
  it("a file that reads sessions and works out a week counts through trainingWeek.ts", () => {
    const offenders = FILES.filter(
      ({ rel, src }) =>
        rel !== "src/lib/trainingWeek.ts" &&
        !(rel in WEEK_READER_ALLOWLIST) &&
        READS_SESSIONS.test(src) &&
        CALENDAR_WEEK.test(src) &&
        !importsTrainingWeek(src)
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "Count a week's sessions with trainingWeek / weekDone / " +
        "weekRunsThatCount from src/lib/trainingWeek.ts, or add the file to " +
        "WEEK_READER_ALLOWLIST with the reason it counts no week."
    ).toEqual([]);
  });

  it("no file but trainingWeek.ts names a count of a week's sessions", () => {
    const offenders = FILES.filter(
      ({ rel, src }) =>
        rel !== "src/lib/trainingWeek.ts" &&
        !(rel in WEEK_COUNT_NAME_ALLOWLIST) &&
        WEEK_COUNT_NAME.test(src)
    ).map(({ rel }) => rel);
    expect(
      offenders,
      "A week's sessions are counted by src/lib/trainingWeek.ts."
    ).toEqual([]);
  });

  it("the allow-lists are honest: each file still matches", () => {
    for (const rel of Object.keys(WEEK_READER_ALLOWLIST)) {
      const file = FILES.find((f) => f.rel === rel);
      expect(file, `${rel} is allow-listed but gone; remove it.`).toBeTruthy();
      expect(
        READS_SESSIONS.test(file!.src) &&
          CALENDAR_WEEK.test(file!.src) &&
          !importsTrainingWeek(file!.src),
        `${rel} no longer needs its place on WEEK_READER_ALLOWLIST; remove it.`
      ).toBe(true);
    }
    for (const rel of Object.keys(WEEK_COUNT_NAME_ALLOWLIST)) {
      const file = FILES.find((f) => f.rel === rel);
      expect(file, `${rel} is allow-listed but gone; remove it.`).toBeTruthy();
      expect(
        WEEK_COUNT_NAME.test(file!.src),
        `${rel} no longer names a week count; remove it.`
      ).toBe(true);
    }
  });
});
