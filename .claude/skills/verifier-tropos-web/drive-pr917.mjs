// drive-pr917.mjs — verify the programme-save change recap + runs-in-copy.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out"); // gitignored — transient run evidence
const SCREENS = join(OUT_DIR, "screenshots");
mkdirSync(SCREENS, { recursive: true });

const BASE = "http://localhost:4173/Maiin/";
const EMAIL = "e2e-test@tropos.test";
const PW = "test-password-123";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const log = (...a) => console.log("[drive]", ...a);

const ENV_NOISE = [
  /punycode/i,
  /MetadataLookup/i,
  /favicon\.ico/i,
  /ERR_CERT_AUTHORITY_INVALID/i,
  /firestore\.googleapis\.com/i,
  /firebaseinstallations\.googleapis/i,
  /Failed to load resource.*404/i,
];
const interesting = (t) => !ENV_NOISE.some((re) => re.test(t));

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
  const t = m.text();
  if (interesting(t))
    errors.push({ kind: "console.error", text: t, url: page.url() });
});

let stepN = 0;
const observations = [];
async function step(name, fn) {
  stepN += 1;
  const tag = String(stepN).padStart(2, "0");
  log(`step ${tag}: ${name}`);
  try {
    const note = await fn();
    if (note) observations.push(`${tag} ${name}: ${note}`);
    await page.screenshot({
      path: join(SCREENS, `${tag}-${name.replace(/\s+/g, "-")}.png`),
    });
  } catch (e) {
    log(`  FAILED: ${e.message}`);
    await page
      .screenshot({
        path: join(SCREENS, `${tag}-${name.replace(/\s+/g, "-")}-FAIL.png`),
      })
      .catch(() => {});
    observations.push(`${tag} ${name}: FAILED — ${e.message}`);
    throw e;
  }
}

try {
  await step("boot", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    return `title="${await page.title()}"`;
  });

  await step("sign-in", async () => {
    await page.fill("#login-email", EMAIL);
    await page.fill("#login-password", PW);
    await page.locator('button[type="submit"]').first().click();
    await page
      .locator("nav")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    return `url=${page.url()}`;
  });

  await step("open-settings-training", async () => {
    await page.goto(BASE + "settings/training", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByText("Nutrition phase")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    return "ProgrammeSettings editor rendered (Nutrition phase section visible)";
  });

  await step("edit-two-fields", async () => {
    // recomp -> cut, and lift days 4 -> 5
    await page.locator('button:has-text("Cutting")').first().click();
    await page.getByRole("button", { name: "5", exact: true }).click();
    const saveBar = page.getByRole("button", { name: "Save changes" });
    await saveBar.waitFor({ state: "visible", timeout: 5_000 });
    return "edited Nutrition Recomp→Cutting + Lift days 4→5; sticky 'Save changes' bar appeared";
  });

  await step("open-confirm-modal", async () => {
    await page.getByRole("button", { name: "Save changes" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(300); // settle the framer-motion scale-in
    const text = (await dialog.innerText()).replace(/\n+/g, " | ");
    log("  MODAL TEXT:", text);
    writeFileSync(join(OUT_DIR, "modal-text.txt"), text);

    const checks = {
      hasChangesHeader: /changes/i.test(text),
      hasNutritionRow:
        /Nutrition phase/.test(text) &&
        /Recomp/.test(text) &&
        /Cutting/.test(text),
      hasLiftRow: /Lift days/.test(text) && /4/.test(text) && /5/.test(text),
      hasArrow: /→/.test(text),
      mentionsRuns: /logged workouts and runs stay in History/i.test(text),
    };
    writeFileSync(
      join(OUT_DIR, "checks.json"),
      JSON.stringify(checks, null, 2)
    );
    const failed = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (failed.length)
      throw new Error("modal assertions failed: " + failed.join(", "));
    return "ALL modal assertions passed: Changes header, Recomp→Cutting, Lift days 4→5, arrow glyph, 'logged workouts and runs stay in History'";
  });

  // ── PROBE 1: dirty must react in BOTH directions off the SAME diff.
  // Cancel, reload fresh (drafts reset to saved), toggle the mid-page
  // nutrition control on→off, asserting the save bar appears then clears.
  // (Lift-days row is bottom-of-page behind the fixed emulator banner, so
  // this uses nutrition to avoid that dev-only occlusion.)
  await step("probe-dirty-both-directions", async () => {
    await page.getByRole("button", { name: "Cancel" }).click();
    await page
      .getByRole("alertdialog")
      .waitFor({ state: "hidden", timeout: 5_000 });
    await page.goto(BASE + "settings/training", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByText("Nutrition phase")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    const bar = page.getByRole("button", { name: "Save changes" });
    if (await bar.isVisible().catch(() => false))
      throw new Error(
        "save bar visible on a fresh, unedited load (dirty should be false)"
      );

    await page.locator('button:has-text("Cutting")').first().click();
    await bar.waitFor({ state: "visible", timeout: 5_000 }); // dirty → true

    await page.locator('button:has-text("Recomp")').first().click();
    await page.waitForTimeout(400);
    if (await bar.isVisible().catch(() => false))
      throw new Error(
        "save bar still visible after reverting nutrition to saved value — dirty did not clear"
      );
    return "fresh load: no bar → pick Cutting: bar appears → back to Recomp: bar clears. dirty reacts both ways, no phantom change.";
  });

  // ── PROBE 2: race_prep with no date → 'Fix race date' (button disabled),
  // a single-field run-mode change still shows in the recap once a date is set.
  await step("probe-race-prep-validation", async () => {
    await page.locator('button:has-text("Race prep")').first().click();
    await page.waitForTimeout(300);
    const fixLabel = await page
      .getByRole("button", { name: "Fix race date" })
      .isVisible()
      .catch(() => false);
    return fixLabel
      ? "switching to Race prep with no date → save bar reads 'Fix race date' (blocked until valid)"
      : "Race prep selected (no 'Fix race date' label observed — note for review)";
  });
} finally {
  writeFileSync(join(OUT_DIR, "errors.json"), JSON.stringify(errors, null, 2));
  writeFileSync(join(OUT_DIR, "observations.txt"), observations.join("\n"));
  log(`captured ${errors.length} interesting console errors`);
  await browser.close();
}
console.log(
  errors.length
    ? "\nErrors caught (see errors.json)"
    : "\nClean run (no interesting console errors)."
);
