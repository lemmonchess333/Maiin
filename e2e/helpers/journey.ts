/**
 * Journeys: one person, through weeks of the real app, in a few minutes.
 *
 * test-infrastructure-audit §4(b) is the design. A journey signs up through
 * the real form and sets up through the real setup screens, with the
 * callables answered by their real handlers (`realCallables.ts`). Each
 * simulated day moves the page's clock and this process's together with the
 * app open, as a phone brings the app back the next morning, and the app
 * does what it does on that day: the weekly rollover, the session up next,
 * the run planned for today.
 *
 * The app stays loaded from sign-up to the end: screens are reached through
 * the tab bar, never by loading a URL. The Firestore emulator keeps the
 * listen channel of every page load that went away and queues each later
 * write into all of them, so a journey that reloaded each day ran it out of
 * memory by its fifteenth week (3.4 GB live heap, measured).
 *
 * What a person does goes through the UI where the journey checks it, and
 * through the app's own engine where it only needs to have happened
 * (`fastForwardLift`): a 16-week plan is 48 sessions, and the workout
 * screen takes about 8 s for each.
 *
 * Times are UTC: the specs pin the browser to it, and this process has to
 * read the same days (the runner is UTC in CI; `assertUtc` says so where
 * it isn't).
 */
import { expect, type Page } from "@playwright/test";
import { openSignUpForm } from "./auth";
import { emulatorAdmin, routeRealCallables } from "./realCallables";
import { realNow, setNodeClock } from "./nodeClock";
import { verifySignupEmail } from "./verifySignupEmail";
import {
  addLocalDays,
  localWeekKey,
  parseLocalDate,
} from "../../src/lib/dateHelpers";
import type { ProgramState } from "../../src/features/program/programTypes";
import {
  HOME,
  OFFER,
  SETUP,
  TABS,
  type SetupOption,
  type TabName,
} from "../../src/test/journeyScreens";

export const JOURNEY_PASSWORD = "test-password-123";

/** Fails at once where this process's days aren't the browser's. */
export function assertUtc(): void {
  expect(
    new Date().getTimezoneOffset(),
    "journeys read days in UTC: run them with TZ=UTC"
  ).toBe(0);
}

/** A day, `YYYY-MM-DD`, at noon UTC: clear of every midnight. */
export function noon(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** The `YYYY-MM-DD` `days` after `day`. */
export function plusDays(day: string, days: number): string {
  return localDateKey(addLocalDays(parseLocalDate(day), days));
}

function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The Monday of `day`'s week. */
export function weekOf(day: string): string {
  return localWeekKey(parseLocalDate(day));
}

/**
 * The first `weekday` (0 Sunday … 6 Saturday) after the real today, so a
 * journey starts on the same weekday whenever it runs, in the future, where
 * nothing it writes can meet another run's.
 */
export function nextWeekday(weekday: number): string {
  const today = new Date();
  const ahead = (weekday - today.getDay() + 7) % 7 || 7;
  return localDateKey(addLocalDays(today, ahead));
}

/**
 * The page's clock: `Date` behind a proxy whose "now" starts at the
 * journey's day on each load and runs on from there. Timers and
 * `performance` stay real.
 *
 * Not Playwright's `page.clock`, whose fixed time works for days but not
 * months: it keeps `performance.timeOrigin` at the first time it was set
 * and runs the page's timers itself, and from 2^31 ms (24.9 days) after
 * that first time the app never left "Loading Tropos" (measured: day 24
 * loads, day 25 doesn't, in a fresh account and in one trained weekly).
 */
async function installPageClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Real = Date;
    const clock = globalThis as unknown as {
      __journeyAt?: number;
      __journeyFrom?: number;
    };
    const now = () =>
      clock.__journeyAt === undefined
        ? Real.now()
        : clock.__journeyAt +
          (Real.now() - (clock.__journeyFrom ?? Real.now()));
    globalThis.Date = new Proxy(Real, {
      construct: (target, args, newTarget) =>
        Reflect.construct(target, args.length ? args : [now()], newTarget),
      apply: () => new Real(now()).toString(),
      get: (target, property, receiver) =>
        property === "now" ? now : Reflect.get(target, property, receiver),
    });
  });
}

/** Sets the page's clock and this process's to noon on `day`, from where
 *  both run on, for the page's next load: navigate after. Each load runs
 *  every init script in order, so the latest day wins, and a reload the
 *  same day carries on from where the clock had got to (the app's cache
 *  records when it wrote, and a clock that went back reads as a write from
 *  the future). */
export async function setDay(
  page: Page,
  day: string
): Promise<[number, number]> {
  const at = noon(day).getTime();
  const from = realNow();
  setNodeClock(at);
  await page.addInitScript(
    ([dayAt, realFrom]: [number, number]) => {
      const clock = globalThis as unknown as {
        __journeyAt?: number;
        __journeyFrom?: number;
      };
      clock.__journeyAt = dayAt;
      clock.__journeyFrom = realFrom;
    },
    [at, from] as [number, number]
  );
  return [at, from];
}

/**
 * Moves the journey to noon on `day` with the app open: both clocks move,
 * then the page comes back as a phone brings it back from the background
 * (`visibilitychange`, then `focus`), which is when the app reads the day
 * again (`useLocalDateKey`). A later load opens on the same day.
 */
export async function moveDay(page: Page, day: string): Promise<void> {
  const clocks = await setDay(page, day);
  await page.evaluate(([dayAt, realFrom]: [number, number]) => {
    const clock = globalThis as unknown as {
      __journeyAt?: number;
      __journeyFrom?: number;
    };
    clock.__journeyAt = dayAt;
    clock.__journeyFrom = realFrom;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  }, clocks);
}

/**
 * Sign-in that lasts the journey. The Auth emulator's tokens last an hour,
 * which the page dates by its own clock, and a journey moves that clock
 * days at a time: each move expired the token, the next request refreshed
 * it, and Firestore opened a new pair of streams on each new token. The
 * emulator keeps every stream a page ever opened and copies each later
 * write into all of them, so sixteen weeks reached 3.4 GB of heap. Here the
 * page is told each token lasts ten years. The token itself still expires
 * an hour after it was made, by the real clock, which is the one the
 * callables check it on (`realCallables.ts`): a journey runs well inside
 * that.
 */
async function outlastTheJourney(page: Page): Promise<void> {
  const TEN_YEARS = String(10 * 365 * 24 * 60 * 60);
  await page.route(
    /:9099\/(identitytoolkit|securetoken)\.googleapis\.com\//,
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      let reply = body;
      try {
        const json = JSON.parse(body) as Record<string, unknown>;
        if ("expiresIn" in json) json.expiresIn = TEN_YEARS;
        if ("expires_in" in json) json.expires_in = TEN_YEARS;
        reply = JSON.stringify(json);
      } catch {
        // Not JSON (a preflight): passed on as it came.
      }
      await route.fulfill({ response, body: reply });
    }
  );
}

const journeyErrors = new WeakMap<Page, string[]>();

/** The errors the page has thrown since the journey opened it. */
export function pageErrors(page: Page): readonly string[] {
  return journeyErrors.get(page) ?? [];
}

/**
 * Readies a page for a journey: the callables answered, the emulator's
 * banner out of the way of the bottom buttons, motion reduced, and the
 * clocks on `day`.
 */
export async function openJourney(page: Page, day: string): Promise<void> {
  assertUtc();
  await routeRealCallables(page);
  await outlastTheJourney(page);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installPageClock(page);
  // What the app says about its plan, and anything that goes wrong, in the
  // run's log: a journey that fails weeks in needs to say why.
  // Stamped with the journey's day: this process's clock moves with the
  // page's.
  const at = () => new Date().toISOString().slice(0, 16);
  page.on("console", (message) => {
    const text = message.text();
    if (/rollover|programme|program/i.test(text) || message.type() === "error")
      console.log(`[${at()} console.${message.type()}] ${text.slice(0, 400)}`);
  });
  const errors: string[] = [];
  journeyErrors.set(page, errors);
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log(`[${at()} uncaught] ${error.message}`);
  });
  page.on("response", async (response) => {
    if (response.status() < 400 || response.url().includes(":5001/")) return;
    const body = await response.text().catch(() => "");
    console.log(
      `[${at()} response] ${response.status()} ${response.request().method()} ${response.url().slice(0, 200)} ${body.slice(0, 300)}`
    );
  });
  await setDay(page, day);
}

export interface JourneyAccount {
  uid: string;
  email: string;
}

/** A new account through the sign-up form, its email verified as a person
 *  verifies it. Leaves the page on setup's first screen. */
export async function signUp(page: Page, tag: string): Promise<JourneyAccount> {
  await page.goto("/");
  await openSignUpForm(page);
  const email = `journey-${tag}-${Date.now()}@tropos.test`;
  await page.fill("#login-email", email);
  await page.fill("#login-password", JOURNEY_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await verifySignupEmail(page, email);
  const { uid } = await emulatorAdmin().auth.getUserByEmail(email);
  return { uid, email };
}

/** The account and everything under it, gone, the page having left the
 *  app first (an app still open on a deleted account keeps writing, and
 *  is refused). A journey runs this in `finally`, so a failure here is
 *  logged, never thrown over the journey's own. */
export async function deleteAccount(
  page: Page,
  account: JourneyAccount
): Promise<void> {
  const { auth, db } = emulatorAdmin();
  try {
    await page.goto("about:blank");
    await db.recursiveDelete(db.doc(`users/${account.uid}`));
    await auth.deleteUser(account.uid);
  } catch (error) {
    console.log(`[journey] couldn't delete ${account.email}: ${String(error)}`);
  }
}

export interface SetupAnswers {
  aim: SetupOption<"aims">;
  activity: SetupOption<"activities">;
  /** Lift sessions a week, where they lift. */
  liftDays?: SetupOption<"liftDays">;
  liftMinutes?: SetupOption<"liftMinutes">;
  /** Where they run. */
  runner?: SetupOption<"runners">;
  race?: {
    distance: SetupOption<"raceDistances">;
    /** `YYYY-MM-DD`. */
    date: string;
    runsPerWeek: number;
    legTrim?: boolean;
  };
  equipment?: SetupOption<"equipment">;
  experience?: SetupOption<"experience">;
  weightKg: number;
  heightCm: number;
  sex: SetupOption<"sexes">;
  age: SetupOption<"ages">;
}

function button(page: Page, name: string | RegExp) {
  return page.getByRole("button", {
    name,
    exact: typeof name === "string",
  });
}

async function next(page: Page) {
  await button(page, SETUP.continue).click();
}

/**
 * Setup's screens, as a person answers them, then Start my plan (answered by
 * the real `completeOnboarding`) and the offer's Continue with Free. Leaves
 * the page on Home.
 */
export async function setUpPlan(
  page: Page,
  answers: SetupAnswers
): Promise<void> {
  await button(page, new RegExp(`^${answers.aim}`)).click();
  await next(page);

  await page
    .getByRole("radiogroup", { name: SETUP.activities })
    .getByRole("radio", { name: answers.activity, exact: true })
    .click();
  if (answers.activity !== "Running") {
    await page
      .getByRole("radiogroup", { name: SETUP.liftDays })
      .getByRole("radio", { name: answers.liftDays ?? "4", exact: true })
      .click();
    await page
      .getByRole("radiogroup", { name: SETUP.liftMinutes })
      .getByRole("radio", {
        name: answers.liftMinutes ?? "60 min",
        exact: true,
      })
      .click();
  }
  if (answers.activity !== "Lifting") {
    // The run's questions are on the chapter's second screen.
    await next(page);
    await button(
      page,
      new RegExp(`^${answers.runner ?? "Regular runner"}`)
    ).click();
    if (answers.race) {
      await page
        .getByRole("radiogroup", { name: SETUP.runningPlan })
        .getByRole("radio", { name: SETUP.racePrep, exact: true })
        .click();
      // A native range input: its value, not an aria-valuenow.
      const runs = page.getByRole("slider", { name: SETUP.runsPerWeek });
      await runs.fill(String(answers.race.runsPerWeek));
      await expect(runs).toHaveValue(String(answers.race.runsPerWeek));
      await page
        .getByRole("radiogroup", { name: SETUP.raceDistance })
        .getByRole("radio", { name: answers.race.distance, exact: true })
        .click();
      await page
        .getByRole("textbox", { name: SETUP.raceDate })
        .fill(answers.race.date);
      if (answers.activity === "Both") {
        const trim = page.getByRole("switch", {
          name: SETUP.legTrim,
        });
        if (
          (await trim.getAttribute("aria-checked")) !==
          String(!!answers.race.legTrim)
        )
          await trim.click();
      }
    }
  }
  await next(page);

  if (answers.activity !== "Running") {
    await button(
      page,
      new RegExp(`^${answers.equipment ?? "Full gym"}`)
    ).click();
    await button(
      page,
      new RegExp(`^${answers.experience ?? "Some experience"}`)
    ).click();
    await next(page);
    await button(page, SETUP.noInjuries).click();
    await next(page);
  }

  await page
    .getByRole("textbox", { name: SETUP.weight, exact: true })
    .fill(String(answers.weightKg));
  await page
    .getByRole("textbox", { name: SETUP.height, exact: true })
    .fill(String(answers.heightCm));
  await page
    .getByRole("radiogroup", { name: SETUP.sex })
    .getByRole("radio", { name: answers.sex, exact: true })
    .click();
  await page
    .getByRole("radiogroup", { name: SETUP.age })
    .getByRole("radio", { name: answers.age, exact: true })
    .click();
  await next(page);

  await button(page, SETUP.start).click();
  await expect(page.getByRole("heading", { name: OFFER.ready })).toBeVisible({
    timeout: 30_000,
  });
  await button(page, OFFER.free).click();
  await expect(
    page.getByRole("heading", { name: HOME.heading, level: 1 })
  ).toBeVisible({
    timeout: 20_000,
  });
}

/** The programme as stored. */
export async function programme(uid: string): Promise<ProgramState> {
  const snapshot = await emulatorAdmin()
    .db.doc(`users/${uid}/programState/current`)
    .get();
  expect(snapshot.exists, "no programme stored").toBe(true);
  return snapshot.data() as ProgramState;
}

/** A screen from the tab bar, as a person reaches it. */
export async function openTab(page: Page, tab: TabName): Promise<void> {
  await page
    .getByRole("navigation", { name: TABS.navigation })
    .getByRole("link", { name: tab, exact: true })
    .click();
}

/**
 * Moves the journey to `day` (`moveDay`), then waits for the app to have
 * caught the plan up to that week: the rollover runs when the app comes
 * back on a new week, and a journey's next step reads what it wrote.
 */
export async function advanceTo(
  page: Page,
  account: JourneyAccount,
  day: string
): Promise<ProgramState> {
  await moveDay(page, day);
  const week = weekOf(day);
  let state: ProgramState | null = null;
  const caughtUp = (plan: ProgramState) =>
    (!plan.workouts?.length || (plan.liftWeekKey ?? "") >= week) &&
    (!plan.runDays?.length ||
      plan.runDays.every((run) => !run.weekKey || run.weekKey >= week));
  try {
    await expect
      .poll(
        async () => {
          state = await programme(account.uid);
          return caughtUp(state);
        },
        { timeout: 20_000 }
      )
      .toBe(true);
  } catch {
    const plan = state as ProgramState | null;
    throw new Error(
      `the plan never reached the week of ${week}: ${JSON.stringify({
        liftWeekKey: plan?.liftWeekKey,
        weekNumber: plan?.weekNumber,
        currentPhase: plan?.currentPhase,
        runWeeks: [...new Set(plan?.runDays?.map((run) => run.weekKey))],
        workouts: plan?.workouts?.map((w) => [
          w.dayName,
          w.completed,
          w.skipped,
        ]),
      })}`
    );
  }
  return state!;
}
