// Standalone audit crawler — NOT a committed test. Drives the built
// app (preview server) against the Firebase emulator, signs in as the
// seeded E2E user, walks every route, records console/page/network
// errors + error-boundary renders, screenshots each page, and runs a
// safe button-interaction pass (destructive controls denylisted).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:4173/Maiin/";
const OUT = "/tmp/tropos-audit";
const SHOTS = `${OUT}/shots`;
mkdirSync(SHOTS, { recursive: true });

const CREDS = { email: "e2e-test@tropos.test", password: "test-password-123" };

// Buttons we must NOT click (irreversible / external / GPS / payment).
const DENY = [
  /delete/i,
  /sign out/i,
  /log ?out/i,
  /upgrade/i,
  /checkout/i,
  /\bpay\b/i,
  /subscribe/i,
  /start run/i,
  /begin run/i,
  /purchase/i,
  /restore/i,
  /export/i,
  /download/i,
  /remove account/i,
  /deactivate/i,
];

const results = [];
let cur = null; // current route record collecting events

function newRecord(label, path) {
  return {
    label,
    path,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    errorBoundary: false,
    bodyText: "",
    interactions: [],
  };
}

const EXEC =
  process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  bypassCSP: true,
}); // iPhone-ish; bypass prod CSP so emulator origin works
const page = await ctx.newPage();

page.on("console", (m) => {
  if (!cur) return;
  const t = m.type();
  const text = `${m.text()}`.slice(0, 500);
  if (t === "error") cur.consoleErrors.push(text);
  else if (t === "warning") cur.consoleWarnings.push(text);
});
page.on("pageerror", (e) => {
  if (cur) cur.pageErrors.push(`${e.message}`.slice(0, 500));
});
page.on("requestfailed", (r) => {
  if (!cur) return;
  const u = r.url();
  // Ignore expected emulator long-poll aborts / analytics noise.
  if (
    /google-analytics|googletagmanager|firebaseinstallations|fcmregistrations/.test(
      u
    )
  )
    return;
  cur.failedRequests.push(
    `${r.failure()?.errorText || "failed"} ${u}`.slice(0, 300)
  );
});

async function settle(ms = 1200) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(ms);
}

async function checkErrorBoundary() {
  const txt = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const eb =
    /something went wrong|unexpected error|reload the page|this section couldn’t load|this section couldn't load/i.test(
      txt
    );
  return { eb, txt: txt.slice(0, 600) };
}

async function signIn() {
  cur = newRecord("signin", "/");
  results.push(cur);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await settle(800);
  await page
    .locator("#login-email")
    .waitFor({ state: "visible", timeout: 20000 });
  await page.fill("#login-email", CREDS.email);
  await page.fill("#login-password", CREDS.password);
  await page.locator('button[type="submit"]').first().click();
  await page
    .locator("nav")
    .first()
    .waitFor({ state: "visible", timeout: 25000 });
  await settle(800);
  const { eb } = await checkErrorBoundary();
  cur.errorBoundary = eb;
}

async function visit(label, path, { interact = false } = {}) {
  cur = newRecord(label, path);
  results.push(cur);
  try {
    await page.goto(BASE + path.replace(/^\//, ""), {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
  } catch (e) {
    cur.pageErrors.push(`goto failed: ${e.message}`);
  }
  await settle();
  const { eb, txt } = await checkErrorBoundary();
  cur.errorBoundary = eb;
  cur.bodyText = txt;
  const safe = label.replace(/[^a-z0-9]+/gi, "_");
  await page
    .screenshot({ path: `${SHOTS}/${safe}.png`, fullPage: true })
    .catch(() => {});
  if (interact) await interactButtons(label, path);
}

async function interactButtons(label, path) {
  const handles = await page
    .locator('button:visible, [role="button"]:visible')
    .elementHandles()
    .catch(() => []);
  const names = [];
  for (const h of handles) {
    const name = (
      (await h.getAttribute("aria-label")) ||
      (await h.innerText().catch(() => "")) ||
      ""
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    names.push({ h, name });
  }
  const seen = new Set();
  for (const { h, name } of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (DENY.some((re) => re.test(name))) {
      cur.interactions.push(`SKIP(deny): ${name}`);
      continue;
    }
    const before = cur.consoleErrors.length + cur.pageErrors.length;
    try {
      await h.click({ timeout: 2500 });
      await page.waitForTimeout(500);
      // If a dialog/sheet opened, screenshot it.
      const dlg = await page
        .locator(
          '[role="dialog"]:visible, [data-vaul-drawer]:visible, [role="menu"]:visible'
        )
        .count()
        .catch(() => 0);
      if (dlg > 0) {
        const safe = `${label}__${name}`
          .replace(/[^a-z0-9]+/gi, "_")
          .slice(0, 60);
        await page.screenshot({ path: `${SHOTS}/${safe}.png` }).catch(() => {});
      }
      const after = cur.consoleErrors.length + cur.pageErrors.length;
      cur.interactions.push(
        `${name}${after > before ? " [ERROR+]" : ""}${dlg ? " [opened]" : ""}`
      );
      // Reset: escape any sheet, then return to the page baseline.
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
      if (!page.url().includes(path.replace(/^\//, "")) && path !== "/") {
        await page.goto(BASE + path.replace(/^\//, ""), {
          waitUntil: "domcontentloaded",
        });
        await settle(600);
      }
    } catch (e) {
      cur.interactions.push(
        `${name} [click-failed: ${(e.message || "").slice(0, 60)}]`
      );
    }
  }
}

// ---- run ----
await signIn();

// Scrape uid from diagnostics for the /user route.
await visit("diagnostics", "/diagnostics");
let uid = "self";
try {
  const m = cur.bodyText.match(/[a-zA-Z0-9]{20,}/);
  if (m) uid = m[0];
} catch {}

const routes = [
  ["home", "/", true],
  ["food", "/food", true],
  ["history", "/history", true],
  ["program", "/program", true],
  ["social", "/social", true],
  ["settings_index", "/settings", true],
  ["settings_profile", "/settings/profile", false],
  ["settings_training", "/settings/training", false],
  ["settings_nutrition", "/settings/nutrition", false],
  ["settings_workout_prefs", "/settings/workout-prefs", false],
  ["settings_units_appearance", "/settings/units-appearance", false],
  ["settings_privacy", "/settings/privacy", false],
  ["settings_shoes", "/settings/shoes", false],
  ["settings_notifications", "/settings/notifications", false],
  ["settings_subscription", "/settings/subscription", false],
  ["settings_support_legal", "/settings/support-legal", false],
  ["settings_account", "/settings/account", false],
  ["settings_recently_deleted", "/settings/recently-deleted-meals", false],
  ["settings_legacy", "/settings/legacy", false],
  ["upgrade", "/upgrade", false],
  ["admin_moderation", "/admin/moderation", false],
  ["run", "/run", false],
  ["run_summary", "/run-summary", false],
  ["privacy", "/privacy", false],
  ["terms", "/terms", false],
  ["user_self", `/user/${uid}`, false],
  ["exercise_history", "/history/exercise/Bench%20Press", false],
  ["crew_missing", "/crew/nonexistent", false],
  ["routine_missing", "/routine/nonexistent", false],
  ["run_detail_missing", "/run/nonexistent", false],
  ["unknown_route", "/this-route-does-not-exist", false],
];

for (const [label, path, interact] of routes) {
  await visit(label, path, { interact });
}

writeFileSync(`${OUT}/results.json`, JSON.stringify({ uid, results }, null, 2));

// Console summary.
for (const r of results) {
  const flags = [];
  if (r.errorBoundary) flags.push("ERROR_BOUNDARY");
  if (r.pageErrors.length) flags.push(`pageErr:${r.pageErrors.length}`);
  if (r.consoleErrors.length)
    flags.push(`consoleErr:${r.consoleErrors.length}`);
  if (r.failedRequests.length) flags.push(`netFail:${r.failedRequests.length}`);
  console.log(
    `${flags.length ? "⚠ " : "  "}${r.label.padEnd(26)} ${flags.join(" ") || "ok"}`
  );
}

await browser.close();
console.log(`\nDone. uid=${uid}. JSON: ${OUT}/results.json  Shots: ${SHOTS}`);
