/**
 * Visual capture for CI (.github/workflows/visual-capture.yml).
 *
 * Runs INSIDE `firebase emulators:exec` on a GitHub runner — which has the
 * memory the ephemeral dev container lacks for the Firestore JVM — boots a
 * preview build against the emulators, logs in as the seeded user, and
 * screenshots every key screen in light + dark. The PNGs are uploaded as a
 * workflow artifact so changes can be reviewed pic-by-pic without a local
 * rig. Nothing here ships; it's a verification harness.
 *
 * Preconditions (set by the workflow): emulators running, the e2e + rich
 * user seeded, a preview server on http://localhost:4173/Maiin/, and the
 * emulator env vars (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * / GCLOUD_PROJECT) exported so the dark-mode flip below can write via the
 * Admin SDK.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const BASE = "http://localhost:4173/Maiin/";
const OUT = "visual-capture";
const CREDS = { email: "e2e-test@tropos.test", password: "test-password-123" };

// The screens worth eyeballing on every UI change. Settings sub-pages are
// included because that's where the recent cohesion work landed.
const SCREENS = [
  ["/", "01-home"],
  ["/food", "02-food"],
  ["/program", "03-train"],
  ["/social?tab=feed", "04-social"],
  ["/history", "05-analytics"],
  ["/settings/profile", "06-settings-profile"],
  ["/settings/nutrition", "07-settings-nutrition"],
  ["/settings/privacy", "08-settings-privacy"],
];

const SAFE = `:root{--safe-top:59px!important;--safe-bottom:34px!important}
.safe-area-pb{padding-bottom:34px!important}.safe-area-pt{padding-top:59px!important}
.firebase-emulator-warning{display:none!important}`;

const settle = async (p, ms = 1400) => {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(ms);
};

async function setDarkMode(value) {
  // Admin write — the app reads profile.darkMode as the source of truth, so
  // toggling localStorage alone isn't enough for a real dark capture.
  // Guard init: setDarkMode runs twice (light → dark) and a second
  // initializeApp would throw "default app already exists".
  if (!getApps().length) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  }
  const u = await getAuth().getUserByEmail(CREDS.email);
  await getFirestore()
    .doc(`users/${u.uid}`)
    .set({ darkMode: value }, { merge: true });
}

async function capturePass(browser, dark) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    bypassCSP: true,
    serviceWorkers: "block",
  });
  await ctx.addInitScript((d) => {
    try {
      localStorage.setItem("tropos-dark-mode", d ? "true" : "false");
      if (d) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    } catch {
      /* ignore */
    }
  }, dark);
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(BASE);
  await settle(p);
  await p.locator("#login-email").waitFor({ state: "visible" });
  await p.fill("#login-email", CREDS.email);
  await p.fill("#login-password", CREDS.password);
  await p.locator('button[type="submit"]').first().click();
  await p
    .waitForFunction(() => !document.querySelector("#login-email"), null, {
      timeout: 25000,
    })
    .catch(() => {});
  await settle(p, 2500);
  const dismiss = async () => {
    try {
      const no = p.getByRole("button", { name: /no thanks/i });
      if (await no.isVisible({ timeout: 1000 })) await no.click();
    } catch {
      /* none */
    }
  };
  await dismiss();
  const tag = dark ? "dark" : "light";
  for (const [path, name] of SCREENS) {
    await p.goto(BASE.replace(/\/$/, "") + path, {
      waitUntil: "domcontentloaded",
    });
    await settle(p);
    await dismiss();
    await p.addStyleTag({ content: SAFE }).catch(() => {});
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    await p.screenshot({
      path: `${OUT}/${name}-${tag}.png`,
      fullPage: true,
      animations: "disabled",
    });
    console.log(`  ✓ ${tag}/${name}`);
  }
  await ctx.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
// Light pass (profile default), then flip + dark pass.
await setDarkMode(false);
await capturePass(browser, false);
await setDarkMode(true);
await capturePass(browser, true);
await browser.close();
console.log("visual-capture: done");
process.exit(0);
