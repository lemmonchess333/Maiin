/** Saved history, through actual range readers and session detail routes. */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";
import { openJourney, plusDays } from "./helpers/journey";
import { resetNodeClock } from "./helpers/nodeClock";
import { buildPlan } from "../src/features/program/planBuilder";
import { stripUndefined } from "../src/lib/firestoreGuards";
import { settleImages } from "./helpers/settleImages";

test.skip(!emulatorActive, "Requires the local Auth and Firestore emulators");
test.setTimeout(180_000);
test.use({ viewport: { width: 393, height: 852 }, timezoneId: "UTC" });

test("browses lifts and runs, filters an older period and restores the expanded list on Back", async ({
  page,
}) => {
  process.env.GCLOUD_PROJECT = "demo-tropos";
  const { auth, db, Timestamp } = emulatorAdmin();
  const email = `training-history-${Date.now()}@tropos.test`;
  const password = "test-password-123";
  const user = await auth.createUser({ email, password, emailVerified: true });
  const base = db.doc(`users/${user.uid}`);
  const today = new Date().toISOString().slice(0, 10);
  const olderDay = plusDays(today, -400);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const metrics: Record<string, unknown> = {
    errors,
    source: "Implemented app, isolated local emulator account",
    today,
  };
  const captureDir = process.env.HISTORY_CAPTURE_DIR;
  if (captureDir) await mkdir(captureDir, { recursive: true });
  async function capture(name: string) {
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await settleImages(page);
    // Resizing and changing the root text size need a painted frame even
    // when optional screenshots aren't requested by the CI runner.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    if (captureDir) {
      await page.screenshot({
        path: `${captureDir}/${name}.png`,
        animations: "disabled",
      });
    }
    const layout = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#history-search");
      const icon = input?.parentElement?.querySelector(":scope > svg");
      const clear = input?.parentElement?.querySelector("button");
      const style = input ? getComputedStyle(input) : null;
      const rect = input?.getBoundingClientRect();
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        searchIconGap:
          rect && style && icon
            ? rect.left +
              parseFloat(style.borderLeftWidth) +
              parseFloat(style.paddingLeft) -
              icon.getBoundingClientRect().right
            : null,
        searchClearGap:
          rect && style && clear
            ? clear.getBoundingClientRect().left -
              (rect.right -
                parseFloat(style.borderRightWidth) -
                parseFloat(style.paddingRight))
            : null,
      };
    });
    metrics[name] = layout;
    expect(layout.overflow, name).toBe(false);
    if (layout.searchIconGap !== null)
      expect(
        layout.searchIconGap,
        `${name}: search text clears its icon`
      ).toBeGreaterThanOrEqual(8);
    if (layout.searchClearGap !== null)
      expect(
        layout.searchClearGap,
        `${name}: search text clears the clear button`
      ).toBeGreaterThanOrEqual(0);
  }
  const timestamp = (day: string) =>
    Timestamp.fromDate(new Date(`${day}T12:00:00Z`));
  const lift = (day: string, title: string) => ({
    date: day,
    notes: `${title} — Programme Week 1`,
    durationMinutes: 46,
    totalCalories: 250,
    createdAt: timestamp(day),
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        category: "push",
        caloriesBurned: 0,
        sets: [1, 2, 3].map((setNumber) => ({
          setNumber,
          reps: 8,
          weightKg: 60,
          type: "working",
        })),
      },
    ],
  });
  const run = (day: string, activityType = "easy") => ({
    date: day,
    activityType,
    distance: 5200,
    duration: 1872,
    avgPace: 360,
    calories: 300,
    elevationGain: 0,
    completedAt: timestamp(day),
    points: [],
    splits: [],
    bestEfforts: [],
  });
  try {
    const plan = buildPlan({
      primaryGoal: "hypertrophy",
      nutritionPhase: "recomp",
      experience: "intermediate",
      bodyweightKg: 74,
      sex: "female",
      liftDays: 3,
      preferredSplit: "auto",
      runMode: "freeform",
      weeklyRunDays: 0,
      equipment: "full_gym",
      injuries: [],
      currentDate: today,
      preserveHistory: false,
    });
    await base.set(
      stripUndefined({
        ...plan.profileUpdates,
        uid: user.uid,
        email,
        displayName: "History review",
        onboardingComplete: true,
        subscriptionTier: "pro",
        weightKg: 74,
        heightCm: 170,
        sex: "female",
        timezone: "UTC",
        timeZone: "UTC",
        darkMode: true,
        preferredWeightUnit: "kg",
        preferredDistanceUnit: "km",
        createdAt: timestamp(plusDays(today, -500)),
      })
    );
    await base
      .collection("programState")
      .doc("current")
      .set(stripUndefined(plan.programState));
    const batch = db.batch();
    for (const [index, ago] of [1, 5, 8, 10].entries())
      batch.set(
        base.collection("workouts").doc(`recent-lift-${index}`),
        lift(plusDays(today, -ago), `Full body ${["B", "C", "B", "A"][index]}`)
      );
    for (const [index, ago] of [2, 7, 9].entries())
      batch.set(
        base.collection("runs").doc(`recent-run-${index}`),
        run(plusDays(today, -ago), index === 1 ? "tempo" : "easy")
      );
    for (let i = 0; i < 70; i++)
      batch.set(
        base
          .collection("workouts")
          .doc(`older-lift-${String(i).padStart(2, "0")}`),
        lift(olderDay, `Saved lift ${i + 1}`)
      );
    batch.set(base.collection("runs").doc("older-run"), run(olderDay));
    await batch.commit();
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
    await page.locator("#login-password").fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.getByRole("navigation", { name: /main navigation/i }).waitFor();
    await page.goto("history");
    await page.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByText("7 sessions", { exact: true })).toBeVisible();
    const list = page.getByRole("region", {
      name: "Saved sessions",
      exact: true,
    });
    await expect(list.getByRole("link")).toHaveCount(7);

    for (const width of [393, 320])
      for (const scale of [1, 2])
        for (const theme of ["dark", "light"]) {
          await page.setViewportSize({ width, height: 852 });
          await page.evaluate(
            ({ scale, theme }) => {
              document.documentElement.style.fontSize = `${16 * scale}px`;
              document.documentElement.classList.toggle(
                "dark",
                theme === "dark"
              );
              window.scrollTo(0, 0);
            },
            { scale, theme }
          );
          await capture(`history-${width}-${scale}x-${theme}`);
          await page.getByRole("searchbox").fill("body");
          await capture(`search-${width}-${scale}x-${theme}`);
          await page
            .getByRole("button", { name: "Clear search", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Last 30 days", exact: true })
            .click();
          await capture(`dates-${width}-${scale}x-${theme}`);
          await page
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "16px";
      document.documentElement.classList.add("dark");
    });
    await page.getByRole("radio", { name: "Runs", exact: true }).click();
    await expect(page.getByText("3 runs", { exact: true })).toBeVisible();
    await page.getByRole("searchbox").fill("tempo");
    await expect(page.getByText("1 run", { exact: true })).toBeVisible();
    const filteredUrl = page.url();
    await capture("filtered-runs-dark");
    await list.getByRole("link").click();
    await expect(page).toHaveURL(/\/run\/recent-run-1$/);
    await expect(page.getByText("Tempo run", { exact: true })).toBeVisible();
    await capture("run-detail-dark");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(filteredUrl);
    await expect(page.getByRole("searchbox")).toHaveValue("tempo");
    await expect(page.getByRole("radio", { name: "Runs" })).toBeChecked();

    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await page.getByRole("radio", { name: "All", exact: true }).click();
    await page
      .getByRole("button", { name: "Last 30 days", exact: true })
      .click();
    const sheetUrl = page.url();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(sheetUrl);
    await page
      .getByRole("button", { name: "Last 30 days", exact: true })
      .click();
    await page.getByLabel("From", { exact: true }).fill(olderDay);
    await page.getByLabel("To", { exact: true }).fill(olderDay);
    await page
      .getByRole("button", { name: "Apply dates", exact: true })
      .click();
    await expect(page.getByText("71 sessions", { exact: true })).toBeVisible();
    await expect(list.getByRole("link")).toHaveCount(30);
    await page
      .getByRole("button", { name: "Show more sessions", exact: true })
      .click();
    await expect(list.getByRole("link")).toHaveCount(60);
    const olderLink = list.getByRole("link").nth(45);
    await olderLink.scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    const olderUrl = page.url();
    await olderLink.click();
    await expect(page.getByText("Bench Press", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await capture("older-lift-detail-dark");
    await page.goBack();
    await expect(page).toHaveURL(olderUrl);
    await expect(list.getByRole("link")).toHaveCount(60);
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => window.scrollY)) - scrollY)
      )
      .toBeLessThan(3);
    metrics.backRestoration = {
      scrollY,
      actual: await page.evaluate(() => window.scrollY),
      visible: await list.getByRole("link").count(),
    };
    await page
      .getByRole("button", { name: "Show more sessions", exact: true })
      .click();
    await expect(list.getByRole("link")).toHaveCount(71);
    await expect(
      page.getByRole("button", { name: "Show more sessions", exact: true })
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    if (captureDir)
      await writeFile(
        `${captureDir}/metrics.json`,
        JSON.stringify(metrics, null, 2)
      );
    await page.close();
    await db.recursiveDelete(base);
    await auth.deleteUser(user.uid);
    resetNodeClock();
  }
});
