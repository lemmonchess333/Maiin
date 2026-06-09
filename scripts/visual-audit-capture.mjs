// Visual-audit capture — drives the BUILT app (preview server) against the
// Firebase emulators as the seeded user, and screenshots every route in
// light + dark, top-of-page + fullPage, at iPhone-14-ish metrics on WEBKIT.
//
// Device simulation:
//   - webkit, 393x852, DSF 3, isMobile, hasTouch  (closest practical match
//     to the TestFlight build's WKWebView)
//   - safe areas: env(safe-area-inset-*) is 0 in Playwright, so we inject
//     --safe-top: 59px / --safe-bottom: 34px (+ .safe-area-pb / .safe-area-pt
//     which read env() directly) to reproduce device conditions. Nothing
//     else is drawn.
//
// Dark mode uses the app's real mechanism: the profile.darkMode flag is
// flipped in Firestore (admin write) between passes, plus the
// tropos-dark-mode localStorage key + early .dark class to kill the
// pre-hydration flash.
//
// Usage:
//   node scripts/visual-audit-capture.mjs light|dark
// ENGINE NOTE: webkit was requested (TestFlight WKWebView parity) but the
// environment network policy blocks the WebKit download (chromium is
// pre-provisioned). Chromium at identical device metrics (393x852 @3x,
// isMobile, hasTouch) is the documented fallback — layout/safe-area/theme
// fidelity holds; WebKit-specific rendering quirks are NOT covered.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const THEME = process.argv[2] === "dark" ? "dark" : "light";
const BASE = "http://localhost:4173/Maiin/";
const OUT = `docs/visual-audit/screens/${THEME}`;
mkdirSync(OUT, { recursive: true });

const CREDS = { email: "e2e-test@tropos.test", password: "test-password-123" };

const SAFE_AREA_CSS = `
  :root { --safe-top: 59px !important; --safe-bottom: 34px !important; }
  .safe-area-pb { padding-bottom: 34px !important; }
  .safe-area-pt { padding-top: 59px !important; }
  /* Firebase Auth emulator SDK injects its own red warning banner; it is
     emulator chrome, not app UI — hide it so captures reflect the app. */
  .firebase-emulator-warning { display: none !important; }
`;

const settle = async (page, ms = 1800) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};

async function prep(page) {
  await page.addStyleTag({ content: SAFE_AREA_CSS }).catch(() => {});
}

async function shoot(page, name, { full = true } = {}) {
  await prep(page);
  await page.screenshot({
    path: `${OUT}/${name}-top.png`,
    animations: "disabled",
  });
  if (full) {
    await page
      .screenshot({
        path: `${OUT}/${name}-full.png`,
        fullPage: true,
        animations: "disabled",
      })
      .catch(() => {});
  }
  console.log(`  ✓ ${name}`);
}

async function scrollShot(page, name, ratio = 0.5) {
  await page.evaluate((r) => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(h * r));
  }, ratio);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `${OUT}/${name}-scrolled.png`,
    animations: "disabled",
  });
  console.log(`  ✓ ${name}-scrolled`);
}

const run = async () => {
  const browser = await chromium.launch({
    // Pre-provisioned build (network policy blocks Playwright downloads).
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    bypassCSP: true,
  });

  // Dark pass: seed the persisted key + class before any script runs so the
  // first paint is already dark (profile.darkMode in Firestore is the truth;
  // this only kills the boot flash).
  if (THEME === "dark") {
    await context.addInitScript(() => {
      try {
        localStorage.setItem("tropos-dark-mode", "true");
      } catch {
        /* ignore */
      }
      document.documentElement.classList.add("dark");
    });
  }

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // ── Sign in via the real Login form ──
  console.log("Signing in…");
  await page.goto(BASE);
  await settle(page);
  await page.locator("#login-email").waitFor({ state: "visible" });
  await page.fill("#login-email", CREDS.email);
  await page.fill("#login-password", CREDS.password);
  await page.locator('button[type="submit"]').first().click();
  await page
    .waitForFunction(() => !document.querySelector("#login-email"), null, {
      timeout: 20000,
    })
    .catch(() => {});
  await settle(page, 2500);
  console.log("Signed in. URL:", page.url());

  const dismissStreakModal = async () => {
    try {
      const no = page.getByRole("button", { name: /no thanks/i });
      if (await no.isVisible({ timeout: 1200 })) {
        await no.click();
        await page.waitForTimeout(400);
        console.log("  (dismissed streak modal)");
      }
    } catch {
      /* not present */
    }
  };
  await dismissStreakModal();

  const go = async (path) => {
    await page.goto(BASE.replace(/\/$/, "") + path, {
      waitUntil: "domcontentloaded",
    });
    await settle(page);
    await dismissStreakModal();
  };

  // ── 1. Home ──
  await go("/");
  await shoot(page, "01-home");
  await scrollShot(page, "01-home");

  // ── 2. Food + states ──
  await go("/food");
  await shoot(page, "02-food");
  await scrollShot(page, "02-food");
  // Details sheet
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByLabel("View nutrition breakdown").click({ timeout: 5000 });
    await page.waitForTimeout(900);
    await shoot(page, "02-food-details-sheet", { full: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } catch (e) {
    console.log("  ✗ details sheet:", e.message.split("\n")[0]);
  }
  // Composer focused + pantry typeahead
  try {
    const composer = page.getByLabel("What did you eat");
    await composer.click({ timeout: 5000 });
    await composer.fill("pi");
    await page.waitForTimeout(1200);
    await shoot(page, "02-food-typeahead", { full: false });
    await page.keyboard.press("Escape").catch(() => {});
  } catch (e) {
    console.log("  ✗ typeahead:", e.message.split("\n")[0]);
  }

  // ── 3. Programme ──
  await go("/program");
  await shoot(page, "03-program");
  await scrollShot(page, "03-program");

  // ── 4. Active workout session (timeboxed click-through) ──
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const begin = page.getByRole("button", { name: /begin workout/i }).first();
    await begin.click({ timeout: 6000 });
    await settle(page, 1500);
    await shoot(page, "04-workout-session");
    await scrollShot(page, "04-workout-session");
    await go("/program"); // leave session view
  } catch (e) {
    console.log("  ✗ workout session:", e.message.split("\n")[0]);
    await shoot(page, "04-workout-session-attempt", { full: false });
  }

  // ── 5. Run page + treadmill (manual, non-GPS) path ──
  await go("/run");
  await shoot(page, "05-run-setup", { full: false });
  try {
    // The activity card ("Easy Run · Outdoor GPS") opens the type picker;
    // pick Treadmill there, then hit the Start CTA and ride out the
    // countdown to the live treadmill screen.
    await page.getByText("Easy Run").first().click({ timeout: 5000 });
    await page.waitForTimeout(700);
    await page
      .getByText(/treadmill/i)
      .first()
      .click({ timeout: 5000 });
    await page.waitForTimeout(700);
    await shoot(page, "05-run-setup-treadmill", { full: false });
    const start = page.getByRole("button", { name: /start/i }).first();
    await start.click({ timeout: 5000 });
    await page.waitForTimeout(4500); // GO! countdown
    await shoot(page, "05-run-treadmill-live", { full: false });
  } catch (e) {
    console.log("  ✗ treadmill live:", e.message.split("\n")[0]);
    await shoot(page, "05-run-treadmill-attempt", { full: false });
  }

  // ── 6. RunSummary/RunDetail for the seeded GPS run ──
  await go("/run/audit-gps");
  await shoot(page, "06-run-detail");

  // ── 7. History + tabs ──
  await go("/history");
  await shoot(page, "07-history");
  await scrollShot(page, "07-history");
  // Tabs are URL-driven: analytics (default) + prs + badges.
  await go("/history?tab=prs");
  await shoot(page, "07-history-prs");
  await go("/history?tab=badges");
  await shoot(page, "07-history-badges");

  // ── 8. Social + Crew ──
  await go("/social");
  await shoot(page, "08-social");
  await scrollShot(page, "08-social");

  // ── 9. Settings + subpage + Upgrade ──
  await go("/settings");
  await shoot(page, "09-settings");
  await scrollShot(page, "09-settings");
  await go("/settings/training");
  await shoot(page, "09-settings-training");
  await go("/upgrade");
  await shoot(page, "10-upgrade");

  await context.close();

  // ── 10. Onboarding (fresh logged-out context) ──
  const fresh = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    bypassCSP: true,
  });
  if (THEME === "dark") {
    await fresh.addInitScript(() => {
      try {
        localStorage.setItem("tropos-dark-mode", "true");
      } catch {
        /* ignore */
      }
      document.documentElement.classList.add("dark");
    });
  }
  const p2 = await fresh.newPage();
  p2.setDefaultTimeout(15000);
  await p2.goto(BASE);
  await p2.waitForLoadState("networkidle").catch(() => {});
  await p2.waitForTimeout(1500);
  await p2.addStyleTag({ content: SAFE_AREA_CSS }).catch(() => {});
  await p2.screenshot({
    path: `${OUT}/11-login-top.png`,
    animations: "disabled",
  });
  console.log("  ✓ 11-login");
  // Onboarding steps: tap sign-up / create account if present.
  try {
    const signup = p2
      .getByRole("button", { name: /sign up|create account|get started/i })
      .first();
    await signup.click({ timeout: 5000 });
    await p2.waitForTimeout(1200);
    await p2.addStyleTag({ content: SAFE_AREA_CSS }).catch(() => {});
    await p2.screenshot({
      path: `${OUT}/12-onboarding-step1-top.png`,
      animations: "disabled",
    });
    console.log("  ✓ 12-onboarding-step1");
  } catch (e) {
    console.log("  ✗ onboarding:", e.message.split("\n")[0]);
  }

  await fresh.close();
  await browser.close();
  console.log(`DONE (${THEME})`);
};

run().catch((e) => {
  console.error("CAPTURE FAILED:", e);
  process.exit(1);
});
