/**
 * The verify skill's feature map: what a person can see and do in Tropos,
 * where it lives in the code, how to reach it and what it should show.
 *
 * It is the skill's guide and its rubric (the verification article's
 * "feature map"). `npm run verify:app -- --diff origin/main` maps a change's
 * files onto these features through `sources`, drives each one's `steps`
 * against the emulator rig, and leaves a screenshot per step for a reviewer
 * to hold against `expected`.
 *
 * Rules for an entry:
 * - Every step waits on something the person sees (a role and name, a
 *   label, a test id), never on a timer or on `networkidle`, which the
 *   Firebase SDK never reaches.
 * - Names come from `src/test/journeyScreens.ts` where it has them, so a
 *   renamed button fails a unit test there before it fails here.
 * - The anchors are the ones the capture specs already wait on in CI
 *   (`e2e/screenshots/*.capture.spec.ts`), against the same seed chain.
 * - A negative step (`absent`) comes after a positive one on the same
 *   screen, or it passes on a blank page (CODING_STANDARDS: an absence
 *   needs an anchor).
 * - Read-only: a feature never saves, posts, follows or deletes, so the
 *   features can run in any order against one seeded emulator.
 *
 * `featureMap.test.ts` holds every route to a `path=` in `src/App.tsx` and
 * every source glob to at least one file.
 */
import { HOME, TABS, TRAIN, WORKOUT } from "@/test/journeyScreens";
import type { Account } from "./rigConfig";

/** What a feature needs from the rig before it can run. */
export type Needs =
  /** The built app alone; no account. */
  | "signed-out"
  /** The seeded account, which needs the Firestore emulator. */
  | "signed-in";

type Name = string | RegExp;

/** How a step finds an element, in Playwright's own terms. */
export type Target =
  | {
      role:
        | "button"
        | "dialog"
        | "group"
        | "heading"
        | "link"
        | "list"
        | "navigation"
        | "radio"
        | "region";
      name?: Name;
      exact?: boolean;
      level?: number;
      /** A radio, checkbox or switch in this state (`aria-checked`). */
      checked?: boolean;
    }
  | { label: Name; exact?: boolean }
  | { text: Name; exact?: boolean }
  | { testId: string }
  | { css: string };

export type Step =
  /** Open a route under the app's base ("" is Home or the welcome). */
  | { goto: string }
  | { click: Target }
  | { fill: Target; value: string }
  /** Wait until the target is visible. */
  | { see: Target; timeoutMs?: number }
  /**
   * The target is not on the page, checked once, at once: it does not
   * wait. So it must follow a `see` on the same screen that proves the
   * screen has loaded, or it passes on a blank page
   * (`featureMap.test.ts` holds this).
   */
  | { absent: Target }
  /** Wait until the URL's path matches. */
  | { url: RegExp }
  /**
   * Close whatever opened over the screen (a badge seal, a sheet). Checks
   * once whether a dialog is open, so it must follow a `see` on something
   * only the loaded screen draws: before that, a dialog still on its way
   * is not there to close.
   */
  | { dismiss: true };

export interface Feature {
  id: string;
  title: string;
  needs: Needs;
  /** The seeded account a signed-in feature uses; `e2e` when unset. */
  account?: Account;
  /** Globs, from the repo root, of the code that draws this feature. */
  sources: string[];
  /** The route the feature starts on, as `App.tsx` writes it. */
  route: string;
  steps: Step[];
  /** What a reviewer should see in the last screenshot: the rubric. */
  expected: string;
}

/** The tab bar: drawn only inside the signed-in Layout. */
const mainNav: Target = { role: "navigation", name: TABS.navigation };

const settingsPage = (
  id: string,
  path: string,
  title: string,
  sources: string[],
  expected: string
): Feature => ({
  id,
  title: `Settings: ${title}`,
  needs: "signed-in",
  sources,
  route: `/settings/${path}`,
  steps: [
    { goto: `settings/${path}` },
    { see: { role: "heading", name: title, level: 1, exact: true } },
  ],
  expected,
});

export const FEATURES: Feature[] = [
  /* ── Signed out ─────────────────────────────────────────────── */
  {
    id: "welcome",
    title: "Welcome screen",
    needs: "signed-out",
    sources: [
      "src/pages/Login.tsx",
      "src/components/auth/**",
      "src/assets/welcome/**",
    ],
    route: "*",
    steps: [
      { goto: "" },
      {
        see: {
          role: "heading",
          name: "Your training and food, planned together",
        },
      },
      { see: { role: "button", name: "Get started", exact: true } },
      { see: { role: "button", name: "Sign in", exact: true } },
    ],
    expected:
      "A full-screen athlete photograph under the heading “Your training " +
      "and food, planned together”, with Get started and Sign in below it.",
  },
  {
    id: "sign-in-form",
    title: "Sign-in form",
    needs: "signed-out",
    sources: ["src/pages/Login.tsx", "src/components/auth/**"],
    route: "*",
    steps: [
      { goto: "" },
      { click: { role: "button", name: "Sign in", exact: true } },
      /* The two forms share their fields, so the heading and the submit
         button are what tell them apart: a Sign in that opened sign-up
         passed the fields alone (planted 2026-11-18). */
      { see: { role: "heading", name: "Welcome back", level: 1 } },
      { see: { css: "#login-email" } },
      { see: { css: "#login-password" } },
      { see: { css: 'button[type="submit"]' } },
      { absent: { role: "button", name: /create account/i } },
    ],
    expected:
      "The drawn lifter facing the reader, the email and password fields, " +
      "and a Sign in button; no error text before anything is typed.",
  },
  {
    id: "sign-up-form",
    title: "Sign-up form",
    needs: "signed-out",
    sources: ["src/pages/Login.tsx", "src/components/auth/**"],
    route: "*",
    steps: [
      { goto: "" },
      { click: { role: "button", name: "Get started", exact: true } },
      { see: { role: "heading", name: "Create your account", level: 1 } },
      { see: { css: "#login-email" } },
      { see: { role: "button", name: /create account/i } },
    ],
    expected:
      "The sign-up form: email, password and Create account, with the " +
      "Apple and Google buttons offered beside email.",
  },
  {
    id: "public-pages",
    title: "Privacy policy, terms and support, signed out",
    needs: "signed-out",
    sources: [
      "src/pages/PrivacyPolicy.tsx",
      "src/pages/TermsOfService.tsx",
      "src/pages/Support.tsx",
    ],
    route: "/privacy",
    steps: [
      { goto: "privacy" },
      { see: { role: "heading", name: "Privacy Policy", level: 1 } },
      { goto: "terms" },
      { see: { role: "heading", name: "Terms of Service", level: 1 } },
      { goto: "support" },
      { see: { role: "heading", name: "Support", level: 1, exact: true } },
    ],
    expected:
      "Each page readable without signing in: the policy and the terms " +
      "with their “Last updated” lines, and the support page (the App " +
      "Store's Support URL) with a way to get in touch.",
  },

  /* ── Home ───────────────────────────────────────────────────── */
  {
    id: "home",
    title: "Home: today's session and the day's cards",
    needs: "signed-in",
    sources: [
      "src/pages/Home.tsx",
      "src/components/home/**",
      "src/lib/todaySession.ts",
      "src/lib/homeHero.ts",
      "src/components/WeekPulse*.tsx",
    ],
    route: "/",
    /* seed-e2e-user.ts makes every day but tomorrow a lift day, and no
       seeded workout is dated today (seed-rich-user.ts: two and five days
       back each week), so today's hero is always an unstarted lift:
       Start workout inside "Today’s training" (Home.tsx, LiftCTACard). */
    steps: [
      { goto: "" },
      { see: mainNav },
      { see: { role: "button", name: /add water/i } },
      { dismiss: true },
      { see: { role: "group", name: "Today’s training", exact: true } },
      { see: { role: "button", name: WORKOUT.start, exact: true } },
      { see: { role: "heading", name: HOME.heading, level: 1 } },
    ],
    expected:
      "The date as a kicker, today's session as the hero with one Start, " +
      "the week card, then energy, water and weight. Nothing overlaps the " +
      "tab bar.",
  },
  {
    id: "home-week",
    title: "Home: the week strip",
    needs: "signed-in",
    sources: [
      "src/components/home/WeekStrip.tsx",
      "src/components/home/WeekSessions.tsx",
      "src/components/home/WeekSummary.tsx",
      "src/components/home/DayPeekCard.tsx",
      "src/lib/trainingWeek.ts",
      "src/lib/layOutWeek.ts",
    ],
    route: "/",
    steps: [
      { goto: "" },
      { see: mainNav },
      { see: { role: "group", name: /^Week of / } },
      { dismiss: true },
      { click: { role: "button", name: /\(today\)$/ } },
      { see: { role: "group", name: /^Week of / } },
    ],
    expected:
      "Seven equal day segments, today outlined and now selected, the " +
      "week's count of sessions above them and what it is made of below.",
  },

  /* ── Food ───────────────────────────────────────────────────── */
  {
    id: "food",
    title: "Food: the day's diary and the composer",
    needs: "signed-in",
    sources: [
      "src/pages/Food.tsx",
      "src/components/food/**",
      "src/components/nutrition/**",
      "src/lib/foodDay.ts",
      "src/lib/nlFoodParser.ts",
    ],
    route: "/food",
    steps: [
      { goto: "food" },
      { see: { role: "button", name: "Enter manually" } },
      { see: { label: "What did you eat" } },
      { see: mainNav },
    ],
    expected:
      "The calories wheel and macros for today, the composer (“What did " +
      "you eat”, the camera, Enter manually) and the diary's meals.",
  },
  {
    id: "food-manual",
    title: "Food: enter a meal by hand (opened, not saved)",
    needs: "signed-in",
    sources: [
      "src/components/ManualFoodLogger.tsx",
      "src/components/food/FoodComposerCard.tsx",
    ],
    route: "/food",
    steps: [
      { goto: "food" },
      { click: { role: "button", name: "Enter manually" } },
      { see: { role: "dialog" } },
      { see: { label: "Meal name" } },
    ],
    expected:
      "The manual entry sheet over Food with its name and calorie fields " +
      "empty; nothing saved.",
  },

  /* ── Train ──────────────────────────────────────────────────── */
  {
    id: "train-lift",
    title: "Train: the lift plan's day and Start workout",
    needs: "signed-in",
    sources: [
      "src/pages/Program.tsx",
      "src/components/program/**",
      "src/features/program/**",
    ],
    route: "/program",
    steps: [
      { goto: "program" },
      { see: { role: "heading", name: "Train", level: 1 } },
      { see: { role: "button", name: WORKOUT.start, exact: true } },
    ],
    expected:
      "Train on its Lift half: the day's exercises, each with sets, reps " +
      "and weight, and Start workout.",
  },
  {
    id: "train-run",
    title: "Train: the run week",
    needs: "signed-in",
    sources: [
      "src/pages/Program.tsx",
      "src/components/program/**",
      "src/features/program/runScheduler.ts",
      "src/lib/runProgrammeViewModel.ts",
    ],
    route: "/program",
    /* The Run radio is drawn on both halves, so it is the CHECKED one that
       proves ?tab=run was honoured, and "Run training" (the run half's
       own section, ProgrammeRunSection) that it drew: a freeform hero for
       the seeded lifter, the run week for a plan. */
    steps: [
      { goto: "program?tab=run" },
      { see: { role: "heading", name: "Train", level: 1 } },
      {
        see: { role: "radio", name: TRAIN.run, exact: true, checked: true },
      },
      { see: { role: "region", name: "Run training", exact: true } },
    ],
    expected:
      "Train on its Run half: the run week's days, today's run (or rest) " +
      "and the plan's line in the header.",
  },
  {
    id: "lift-session",
    title: "A lift session, opened and left unsaved",
    needs: "signed-in",
    sources: [
      "src/components/WorkoutSession.tsx",
      "src/components/workout/**",
      "src/components/session/**",
      "src/lib/liftCompletion.ts",
    ],
    route: "/program",
    steps: [
      { goto: "program" },
      { click: { role: "button", name: WORKOUT.start, exact: true } },
      { see: { role: "button", name: /^Complete / }, timeoutMs: 20_000 },
    ],
    expected:
      "The workout screen: the first exercise's sets with weight and reps, " +
      "a Complete control per set and the rest timer; nothing saved.",
  },
  {
    id: "plan-week",
    title: "Your plan: the combined training week",
    needs: "signed-in",
    sources: ["src/pages/TrainingPlan.tsx", "src/lib/layOutWeek.ts"],
    route: "/program/plan",
    steps: [
      { goto: "program/plan" },
      { see: { role: "heading", name: "Your plan", level: 1 } },
      /* Drawn once the programme has loaded (TrainingPlan.tsx). */
      { see: { role: "region", name: "This week’s plan", exact: true } },
    ],
    expected:
      "The week's lifts and runs laid out by day, with the next lift named.",
  },
  {
    id: "empty-workout",
    title: "Empty workout",
    needs: "signed-in",
    sources: [
      "src/pages/EmptyWorkout.tsx",
      "src/features/program/emptyWorkout.ts",
    ],
    route: "/empty-workout",
    steps: [
      { goto: "empty-workout" },
      { see: { role: "button", name: WORKOUT.addExercise } },
    ],
    expected: "A lift with no exercises yet and Add exercise.",
  },
  {
    id: "run-start",
    title: "Run: the start screen (no run recorded)",
    needs: "signed-in",
    sources: [
      "src/pages/Run.tsx",
      "src/components/run/**",
      "src/features/run/**",
      "src/hooks/useGPS.ts",
    ],
    route: "/run",
    steps: [
      { goto: "run" },
      {
        see: {
          role: "button",
          name: /free run|^start( run)?$/i,
        },
        timeoutMs: 20_000,
      },
    ],
    expected:
      "The full-screen run start, with no tab bar: the map or its " +
      "placeholder, the run's type and a Start; nothing recorded.",
  },

  /* ── Progress ───────────────────────────────────────────────── */
  {
    id: "progress",
    title: "Progress: the overview",
    needs: "signed-in",
    sources: [
      "src/pages/History.tsx",
      "src/components/analytics/**",
      "src/components/progress/**",
      "src/lib/historyFigures.ts",
      "src/lib/analytics.ts",
    ],
    route: "/history",
    steps: [
      { goto: "history" },
      { see: { role: "heading", name: "Progress", level: 1 } },
      { see: { role: "region", name: "Muscles trained" }, timeoutMs: 30_000 },
    ],
    expected:
      "Progress's overview with the range pills, the week's figures and " +
      "the muscles trained listed, past their skeletons.",
  },
  {
    id: "progress-pages",
    title: "Progress: the Lifting, Running, Body and Food pages",
    needs: "signed-in",
    /* The season athlete: the e2e account has no weigh-ins, no daily
       targets and no run with splits, so three of these pages would show
       their empty states. Each anchor is the one
       analytics.season.capture.spec.ts waits on, for the same reason:
       it draws only when the page's data is there. */
    account: "season",
    sources: [
      "src/pages/History.tsx",
      "src/components/analytics/**",
      "src/components/progress/**",
      "src/utils/weightTrend.ts",
      "src/utils/calorieBalance.ts",
    ],
    route: "/history",
    steps: [
      { goto: "history?view=lifting" },
      { see: { role: "heading", name: "Progress", level: 1 } },
      /* MuscleVolumeCard's summary line, in each of its forms. */
      {
        see: {
          text: /^\d+ of \d+ muscles? below their range|muscles in their range$|^Your 1 muscle is in its range$/,
        },
        timeoutMs: 30_000,
      },
      { goto: "history?view=running" },
      {
        see: { role: "heading", name: "Fastest kilometres" },
        timeoutMs: 30_000,
      },
      { goto: "history?view=body" },
      { see: { role: "heading", name: "Your rate" }, timeoutMs: 30_000 },
      { goto: "history?view=food" },
      {
        see: { role: "heading", name: "How the days went" },
        timeoutMs: 30_000,
      },
    ],
    expected:
      "Sixteen weeks drawn on each page: sets per muscle against their " +
      "ranges, the fastest kilometres, the rate of weight change, and the " +
      "days against their targets; no chart past the screen's edge.",
  },
  {
    id: "training-history",
    title: "Training history: saved lifts and runs",
    needs: "signed-in",
    sources: [
      "src/pages/TrainingHistory.tsx",
      "src/lib/savedRuns.ts",
      "src/lib/savedWorkouts.ts",
    ],
    route: "/history/sessions",
    steps: [
      { goto: "history/sessions" },
      { see: { role: "heading", name: "Training history", level: 1 } },
      { see: { role: "region", name: "Saved sessions" } },
    ],
    expected:
      "The saved sessions, newest first, each a link with its date, kind " +
      "and figure, under the period and sport filters.",
  },
  {
    id: "exercise-history",
    title: "An exercise's history (Bench Press)",
    needs: "signed-in",
    sources: ["src/pages/ExerciseHistory.tsx", "src/lib/prTracking.ts"],
    route: "/history/exercise/:name",
    /* The h1 is the URL's own name, so it draws on any name; the two
       cards below draw only from saved sessions (ExerciseHistory.tsx:
       "No sessions logged yet" otherwise). seed-rich-user.ts saves Bench
       Press twice a week for nine weeks, 4×8 climbing 2.5 kg a week. */
    steps: [
      { goto: "history/exercise/Bench%20Press" },
      { see: { role: "heading", name: /Bench Press/, level: 1 } },
      {
        see: { role: "heading", name: "Recent sessions", exact: true },
        timeoutMs: 30_000,
      },
      { see: { role: "heading", name: "Bests by reps", exact: true } },
    ],
    expected:
      "Bench Press's progression chart, its bests by reps (8 reps, the " +
      "seeded sets) and its recent sessions.",
  },
  {
    id: "workout-detail",
    title: "A saved workout",
    needs: "signed-in",
    sources: ["src/pages/WorkoutDetail.tsx"],
    route: "/workout/:workoutId",
    steps: [
      { goto: "workout/rich-w0" },
      /* Share is drawn only once the workout has loaded: an h1 alone
         would pass on an error card. */
      { see: { role: "button", name: "Share", exact: true } },
      { see: { role: "heading", level: 1 } },
    ],
    expected:
      "A saved lift: its name, date, exercises and sets, with the delete " +
      "action in its menu.",
  },
  {
    id: "run-detail",
    title: "A saved run",
    needs: "signed-in",
    sources: ["src/pages/RunDetail.tsx", "src/lib/gps.ts"],
    route: "/run/:runId",
    steps: [
      { goto: "run/rich-r0" },
      { see: { role: "button", name: "Share", exact: true } },
    ],
    expected:
      "A saved run: the route on its map (with the map's credit), the " +
      "distance, time and pace, the splits, and Share.",
  },

  /* ── Social ─────────────────────────────────────────────────── */
  {
    id: "social-together",
    title: "Social: Together",
    needs: "signed-in",
    sources: [
      "src/pages/Social.tsx",
      "src/components/social/**",
      "src/features/challenges/**",
      "src/features/goalSpace/**",
      "src/lib/enoughPeople.ts",
    ],
    route: "/social",
    steps: [
      { goto: "social?tab=together" },
      { see: { role: "heading", name: "Social", level: 1 } },
      { see: { role: "region", name: "Community" }, timeoutMs: 30_000 },
    ],
    expected:
      "Together: the Circles, this month's challenges and the community " +
      "goal, past their skeletons.",
  },
  {
    id: "social-feed",
    title: "Social: the Explore feed",
    needs: "signed-in",
    sources: [
      "src/pages/Social.tsx",
      "src/components/social/**",
      "src/hooks/useSocialFeed.ts",
      "src/hooks/useDiscoverFeed.ts",
    ],
    route: "/social",
    /* Every seeded public post is Maya Chen's (seed-rich-user.ts), and
       she is also the one person the account follows, so her name alone
       would pass on Following. The CHECKED Explore source is what proves
       the feed=explore link was honoured (the radio is drawn on both
       sources; feed-activity-cards.screens.capture checks the same
       aria-checked), and her "Morning run" that Explore read the public
       posts: the account has no fan-out feed docs for Following to show. */
    steps: [
      { goto: "social?tab=feed&feed=explore" },
      {
        see: { role: "radio", name: /^Explore/, checked: true },
        timeoutMs: 30_000,
      },
      { see: { text: "Morning run" }, timeoutMs: 30_000 },
    ],
    expected:
      "Explore's posts from the seeded athletes (Maya Chen's morning run " +
      "and push day among them), each card with its map or lifts and its " +
      "props.",
  },
  {
    id: "profile",
    title: "Your profile as others see it",
    needs: "signed-in",
    sources: [
      "src/pages/UserProfile.tsx",
      "src/pages/settings/SettingsProfile.tsx",
      "src/features/streaks/BadgeShelf.tsx",
    ],
    route: "/user/:uid",
    steps: [
      { goto: "settings/profile" },
      { click: { role: "button", name: "See your profile as others do" } },
      { url: /\/user\// },
      /* The seeded account's public name (`seed-e2e-user.ts`). */
      { see: { role: "heading", name: /^E2E Test/, level: 1 } },
    ],
    expected:
      "The profile others see: name and photo, the follow counts, the " +
      "week's sessions, badges, medals and posts.",
  },
  {
    id: "activity-post",
    title: "One shared session, with its props",
    needs: "signed-in",
    sources: [
      "src/pages/ActivityPost.tsx",
      "src/lib/liftPost.ts",
      "src/lib/postMoments.ts",
    ],
    route: "/activity/:activityId",
    steps: [
      { goto: "activity/rich-feed-push" },
      { click: { role: "button", name: /props — show list$/ } },
      { see: { text: "Jordan Reyes" } },
    ],
    expected:
      "Maya's push day as one post (the page the tray's props and comment " +
      "rows open), with the list of who gave props open.",
  },
  {
    id: "follow-lists",
    title: "Your followers and following",
    needs: "signed-in",
    sources: ["src/pages/FollowList.tsx", "src/hooks/useFollowState.ts"],
    route: "/followers",
    /* The heading draws before the list loads, and over its error card
       too, so each list is anchored on what only a loaded list shows:
       its rows, or the empty state. seed:rich makes the account follow
       one person (Maya) and gives it no followers. */
    steps: [
      { goto: "followers" },
      { see: { role: "heading", name: "Followers", level: 1, exact: true } },
      { see: { text: "No followers yet", exact: true } },
      { goto: "following" },
      { see: { role: "heading", name: "Following", level: 1, exact: true } },
      { see: { role: "list", name: "Following" } },
    ],
    expected:
      "Followers' empty state (the seeded account has none) and the one " +
      "person it follows, Maya, as a row that opens her profile.",
  },
  {
    id: "league",
    title: "The weekly league",
    needs: "signed-in",
    sources: ["src/pages/League.tsx", "src/features/league/**"],
    route: "/league",
    steps: [
      { goto: "league" },
      { see: { role: "button", name: "Join the league" }, timeoutMs: 30_000 },
    ],
    expected:
      "For the seeded account, which has not joined: what joining shows " +
      "and Join the league.",
  },
  {
    id: "space",
    title: "A Space (Women's Running)",
    needs: "signed-in",
    sources: [
      "src/pages/Space.tsx",
      "src/pages/SpacePost.tsx",
      "src/features/spaces/**",
    ],
    route: "/space/:spaceId",
    steps: [
      { goto: "space/womens-running" },
      { see: { role: "heading", name: "Women's Running", level: 1 } },
      { goto: "space/womens-running/post/seed-maya" },
      { see: { role: "link", name: "Women's Running" } },
    ],
    expected:
      "The Space's hero, Join or Leave, its week line and its posts; then " +
      "Maya's post on its own page, with a link back to the Space.",
  },

  /* ── Settings, review, Pro ──────────────────────────────────── */
  {
    id: "settings",
    title: "Settings: the section list",
    needs: "signed-in",
    sources: ["src/pages/SettingsIndex.tsx", "src/components/settings/**"],
    route: "/settings",
    steps: [
      { goto: "settings" },
      { see: { role: "heading", name: "Settings", level: 1 } },
      { see: { text: "Lift plan", exact: true } },
      { see: { text: "Support & legal", exact: true } },
      /* Diagnostics is hidden and unlinked (CLAUDE.md's Pages table). */
      { absent: { css: 'a[href$="/diagnostics"]' } },
    ],
    expected:
      "Ten rows in four groups: Lift plan, Run plan, Nutrition, Shoes; " +
      "Notifications, Units & appearance, Social & privacy, Apple Health; " +
      "Account; Support & legal. No link to Diagnostics.",
  },
  settingsPage(
    "settings-lift-plan",
    "lift-plan",
    "Lift plan",
    ["src/pages/settings/SettingsLiftPlan.tsx"],
    "The lift plan's days, minutes and equipment, the rest timer, and " +
      "Reset programme at the foot."
  ),
  settingsPage(
    "settings-run-plan",
    "run-plan",
    "Run plan",
    ["src/pages/settings/SettingsRunPlan.tsx"],
    "The run plan's goal and days, and the voice cues."
  ),
  settingsPage(
    "settings-nutrition",
    "nutrition",
    "Nutrition",
    ["src/pages/settings/SettingsNutrition.tsx", "src/lib/tdee.ts"],
    "Calorie and macro targets, adaptive TDEE, and the way into Your pantry."
  ),
  {
    id: "settings-sections",
    title: "Settings: every other section opens",
    needs: "signed-in",
    sources: [
      "src/pages/settings/SettingsAccount.tsx",
      "src/pages/settings/SettingsHealth.tsx",
      "src/pages/settings/SettingsHiddenPosts.tsx",
      "src/pages/settings/SettingsNotifications.tsx",
      "src/pages/settings/SettingsPantry.tsx",
      "src/pages/settings/SettingsPrivacy.tsx",
      "src/pages/settings/SettingsProfile.tsx",
      "src/pages/settings/SettingsRecentlyDeleted.tsx",
      "src/pages/settings/SettingsShoes.tsx",
      "src/pages/settings/SettingsSupportLegal.tsx",
      "src/pages/settings/SettingsUnitsAppearance.tsx",
    ],
    route: "/settings/profile",
    steps: (
      [
        ["profile", "Profile"],
        ["account", "Account"],
        ["notifications", "Notifications"],
        ["units-appearance", "Units & appearance"],
        ["privacy", "Social & privacy"],
        ["hidden-posts", "Hidden posts"],
        ["health", "Apple Health"],
        ["shoes", "Shoes"],
        ["pantry", "Your pantry"],
        ["recently-deleted-meals", "Recently deleted meals"],
        ["support-legal", "Support & legal"],
      ] as const
    ).flatMap(([path, title]): Step[] => [
      { goto: `settings/${path}` },
      { see: { role: "heading", name: title, level: 1, exact: true } },
    ]),
    expected:
      "Each section opens on its own heading, with no error card: Profile, " +
      "Account, Notifications, Units & appearance, Social & privacy, " +
      "Hidden posts, Apple Health, Shoes, Your pantry, Recently deleted " +
      "meals, Support & legal.",
  },
  {
    id: "weekly-review",
    title: "The weekly review",
    needs: "signed-in",
    sources: ["src/pages/WeeklyReview.tsx", "src/components/review/**"],
    route: "/review",
    steps: [
      { goto: "review" },
      { see: { role: "heading", name: "Your week", exact: true } },
    ],
    expected:
      "Last week's recap, card by card, ending where the week ahead is " +
      "agreed.",
  },
  {
    id: "upgrade",
    title: "Pro: pricing and purchase",
    needs: "signed-in",
    sources: [
      "src/pages/Upgrade.tsx",
      "src/components/paywall/**",
      "src/lib/subscription.ts",
      "src/lib/purchaseProvider.ts",
    ],
    route: "/upgrade",
    steps: [
      { goto: "upgrade" },
      { see: { role: "heading", name: "Log a meal from a photo", level: 1 } },
    ],
    expected:
      "The Pro offer led by meal photos, the plans with their prices and " +
      "trial, and one way to start; no Stripe SDK loaded.",
  },
  {
    id: "diagnostics",
    title: "Diagnostics (hidden, by URL only)",
    needs: "signed-in",
    sources: ["src/pages/Diagnostics.tsx"],
    route: "/diagnostics",
    steps: [
      { goto: "diagnostics" },
      { see: { role: "heading", name: "Diagnostics", level: 1 } },
    ],
    expected:
      "The operator page: push, service-worker update and App Check state.",
  },
];

/**
 * The pages no feature drives, and why. `featureMap.test.ts` fails on a
 * page that is in neither the map nor this list, so a new page is a
 * choice: map it, or say here why the rig cannot.
 */
export const NOT_DRIVEN: Readonly<Record<string, string>> = {
  "src/pages/Onboarding.tsx":
    "Setup needs a new account and writes a programme; the journeys " +
    "(e2e/journeys) and onboarding.screens.capture drive it.",
  "src/pages/AdminModeration.tsx":
    "Admin only (VITE_ADMIN_UIDS); the seeded account is not an admin.",
  "src/pages/PublicPost.tsx":
    "A public post seen signed out needs seeded data without a session; " +
    "the map's signed-out features run without the Firestore emulator.",
  "src/pages/Routine.tsx":
    "A saved routine runs the same WorkoutSession that lift-session opens.",
  "src/pages/RunSummary.tsx":
    "Reached only by finishing a recorded run; run-finish.capture drives it.",
  "src/pages/Segment.tsx":
    "Needs a segment made by the createSegment callable; none is seeded.",
  "src/pages/dev/**": "Developer labs, not product surfaces.",
};

/** What runs when a change reaches the app but no feature claims it. */
export const SMOKE: readonly string[] = [
  "welcome",
  "sign-in-form",
  "home",
  "food",
  "train-lift",
  "progress",
  "social-together",
  "settings",
];

/**
 * Code every screen depends on. A change here runs the smoke set: it can
 * break any feature, and running every feature for it is the slow answer.
 */
export const SHARED_SOURCES: readonly string[] = [
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "src/styles/**",
  "src/components/ui/**",
  "src/components/Layout.tsx",
  "src/components/BottomNavigation.tsx",
  "src/lib/auth.tsx",
  "src/lib/firebase.ts",
  "src/lib/firebaseApp.ts",
  "src/lib/theme.ts",
  "index.html",
  "vite.config.ts",
  "public/**",
  "package-lock.json",
  /* A dependency or an npm script: the same reach as the lockfile. */
  "package.json",
  /* The emulator does not enforce composite indexes, so the rig cannot
     catch a missing one; the smoke set runs so the change is at least
     seen against the app. */
  "firestore.indexes.json",
];

/**
 * What every signed-in feature reads through: the seeded data and the
 * rules the Firestore emulator enforces on it (`firebase.json` points the
 * emulator at `firestore.rules`). Every signed-in anchor in the map is
 * seeded data read through those rules, so a change here can break any
 * feature, and the whole map runs (under a minute a round once the rig is
 * warm). Changing the rules themselves is not this skill's business; it
 * only shows what a change does to the screens.
 */
export const DATA_SOURCES: readonly string[] = [
  "firestore.rules",
  "scripts/seed-*.ts",
  "functions/lib/challengeDefs.js",
];
