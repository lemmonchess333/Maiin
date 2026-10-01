import { verifySignupEmail } from "../helpers/verifySignupEmail";
/**
 * A new person's Social feed, light + dark: the state every launch user
 * sees first, filmed as a genuinely fresh account.
 *
 * Until 2026-10-01 this file filmed the solo-first stack (Soc8), four
 * prompts that REPLACED the feed for anyone following nobody. The owner
 * retired it: a new person lands on Explore and sees what people share
 * publicly, under one line on how Following fills, with Follow beside
 * each author and a People to follow row after the second post.
 * Following, with nobody followed, says so.
 *
 * Fixture: brand-new signup-form account + onboardingComplete patched
 * via the emulator's rules-free REST surface (the coachmark.auth
 * pattern). The posts are the shared seed's (seed:rich's Maya Chen).
 * Each claim is asserted before shooting, so a regression films loudly.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function uidByEmail(email: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/demo-tropos/accounts:query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: "{}",
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const { userInfo } = (await res.json()) as {
    userInfo?: { localId: string; email?: string }[];
  };
  const localId = userInfo?.find((u) => u.email === email)?.localId;
  if (!localId) throw new Error(`user ${email} not found in auth emulator`);
  return localId;
}

async function completeOnboardingDirect(uid: string): Promise<void> {
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=displayName`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify({
        fields: {
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: "New Tester" },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

test.describe("new person's feed screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await suppressCoachmarks(page);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
  });

  async function shootBoth(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
  }

  async function freshAccountOnFeed(page: Page, prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /sign up/i })
      .click({ timeout: 20_000 });
    await page.fill("#login-email", email);
    await page.fill("#login-password", "test-password-123");
    await page
      .getByRole("button", { name: /create account/i })
      .click({ timeout: 8000 });
    await verifySignupEmail(page, email);
    await page
      .getByRole("button", { name: /build muscle/i })
      .waitFor({ state: "visible", timeout: 30_000 });
    await completeOnboardingDirect(await uidByEmail(email));

    await page.goto("social");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 25_000 });
    // Social defaults to the Together tab; the feed lives under Feed
    // (SegmentedControl → role=radio, the standing gotcha).
    await page.getByRole("radio", { name: /feed/i }).click({ timeout: 20_000 });
  }

  test("a new person's Feed is Explore's posts, light + dark", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await freshAccountOnFeed(page, "newfeed");

    // Following nobody, the feed opens on Explore with one line on how
    // Following fills — and real posts under it, not prompts.
    await expect(
      page.getByText(/Sessions people shared publicly/i)
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("Maya Chen").first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/Share your training/i)).not.toBeVisible();
    await expect(page.getByText(/Start a partner streak/i)).not.toBeVisible();
    // Follow sits beside an author you don't follow.
    await expect(
      page.getByRole("button", { name: "Follow Maya Chen" }).first()
    ).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    await shootBoth(page, "new-user-feed");
  });

  test("People to follow loads, and following from a post shows at once", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await freshAccountOnFeed(page, "newfeed2");

    // The row reads suggestions; before 2026-10-01 they never finished
    // loading (a read loop), so its heading appearing is the check.
    const row = page.getByRole("heading", { name: "People to follow" });
    await row.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(row).toBeVisible();

    const follow = page.getByRole("button", { name: "Follow Maya Chen" });
    await follow.first().scrollIntoViewIfNeeded({ timeout: 15_000 });
    await follow.first().click();
    await expect(page.getByText("Following").first()).toBeVisible({
      timeout: 10_000,
    });
    // The follow is live: the line over the feed now counts it.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.getByText(/^You follow/)).toContainText("1 person", {
      timeout: 15_000,
    });
    await page.waitForTimeout(500);
    await shootBoth(page, "new-user-feed-followed");
  });

  test("Following, with nobody followed, says so", async ({ page }) => {
    test.setTimeout(180_000);
    await freshAccountOnFeed(page, "newfeed3");
    await page
      .getByRole("button", { name: /feed source/i })
      .click({ timeout: 10_000 });
    await page
      .getByRole("radio", { name: /following/i })
      .click({ timeout: 10_000 });
    await expect(page.getByText("You don't follow anyone yet")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(500);
    await shootBoth(page, "new-user-following");
  });
});
