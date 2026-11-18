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
import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { assertVisualCaptureEnvironment } from "./visual-capture-safety.mjs";

assertVisualCaptureEnvironment();

const BASE = "http://localhost:4173/Maiin/";
const OUT = "visual-capture";
const CREDS = { email: "e2e-test@tropos.test", password: "test-password-123" };
const manifest = {
  sourceCommit: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null,
  startedAt: new Date().toISOString(),
  status: "incomplete",
  project: "demo-tropos",
  viewport: { width: 393, height: 852 },
  notes: [
    "Synthetic emulator fixture. Route captures do not prove every feature works.",
    "Full-page captures retain fixed navigation at its viewport position; use viewport PNGs for layout review.",
    "Open dialogs are recorded, not hidden. An obscured page is not an unobstructed screen pass.",
    "No native-device, backend-callable, payment or offline-sync coverage is implied.",
  ],
  screens: [],
};
const saveManifest = () =>
  writeFileSync(
    `${OUT}/capture-manifest.json`,
    JSON.stringify(manifest, null, 2)
  );

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
    initializeApp({ projectId: "demo-tropos" });
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
  // A first visit opens on the welcome screen, whose "Sign in"
  // leads to the form.
  const haveAccount = p.getByRole("button", {
    name: "Sign in",
    exact: true,
  });
  await haveAccount
    .or(p.locator("#login-email"))
    .first()
    .waitFor({ state: "visible" });
  // The form's submit is "Sign in" too: the email field says which screen is open.
  if (!(await p.locator("#login-email").isVisible()))
    await haveAccount.first().click();
  await p.locator("#login-email").waitFor({ state: "visible" });
  await p.fill("#login-email", CREDS.email);
  await p.fill("#login-password", CREDS.password);
  await p.locator('button[type="submit"]').first().click();
  // A failed sign-in must fail the capture, not produce eight login-page
  // screenshots under names that look like successful authenticated screens.
  await p.waitForFunction(() => !document.querySelector("#login-email"), null, {
    timeout: 25000,
  });
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
    if (await p.locator("#login-email").isVisible()) {
      throw new Error(`Authentication lost while capturing ${name}-${tag}`);
    }
    const openDialogs = await p
      .locator('[role="dialog"]:visible, [role="alertdialog"]:visible')
      .count();
    const viewportFile = `${name}-${tag}-viewport.png`;
    await p.screenshot({
      path: `${OUT}/${viewportFile}`,
      animations: "disabled",
    });
    await p.screenshot({
      path: `${OUT}/${name}-${tag}.png`,
      fullPage: true,
      animations: "disabled",
    });
    manifest.screens.push({
      name,
      theme: tag,
      path,
      actualUrl: p.url(),
      fullPageFile: `${name}-${tag}.png`,
      viewportFile,
      openDialogs,
      reviewStatus: openDialogs
        ? "dialog-obscures-page"
        : "captured-not-interactively-tested",
    });
    saveManifest();
    console.log(
      `  ✓ ${tag}/${name}${openDialogs ? " (open dialog — review required)" : ""}`
    );
  }
  // Circ1's captures (this scratch branch only, never merged): circuit
  // mode's picker, work, rest, end question and finish at 393 and 320 px,
  // on Playwright's clock moved 5 s at a time.
  await p.clock.install();
  const shoot = async (name, width) => {
    const file = `${name}-${width}-${tag}.png`;
    await p.screenshot({ path: `${OUT}/${file}`, animations: "disabled" });
    manifest.screens.push({ name, theme: tag, path: "/circuit", viewportFile: file });
    saveManifest();
    console.log(`  ✓ ${tag}/${name} at ${width}px`);
  };
  const forward = async (seconds) => {
    for (let s = 0; s < seconds; s += 5) {
      await p.clock.fastForward(5000);
      await p.waitForTimeout(60);
    }
  };
  const until = async (locator) => {
    for (let i = 0; i < 40; i++) {
      if (await locator.isVisible().catch(() => false)) return;
      await forward(5);
    }
    await locator.waitFor({ state: "visible" });
  };
  for (const width of [393, 320]) {
    await p.setViewportSize({ width, height: 852 });
    await p.goto(BASE.replace(/\/$/, "") + "/circuit", {
      waitUntil: "domcontentloaded",
    });
    const row = p.getByRole("button", { name: /^10-minute circuit\s?10 min/ });
    await row.waitFor({ state: "visible" });
    await p.addStyleTag({ content: SAFE }).catch(() => {});
    await p.waitForTimeout(800);
    await shoot("20-circuit-picker", width);
    await row.click();
    await until(p.getByText("Work", { exact: true }));
    await p.waitForTimeout(500);
    await shoot("21-circuit-work", width);
    await until(p.getByText("Rest", { exact: true }));
    await p.waitForTimeout(500);
    await shoot("22-circuit-rest", width);
    await p.getByRole("button", { name: "End circuit" }).click();
    const keepGoing = p
      .getByRole("alertdialog")
      .getByRole("button", { name: "Keep going" });
    await keepGoing.waitFor({ state: "visible" });
    await p.waitForTimeout(800);
    await shoot("23-circuit-end-question", width);
    await keepGoing.click();
    await forward(600);
    await p.getByText("How did it feel?").waitFor({ state: "visible" });
    await p.waitForTimeout(1000);
    await shoot("24-circuit-finish", width);
  }
  await ctx.close();
}

mkdirSync(OUT, { recursive: true });
saveManifest();
const browser = await chromium.launch();
try {
  // Light pass (profile default), then flip + dark pass.
  await setDarkMode(false);
  await capturePass(browser, false);
  await setDarkMode(true);
  await capturePass(browser, true);
  manifest.status = "complete";
  console.log("visual-capture: done");
} finally {
  saveManifest();
  await browser.close();
}
