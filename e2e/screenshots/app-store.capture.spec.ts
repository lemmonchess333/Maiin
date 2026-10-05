/**
 * App Store screenshots, iPhone 6.9-inch display class. A DRAFT set for
 * the owner to review, not the shipped listing.
 *
 * Each frame is exactly 1320 x 2868: a 440 x 956 CSS viewport at device
 * scale 3, portrait, the size App Store Connect takes for the 6.9-inch
 * class. Frames are named in listing order, `app-store-01-home.png` on,
 * and land in `screenshots/` with every other capture, so
 * app-screenshots.yml commits them to the `app-screenshots` branch.
 *
 * A frame is real use of the web build on the repo's demo seeds, settled:
 * no loading state, no guide, no toast.
 *
 * One person's app. Every frame copies the season athlete
 * (seed-season-athlete: sixteen weeks of lifting, running, food and
 * weigh-ins), so the set agrees with itself: Home's food card is the Food
 * page's day, and the lift Home offers is the one Train lists and the
 * workout frame is part-way through. Each test signs in to a COPY of that
 * account, made for it (`openSeasonAthlete`):
 *   - the profile, the collections the seed writes, and the account's
 *     follows, space memberships and challenge entries. A copy can be used
 *     the way a person would (water logged, sets ticked, a badge opened, a
 *     race goal set) without changing what the other capture specs see;
 *   - the history up to yesterday. Today, as the frames show it, has
 *     breakfast and lunch logged and its training still to come;
 *   - a lift on today (`weekWithLiftToday`), so Home has a session to
 *     Start whatever day CI runs on;
 *   - a follow of the seeded author whose posts fill the feed;
 *   - the programme the app builds on the copy's first visit, calibrated
 *     from the athlete's history (`calibrateProgramme`).
 * The race plan's copy also sets a race goal, saved as the app's Run plan
 * editor saves one (`setHalfMarathonGoal`).
 *
 * The copy keeps the default dark theme. The seeds store light
 * (`darkMode: false`) for their own light captures, and a profile's theme
 * reaches more than the root class: RunDetail draws its basemap from
 * `profile.darkMode`, so toggling `.dark` would leave a light map under a
 * dark page.
 *
 * The layout is an iPhone 16 Pro Max's: the app pads for
 * `env(safe-area-inset-*)` (index.css `--safe-top` / `--safe-bottom`), and
 * CDP's `Emulation.setSafeAreaInsetsOverride` gives those the phone's
 * 62 px status bar and 34 px home indicator. The status bar itself is not
 * drawn: that band is left as the app paints it. Touch and a coarse
 * pointer (`isMobile`, `hasTouch`), as on the phone: the project's desktop
 * pointer would turn on index.css's desktop scrollbar. Reduce Motion, so
 * count-ups and entrances are at rest when the shutter fires.
 *
 * The run's map needs tiles.openfreemap.org, which CI reaches and the
 * agent sandbox does not: there the frame shows the map's own "Map tiles
 * unavailable" note over an empty map, after a capped wait.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { signInAsTestUser, TEST_USER } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";
import {
  normalizeProgramState,
  type ProgramExercise,
  type ProgramState,
} from "../../src/features/program/programTypes";
import { migrateProgramState } from "../../src/features/program/migrations";
import { nextUpIndex } from "../../src/features/program/nextUpCursor";
import { applySessionProgression } from "../../src/features/program/sessionCompletion";
import type { LoggedSet } from "../../src/features/program/workoutSetRecord";
import { buildPlan } from "../../src/features/program/planBuilder";
import { layoffFromRuns } from "../../src/features/program/layoffDetection";
import { runTuningFromProfile } from "../../src/features/program/runScheduler";
import { normalizeRunTimeLimits } from "../../src/features/program/runTimeLimits";
import { isRunningBaseline } from "../../src/features/program/runningBaseline";
import type { UserProfile } from "../../src/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../../src/lib/dateHelpers";
import { stripUndefined } from "../../src/lib/firestoreGuards";
import { isNonRaceGoal } from "../../src/lib/nonRaceGoal";
import { getNutritionPhase } from "../../src/lib/nutritionPhase";
import {
  getWeeklyRunTarget,
  type DayType,
  type ScheduleDay,
} from "../../src/lib/scheduleUtils";

const require = createRequire(import.meta.url);

const FRAME = { width: 440, height: 956, scale: 3 } as const;
/** iPhone 16 Pro Max, portrait, in CSS px: the status bar above, the home
 *  indicator below. */
const SAFE_AREA = {
  top: 62,
  topMax: 62,
  bottom: 34,
  bottomMax: 34,
  left: 0,
  leftMax: 0,
  right: 0,
  rightMax: 0,
} as const;
/** How far down the status bar's scrim is solid: `.ds-safe-top-occluder`
 *  (components.css) is the page colour for 58% of the inset, then fades
 *  out. Content scrolled above this line is hidden; below it, it shows
 *  through. */
const SCRIM_SOLID = Math.floor(SAFE_AREA.top * 0.58);

test.use({
  viewport: { width: FRAME.width, height: FRAME.height },
  deviceScaleFactor: FRAME.scale,
  isMobile: true,
  hasTouch: true,
  locale: "en-GB",
  colorScheme: "dark",
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

// The seed scripts export these, but importing one runs it.
const SEASON_ATHLETE = "season-athlete@tropos.test";
/** Maya Chen, the author of the feed's posts (seed-rich-user.ts). */
const FEED_AUTHOR = "rich-feed-author";

let adminApp: App | undefined;
function admin(): App {
  adminApp ??= initializeApp({ projectId: "demo-tropos" }, "app-store");
  return adminApp;
}

/** What the seeds write under `users/{uid}`. Copied by name, so whatever
 *  the app or another spec has since added to the shared account (its
 *  programme, streaks, water) stays behind. */
const SEEDED_COLLECTIONS = [
  "public",
  "workouts",
  "runs",
  "meals",
  "performance",
  "bodyweightLogs",
  "dailyNutrition",
] as const;

/** The seeded collections of training sessions, each dated by `date`. */
const SESSIONS = new Set<string>(["workouts", "runs"]);

interface Account {
  email: string;
  password: string;
  uid: string;
}

interface CopyOptions {
  /** Whether to copy a seeded document. */
  keep?: (collection: string, data: DocumentData) => boolean;
  /** Fields the copy's profile sets over the seeded profile's. */
  profile?: (seeded: DocumentData) => DocumentData;
}

async function copySeededAccount(
  sourceEmail: string,
  tag: string,
  { keep = () => true, profile: patch = () => ({}) }: CopyOptions = {}
): Promise<Account> {
  const auth = getAuth(admin());
  const db = getFirestore(admin());
  const source = await auth.getUserByEmail(sourceEmail);
  const email = `app-store-${tag}-${Date.now()}@tropos.test`;
  const { uid } = await auth.createUser({
    email,
    password: TEST_USER.password,
    displayName: source.displayName,
    emailVerified: true,
  });
  const from = db.collection("users").doc(source.uid);
  const to = db.collection("users").doc(uid);
  const profile = (await from.get()).data();
  expect(profile, `${sourceEmail} has no profile: is it seeded?`).toBeTruthy();
  await to.set({ ...profile, ...patch(profile!), uid, email, darkMode: true });

  const writer = db.bulkWriter();
  const copies: Promise<unknown>[] = [];
  for (const name of SEEDED_COLLECTIONS) {
    const docs = (await from.collection(name).get()).docs;
    for (const doc of docs)
      if (keep(name, doc.data()))
        copies.push(
          writer.set(
            to.collection(name).doc(doc.id),
            name === "public" ? { ...doc.data(), uid } : doc.data()
          )
        );
  }
  const follows = await db
    .collection("following")
    .doc(source.uid)
    .collection("users")
    .get();
  for (const follow of follows.docs)
    copies.push(
      writer.set(
        db.collection("following").doc(uid).collection("users").doc(follow.id),
        follow.data()
      ),
      writer.set(
        db.collection("followers").doc(follow.id).collection("users").doc(uid),
        follow.data()
      )
    );
  // Space memberships and challenge entries carry the member's uid.
  for (const group of ["members", "participants"]) {
    const rows = await db
      .collectionGroup(group)
      .where("uid", "==", source.uid)
      .get();
    for (const row of rows.docs)
      copies.push(writer.set(row.ref.parent.doc(uid), { ...row.data(), uid }));
  }
  await writer.close();
  await Promise.all(copies);
  return { email, password: TEST_USER.password, uid };
}

/**
 * The week with a lift on today, moved as a person moves one in the
 * week-layout editor: the same three lift days and three run days, so the
 * programme is not rebuilt, and in day order, as every schedule the app
 * writes is (`buildPlan` refuses any other order).
 *
 * Today swaps with the week's next lift day. With none left this week (the
 * seed lifts on Monday, Wednesday and Friday, so on a Saturday or a
 * Sunday), today takes the last lift day's place and that day becomes the
 * rest day; a run moved off today goes to the next rest day, or, in a week
 * without one, back to that day. On the seed's week no day already behind
 * becomes a run day, which a race plan would fill with a run nobody did.
 */
function weekWithLiftToday(
  schedule: ScheduleDay[],
  today: Date
): ScheduleDay[] {
  const type = new Map(schedule.map(({ day, type }) => [day, type]));
  const lifts = (day: number) => ["lift", "both"].includes(type.get(day)!);
  // Monday first, as the week runs.
  const week = [1, 2, 3, 4, 5, 6, 0];
  const day = today.getDay();
  const at = week.indexOf(day);
  const was = type.get(day)!;
  if (!lifts(day)) {
    const next = week.slice(at + 1).find(lifts);
    if (next !== undefined) {
      type.set(day, type.get(next)!);
      type.set(next, was);
    } else {
      const last = week.slice(0, at).reverse().find(lifts)!;
      type.set(day, type.get(last)!);
      type.set(last, "rest");
      const rest = week.slice(at + 1).find((d) => type.get(d) === "rest");
      if (was !== "rest") type.set(rest ?? last, was);
    }
  }
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, type: type.get(d)! }));
}

/** The season athlete as every frame shows them (see the header). */
async function copySeasonAthlete(tag: string): Promise<Account> {
  const today = new Date();
  const account = await copySeededAccount(SEASON_ATHLETE, tag, {
    keep: (collection, data) =>
      !(SESSIONS.has(collection) && data.date === localDateString(today)),
    // As the week-layout editor saves a layout (useProgrammeScheduleEditor):
    // the days and the targets they count to.
    profile: (seeded) => {
      const weekSchedule = weekWithLiftToday(seeded.weekSchedule, today);
      const count = (...types: DayType[]) =>
        weekSchedule.filter((d) => types.includes(d.type)).length;
      return {
        weekSchedule,
        weeklyWorkoutsTarget: count("lift", "both"),
        weeklyRunsTarget: count("run", "both"),
        weeklyRunDaysTarget: count("run", "both"),
      };
    },
  });
  // As seed-rich-user.ts writes the e2e account's follow of the same author.
  const db = getFirestore(admin());
  const followedAt = Timestamp.now();
  await db
    .collection("following")
    .doc(account.uid)
    .collection("users")
    .doc(FEED_AUTHOR)
    .set({ followedAt });
  await db
    .collection("followers")
    .doc(FEED_AUTHOR)
    .collection("users")
    .doc(account.uid)
    .set({ followedAt });
  return account;
}

interface LoggedLift {
  /** The session's day, "yyyy-MM-dd". */
  date: string;
  sets: LoggedSet[];
}

/** Each lift's latest session, by exercise id: the one Train's "Last:"
 *  line reads (Program.tsx, `lastPerformanceMap`). */
function latestSessions(workouts: DocumentData[]): Map<string, LoggedLift> {
  const latest = new Map<string, LoggedLift>();
  const newestFirst = [...workouts].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  for (const workout of newestFirst)
    for (const exercise of workout.exercises ?? []) {
      const sets: DocumentData[] = exercise.sets ?? [];
      if (latest.has(exercise.exerciseId)) continue;
      if (!sets.some((set) => set.weightKg > 0)) continue;
      latest.set(exercise.exerciseId, {
        date: workout.date,
        // A saved workout keeps the sets that were done, and only those.
        sets: sets.map((set) => ({
          weight: set.weightKg,
          reps: set.reps,
          completed: true,
          type: set.type ?? "working",
          ...(typeof set.rpe === "number" ? { rpe: set.rpe } : {}),
        })),
      });
    }
  return latest;
}

/** `state` after each logged lift's latest session, applied to the lift's
 *  slots with the engine's own session step. */
function calibrated(
  state: ProgramState,
  latest: Map<string, LoggedLift>
): ProgramState {
  let next = state;
  state.workouts.forEach((day, dayIndex) => {
    // The day's logged lifts, by the session each was last done in: one
    // call per session, as the app makes one per session it saves.
    const sessions = new Map<string, number[]>();
    day.exercises.forEach((exercise, slot) => {
      const date = latest.get(exercise.exerciseId)?.date;
      if (date) sessions.set(date, [...(sessions.get(date) ?? []), slot]);
    });
    for (const [date, slots] of sessions) {
      // Each slot as the engine holds a lift it has no load for.
      const uncalibrated: ProgramExercise[] = slots.map((slot) => ({
        ...day.exercises[slot],
        weight: 0,
      }));
      next = {
        ...next,
        workouts: next.workouts.map((d, i) =>
          i !== dayIndex
            ? d
            : {
                ...d,
                exercises: d.exercises.map((exercise, slot) =>
                  slots.includes(slot)
                    ? uncalibrated[slots.indexOf(slot)]
                    : exercise
                ),
              }
        ),
      };
      next = applySessionProgression(next, dayIndex, {
        completionId: `history-${date}`,
        date,
        prescription: {
          dayName: day.dayName,
          exercises: uncalibrated,
          progressionBaseline: uncalibrated,
        },
        setLogs: slots.map(
          (slot) => latest.get(day.exercises[slot].exerciseId)!.sets
        ),
      });
    }
  });
  return next;
}

/**
 * The copy's programme, given the athlete's history.
 *
 * The app builds the copy a programme on its first visit (useProgram's
 * loader), and a new programme starts each lift from body weight and
 * experience (`startingLoads.ts`): the right guess for someone with no
 * history, and this athlete has sixteen weeks of it. Bench Press read
 * "57.5 kg" over "Last: 82.5 kg x 6". The athlete's next session would
 * move the plan to the load lifted, however far from the seed, but the
 * frames come before any session, and a session saved the ordinary way
 * would also add a step or count a miss. So each lift the athlete has
 * logged is calibrated the way the engine calibrates a lift it has no load
 * for: the slot's load is set to 0 kg, the engine's "uncalibrated", and
 * the lift's latest session goes through `applySessionProgression`, the
 * step the app runs as it saves a session, where `applyProgression` takes
 * the load lifted (`calibratedWeight`) with no step on top, records the
 * session and clears the failure counts. Lifts the athlete has never
 * logged keep their seed, as `seedStartingLoads` intends.
 *
 * Only exercises change. The document is read the way the loader reads it
 * (normalised, migrated) and written whole in a transaction, as the app's
 * own commits are, so its shape, schema version and instance ids are the
 * app's.
 */
async function calibrateProgramme(uid: string): Promise<ProgramState> {
  const db = getFirestore(admin());
  const user = db.collection("users").doc(uid);
  const programme = user.collection("programState").doc("current");
  // Written once Home has asked for it, on the copy's first visit.
  await expect
    .poll(async () => (await programme.get()).exists, {
      message: "the app built the copy no programme",
      timeout: 30_000,
    })
    .toBe(true);
  const profile = (await user.get()).data()!;
  const latest = latestSessions(
    (await user.collection("workouts").get()).docs.map((doc) => doc.data())
  );
  return db.runTransaction(async (transaction) => {
    const stored = (await transaction.get(programme)).data() as ProgramState;
    const read = migrateProgramState(
      normalizeProgramState(stored, { primaryGoal: profile.primaryGoal }),
      localWeekKey()
    );
    const next = stripUndefined({
      ...calibrated(read, latest),
      updatedAt: Date.now(),
    });
    transaction.set(programme, next);
    return next;
  });
}

/**
 * The planned line ("3 sets × 6 reps · 82.5 kg") of the first loaded lift
 * of the day Train has up next, at its calibrated load. A page paints the
 * programme from the browser's cache before the server answers, and the
 * cache can still hold the copy's first, uncalibrated programme, so a frame
 * or a Start that only waits for the list can land on the old loads.
 */
function calibratedLead(page: Page, programme: ProgramState): Locator {
  const lead = programme.workouts[nextUpIndex(programme)].exercises.find(
    (exercise) => exercise.weight > 0
  );
  expect(lead, "the up-next day has no loaded lift").toBeTruthy();
  const kg = String(lead!.weight).replace(".", "\\.");
  return page.getByText(new RegExp(`· ${kg} kg$`)).first();
}

async function openAs(page: Page, account: Account) {
  const cdp = await page.context().newCDPSession(page);
  await cdp
    .send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE_AREA })
    .catch((err: Error) =>
      console.log(
        `[capture] no safe-area override in this Chromium (${err.message}); frames are laid out without the iPhone insets`
      )
    );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
  await signInAsTestUser(page, account);
}

/** A copy of the season athlete, signed in, and its programme, calibrated.
 *  The page is left on the first visit's Home: go somewhere, or reload, to
 *  see the calibrated programme. */
async function openSeasonAthlete(
  page: Page,
  tag: string
): Promise<Account & { programme: ProgramState }> {
  const account = await copySeasonAthlete(tag);
  await openAs(page, account);
  return { ...account, programme: await calibrateProgramme(account.uid) };
}

/** The Sunday thirteen calendar weeks out: about twelve weeks away on any
 *  weekday, which is room for a whole half-marathon block ("week 1 of 13")
 *  and no compressed-plan note. */
function halfMarathonDay(today: Date): string {
  const monday = parseLocalDate(localWeekKey(today));
  return localDateString(addLocalDays(monday, 12 * 7 + 6));
}

/**
 * A half marathon, saved as the Run plan editor saves one
 * (RunPlanSettings `handleSave`): the plan `buildPlan` builds from the
 * profile and the programme, with the editor's defaults for everything its
 * form leaves alone, committed by `configurePlan`'s own handler, which
 * writes the goal with what derives from it (`runMode`, the week and its
 * run targets, the week's runs and the race block) in one transaction. The
 * capture rig has no Functions emulator, so the handler is called
 * directly, as run-coaching.capture calls applyProgramCommand's.
 */
async function setHalfMarathonGoal(uid: string, today: Date): Promise<void> {
  const db = getFirestore(admin());
  const user = db.collection("users").doc(uid);
  const profile = (await user.get()).data() as UserProfile;
  const programState = (
    await user.collection("programState").doc("current").get()
  ).data() as ProgramState;
  const todayKey = localDateString(today);
  const runs = (await user.collection("runs").get()).docs.map((doc) =>
    doc.data()
  );
  const plan = buildPlan({
    primaryGoal: profile.primaryGoal ?? "general",
    nutritionPhase: getNutritionPhase(profile),
    experience: profile.experience ?? "beginner",
    previousExperience: profile.experience ?? "beginner",
    bodyweightKg: profile.weightKg,
    sex: profile.sex,
    liftDays: profile.weeklyWorkoutsTarget ?? 0,
    preferredSplit:
      !profile.preferredSplit || profile.preferredSplit === "auto"
        ? "full_body"
        : profile.preferredSplit,
    runMode: "race_prep",
    weeklyRunDays: getWeeklyRunTarget(profile) || 3,
    runTuning: runTuningFromProfile(profile),
    // Read from the runs as fetchRecentLayoff reads them.
    recentLayoff: layoffFromRuns(
      runs.map((run) => ({
        date: run.date,
        distance: run.distance,
        duration: run.duration,
        isInvalid: run.isInvalid === true,
        savedAnyway: run.savedAnyway === true,
      })),
      todayKey
    ),
    weekSchedule: profile.weekSchedule,
    runFitness: profile.runFitness ?? null,
    runTimeLimits: normalizeRunTimeLimits(profile.runTimeLimits),
    runningBaseline: isRunningBaseline(profile.runningBaseline)
      ? profile.runningBaseline
      : null,
    raceGoal: { distance: "half", targetDate: halfMarathonDay(today) },
    equipment: profile.equipment ?? "full_gym",
    injuries: profile.injuries ?? [],
    currentDate: todayKey,
    existingState: programState,
    preserveHistory: true,
  });
  plan.profileUpdates.nonRaceGoal = isNonRaceGoal(profile.nonRaceGoal)
    ? profile.nonRaceGoal
    : null;
  const stored = profile as unknown as Record<string, unknown>;
  const baseProfile = Object.fromEntries(
    Object.keys(plan.profileUpdates)
      .filter((key) => stored[key] !== undefined)
      .map((key) => [key, stored[key]])
  );
  const { configurePlan } = require("../../functions/index.js");
  // Through JSON, as the callable carries it.
  await configurePlan.run(
    JSON.parse(
      JSON.stringify({
        baseProgramState: programState,
        baseProfile,
        profileUpdates: plan.profileUpdates,
        programState: plan.programState,
        weekSchedule: plan.weekSchedule,
      })
    ),
    { auth: { uid } }
  );
}

/** Cards that arrive with a second read (a coaching note, a badge) move
 *  everything under them, so wait for the page to stop growing. */
async function settled(page: Page) {
  await settleFullPageHeight(page, { timeoutMs: 10_000, stableForMs: 1_500 });
}

/** Scroll until `above` has gone under the status bar's solid scrim, so
 *  what follows it starts the frame. Instant: index.css scrolls smoothly,
 *  and a shot taken mid-glide is a different frame each run. */
async function scrollPast(page: Page, above: Locator) {
  const box = await above.boundingBox();
  expect(box, "nothing to scroll past").not.toBeNull();
  await page.evaluate(
    (by) => window.scrollBy({ top: by, behavior: "instant" }),
    box!.y + box!.height - SCRIM_SOLID
  );
}

function pageHeader(page: Page) {
  return page
    .locator("header")
    .filter({ has: page.getByRole("heading", { level: 1 }) })
    .first();
}

async function shoot(page: Page, name: string) {
  // Nothing transient over the frame.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const safeTop = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--safe-top")
      .trim()
  );
  if (safeTop !== `${SAFE_AREA.top}px`)
    console.log(`[capture] ${name}: --safe-top is "${safeTop}"`);
  await settleImages(page);
  const png = await page.screenshot({
    path: `screenshots/app-store-${name}.png`,
    animations: "disabled",
  });
  // The PNG's IHDR chunk: width at byte 16, height at byte 20.
  expect(png.readUInt32BE(16), "frame width").toBe(FRAME.width * FRAME.scale);
  expect(png.readUInt32BE(20), "frame height").toBe(FRAME.height * FRAME.scale);
}

/** A badge earned on the copy's first visit waits on Home as a row. Open
 *  each, as a person would, so the row is not in the frame. Awards land
 *  one after another once the streak data loads, so this waits a moment
 *  for the next before deciding there is none. */
async function openWaitingBadges(page: Page) {
  const row = page.getByRole("button", { name: /^New badge/ });
  for (let i = 0; i < 12; i++) {
    const waiting = await row
      .waitFor({ state: "visible", timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    if (!waiting) return;
    await row.click();
    const dialog = page.getByRole("dialog");
    const nice = dialog.getByRole("button", { name: "Nice", exact: true });
    for (let tap = 0; tap < 8 && !(await nice.isVisible()); tap++)
      await dialog
        .getByRole("button", { name: /^Break the seal/ })
        .click({ timeout: 2_000 })
        .catch(() => {});
    await nice.click();
    await expect(dialog).toHaveCount(0);
  }
}

/** RunDetail's map draws the route, and its start and finish markers, once
 *  the basemap has loaded. Wait for the route, then for MapLibre's credit
 *  to fold, which basemap.ts does CREDIT_OPEN_MS after the map loads: the
 *  map at rest, with that long for the fitted view's tiles. Where the
 *  basemap cannot be fetched the map says "Map tiles unavailable" and the
 *  route never draws. Every wait here is capped and none fails the test:
 *  a frame without tiles is still a frame. */
async function waitForRunMap(page: Page) {
  const route = page.locator(".maplibregl-marker");
  const unavailable = page.getByText(/^Map tiles unavailable/);
  await route
    .or(unavailable)
    .first()
    .waitFor({ state: "visible", timeout: 25_000 })
    .catch(() => {});
  // A tile error can put the note up before the map loads, so the route
  // gets a little longer before the basemap is given up on.
  const drawn = await route
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!drawn) {
    console.log("[capture] 08-run: the basemap did not load; no map tiles");
    return;
  }
  await page
    .locator(".maplibregl-ctrl-attrib.maplibregl-compact")
    .and(page.locator(":not(.maplibregl-compact-show)"))
    .waitFor({ state: "attached", timeout: 8_000 })
    .catch(() =>
      console.log("[capture] 08-run: the map's credit did not fold in time")
    );
}

test.describe("App Store screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );
  // A copy, a sign-in, a programme and a settled page: more than the
  // default 30 s.
  test.describe.configure({ timeout: 120_000 });

  test.afterAll(async () => {
    if (adminApp) await deleteApp(adminApp);
    adminApp = undefined;
  });

  test("01 home: today's session and food", async ({ page }) => {
    await openSeasonAthlete(page, "home");
    await page.reload();

    await expect(
      page.getByRole("button", { name: "Start workout", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    const food = page.getByRole("region", { name: "Today's food" });
    await expect(food).toContainText(/kcal (left|over)/, { timeout: 20_000 });
    await expect(food.getByText("Protein")).toBeVisible();

    // The day's water, logged the way it is: the tile's plus, a glass a tap.
    const addGlass = page.getByRole("button", { name: /^Add \d+ ml$/ });
    for (let glass = 0; glass < 4; glass++) await addGlass.click();
    await expect(page.getByText(/^Tap \+ for/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /Add water — choose a container size/ })
    ).toHaveAccessibleName(/^Water 1 litres? logged/);

    // Last, so a badge the water earned is opened with the rest.
    await openWaitingBadges(page);
    await settled(page);
    await expect(page.getByRole("button", { name: /^New badge/ })).toHaveCount(
      0
    );
    // The top of the page, whatever the taps above scrolled into view.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await shoot(page, "01-home");
  });

  test("02 train: the week and a lift day", async ({ page }) => {
    const { programme } = await openSeasonAthlete(page, "train");
    await page.goto("program");

    await expect(
      page
        .getByRole("tablist", { name: "Lift sessions" })
        .getByRole("tab")
        .first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(calibratedLead(page, programme)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Start workout", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^More options for / }).nth(2)
    ).toBeAttached({ timeout: 15_000 });
    await settled(page);

    // The week, the day and its exercises, with the title and the
    // Lift / Run switch scrolled under the status bar.
    await scrollPast(page, pageHeader(page));
    await shoot(page, "02-train");
  });

  test("03 workout: a lift in progress", async ({ page }) => {
    const { programme } = await openSeasonAthlete(page, "workout");
    await page.goto("program");
    const start = page.getByRole("button", {
      name: "Start workout",
      exact: true,
    });
    await expect(start).toBeVisible({ timeout: 20_000 });
    // The session takes its sets from the programme the page holds.
    await expect(calibratedLead(page, programme)).toBeVisible({
      timeout: 20_000,
    });
    // The sets below take seconds here and a quarter of an hour in a gym.
    // Hold the page's clock as the session starts, and move it on by that
    // quarter before the shot, so the session's running time reads as one
    // would. Only Date is held; timers run as normal.
    const startedAt = Date.now();
    await page.clock.setFixedTime(startedAt);
    await start.click();

    const complete = page.getByRole("button", {
      name: "Mark set complete",
      exact: true,
    });
    await expect(complete.first()).toBeVisible({ timeout: 15_000 });
    // The first lift's progression offer ("All sets hit 6 reps at 82.5 kg
    // last time — try 85 kg"), taken. It is built from the seeded history
    // once that has loaded.
    await page
      .getByRole("button", { name: "Apply", exact: true })
      .click({ timeout: 8_000 })
      .catch(() =>
        console.log("[capture] 03-workout: no progression offer to take")
      );

    // The warm-ups and two working sets, each rest ended as it starts.
    const endRest = page.getByRole("button", { name: "End rest", exact: true });
    const done = page.getByRole("button", { name: /^Edit completed / });
    const warmups = await page
      .getByRole("button", { name: /^Warm-up \d+\. Change set type$/ })
      .count();
    for (let set = 1; set <= warmups + 2; set++) {
      await complete.first().click();
      await expect(done).toHaveCount(set);
      if (await endRest.isVisible()) await endRest.click();
    }
    await expect(page.getByText(/^Set \d+ of \d+ · 2 done$/)).toBeVisible();
    // A set that beats last time's best is announced on the spot for a few
    // seconds; the frame is the screen once that has gone.
    await expect(page.getByTestId("new-best-moment")).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.clock.setFixedTime(startedAt + (14 * 60 + 20) * 1000);
    await expect(page.getByText(/ · 14:2\d$/)).toBeVisible();
    await shoot(page, "03-workout");
  });

  test("04 food: the ring, macros and the day's diary", async ({ page }) => {
    await openSeasonAthlete(page, "food");
    await page.goto("food");

    // The diary once the day's meals have been read: its log or, when a
    // run straddles midnight after seeding, its empty state.
    await expect(
      page
        .getByText(/^Food log\s+·\s+\d+ items?$/)
        .or(page.getByText("Nothing logged yet"))
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /calories logged/ }).first()
    ).toBeVisible();
    // The free account's Pro line under the composer, closed as anyone
    // can close it, for room for the diary.
    await page
      .getByRole("note")
      .getByRole("button", { name: "Dismiss" })
      .click({ timeout: 3_000 })
      .catch(() => {});
    await settled(page);

    // The week's rings, the day's ring and macros, and the diary, with
    // the title scrolled under the status bar.
    await scrollPast(page, pageHeader(page));
    await shoot(page, "04-food");
  });

  test("05 analytics: the overview", async ({ page }) => {
    await openSeasonAthlete(page, "analytics");
    await page.goto("history");

    await expect(
      page.getByRole("heading", { name: "Performance", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Last 30 days" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Muscles trained" })
        .getByRole("listitem")
        .first()
    ).toBeVisible({ timeout: 30_000 });
    // No skeleton left anywhere, the Performance card's included.
    await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    await settled(page);
    await shoot(page, "05-analytics");
  });

  test("06 race plan: the race cockpit", async ({ page }) => {
    const account = await openSeasonAthlete(page, "race");
    await setHalfMarathonGoal(account.uid, new Date());
    await page.goto("program?tab=run");

    const plan = page.getByRole("region", { name: "Race plan" });
    await expect(plan).toBeVisible({ timeout: 20_000 });
    await expect(plan).toContainText(/\d+ days? out/);
    // The phase rail, the last of each word in the card.
    for (const phase of ["Base", "Build", "Taper", "Race"])
      await expect(plan.getByText(phase, { exact: true }).last()).toBeVisible();
    // A whole block: no compressed-plan note under the card.
    await expect(page.getByText(/^Compressed plan/)).toHaveCount(0);
    await settled(page);
    await shoot(page, "06-race-plan");
  });

  test("07 social: the feed", async ({ page }) => {
    await openSeasonAthlete(page, "social");
    await page.goto("social?tab=feed&feed=explore");

    await expect(page.getByText("Morning run")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Push day")).toBeVisible();
    await settled(page);
    await shoot(page, "07-social");
  });

  test("08 run: a saved run and its map", async ({ page }) => {
    const account = await openSeasonAthlete(page, "run");
    // The season's longest run of the last fortnight: an 18 km long run,
    // whichever day this runs on.
    const since = new Date();
    since.setDate(since.getDate() - 13);
    const runs = await getFirestore(admin())
      .collection("users")
      .doc(account.uid)
      .collection("runs")
      .where("date", ">=", localDateString(since))
      .get();
    const longest = runs.docs
      .map((doc) => ({ id: doc.id, metres: doc.get("distance") as number }))
      .sort((a, b) => b.metres - a.metres)[0];
    expect(longest, "the season seed has no recent runs").toBeTruthy();

    await page.goto(`run/${longest.id}`);
    await expect(
      page.getByRole("heading", {
        name: `${(longest.metres / 1000).toFixed(2)} km`,
      })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("table", { name: "Splits" }).getByRole("row").nth(5)
    ).toBeAttached();
    await waitForRunMap(page);
    await settled(page);
    await shoot(page, "08-run");
  });
});
