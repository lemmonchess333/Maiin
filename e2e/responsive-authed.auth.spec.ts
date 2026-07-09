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
 * Runs ONLY in the `auth-emulator` project (matches `*.auth.spec.ts`).
 * The `emulator-tests` CI job seeds ONLY the basic cold-start user
 * (`seed:e2e`) — it deliberately does NOT run `seed:rich`, because
 * `coldstart.auth.spec.ts` asserts the empty-user experience and rich
 * data would break it. So every route here must be reachable and
 * overflow-clean for a fresh cold-start user (Home/Food render their
 * empty states; /upgrade is data-independent).
 *
 * Intentionally NOT covered here (need seeded content the basic user
 * lacks) — guarded elsewhere:
 *  - RunDetail (`/run/:id`, audit #3): needs a seeded run. The rich-seeded
 *    capture specs (screenshot workflow) exercise `run/rich-r0`; its
 *    PaceLegend-placement fix is code + comment guarded.
 *  - TreadmillMode (audit #4): a stateful mode inside the live `/run`
 *    flow, not reachable via a seeded doc; its `w-full`/`min-w-0` fix is
 *    better covered by a render-level test than a flaky E2E.
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
