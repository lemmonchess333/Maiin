// drive-themes.mjs — capture key surfaces in BOTH light and dark mode.
// Adapted from drive.mjs for design-system visual verification.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.VERIFY_OUT || join(__dirname, "out-themes");
const SCREENS = join(OUT_DIR, "screenshots");
mkdirSync(SCREENS, { recursive: true });

import { BASE } from "./env.mjs";
const EMAIL = process.env.TEST_EMAIL || "e2e-test@tropos.test";
import { PW } from "./env.mjs";
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const log = (...a) => console.log("[drive]", ...a);

function isInterestingError(text) {
  const env_noise = [
    /punycode/i,
    /MetadataLookup/i,
    /favicon\.ico/i,
    /ERR_CERT_AUTHORITY_INVALID/i,
    /firestore\.googleapis\.com/i,
    /firebaseinstallations\.googleapis/i,
    /Failed to load resource.*404/i,
  ];
  return !env_noise.some((re) => re.test(text));
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  bypassCSP: true,
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

async function setTheme(mode) {
  await page.evaluate((m) => {
    document.documentElement.classList.toggle("dark", m === "dark");
  }, mode);
  await page.waitForTimeout(150);
}

async function shot(name) {
  await page.screenshot({
    path: join(SCREENS, `${name}.png`),
    fullPage: false,
  });
  log(`  shot ${name}`);
}

async function captureRoute(name, path) {
  const url = BASE.replace(/\/$/, "") + path;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Lazy chunks + Firestore: wait for the route spinner to clear (best
  // effort — Program has a known pre-existing seed bug that never clears).
  // Lazy chunk + Firestore hydration settle. Program has a known
  // pre-existing seed bug that never clears its spinner.
  await page.waitForTimeout(3000);
  await setTheme("light");
  await shot(`${name}-light`);
  await setTheme("dark");
  await shot(`${name}-dark`);
}

try {
  // boot
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  log("title:", await page.title());
  await setTheme("light");
  await shot("00-login-light");
  await setTheme("dark");
  await shot("00-login-dark");
  await setTheme("light");

  // sign in
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PW);
  await page.locator('button[type="submit"]').first().click();
  await page
    .locator("nav")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  log("signed in:", page.url());

  const routes = [
    ["01-home", "/"],
    ["02-program", "/program"],
    ["03-food", "/food"],
    ["04-history", "/history"],
    ["05-social", "/social"],
    ["06-settings", "/settings"],
  ];
  for (const [name, path] of routes) {
    log(`route ${name}`);
    await captureRoute(name, path);
  }
} finally {
  writeFileSync(join(OUT_DIR, "errors.json"), JSON.stringify(errors, null, 2));
  log(`captured ${errors.length} interesting console errors`);
  log(`output: ${OUT_DIR}`);
  await browser.close();
}

if (errors.length > 0) {
  console.error("\nInteresting errors:\n");
  errors.forEach((e) => console.error(`  [${e.kind}] ${e.text}`));
}
console.log("\nDone.");
