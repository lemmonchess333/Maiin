import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";
import { computePlanMetadata } from "../../src/lib/runPlanMetadata";
import {
  localDateString,
  localWeekKey,
  addLocalDays,
} from "../../src/lib/dateHelpers";

const require = createRequire(import.meta.url);
test.use({ viewport: { width: 375, height: 852 } });

test("running feedback follows edits and opens a reversible easier-week preview", async ({
  page,
}) => {
  test.skip(!emulatorActive, "isolated emulator account only");
  test.setTimeout(120_000);
  const admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp({ projectId: "demo-tropos" });
  const db = admin.firestore();
  const source = await admin
    .auth()
    .getUserByEmail("fellbehind-capture@tropos.test");
  const sourceProfile = (await db.doc(`users/${source.uid}`).get()).data();
  const sourcePlan = (
    await db.doc(`users/${source.uid}/programState/current`).get()
  ).data();
  expect(sourceProfile).toBeTruthy();
  expect(sourcePlan).toBeTruthy();
  const email = `run-coaching-${Date.now()}@tropos.test`;
  const password = "test-password-123";
  const { uid } = await admin
    .auth()
    .createUser({ email, password, emailVerified: true });
  const now = new Date();
  const today = localDateString(now);
  const profile = { ...sourceProfile, uid, email, darkMode: false };
  const runDay = {
    id: `coaching-${today}`,
    dayIndex: now.getDay(),
    date: today,
    weekKey: localWeekKey(now),
    templateId: "tempo_30",
    type: "tempo",
    status: "planned",
    completed: false,
  };
  const state = {
    ...sourcePlan,
    pendingFellBehindPrompt: null,
    runDays: [runDay],
    updatedAt: Date.now(),
    manualCompletions: {},
  };
  await db.doc(`users/${uid}`).set(profile);
  await db.doc(`users/${uid}/programState/current`).set(state);
  const paths = ["short-a", "short-b"];
  for (let index = 0; index < paths.length; index++) {
    const date = addLocalDays(now, -(index + 1));
    const savedDay = {
      id: `previous-${index}`,
      date: localDateString(date),
      dayIndex: date.getDay(),
      templateId: "easy_20",
      type: "easy",
      completed: false,
    };
    const { metadata, prefill } = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: "race_prep",
      todayDayIndex: date.getDay(),
      todayDate: savedDay.date,
      runPlan: undefined,
      runDays: [savedDay],
      urlTemplateId: savedDay.templateId,
      urlScheduledRunId: savedDay.id,
      urlType: null,
    });
    await db.doc(`users/${uid}/runs/${paths[index]}`).set({
      date: localDateString(date),
      completedAt: admin.firestore.Timestamp.fromDate(date),
      distance: 1500,
      duration: 600,
      avgPace: 400,
      activityType: "easy",
      relativeEffort: null,
      isInvalid: false,
      savedAnyway: false,
      ...metadata,
      runConfig: prefill,
    });
  }
  // The normal capture rig has Auth + Firestore, not a Functions HTTP
  // emulator. Route this callable into its ACTUAL exported handler with a
  // verified emulator token; mutations still use the real transaction/rules
  // owners. No fabricated success response or parallel reducer.
  const { applyProgramCommand } = require("../../functions/index.js");
  await page.route(
    "**/demo-tropos/us-central1/applyProgramCommand",
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
        return;
      }
      const token = await admin.auth().verifyIdToken(
        route
          .request()
          .headers()
          .authorization.replace(/^Bearer /, "")
      );
      const result = await applyProgramCommand.run(
        route.request().postDataJSON().data,
        { auth: { uid: token.uid, token } }
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ result }),
      });
    }
  );
  await suppressCoachmarks(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsTestUser(page, { email, password });
  await page.goto("program?tab=run");
  const review = page.getByRole("button", {
    name: "Review easier week",
    exact: true,
  });
  // Advice also waits for the runs query's server snapshot, which may
  // arrive after the profile and programme on a busy emulator runner.
  await expect(review).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "See runs", exact: true }).click();
  await expect(page.getByRole("link", { name: /10:00 \/ 20:00/ })).toHaveCount(
    2
  );
  const card = review.locator("../..");
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await card.screenshot({
      path: `screenshots/run-coaching-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
  // Remote edits and deletions must invalidate an already mounted card.
  await db.doc(`users/${uid}/runs/short-b`).update({ duration: 1800 });
  await expect(review).toHaveCount(0);
  await db.doc(`users/${uid}/runs/short-b`).update({ duration: 600 });
  await expect(review).toBeVisible();
  await db.doc(`users/${uid}/runs/short-b`).delete();
  await expect(review).toHaveCount(0);
  const first = (await db.doc(`users/${uid}/runs/short-a`).get()).data();
  await db.doc(`users/${uid}/runs/short-b`).set(first);
  await expect(review).toBeVisible();
  const before = (
    await db.doc(`users/${uid}/programState/current`).get()
  ).data();
  await review.click();
  const sheet = page.getByRole("dialog", {
    name: "Adjust this week",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  expect(
    (await db.doc(`users/${uid}/programState/current`).get()).data().runDays
  ).toEqual(before.runDays);
  // Server work has its own bounded wait; the normal UI assertions below
  // start after the matching command response, not while it is in flight.
  const waitForCommand = (kind: string) =>
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/applyProgramCommand") &&
        response.request().method() === "POST" &&
        response.request().postDataJSON().data.kind === kind
    );
  const [applied] = await Promise.all([
    waitForCommand("applyEaseWeek"),
    sheet.getByRole("button", { name: "Ease this week", exact: true }).click(),
  ]);
  expect(applied.ok()).toBe(true);
  await expect(sheet).toHaveCount(0);
  await expect(review).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await db.doc(`users/${uid}/programState/current`).get()).data()
          .runDays[0].userOverride
    )
    .toBe("easy_30");
  await page.getByRole("button", { name: /Adjust this week/ }).click();
  const [undone] = await Promise.all([
    waitForCommand("revertEaseWeek"),
    sheet
      .getByRole("button", { name: "Undo easier week", exact: true })
      .click(),
  ]);
  expect(undone.ok()).toBe(true);
  await expect
    .poll(
      async () =>
        (await db.doc(`users/${uid}/programState/current`).get()).data()
          .runDays[0].userOverride ?? null
    )
    .toBe(null);
});
