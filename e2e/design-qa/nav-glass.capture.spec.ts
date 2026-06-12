/**
 * NAV GLASS-UP capture harness — visual evidence for the floating glass
 * capsule bottom nav (Layout.tsx + .nav-capsule).
 *
 * Produces the screenshots the NAV GLASS-UP brief asks for:
 *   light + dark × top + mid-scroll × Home / Food, plus the no-active-tab
 *   states (Upgrade, and RunDetail when a seeded run id is provided), plus a
 *   reduced-transparency capture (the solid fallback). Output lands in
 *   docs/visual-audit/fixes/nav-glass/.
 *
 * Runs in the `auth-emulator` Playwright project only (authed surfaces +
 * bypassCSP). Locally:
 *   npm run seed:e2e && E2E_AUTH_EMULATOR=1 \
 *     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npx playwright test --project=auth-emulator nav-glass.capture
 *
 * RunDetail (/run/:id) needs a real run doc — pass its id via E2E_RUN_ID to
 * include the RunDetail no-active captures; without it those are skipped (the
 * rest still run). The FIRST run is the calibration pass — eyeball that the
 * capsule renders over real content, the active pill sits on the right tab,
 * and the no-active routes show NO pill.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs/visual-audit/fixes/nav-glass"
);

// iPhone-class width — the brief's geometry budget ("five tabs must fit at
// 393px"). Tall enough that pages have something to mid-scroll.
const VIEWPORT = { width: 393, height: 852 };

/** Set the theme the way init.js reads it (pre-React boot), then load `route`
 *  so the `.dark` class is applied before first paint. Auth persists across
 *  the navigation (Firebase keeps its tokens in localStorage/IDB). */
async function gotoThemed(
  page: Page,
  route: string,
  theme: "light" | "dark"
): Promise<void> {
  await page.evaluate(
    (v) => localStorage.setItem("tropos-dark-mode", v),
    theme === "dark" ? "true" : "false"
  );
  await page.goto(`/Maiin${route}`);
  await page.waitForLoadState("networkidle");
  // The capsule is the success signal — present on authed + no-active routes.
  await expect(page.locator("nav[data-tab-bar]")).toBeVisible({
    timeout: 15_000,
  });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`) });
}

async function midScroll(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.scrollTo({
      top: document.body.scrollHeight / 2,
      behavior: "instant",
    })
  );
  // Let the capsule's backdrop-filter resample the now-scrolled content.
  await page.waitForTimeout(400);
}

test.describe("NAV GLASS-UP — floating capsule captures", () => {
  test.skip(
    !emulatorActive(),
    "needs the auth-emulator stack (E2E_AUTH_EMULATOR=1 + seeded user)"
  );
  test.use({ viewport: VIEWPORT, deviceScaleFactor: 3 });

  test.beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
  });

  test("captures the capsule across themes, scroll, and no-active routes", async ({
    page,
  }) => {
    await signInAsTestUser(page);

    for (const theme of ["light", "dark"] as const) {
      // Active-tab surfaces — top + mid-scroll so the glass is shown over
      // real scrolling content.
      for (const [route, key] of [
        ["/", "home"],
        ["/food", "food"],
      ] as const) {
        await gotoThemed(page, route, theme);
        await shot(page, `${key}-${theme}-top`);
        await midScroll(page);
        await shot(page, `${key}-${theme}-mid`);
      }

      // No-active-tab state — the capsule must render with NO pill. Upgrade is
      // always reachable; RunDetail needs a seeded run id (E2E_RUN_ID).
      await gotoThemed(page, "/upgrade", theme);
      await shot(page, `upgrade-noactive-${theme}-top`);

      const runId = process.env.E2E_RUN_ID;
      if (runId) {
        await gotoThemed(page, `/run/${runId}`, theme);
        await shot(page, `rundetail-noactive-${theme}-top`);
      }
    }

    // Reduced-transparency → the solid, no-blur capsule fallback. Playwright's
    // emulateMedia() doesn't expose prefers-reduced-transparency, so drive it
    // over CDP. Capture both themes so the solid fallback is verified on each.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    for (const theme of ["light", "dark"] as const) {
      await gotoThemed(page, "/", theme);
      await shot(page, `home-reduced-transparency-${theme}-top`);
    }
  });
});
