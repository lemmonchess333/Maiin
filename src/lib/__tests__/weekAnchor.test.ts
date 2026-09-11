/**
 * The week's first day is decided once.
 *
 * It was decided in six places: `localWeekKey`, plus
 * `setDate(getDate() - getDay())` written out by hand in
 * `personalTrajectory`, `leaderboard`, and twice each in two blocks of
 * `History.tsx`. History's own comments insisted its axis "MUST use the
 * same local-week helper" as its data — a coupling real enough to
 * document, held together by nothing but the comment. Changing the anchor
 * meant finding all six and agreeing with yourself six times.
 *
 * These tests pin the structure rather than the value: WEEK_STARTS_ON may
 * change (Monday is en-GB and ISO, and `streakEngine.weekKey` and the
 * coach-prompt ids already use it), and when it does, everything here must
 * follow from the one edit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  WEEK_STARTS_ON,
  startOfLocalWeek,
  localWeekKey,
  dateForDayOfWeek,
  parseLocalDate,
} from "../dateHelpers";

describe("the anchor is self-consistent", () => {
  it("puts every day of a week on the same key", () => {
    // Seven consecutive days must agree, whatever the anchor is.
    const start = startOfLocalWeek(new Date(2026, 4, 14));
    const key = localWeekKey(start);
    for (let i = 0; i < 7; i++) {
      const d = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i
      );
      expect(localWeekKey(d)).toBe(key);
    }
  });

  it("starts the week on WEEK_STARTS_ON", () => {
    for (const d of [
      new Date(2026, 4, 11),
      new Date(2026, 4, 14),
      new Date(2026, 4, 17),
      new Date(2027, 0, 2),
    ]) {
      expect(startOfLocalWeek(d).getDay()).toBe(WEEK_STARTS_ON);
    }
  });

  it("rolls the eighth day into the next week", () => {
    // Guards an off-by-one that would make a week eight days long.
    const start = startOfLocalWeek(new Date(2026, 4, 14));
    const eighth = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 7
    );
    expect(localWeekKey(eighth)).not.toBe(localWeekKey(start));
  });
});

describe("dateForDayOfWeek follows the same anchor", () => {
  it("round-trips every day-of-week back to its own week key", () => {
    // The property that breaks when a call site adds dayIndex straight
    // onto the key: under a non-Sunday anchor, Sunday lands a week out.
    const key = localWeekKey(new Date(2026, 4, 14));
    for (let dow = 0; dow < 7; dow++) {
      const date = dateForDayOfWeek(key, dow);
      expect(parseLocalDate(date).getDay()).toBe(dow);
      expect(localWeekKey(parseLocalDate(date))).toBe(key);
    }
  });

  it("returns seven distinct dates", () => {
    const key = localWeekKey(new Date(2026, 4, 14));
    const dates = new Set(
      Array.from({ length: 7 }, (_, dow) => dateForDayOfWeek(key, dow))
    );
    expect(dates.size).toBe(7);
  });
});

/* Structure, not behaviour: the point of the refactor is that nowhere
   re-derives the boundary. A source scan is the only way to see that. */
describe("nothing decides the week boundary on its own", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const files = [
    "src/lib/personalTrajectory.ts",
    "src/lib/leaderboard.ts",
    "src/pages/History.tsx",
    "src/lib/chartGranularity.ts",
  ];

  it("has no hand-written week arithmetic left in the callers", () => {
    for (const file of files) {
      const code = readFileSync(resolve(repoRoot, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
      /* Bounded by the statement, not by the first ")": the inner
         `getDate()` closes a paren before `getDay()` is reached, so a
         `[^)]*` form silently matches nothing and this guard passes while
         the arithmetic is back. Caught by mutating leaderboard.ts. */
      expect(code).not.toMatch(/\.setDate\([^;]*getDay\(\)/);
    }
  });

  it("keeps the offset out of the weekKey + dayIndex call sites", () => {
    for (const file of [
      "src/lib/runReschedule.ts",
      "src/features/program/migrations.ts",
    ]) {
      const code = readFileSync(resolve(repoRoot, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
      expect(code).toMatch(/dateForDayOfWeek\(/);
      expect(code).not.toMatch(/addLocalDays\([^)]*dayIndex/);
    }
  });
});
