/**
 * The runner's welcome-back capture fixture must survive a midnight
 * rollover, as the lifter's must (`liftReturnCaptureFixture.test.tsx`).
 *
 * `seed-liftreturn-capture.ts` stages a free runner whose last run is
 * RUN_DAYS_AWAY days back; the large-text and axe captures then sign in as
 * her and wait for the sheet's line. They run minutes after the seed, and
 * can measure one day more than it staged. So this asserts the property,
 * for the staged gap and the day after it: Home still greets her with the
 * easy run, and the sheet still says the line the captures wait on. It
 * reads the real seed and the real specs, so editing any of them is what
 * re-runs the check.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RunReturnSheet from "../RunReturnSheet";
import { assessRunReturn } from "@/features/program/runReturn";
import { localDateString } from "@/lib/dateHelpers";

const ROOT = process.cwd();

function read(relative: string): string {
  return readFileSync(resolve(ROOT, relative), "utf8");
}

/** The gap the seed stages, as the seed declares it. */
function seededDaysAway(): number {
  const src = read("scripts/seed-liftreturn-capture.ts");
  const match = /^const RUN_DAYS_AWAY = (\d+);$/m.exec(src);
  if (!match)
    throw new Error("seed-liftreturn-capture.ts: RUN_DAYS_AWAY not found");
  return Number(match[1]);
}

/** The sheet's words the captures wait on, the same in both specs. */
const SPECS = [
  "e2e/screenshots/largeText.capture.spec.ts",
  "e2e/screenshots/axe.capture.spec.ts",
];
function specAnchor(): string {
  const anchors = SPECS.map((file) => {
    const match =
      /getByText\("(since your last run)", \{ exact: false \}\)/.exec(
        read(file)
      );
    if (!match) throw new Error(`${file}: the run-return anchor not found`);
    return match[1];
  });
  expect(new Set(anchors).size).toBe(1);
  return anchors[0];
}

function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

describe("run-return capture fixture", () => {
  const staged = seededDaysAway();
  const anchor = specAnchor();

  for (const daysAway of [staged, staged + 1]) {
    it(`is greeted with the easy run at ${daysAway} days away`, () => {
      const assessment = assessRunReturn({
        plan: "free",
        runs: [{ date: daysAgoKey(daysAway), distance: 5000, duration: 1725 }],
        todayKey: localDateString(),
      });
      expect(assessment.offer).toBe("easy-run");
      expect(assessment.daysAway).toBe(daysAway);
    });

    it(`renders the line the captures wait on at ${daysAway} days away`, () => {
      render(
        <RunReturnSheet
          open
          onClose={() => {}}
          onEasyRun={() => {}}
          daysAway={daysAway}
        />
      );
      // The figure is its own span (`InlineNumerals`), so the line is read
      // whole, from its paragraph.
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName === "P" &&
            el.textContent === `It's been about 2 weeks ${anchor}`
        )
      ).toBeInTheDocument();
      cleanup();
    });
  }
});
