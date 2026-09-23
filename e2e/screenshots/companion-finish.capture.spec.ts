import { test, expect } from "@playwright/test";
import { signInAsTestUser, TEST_USER } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FIRESTORE}/v1/projects/demo-tropos/databases/(default)/documents`;

test.use({ viewport: { width: 375, height: 852 } });
for (const budget of [null, 30] as const) {
  const capturePrefix = budget === null ? "" : "usual-time-";
  test(`a saved ${budget === null ? "full" : "usual time"} lift has one finish and Done returns to Program`, async ({
    page,
    request,
  }) => {
    test.skip(!emulatorActive, "isolated emulator account only");
    test.setTimeout(120_000);
    const headers = { Authorization: "Bearer owner" };
    const accounts = await request.post(
      `http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-tropos/accounts:query`,
      { headers, data: {} }
    );
    expect(accounts.ok()).toBe(true);
    const source = (await accounts.json()).userInfo.find(
      (user: { email: string }) => user.email === TEST_USER.email
    );
    expect(source).toBeTruthy();
    const email = `companion-finish-${Date.now()}@tropos.test`;
    const password = "test-password-123";
    const signup = await request.post(
      `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-dummy-key`,
      { data: { email, password, returnSecureToken: true } }
    );
    expect(signup.ok()).toBe(true);
    const { localId: uid } = await signup.json();
    // Copy only the profile; the app creates this fresh account's programme.
    // Depending on the shared account's programme makes isolated runs order-dependent.
    for (const suffix of [""]) {
      const sourceDoc = await request.get(
        `${DOCS}/users/${source.localId}${suffix}`,
        { headers }
      );
      expect(sourceDoc.ok()).toBe(true);
      const { fields } = await sourceDoc.json();
      if (!suffix) {
        fields.uid = { stringValue: uid };
        fields.liftTimeBudgetMinutes =
          budget === null
            ? { nullValue: null }
            : { integerValue: String(budget) };
        fields.runMode = { stringValue: "freeform" };
        fields.nonRaceGoal = {
          mapValue: {
            fields: {
              kind: { stringValue: "runs" },
              target: { integerValue: "3" },
            },
          },
        };
      }
      const copy = await request.patch(`${DOCS}/users/${uid}${suffix}`, {
        headers,
        data: { fields },
      });
      expect(copy.ok()).toBe(true);
    }
    await suppressCoachmarks(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signInAsTestUser(page, { email, password });
    if (budget !== null) {
      await page.goto("program");
      await expect(
        page.getByRole("button", { name: "Start workout", exact: true })
      ).toBeVisible();
      await page.goto("settings/lift-plan");
      const liftingTime = page.getByRole("region", {
        name: "Usual lifting time",
      });
      await expect(liftingTime.getByRole("combobox")).toHaveValue("30");
      await expect(liftingTime.getByText(/ · about /).first()).toBeVisible();
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark
        );
        await liftingTime.screenshot({
          path: `screenshots/usual-lifting-time-${dark ? "dark" : "light"}.png`,
          animations: "disabled",
        });
      }
      await page.goto("program?tab=run");
      await expect(
        page.getByLabel("Weekly running goal", { exact: true })
      ).toContainText("0 / 3");
      await page.goto("settings/run-plan");
      const goal = page.getByRole("region", {
        name: "Weekly running goal",
        exact: true,
      });
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark
        );
        await goal.screenshot({
          path: `screenshots/weekly-running-goal-${dark ? "dark" : "light"}.png`,
          animations: "disabled",
        });
      }
      await page.getByRole("radio", { name: /Race prep/ }).click();
      await page
        .getByRole("button", { name: "Add starting point", exact: true })
        .click();
      await page.getByLabel("Recent minutes per week").fill("90");
      await page.getByLabel("Longest recent run, min").fill("30");
      const baseline = page.getByRole("region", {
        name: "Running starting point",
      });
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark
        );
        await baseline.screenshot({
          path: `screenshots/running-starting-point-${dark ? "dark" : "light"}.png`,
          animations: "disabled",
        });
      }
      await page.goto("program");
      await page.goto("settings/run-plan");
      await expect(page.getByLabel("Recent minutes per week")).toHaveValue(
        "90"
      );
      await expect(page.getByLabel("Longest recent run, min")).toHaveValue(
        "30"
      );
    }
    await page.goto("program");
    // The SDK emulator banner stays visible but must not consume app taps.
    await page.addStyleTag({
      content:
        ".firebase-emulator-warning { pointer-events: none !important; }",
    });
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const warmups = await page
      .getByTitle("Set type: warmup", { exact: true })
      .count();
    await page
      .getByRole("button", { name: "Mark set complete", exact: true })
      .nth(warmups)
      .click();
    const endRest = page.getByRole("button", { name: "End rest", exact: true });
    if (await endRest.isVisible()) await endRest.click();
    await page
      .getByRole("button", {
        name: `Edit completed set ${warmups + 1}`,
        exact: true,
      })
      .click();
    const correction = page.getByRole("dialog", {
      name: `Edit set ${warmups + 1}`,
      exact: true,
    });
    await expect(correction).toBeVisible();
    await correction
      .getByRole("textbox", { name: "Reps", exact: true })
      .fill("6");
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark
      );
      await settleImages(page);
      await page.screenshot({
        path: `screenshots/${capturePrefix}completed-set-edit-${dark ? "dark" : "light"}.png`,
        animations: "disabled",
      });
    }
    await correction
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(correction).toHaveCount(0);
    await expect(
      page.getByRole("spinbutton", {
        name: `Set ${warmups + 1} reps`,
        exact: true,
      })
    ).toHaveValue("6");
    await page
      .getByRole("button", { name: "Finish early", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review completed work", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Session completion" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review workout", exact: true })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save Workout", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Done", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Workout saved", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // A first finish asks once, inline, with three equal answers. Nothing
    // is posted until one is picked.
    await expect(
      page.getByRole("heading", {
        name: "Share sessions automatically?",
        exact: true,
      })
    ).toBeVisible();
    for (const name of [
      "Share with followers",
      "Share publicly",
      "Don't share",
    ]) {
      await expect(
        page.getByRole("button", { name, exact: true })
      ).toBeVisible();
    }
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark
      );
      await settleImages(page);
      await page.screenshot({
        path: `screenshots/${capturePrefix}companion-finish-${dark ? "dark" : "light"}.png`,
        animations: "disabled",
      });
    }
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Session completion" })
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/program(?:\?.*)?$/);
    await page
      .getByRole("button", { name: "View this workout", exact: true })
      .click();
    await expect(page).toHaveURL(/\/workout\/programme-/);
    const workoutId = new URL(page.url()).pathname.split("/").at(-1);
    const saved = await request.get(
      `${DOCS}/users/${uid}/workouts/${workoutId}`,
      { headers }
    );
    expect(saved.ok()).toBe(true);
    const { fields } = await saved.json();
    expect(fields.sessionVariant?.stringValue).toBe(
      budget === null ? undefined : "time_budget"
    );
  });
}
