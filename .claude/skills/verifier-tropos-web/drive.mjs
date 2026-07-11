// drive.mjs — Tropos web app verifier driver. Copy + adapt for a
// specific PR or run as-is for a smoke walkthrough.
//
// Prerequisites (must be done first — see SKILL.md):
//   1. Firebase emulators running on :9099 + :8080
//   2. Test user seeded under demo-tropos project
//   3. App built with VITE_USE_EMULATORS=true
//   4. vite preview serving on :4173
//
// Output: ./screenshots/, ./errors.json, ./trace.json (this file's dir)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.VERIFY_OUT || join(__dirname, "out");
const SCREENS = join(OUT_DIR, "screenshots");
mkdirSync(SCREENS, { recursive: true });

import { BASE } from "./env.mjs";
const EMAIL = process.env.TEST_EMAIL || "e2e-test@tropos.test";
import { PW } from "./env.mjs";
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const log = (...a) => console.log("[drive]", ...a);

// Strip environment chatter that's not from the diff under review.
function isInterestingError(text) {
  const env_noise = [
    /punycode/i, // Node DEP0040
    /MetadataLookup/i, // GCP metadata
    /favicon\.ico/i, // vite preview doesn't serve manifest
    /ERR_CERT_AUTHORITY_INVALID/i, // Firebase non-emulator background calls
    /firestore\.googleapis\.com/i, // same
    /firebaseinstallations\.googleapis/i, // same
    /Failed to load resource.*404/i, // generic 404 on background fetches
  ];
  return !env_noise.some((re) => re.test(text));
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 }, // iPhone 14
  bypassCSP: true, // CSP doesn't allowlist 127.0.0.1; emulator-only safe
});
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) =>
  errors.push({ kind: "pageerror", text: e.message, url: page.url() })
);
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  if (!isInterestingError(text)) return;
  errors.push({ kind: "console.error", text, url: page.url() });
});

let stepN = 0;
async function step(name, fn) {
  stepN += 1;
  const tag = String(stepN).padStart(2, "0");
  log(`step ${tag}: ${name}`);
  try {
    await fn();
    await page.screenshot({
      path: join(SCREENS, `${tag}-${name.replace(/\s+/g, "-")}.png`),
      fullPage: false,
    });
  } catch (e) {
    log(`  FAILED: ${e.message}`);
    await page
      .screenshot({
        path: join(SCREENS, `${tag}-${name.replace(/\s+/g, "-")}-FAIL.png`),
        fullPage: false,
      })
      .catch(() => {});
    throw e;
  }
}

try {
  // ── boot ────────────────────────────────────────────────────────
  await step("boot", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    log("  title:", await page.title());
  });

  // ── sign in — drives Button, Spinner, AuthProvider end-to-end ──
  await step("sign-in", async () => {
    await page.fill("#login-email", EMAIL);
    await page.fill("#login-password", PW);
    await page.locator('button[type="submit"]').first().click();
    await page
      .locator("nav")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    log("  url after sign-in:", page.url());
  });

  // ── walk every primary route ───────────────────────────────────
  const routes = [
    ["home", "/"],
    ["food", "/food"],
    ["program", "/program"],
    ["history", "/history"],
    ["social", "/social"],
    ["settings", "/settings"],
    ["settings-profile", "/settings/profile"],
    ["settings-training", "/settings/training"],
    ["settings-nutrition", "/settings/nutrition"],
    ["settings-workout-prefs", "/settings/workout-prefs"],
    ["settings-units-appearance", "/settings/units-appearance"],
    ["settings-privacy", "/settings/privacy"],
    ["settings-shoes", "/settings/shoes"],
    ["settings-notifications", "/settings/notifications"],
    ["settings-subscription", "/settings/subscription"],
    ["settings-support-legal", "/settings/support-legal"],
    ["settings-account", "/settings/account"],
    ["settings-recently-deleted", "/settings/recently-deleted-meals"],
  ];
  for (const [name, path] of routes) {
    await step(`route-${name}`, async () => {
      const url = BASE.replace(/\/$/, "") + path;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
    });
  }

  // ── /run cold open (RunResumePrompt / setup modal path) ────────
  await step("route-run", async () => {
    await page.goto(BASE.replace(/\/$/, "") + "/run", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
  });

  // ── post-walk a few interactive probes ─────────────────────────
  await step("probe-escape-global", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  });

  await step("probe-visibilitychange", async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
  });
} finally {
  // Persist evidence even if a step threw.
  writeFileSync(join(OUT_DIR, "errors.json"), JSON.stringify(errors, null, 2));
  log(`captured ${errors.length} interesting console errors`);
  log(`output: ${OUT_DIR}`);
  await browser.close();
}

if (errors.length > 0) {
  console.error("\nInteresting errors caught:\n");
  errors.forEach((e) => console.error(`  [${e.kind}] ${e.text}`));
  process.exit(2);
}
console.log("\nClean run.");
