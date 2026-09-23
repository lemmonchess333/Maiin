import { test, expect } from "@playwright/test";
import { signInAsTestUser, TEST_USER } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FIRESTORE}/v1/projects/demo-tropos/databases/(default)/documents`;

test.use({ viewport: { width: 375, height: 852 } });
test("usual meals are visible and offline adds can be undone", async ({
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
  const email = `companion-food-${Date.now()}@tropos.test`;
  const password = "test-password-123";
  const signup = await request.post(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-dummy-key`,
    { data: { email, password, returnSecureToken: true } }
  );
  expect(signup.ok()).toBe(true);
  const { localId: uid } = await signup.json();
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
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        ".firebase-emulator-warning { display: none !important; }";
      document.head.append(style);
    })
  );
  await suppressCoachmarks(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsTestUser(page, { email, password });
  await page.goto("food");
  await page.addStyleTag({
    content: ".firebase-emulator-warning { display: none !important; }",
  });
  const composer = page.locator("textarea").first();
  await composer.focus();
  await expect(
    page.getByText("Examples — tap to describe your own")
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Oatmeal/ })
    .first()
    .click();
  await expect(composer).not.toHaveValue("");
  const before = await request.get(`${DOCS}/users/${uid}/meals`, { headers });
  expect((await before.json()).documents ?? []).toHaveLength(0);
  // Three earlier days per slot: the smallest history that is a usual
  // (usualMeal.ts — USUAL_MIN_DAYS of the last USUAL_WINDOW_DAYS). With
  // fewer, there is no row at all.
  for (const daysAgo of [1, 2, 3]) {
    const day = new Date();
    day.setDate(day.getDate() - daysAgo);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    for (const slot of ["breakfast", "lunch", "dinner", "snacks"]) {
      const seed = await request.patch(
        `${DOCS}/users/${uid}/meals/usual-${slot}-${daysAgo}`,
        {
          headers,
          data: {
            fields: {
              date: { stringValue: date },
              meal: { stringValue: slot },
              foodName: { stringValue: "Oats and berries" },
              createdAt: { timestampValue: day.toISOString() },
              confidence: { stringValue: "manual" },
              totalCalories: { integerValue: "420" },
              totalProtein: { integerValue: "20" },
              totalCarbs: { integerValue: "50" },
              totalFat: { integerValue: "15" },
              items: {
                arrayValue: {
                  values: [
                    {
                      mapValue: {
                        fields: {
                          name: { stringValue: "Oats and berries" },
                          portionSize: { stringValue: "80 g" },
                          calories: { integerValue: "420" },
                          protein: { integerValue: "20" },
                          carbs: { integerValue: "50" },
                          fat: { integerValue: "15" },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        }
      );
      expect(seed.ok()).toBe(true);
    }
  }
  await page.reload();
  await expect(page.getByText(/^Your usual at /)).toBeVisible();
  // The composer leads (owner call): its Scan button clears the tab bar
  // when the page opens, and the usual row follows it, a scroll away on
  // a phone this size.
  const scan = page.getByRole("button", { name: "Scan a meal" });
  await expect(scan).toBeVisible();
  const scanBox = (await scan.boundingBox())!;
  expect(scanBox.y + scanBox.height).toBeLessThan(760);
  // The text box and the camera button are one row: same top, same
  // height. Sized by rows={1}, the box is 50px and the 56px button
  // hangs 6px below it (measured on an iPhone).
  const fieldBox = (await page
    .getByRole("textbox", { name: "What did you eat" })
    .boundingBox())!;
  expect(Math.abs(fieldBox.y - scanBox.y)).toBeLessThan(1);
  expect(Math.abs(fieldBox.height - scanBox.height)).toBeLessThan(1);
  const logButton = page.getByRole("button", { name: "Log", exact: true });
  await expect(logButton).toBeVisible();
  expect((await logButton.boundingBox())!.y).toBeGreaterThan(scanBox.y);
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({
      path: `screenshots/companion-food-${dark ? "dark" : "light"}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(
    page.getByText("Saved on this phone — syncs when you're back online")
  ).toBeVisible();
  await expect(page.getByText(/^Your usual at /)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText(/^Your usual at /)).toBeVisible();
});
