// drive-measure-tabs.mjs — measure vertical anchoring of Lift vs Run tab.
// Logs in, opens /program, measures the Y of the segmented control and the
// first primary content row on each tab, screenshots both. Used to ground-
// truth the "page clips up between lift and run" report.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "out-measure");
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4173/Maiin/";
const EMAIL = "e2e-test@tropos.test";
const PW = "test-password-123";
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const log = (...a) => console.log("[measure]", ...a);

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  bypassCSP: true,
});
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.fill("#login-email", EMAIL);
await page.fill("#login-password", PW);
await page.click('button[type="submit"]');
await page.locator("nav").first().waitFor({ state: "visible", timeout: 20000 });
await page.waitForTimeout(1500);

await page.goto(BASE + "program", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

async function box(sel) {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return null;
  const b = await el.boundingBox();
  return b ? { top: Math.round(b.y), h: Math.round(b.height) } : null;
}

async function measure(tab) {
  const seg = await box('[role="radiogroup"], [aria-label="Programme mode"]');
  // lift day-stepper: aria-label "Lift sessions"; run: "Run week"
  const liftSel = await box('[aria-label="Lift sessions"]');
  const runSel = await box('[aria-label="Run week"]');
  // first heading-ish content / hero on the tab
  const h1 = await box("h1");
  log(`--- ${tab} ---`);
  log(`  h1(Programme) top=${h1?.top}`);
  log(
    `  segmented control top=${seg?.top} h=${seg?.h} bottom=${seg ? seg.top + seg.h : "?"}`
  );
  log(`  lift selector: ${JSON.stringify(liftSel)}`);
  log(`  run selector:  ${JSON.stringify(runSel)}`);
  return { seg, liftSel, runSel };
}

// dismiss any blocking modal (streak reminder etc.)
for (const label of [/No thanks/i, /Yes, remind me/i, /Got it/i, /Dismiss/i]) {
  const b = page.getByRole("button", { name: label }).first();
  if ((await b.count()) > 0) {
    await b.click().catch(() => {});
    await page.waitForTimeout(500);
    break;
  }
}
await page.waitForTimeout(500);

const liftM = await measure("LIFT");
await page.screenshot({ path: join(OUT, "lift.png") });

// switch to Run
await page.getByRole("radio", { name: /Run/ }).click();
await page.waitForTimeout(1200);
const runM = await measure("RUN");
await page.screenshot({ path: join(OUT, "run.png") });

// Also measure the first visible content element after the seg control on Run
const runFirst = await page.evaluate(() => {
  const seg = document.querySelector('[aria-label="Programme mode"]');
  if (!seg) return null;
  const segBottom = seg.getBoundingClientRect().bottom;
  // walk forward in DOM for the first element below the seg control with size
  const all = [...document.querySelectorAll("section *, section")];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.height > 20 && r.top > segBottom + 2 && r.width > 100) {
      return {
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 60),
        top: Math.round(r.top),
        text: (el.textContent || "").trim().slice(0, 40),
      };
    }
  }
  return null;
});
log("RUN first content below seg:", JSON.stringify(runFirst));

if (liftM.seg && runM.seg) {
  const liftStepperOffset = liftM.liftSel
    ? liftM.liftSel.top - (liftM.seg.top + liftM.seg.h)
    : null;
  const runStepperOffset = runM.runSel
    ? runM.runSel.top - (runM.seg.top + runM.seg.h)
    : runFirst
      ? runFirst.top - (runM.seg.top + runM.seg.h)
      : null;
  log("=====================================");
  log(`LIFT stepper offset below seg-control: ${liftStepperOffset}px`);
  log(`RUN  content offset below seg-control: ${runStepperOffset}px`);
  log(
    `DELTA (run - lift) = ${runStepperOffset != null && liftStepperOffset != null ? runStepperOffset - liftStepperOffset : "?"}px`
  );
}

await browser.close();
