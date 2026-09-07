import { test, expect } from "@playwright/test";
import { signInAsTestUser, TEST_USER } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FIRESTORE}/v1/projects/demo-tropos/databases/(default)/documents`;

test.use({ viewport: { width: 375, height: 852 } });
test("a saved lift has one finish and Done returns to Program", async ({
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
    if (!suffix) fields.uid = { stringValue: uid };
    const copy = await request.patch(`${DOCS}/users/${uid}${suffix}`, {
      headers,
      data: { fields },
    });
    expect(copy.ok()).toBe(true);
  }
  await suppressCoachmarks(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsTestUser(page, { email, password });
  await page.goto("program");
  // The SDK emulator banner stays visible but must not consume app taps.
  await page.addStyleTag({ content: ".firebase-emulator-warning { pointer-events: none !important; }" });
  await page
    .getByRole("button", { name: "Begin Workout", exact: true })
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
  await page.getByRole("button", { name: "Finish early", exact: true }).click();
  await page
    .getByRole("button", { name: "Review completed work", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Session completion" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Save Workout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share this session", exact: true })
  ).toBeVisible();
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await page.screenshot({
      path: `screenshots/companion-finish-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Session completion" })
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/program(?:\?.*)?$/);
});
