import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WeekStrip from "@/components/home/WeekStrip";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";

/**
 * The capture spec's day-cell selector, pinned against the component that
 * produces the names it selects on.
 *
 * `surfaces.screens.capture.spec.ts` opens the day peek by finding a
 * WeekStrip cell that is NOT today. Its selector was
 * `/day, \w+ \d+$/` — the `$` standing in for "no (today) suffix". That
 * regex was dead for as long as WeekStrip's `aria-label` has carried a
 * training descriptor, because the real name is
 * "Saturday, August 23, lift day" and something always follows the date.
 * It matched nothing on every run: the spec timed out, the whole capture
 * step reported failure, and `home-day-peek` quietly dropped out of the
 * frame set while the other 45 tests still passed and still committed
 * their screenshots. Exactly the rot that had frozen this channel before.
 *
 * Nothing could have caught it, because an e2e selector is only exercised
 * by e2e, which the agent sandbox cannot run — and CI's failure was one
 * red step among frames that still landed. So the regex is read out of
 * the spec HERE and run against the component's real output. If either
 * side moves, this fails in the unit suite, in seconds, locally.
 */
const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

/** The literal the capture spec actually uses — not a copy of it. */
function captureSelector(): RegExp {
  const spec = readFileSync(
    resolve(repoRoot, "e2e/screenshots/surfaces.screens.capture.spec.ts"),
    "utf8"
  );
  const m = spec.match(
    /const otherDay = page\s*\.getByRole\("button", \{ name: \/(.+?)\/ \}\)/s
  );
  if (!m) {
    throw new Error(
      "could not find the day-cell selector in surfaces.screens.capture.spec.ts — " +
        "if the spec was restructured, retarget this extractor rather than deleting it"
    );
  }
  return new RegExp(m[1]);
}

function makeProfile(): UserProfile {
  const weekSchedule: ScheduleDay[] = Array.from({ length: 7 }, (_, day) => ({
    day,
    // A mix, so the descriptor that broke the old selector is present on
    // some cells and different on others.
    type: day % 2 === 0 ? "lift" : "rest",
  }));
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weekSchedule,
  } as UserProfile;
}

function makeProgramState(): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays: [],
  } as ProgramState;
}

function dayCellNames(): string[] {
  const { container } = render(
    <WeekStrip
      dayMap={new Map()}
      profile={makeProfile()}
      programState={makeProgramState()}
      claimMap={new Map<string, ClaimState>()}
      selectedDate={null}
      onDayTap={vi.fn()}
    />
  );
  return Array.from(container.querySelectorAll("button"))
    .map((b) => b.getAttribute("aria-label") ?? "")
    .filter(Boolean);
}

describe("capture spec — WeekStrip day-cell selector", () => {
  it("the strip renders a full week, exactly one of which is today", () => {
    // The fixture this rests on. Without it, "matches no today cell" could
    // pass because there is no today cell to match.
    const names = dayCellNames();
    expect(names).toHaveLength(7);
    expect(names.filter((n) => n.includes("(today)"))).toHaveLength(1);
  });

  it("matches the six non-today cells", () => {
    const selector = captureSelector();
    const matched = dayCellNames().filter((n) => selector.test(n));
    expect(
      matched,
      `the capture spec's day-cell selector ${selector} matches none of ` +
        `WeekStrip's accessible names. This is what a dead selector looks ` +
        `like: the spec times out and its frame silently leaves the set.`
    ).toHaveLength(6);
  });

  it("never matches today — tapping it scrolls instead of peeking", () => {
    // Cal-A: `handleDayTap` treats a tap on today as redundant with the
    // live session cards below and scrolls to them. Selecting today
    // captures the wrong screen rather than failing, which is worse.
    const selector = captureSelector();
    const today = dayCellNames().filter((n) => n.includes("(today)"));
    for (const name of today) {
      expect(
        selector.test(name),
        `selector matched today's cell: ${name}`
      ).toBe(false);
    }
  });
});
