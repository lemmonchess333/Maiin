/**
 * The lift-return capture fixture must survive a midnight rollover.
 *
 * `seed-liftreturn-capture.ts` stages a gap in whole days; the capture spec
 * then waits on the rendered line ("It's been about 3 weeks") to prove it
 * filmed the detrained branch rather than the ordinary one. Those two run
 * MINUTES apart, and on 2026-09-13 they straddled midnight UTC — the seed
 * dated the last session 24 days back, the capture measured 25, the sheet
 * rounded to "about 4 weeks", and `capture-specs` went red on four PRs at
 * once for a fixture that was correct when it was written.
 *
 * Nothing connected the two numbers. The seed's day count, the sheet's
 * rounding and the spec's literal each looked right in isolation, which is
 * why the failure read as a broken selector rather than as arithmetic.
 *
 * So this asserts the property, not the number: the staged gap and the
 * staged gap PLUS ONE DAY must both render the line the spec waits for, and
 * must both still classify as detrained. Any gap that only works on the day
 * it is written fails here, in the unit suite, rather than at 00:04 UTC in a
 * ten-minute emulator job. It reads both real files rather than restating
 * them, so editing either one is what re-runs the check.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import LiftReturnSheet from "../LiftReturnSheet";
import { classifyLayoff } from "@/features/program/layoffDetection";

const ROOT = process.cwd();

function read(relative: string): string {
  return readFileSync(resolve(ROOT, relative), "utf8");
}

/** The gap the seed stages, as the seed actually declares it. */
function seededDaysAway(): number {
  const src = read("scripts/seed-liftreturn-capture.ts");
  const match = /^const DAYS_AWAY = (\d+);$/m.exec(src);
  if (!match)
    throw new Error("seed-liftreturn-capture.ts: DAYS_AWAY not found");
  return Number(match[1]);
}

/** The line the capture spec blocks on before it shoots. */
function specGapLine(): string {
  const src = read("e2e/screenshots/lift-return.screens.capture.spec.ts");
  const match = /getByText\(\/(It's been about \d+ weeks)\/i\)/.exec(src);
  if (!match) {
    throw new Error(
      "lift-return.screens.capture.spec.ts: gap-line locator not found"
    );
  }
  return match[1];
}

function renderGap(daysAway: number): void {
  render(
    <LiftReturnSheet
      open
      onClose={() => {}}
      onGoToProgramme={() => {}}
      daysAway={daysAway}
      layoff={classifyLayoff(daysAway)}
    />
  );
}

describe("lift-return capture fixture", () => {
  const staged = seededDaysAway();
  const line = specGapLine();

  // Both days, because the seed runs before the specs and never after: the
  // only drift possible is the capture measuring one day MORE than was
  // staged. Asserting the staged day alone is what passed on 2026-09-13.
  for (const daysAway of [staged, staged + 1]) {
    it(`renders the spec's line at ${daysAway} days away`, () => {
      renderGap(daysAway);
      expect(screen.getByText(line)).toBeInTheDocument();
      cleanup();
    });

    it(`is still a detrained layoff at ${daysAway} days away`, () => {
      // The spec also waits on the detrained body copy, so a gap that
      // rolled out of `detrained` would fail the capture on the sentence
      // below the one above.
      expect(classifyLayoff(daysAway)).toBe("detrained");
    });
  }
});
