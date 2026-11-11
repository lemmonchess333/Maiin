/** A reviewed one-off move through the real UI, command handler and emulator. */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";
import { nextWeekday, openJourney, plusDays, weekOf } from "./helpers/journey";
import { resetNodeClock } from "./helpers/nodeClock";
import { buildPlan } from "../src/features/program/planBuilder";
import { stripUndefined } from "../src/lib/firestoreGuards";
import { settleImages } from "./helpers/settleImages";

const PASSWORD = "test-password-123";

test.skip(!emulatorActive, "Requires the local Auth and Firestore emulators");
test.setTimeout(120_000);

test("reviews a run move while preserving actual history, lift rotation and usual week", async ({
  page,
}) => {
  // Functions can have a separate Admin SDK installation from the test runner.
  // Its default app must resolve the same strictly gated emulator project.
  process.env.GCLOUD_PROJECT = "demo-tropos";
  const { auth, db, Timestamp } = emulatorAdmin();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const captureDir = process.env.PLAN_CAPTURE_DIR;
  const metrics: Record<string, unknown> = {
    errors,
    source:
      "Implemented app; real exported callable handlers and local Auth/Firestore emulators",
  };
  const capture = async (name: string) => {
    if (!captureDir) return;
    await mkdir(captureDir, { recursive: true });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await settleImages(page);
    await page.screenshot({
      path: `${captureDir}/${name}.png`,
      animations: "disabled",
    });
    metrics[name] = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
  };
  const today = nextWeekday(3);
  const monday = weekOf(today);
  const thursday = plusDays(monday, 3);
  const saturday = plusDays(monday, 5);
  const email = `plan-workspace-${Date.now()}@tropos.test`;
  const user = await auth.createUser({
    email,
    password: PASSWORD,
    emailVerified: true,
  });
  const base = db.doc(`users/${user.uid}`);
  const schedule = [
    { day: 0, type: "rest" as const },
    { day: 1, type: "lift" as const },
    { day: 2, type: "run" as const },
    { day: 3, type: "lift" as const },
    { day: 4, type: "run" as const },
    { day: 5, type: "lift" as const },
    { day: 6, type: "rest" as const },
  ];
  const plan = buildPlan({
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 74,
    sex: "female",
    liftDays: 3,
    preferredSplit: "auto",
    runMode: "race_prep",
    weeklyRunDays: 2,
    raceGoal: { distance: "10k", targetDate: plusDays(monday, 55) },
    equipment: "full_gym",
    injuries: [],
    weekSchedule: schedule,
    currentDate: monday,
    preserveHistory: false,
  });
  const state = plan.programState;
  state.workouts[0].completed = true;
  state.runDays = [
    {
      ...state.runDays![0],
      id: "easy",
      weekKey: monday,
      date: plusDays(monday, 1),
      dayIndex: 2,
      templateId: "easy_30",
      type: "easy",
      status: "planned",
      completed: false,
    },
    {
      ...state.runDays![1],
      id: "tempo",
      weekKey: monday,
      date: thursday,
      dayIndex: 4,
      templateId: "tempo_20",
      type: "tempo",
      status: "planned",
      completed: false,
    },
  ];
  try {
    const sourceUser = await auth.getUserByEmail("e2e-test@tropos.test");
    const source = (await db.doc(`users/${sourceUser.uid}`).get()).data();
    await base.set(
      stripUndefined({
        ...source,
        ...plan.profileUpdates,
        uid: user.uid,
        email,
        displayName: "Plan workspace",
        timezone: "UTC",
        timeZone: "UTC",
        onboardingComplete: true,
        subscriptionTier: "pro",
        darkMode: true,
        createdAt: Timestamp.fromDate(
          new Date(`${plusDays(monday, -28)}T12:00:00Z`)
        ),
      })
    );
    await base
      .collection("programState")
      .doc("current")
      .set(stripUndefined(state));
    await base
      .collection("workouts")
      .doc("monday-lift")
      .set({
        date: monday,
        notes: `${state.workouts[0].dayName} — Programme Week 1`,
        durationMinutes: 42,
        totalCalories: 240,
        source: "programme",
        createdAt: Timestamp.fromDate(new Date(`${monday}T10:00:00Z`)),
        exercises: [],
      });
    await base
      .collection("runs")
      .doc("tuesday-run")
      .set({
        date: plusDays(monday, 1),
        distance: 5000,
        duration: 1800,
        avgPace: 360,
        activityType: "easy",
        actualTemplateId: "easy_30",
        plannedTemplateId: "easy_30",
        completedAt: Timestamp.fromDate(
          new Date(`${plusDays(monday, 1)}T09:30:00Z`)
        ),
        calories: 300,
        elevationGain: 0,
      });
    await openJourney(page, today);
    await page.goto("./");
    const emailField = page.locator("#login-email");
    const signIn = page.getByRole("button", {
      name: "I have an account",
      exact: true,
    });
    await signIn.or(emailField).first().waitFor();
    if (await signIn.isVisible()) await signIn.click();
    await emailField.fill(email);
    await page.locator("#login-password").fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.getByRole("navigation", { name: /main navigation/i }).waitFor();
    await page.goto(`program?tab=run&rday=${thursday}`);
    await page.getByRole("link", { name: "Your plan", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your plan", exact: true })
    ).toBeVisible();
    const returnLink = page
      .locator("main")
      .getByRole("link", { name: "Train", exact: true });
    const returnUrl = new URL(
      (await returnLink.getAttribute("href"))!,
      page.url()
    );
    expect(returnUrl.searchParams.get("tab")).toBe("run");
    expect(returnUrl.searchParams.get("rday")).toBe(thursday);
    await page
      .locator("main")
      .getByRole("link", { name: "Train", exact: true })
      .click();
    expect(new URL(page.url()).searchParams.get("tab")).toBe("run");
    expect(new URL(page.url()).searchParams.get("rday")).toBe(thursday);
    await page.getByRole("link", { name: "Your plan", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: `Start ${state.workouts[1].dayName}`,
        exact: true,
      })
    ).toBeVisible();
    const move = page.getByRole("button", { name: "Move a run", exact: true });
    await expect(move).toBeEnabled();
    if (captureDir) {
      metrics.today = today;
      metrics.agendaText = await page.locator("main").innerText();
      for (const size of [
        { name: "phone", width: 393, height: 852, scale: 1 },
        { name: "small", width: 320, height: 568, scale: 1 },
        { name: "large-text", width: 393, height: 852, scale: 2 },
      ]) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.evaluate((scale) => {
          document.documentElement.style.fontSize = `${16 * scale}px`;
        }, size.scale);
        for (const theme of ["dark", "light"]) {
          await page.evaluate(
            (dark) => document.documentElement.classList.toggle("dark", dark),
            theme === "dark"
          );
          await page.evaluate(() => scrollTo(0, 0));
          await capture(`workspace-${size.name}-${theme}`);
        }
      }
      await page.setViewportSize({ width: 393, height: 852 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "16px";
        document.documentElement.classList.add("dark");
      });
    }
    await move.click();
    const sheet = page.getByRole("dialog", { name: "Move a run", exact: true });
    await expect(
      sheet.getByRole("group", { name: "Planned run" }).getByRole("radio")
    ).toHaveCount(1);
    await capture("move-picker-dark");
    await sheet.getByRole("radio", { name: /Fri/ }).check();
    await sheet
      .getByRole("button", { name: "Review change", exact: true })
      .click();
    const review = page.getByRole("dialog", {
      name: "Review change",
      exact: true,
    });
    await expect(
      review.getByRole("button", { name: "Confirm change", exact: true })
    ).toBeDisabled();
    await capture("move-warning-dark");
    await review
      .getByRole("checkbox", { name: "Keep this destination" })
      .check();
    await expect(
      review.getByRole("button", { name: "Confirm change", exact: true })
    ).toBeEnabled();
    await review
      .getByRole("button", { name: "Edit destination", exact: true })
      .click();
    await expect(sheet.getByRole("radio", { name: /Fri/ })).toBeChecked();
    // Retaining a dirty draft must keep intercepting native Back each time.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await page.goBack();
      const discard = page.getByRole("alertdialog", {
        name: "Discard this change?",
        exact: true,
      });
      await expect(discard, `dirty Back attempt ${attempt + 1}`).toBeVisible();
      if (attempt === 0) await capture("move-discard-dark");
      await discard
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      await expect(sheet.getByRole("radio", { name: /Fri/ })).toBeChecked();
      await expect(page).toHaveURL(/\/program\/plan$/);
    }
    await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (await base.collection("programState").doc("current").get()).data()!
        .runDays[1].date
    ).toBe(thursday);
    metrics.nativeBackRetainedDraft = 2;
    await move.click();
    await sheet.getByRole("radio", { name: /Sat/ }).check();
    await sheet
      .getByRole("button", { name: "Review change", exact: true })
      .click();
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      await capture(`move-review-${theme}`);
    }
    await review
      .getByRole("button", { name: "Confirm change", exact: true })
      .click();
    await expect(review).not.toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (await base.collection("programState").doc("current").get()).data()!
            .runDays[1].date
      )
      .toBe(saturday);
    const after = (
      await base.collection("programState").doc("current").get()
    ).data()!;
    expect(after.runDays[1]).toMatchObject({
      id: "tempo",
      date: saturday,
      templateId: "tempo_20",
      movedFromDate: thursday,
    });
    expect(
      after.workouts.map((day: { dayName: string }) => day.dayName)
    ).toEqual(state.workouts.map((day) => day.dayName));
    expect((await base.get()).data()!.weekSchedule).toEqual(schedule);
    expect((await base.collection("runs").get()).size).toBe(1);
    expect((await base.collection("workouts").get()).size).toBe(1);
    expect(errors).toEqual([]);
    await capture("workspace-after-move-light");
    metrics.persistedMove = {
      runId: after.runDays[1].id,
      from: thursday,
      to: saturday,
      templateId: after.runDays[1].templateId,
      usualWeekUnchanged: true,
      liftOrderUnchanged: true,
    };
    if (captureDir)
      await writeFile(
        `${captureDir}/browser-metrics.json`,
        JSON.stringify(metrics, null, 2)
      );
  } finally {
    resetNodeClock();
    await db.recursiveDelete(base);
    await auth.deleteUser(user.uid);
  }
});
