/**
 * Screen scores: the main screens measured against DESIGN_GUIDE §14m's
 * rules, for the screen-critique skill (`.claude/skills/screen-critique`).
 *
 * Opt-in: it runs only with TROPOS_SCORE=1 (`npm run score:screens`), so
 * the capture-specs gate does not spend its minutes on a report nobody
 * reads there. Against the emulator rig with the full seed chain, as the
 * other capture specs (docs/agents/capture-rig.md).
 *
 * Writes, for each screen and theme, the first screen's frame and its
 * checks to `screenshots/score/`: `report.md` (a table per screen) and
 * `report.json`. Nothing here fails on a score: a rule a screen misses is
 * a finding for the critique, read by eye before it is said.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import { PNG } from "pngjs";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { readDomFigures } from "../helpers/screenScore";
import {
  checkRules,
  checksTable,
  colourStats,
  type DomFigures,
} from "../../scripts/design-qa/screenScore";

test.use({
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** The screens a critique starts from. `kind` sets the chrome limit. */
const SCREENS: { name: string; path: string; kind: DomFigures["kind"] }[] = [
  { name: "Home", path: "/Maiin/", kind: "root" },
  { name: "Train", path: "/Maiin/program", kind: "root" },
  { name: "Food", path: "/Maiin/food", kind: "root" },
  { name: "Progress", path: "/Maiin/history", kind: "root" },
  { name: "Social Together", path: "/Maiin/social?tab=together", kind: "root" },
  { name: "Social Feed", path: "/Maiin/social?tab=feed", kind: "root" },
  { name: "League", path: "/Maiin/league", kind: "detail" },
  { name: "Space", path: "/Maiin/space/london-marathon", kind: "detail" },
  { name: "Weekly review", path: "/Maiin/review", kind: "detail" },
  { name: "Settings", path: "/Maiin/settings", kind: "detail" },
  { name: "Pro", path: "/Maiin/upgrade", kind: "detail" },
];

const OUT = "screenshots/score";
const WIDTH = 393;
const HEIGHT = 852;

test.describe("screen scores", () => {
  test.skip(
    !emulatorActive || process.env.TROPOS_SCORE !== "1",
    "opt-in: TROPOS_SCORE=1 against the emulator rig (npm run score:screens)"
  );

  test("the main screens against the measured rules", async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await signInAsTestUser(page, {
      email: "e2e-test@tropos.test",
      password: "test-password-123",
    });

    const report: unknown[] = [];
    const tables: string[] = [];
    for (const screen of SCREENS) {
      await page.goto(screen.path);
      // The page reads several collections; give its cards a moment.
      await page.waitForTimeout(2_500);
      await settleImages(page).catch(() => {});
      for (const theme of ["dark", "light"] as const) {
        await page.evaluate((dark) => {
          document.documentElement.classList.toggle("dark", dark);
          window.scrollTo(0, 0);
        }, theme === "dark");
        await page.waitForTimeout(300);
        const shot = await page.screenshot({ animations: "disabled" });
        const file = `${screen.name.toLowerCase().replace(/\s+/g, "-")}-${theme}`;
        writeFileSync(`${OUT}/${file}.png`, shot);
        const dom = await readDomFigures(page, screen.kind);
        const colour = colourStats(PNG.sync.read(shot), HEIGHT);
        const checks = checkRules(dom, colour);
        report.push({ screen: screen.name, theme, file, dom, colour, checks });
        tables.push(checksTable(`${screen.name}, ${theme}`, checks));
      }
    }
    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
    writeFileSync(
      `${OUT}/report.md`,
      [
        "# Screen scores",
        "",
        `The first ${WIDTH} × ${HEIGHT} screen of each, on the emulator rig with the full seed chain. A ✗ is a place to look, not a verdict: read the frame before saying anything.`,
        "",
        ...tables.flatMap((t) => [t, ""]),
      ].join("\n")
    );
  });
});
