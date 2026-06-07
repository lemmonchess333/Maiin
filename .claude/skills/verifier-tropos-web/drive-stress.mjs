// drive-stress.mjs — scenario-matrix stress pass (see QA-SCENARIO-GOAL.md).
// Requires the RICH seed (npm run seed:rich) so data-heavy surfaces render.
// Walks: rich data (light/dark/narrow) + offline. Captures per-surface
// console errors → out-stress/errors.json + screenshots.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "out-stress");
const SCREENS = join(OUT, "screenshots");
mkdirSync(SCREENS, { recursive: true });
const BASE = "http://localhost:4173/Maiin/";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const log = (...a) => console.log("[stress]", ...a);

function noisy(t) {
  return [
    /punycode/i,
    /MetadataLookup/i,
    /favicon\.ico/i,
    /ERR_CERT_AUTHORITY_INVALID/i,
    /googleapis\.com/i,
    /installations/i,
    /net::ERR/i,
    /identitytoolkit/i,
    /Failed to load resource.*(404|503)/i,
    /open-meteo/i,
    /cartocdn/i,
  ].some((re) => re.test(t));
}

const errors = [];
let scenario = "boot";
let n = 0;

async function newCtx(browser, opts) {
  const ctx = await browser.newContext({ bypassCSP: true, ...opts });
  const page = await ctx.newPage();
  page.on(
    "pageerror",
    (e) =>
      !noisy(e.message) &&
      errors.push({
        scenario,
        kind: "pageerror",
        text: e.message.slice(0, 300),
      }) &&
      log(`⚠ [${scenario}] ${e.message.slice(0, 120)}`)
  );
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (noisy(t)) return;
    errors.push({ scenario, kind: "console.error", text: t.slice(0, 300) });
    log(`⚠ [${scenario}] ${t.slice(0, 120)}`);
  });
  return { ctx, page };
}
async function login(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.fill("#login-email", "e2e-test@tropos.test");
  await page.fill("#login-password", "test-password-123");
  await page.click('button[type="submit"]');
  await page
    .locator("nav")
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
}
async function shot(page, name) {
  n++;
  await page
    .screenshot({
      path: join(SCREENS, `${String(n).padStart(2, "0")}-${name}.png`),
    })
    .catch(() => {});
  log(`shot ${name}`);
}
async function visit(page, path, label, dark = false, wait = 3500) {
  scenario = label;
  await page
    .goto(BASE + path, { waitUntil: "domcontentloaded" })
    .catch((e) => errors.push({ scenario, kind: "nav", text: e.message }));
  if (dark)
    await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(wait);
  await shot(page, label);
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

// ── Pass 1: RICH data, light, standard viewport ──
{
  const { ctx, page } = await newCtx(browser, {
    viewport: { width: 393, height: 852 },
    geolocation: { latitude: 51.5, longitude: -0.12 },
    permissions: ["geolocation"],
  });
  await login(page);
  scenario = "rich-home";
  await page.waitForTimeout(2500);
  await shot(page, "rich-home");
  await visit(page, "food", "rich-food");
  await visit(page, "history", "rich-history-analytics");
  // History sub-tabs
  for (const t of ["PRs", "Badges"]) {
    scenario = `rich-history-${t}`;
    const el = page.getByText(new RegExp(`^${t}$`)).first();
    if (await el.count()) {
      await el.click().catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, `rich-history-${t}`);
    }
  }
  await visit(page, "run/rich-r0", "rich-run-detail");
  await visit(page, "program", "rich-program-lift");
  await ctx.close();
}

// ── Pass 2: RICH data, DARK ──
{
  const { ctx, page } = await newCtx(browser, {
    viewport: { width: 393, height: 852 },
  });
  await login(page);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  scenario = "dark-home";
  await page.waitForTimeout(2000);
  await shot(page, "dark-home");
  await visit(page, "history", "dark-history-analytics", true);
  await ctx.close();
}

// ── Pass 3: RICH data, NARROW (iPhone SE 320) ──
{
  const { ctx, page } = await newCtx(browser, {
    viewport: { width: 320, height: 568 },
  });
  await login(page);
  scenario = "se-home";
  await page.waitForTimeout(2000);
  await shot(page, "se-home");
  await visit(page, "history", "se-history-analytics");
  await visit(page, "program", "se-program-lift");
  await ctx.close();
}

// ── Pass 4: OFFLINE ──
{
  const { ctx, page } = await newCtx(browser, {
    viewport: { width: 393, height: 852 },
  });
  await login(page);
  await ctx.setOffline(true);
  scenario = "offline-home";
  await page.goto(BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, "offline-home");
  await visit(page, "history", "offline-history", false, 3000);
  await ctx.setOffline(false);
  await ctx.close();
}

writeFileSync(join(OUT, "errors.json"), JSON.stringify(errors, null, 2));
log(`DONE — ${errors.length} non-noise error(s); see out-stress/`);
await browser.close();
