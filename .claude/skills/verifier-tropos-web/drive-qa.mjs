// drive-qa.mjs — full-app QA walk for the Tropos web SPA.
//
// A broad "act as a user" pass: signs in as the seeded user and visits
// every top-level surface, attempting key interactions, and records a
// screenshot + every (non-noise) console error per screen. Use it to
// answer "what's working / what's broken" across the app, not to verify
// one specific diff (use drive.mjs / a tailored driver for that).
//
// Prereqs (see SKILL.md): emulators on :9099/:8080, seeded user + crews,
// app built with VITE_USE_EMULATORS=true, vite preview on :4173.
//
// Output (git-ignored via this dir's .gitignore):
//   out-qa/screenshots/<NN>-<surface>.png
//   out-qa/errors.json   — [{ surface, kind, text }]
//
// Selector notes learned the hard way (keep these current):
//   - the workout CTA is "Begin Workout", NOT "Start Workout"
//   - Social's discover tab is labelled "People", NOT "Find"
//   - History sub-tabs are "Analytics" / "PRs" / "Badges"
//   - a fresh user smart-defaults to Social → People (Soc5c)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "out-qa");
const SCREENS = join(OUT, "screenshots");
mkdirSync(SCREENS, { recursive: true });

const BASE = process.env.BASE_URL || "http://localhost:4173/Maiin/";
const EMAIL = process.env.TEST_EMAIL || "e2e-test@tropos.test";
const PW = process.env.TEST_PASSWORD || "test-password-123";
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const log = (...a) => console.log("[qa]", ...a);

// Container / background-service chatter that isn't from the app itself.
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
    /Failed to load resource.*404/i,
  ].some((re) => re.test(t));
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  bypassCSP: true,
  geolocation: { latitude: 51.5, longitude: -0.12 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();

let surface = "boot";
const errors = [];
const record = (kind, text) => {
  if (noisy(text)) return;
  errors.push({ surface, kind, text: text.slice(0, 400) });
  log(`  ⚠ [${surface}] ${kind}: ${text.slice(0, 160)}`);
};
page.on("pageerror", (e) => record("pageerror", e.message));
page.on(
  "console",
  (m) => m.type() === "error" && record("console.error", m.text())
);

let n = 0;
async function shot(name) {
  n += 1;
  await page
    .screenshot({
      path: join(SCREENS, `${String(n).padStart(2, "0")}-${name}.png`),
    })
    .catch(() => {});
  log(`shot ${name}`);
}
async function go(path, label, waitMs = 3000) {
  surface = label;
  await page
    .goto(BASE + path, { waitUntil: "domcontentloaded" })
    .catch((e) => record("nav", e.message));
  await page.waitForTimeout(waitMs);
}
async function tryClick(locator, label) {
  try {
    const el =
      typeof locator === "string" ? page.locator(locator).first() : locator;
    if ((await el.count()) === 0) {
      log(`  (no match: ${label})`);
      return false;
    }
    await el.click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    return true;
  } catch (e) {
    log(`  (click failed: ${label} — ${e.message.slice(0, 80)})`);
    return false;
  }
}

// ── AUTH ──
surface = "login";
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await shot("login");
await page.fill("#login-email", EMAIL);
await page.fill("#login-password", PW);
await page.click('button[type="submit"]');
await page
  .locator("nav")
  .first()
  .waitFor({ state: "visible", timeout: 20000 })
  .catch(() => record("auth", "nav never appeared after sign-in"));
surface = "home";
await page.waitForTimeout(2500);
await shot("home");

// ── FOOD ──
await go("food", "food");
await shot("food");

// ── PROGRAM (Lift + Run + WorkoutSession) ──
await go("program", "program-lift");
await shot("program-lift");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
if (
  await tryClick(
    page.getByRole("button", { name: /begin workout/i }),
    "Begin Workout"
  )
) {
  surface = "workout-session";
  await shot("workout-session");
  await tryClick(
    page
      .locator("button[aria-label*='close' i]")
      .or(page.getByRole("button", { name: /close|×/i })),
    "close session"
  );
}
surface = "program-run";
await tryClick(page.getByRole("radio", { name: /Run/ }), "Program: Run tab");
await shot("program-run");

// ── SOCIAL (Feed / Crews / People) ──
await go("social", "social-default");
await shot("social-default");
await tryClick(
  page.getByRole("tab", { name: /feed/i }).or(page.getByText(/^Feed$/)),
  "Social: Feed"
);
surface = "social-feed";
await shot("social-feed");
await tryClick(
  page.getByRole("tab", { name: /crew/i }).or(page.getByText(/^Crews$/)),
  "Social: Crews"
);
surface = "social-crews";
await shot("social-crews");
await tryClick(
  page.getByRole("tab", { name: /people/i }).or(page.getByText(/^People$/)),
  "Social: People"
);
surface = "social-people";
await shot("social-people");

// ── HISTORY / ANALYTICS (Analytics / PRs / Badges) ──
await go("history", "history-analytics");
await shot("history-analytics");
for (const t of ["PRs", "Badges", "Analytics"]) {
  if (await tryClick(page.getByText(new RegExp(`^${t}$`)), `History: ${t}`)) {
    surface = `history-${t.toLowerCase()}`;
    await shot(`history-${t.toLowerCase()}`);
  }
}

// ── SETTINGS ──
await go("settings", "settings");
await shot("settings");

// ── RUN (full-screen GPS setup) ──
await go("run", "run", 4000);
await shot("run");

// ── DARK MODE (home) ──
await go("", "home-dark");
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(800);
await shot("home-dark");

writeFileSync(join(OUT, "errors.json"), JSON.stringify(errors, null, 2));
log(`DONE — ${errors.length} non-noise error(s) captured; see out-qa/`);
await browser.close();
