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
 * Most of these pin the STRUCTURE rather than the value, so they held
 * unchanged across the flip itself: whatever the anchor is, the seven days
 * of a week agree and `dateForDayOfWeek` lands on the right weekday.
 *
 * Two do pin the value, deliberately and with literal dates. The anchor is
 * MONDAY now (RunWk2 — en-GB and ISO-8601, and what `streakEngine.weekKey`
 * and the coach-prompt ids always used), and a structural suite cannot
 * tell you which day that is: every assertion in it passes just as well
 * under Sunday. A literal is the only thing that fails when someone
 * changes the constant without meaning to.
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
  migrateWeekKeyAnchor,
  parseLocalDate,
} from "../dateHelpers";

describe("the anchor is MONDAY, and a literal is what says so", () => {
  it("keys a Sunday back to the Monday that opened its week", () => {
    // Sun 2026-09-13 belongs to the week that began Mon 2026-09-07.
    // This is THE assertion the structural tests cannot make: under a
    // Sunday anchor the same date keys to itself.
    expect(localWeekKey(parseLocalDate("2026-09-13"))).toBe("2026-09-07");
  });

  it("keys a Monday to itself", () => {
    expect(localWeekKey(parseLocalDate("2026-09-07"))).toBe("2026-09-07");
  });

  it("is Monday in getDay() numbering", () => {
    expect(WEEK_STARTS_ON).toBe(1);
  });
});

describe("migrateWeekKeyAnchor — re-anchoring a stored Sunday key", () => {
  it("shifts a Sunday key FORWARD to the Monday week sharing six of its days", () => {
    // The direction is the point. Sun 6 Sept opened the old week
    // Sun 6..Sat 12; the closest Monday week is Mon 7..Sun 13.
    expect(migrateWeekKeyAnchor("2026-09-06")).toBe("2026-09-07");
  });

  it("never resolves BACKWARD, which is what a naive re-derive would do", () => {
    // localWeekKey("2026-09-06") under Monday rules is 2026-08-31 — a
    // week EARLIER than the key it replaced. Both rollovers compare a
    // stored key against a fresh one as strings and advance while the
    // stored one sorts first, so the naive answer hands every user a
    // spurious week advance on their first open after the flip.
    const naive = localWeekKey(parseLocalDate("2026-09-06"));
    expect(naive).toBe("2026-08-31");
    expect(migrateWeekKeyAnchor("2026-09-06")).not.toBe(naive);
    expect(
      migrateWeekKeyAnchor("2026-09-06") > naive,
      "the remap must move forward, not back"
    ).toBe(true);
  });

  it("is idempotent — a key already on the anchor is returned unchanged", () => {
    // It runs on every read, so a second pass must not walk anyone on.
    const once = migrateWeekKeyAnchor("2026-09-06");
    expect(migrateWeekKeyAnchor(once)).toBe(once);
    expect(migrateWeekKeyAnchor("2026-09-07")).toBe("2026-09-07");
  });

  it("lands on the anchor from every day of the week", () => {
    for (let d = 6; d <= 12; d++) {
      const key = `2026-09-${String(d).padStart(2, "0")}`;
      const out = migrateWeekKeyAnchor(key);
      expect(parseLocalDate(out).getDay()).toBe(WEEK_STARTS_ON);
    }
  });
});

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
