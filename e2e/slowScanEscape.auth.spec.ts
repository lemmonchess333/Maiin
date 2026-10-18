import { test, expect, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openSignInForm, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";

/**
 * The slow-scan escape, in a real browser: a meal photo is being analysed,
 * the request has not come back, and the person taps the X.
 *
 * The X sits in the scanner's top bar, which has to ride above the
 * analysis overlay (z-30 over z-20). Before the fix it sat under it, so an
 * iPhone, with no back button or Escape key, was stuck until the request
 * resolved. The unit tests pin the classes; only a real browser's hit-test
 * says the tap reaches the button: Playwright's click refuses an element
 * another one covers.
 *
 * Then the request fails after all, and the next scan must open on the
 * live viewfinder, with no failure from the abandoned scan waiting there.
 *
 * Chromium's fake camera stands in for the phone's, and the analysis
 * request is held here, as a weak signal holds it.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    ...(process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : {}),
  },
  viewport: { width: 393, height: 852 },
});

test.describe("slow-scan escape", () => {
  test.skip(!emulatorActive, "Requires the local Auth/Firestore emulators");
  test.setTimeout(90_000);

  test("the X closes the scanner mid-sweep, and a late failure is not kept for the next scan", async ({
    page,
  }) => {
    const { auth, db } = emulatorAdmin();
    const baseline = await auth.getUserByEmail(TEST_USER.email);
    const seed = (await db.doc(`users/${baseline.uid}`).get()).data();
    expect(seed?.onboardingComplete).toBe(true);
    const email = `slow-scan-${randomUUID()}@tropos.test`;
    const user = await auth.createUser({
      email,
      password: TEST_USER.password,
      emailVerified: true,
    });
    const profile = db.doc(`users/${user.uid}`);
    try {
      // Pro, and has already said yes to sending photos for analysis.
      await profile.set({
        ...seed,
        uid: user.uid,
        email,
        subscriptionTier: "pro",
        aiAnalysisEnabled: true,
      });

      let held: Route | undefined;
      const sent = new Promise<void>((resolve) => {
        void page.route("**/us-central1/analyzeFood", async (route) => {
          if (route.request().method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers: CORS });
            return;
          }
          held = route;
          resolve();
        });
      });

      await page.addInitScript(() =>
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent =
            ".firebase-emulator-warning{display:none!important}";
          document.head.append(style);
        })
      );
      await page.goto("./");
      await openSignInForm(page);
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(TEST_USER.password);
      await page.locator('button[type="submit"]').first().click();
      const nav = page.getByRole("navigation", {
        name: "Main navigation",
        exact: true,
      });
      await expect(nav).toBeVisible({ timeout: 20_000 });
      await nav.getByRole("link", { name: "Food", exact: true }).click();

      // A real JPEG, made by the browser, as the photo library hands one over.
      const jpeg = Buffer.from(
        await page.evaluate(() => {
          const c = document.createElement("canvas");
          c.width = 1200;
          c.height = 900;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#d9a066";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.fillStyle = "#f4f1ea";
          ctx.beginPath();
          ctx.arc(600, 450, 320, 0, Math.PI * 2);
          ctx.fill();
          const url = c.toDataURL("image/jpeg", 0.85);
          return url.slice(url.indexOf(",") + 1);
        }),
        "base64"
      );

      const scan = page.getByRole("button", { name: "Scan a meal" });
      const scanner = page.getByRole("dialog", { name: "Food camera" });
      await scan.click();
      await expect(scanner).toBeVisible({ timeout: 10_000 });
      await scanner
        .getByRole("group", { name: "Scan mode" })
        .getByRole("button", { name: "Meal", exact: true })
        .click();
      await scanner
        .locator('input[type="file"][aria-label="Upload food photo"]')
        .setInputFiles({
          name: "plate.jpg",
          mimeType: "image/jpeg",
          buffer: jpeg,
        });

      // The sweep is up and the request is out, unanswered.
      await sent;
      await expect(page.getByTestId("scan-laser")).toBeVisible();
      await expect(page.getByTestId("scan-live-status")).toHaveText(
        "Analyzing food"
      );

      // The X takes the tap (a covered button would fail this click) and
      // the scanner is gone within a second.
      await scanner
        .getByRole("button", { name: "Close", exact: true })
        .click({ timeout: 1_000 });
      await expect(scanner).toHaveCount(0, { timeout: 1_000 });

      // The abandoned request fails late.
      const answered = page.waitForEvent(
        "requestfinished",
        (r) => r.url().includes("/analyzeFood") && r.method() === "POST"
      );
      await held!.fulfill({
        status: 500,
        contentType: "application/json",
        headers: CORS,
        body: JSON.stringify({ error: "Analysis failed" }),
      });
      await answered;
      /* The page under the closed scanner stays as it was. The analyzer is
         still mounted here (only the next Scan tap remounts it), so a
         failure kept from the abandoned scan would show as this card
         within a frame of the answer landing; a second is ample. */
      await page.waitForTimeout(1_000);
      await expect(page.getByText("Couldn't identify food.")).toHaveCount(0);

      // The next scan opens on the live viewfinder: the fake camera's
      // frames are playing, the shutter is ready, and no failure waits.
      await scan.click();
      await expect(scanner).toBeVisible({ timeout: 10_000 });
      const video = scanner.getByLabel("Camera preview");
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0);
      await expect(
        scanner.getByRole("button", { name: "Capture", exact: true })
      ).toBeEnabled();
      await expect(page.getByTestId("scan-failure")).toHaveCount(0);
      await expect(page.getByTestId("scan-laser")).toHaveCount(0);
      await expect(page.getByText("Couldn't read this one")).toHaveCount(0);
    } finally {
      await profile.delete();
      await auth.deleteUser(user.uid);
    }
  });
});
