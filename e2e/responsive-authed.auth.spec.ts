import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "./helpers/auth";

/*
 * D9 — authenticated responsive regression coverage.
 *
 * `responsive.spec.ts` sweeps only the UNauthenticated surface (`/`,
 * `/privacy`); the routes that actually broke in the visual audit are
 * behind auth (Home, Food, RunDetail). The layout fixes shipped, but
 * without coverage they can silently regress. This signs in as the
 * rich-seeded test user and pins the durable invariant — no horizontal
 * overflow — plus a couple of cheap structural checks, at the primary
 * iPhone width (390px), on the fragile authed routes.
 *
 * Deliberately NOT brittle full-page screenshots (the repo's screenshot
 * baselines live in the capture specs); these are bounding-box / overflow
 * assertions that survive copy + minor layout tweaks.
 *
 * Runs ONLY in the `auth-emulator` project (matches `*.auth.spec.ts`),
 * which requires the Firebase emulator + the seeded e2e user. RunDetail
 * additionally needs the rich seed (`npm run seed:rich`) for the
 * `run/rich-r0` fixture — same dependency the capture specs already have.
 *
 * TreadmillMode (audit #4) is a stateful mode inside the live `/run`
 * flow, not reachable via a seeded doc, so it is intentionally not
 * covered here — its `w-full`/`min-w-0` fix is guarded by code + comment;
 * a render-level test is the better home for it than a flaky E2E.
 */

const PHONE = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    html: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  // +1px tolerance for sub-pixel rounding at certain DPRs (mirrors the
  // unauthenticated sweep).
  expect(o.body).toBeLessThanOrEqual(o.viewport + 1);
  expect(o.html).toBeLessThanOrEqual(o.viewport + 1);
}

test.describe("Responsive — authenticated fragile routes (390px)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAsTestUser(page);
  });

  // NOTE: never `waitForLoadState("networkidle")` here — the authed app
  // keeps live Firestore subscriptions open, so the network never idles
  // and the wait times out. Use `domcontentloaded` + an element signal.

  test("Home: no horizontal overflow, bottom nav present", async ({ page }) => {
    await page.goto("", { waitUntil: "domcontentloaded" });
    await expect(page.locator("nav[data-tab-bar]")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Food: no horizontal overflow, bottom nav present", async ({ page }) => {
    await page.goto("food", { waitUntil: "domcontentloaded" });
    await expect(page.locator("nav[data-tab-bar]")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("RunDetail (/run/:id): no horizontal overflow", async ({ page }) => {
    // rich-r0 seeded by `npm run seed:rich` (same fixture the capture
    // specs use). Run pages render full-screen without the nav wrapper,
    // so we wait for the back control as the render signal.
    await page.goto("run/rich-r0", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: /back/i }).first()
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("/upgrade: no horizontal overflow, no false-active bottom-nav tab", async ({
    page,
  }) => {
    await page.goto("upgrade", { waitUntil: "domcontentloaded" });
    // Settle a beat for the route component to mount (no nav on /upgrade
    // to key off reliably).
    await page.waitForTimeout(1200);
    await expectNoHorizontalOverflow(page);
    // activeTabForPath returns null for /upgrade — no tab may claim the
    // active-page state (the lingering-Food-pill regression the
    // activeTab.ts fix closed).
    await expect(
      page.locator('nav[data-tab-bar] a[aria-current="page"]')
    ).toHaveCount(0);
  });
});
