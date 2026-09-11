/**
 * Tests for dateHelpers · P0-A · spec v7.
 *
 * Critical invariant: helpers use LOCAL date components, not UTC.
 * The single biggest class of bugs we're preventing is the late-night
 * timezone roll — `new Date().toISOString().split('T')[0]` returns
 * tomorrow's date for a user in PST after 4 PM. These tests pin that
 * the helpers return what the user sees on their calendar.
 */

import { describe, it, expect } from "vitest";
import {
  localDateString,
  localWeekKey,
  dateForDayOfWeek,
  generateScheduledRunId,
  addLocalDays,
  parseLocalDate,
} from "../dateHelpers";

describe("localDateString", () => {
  it("returns YYYY-MM-DD format with zero-padding", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026 (local)
    expect(localDateString(d)).toBe("2026-01-05");
  });

  it("uses local calendar date, not UTC", () => {
    // 23:30 on May 14 in any timezone — the user's calendar says May 14
    // (would say May 15 if we accidentally used toISOString)
    const d = new Date(2026, 4, 14, 23, 30, 0);
    expect(localDateString(d)).toBe("2026-05-14");
  });

  it("defaults to today when no arg passed", () => {
    const result = localDateString();
    // Just verify shape — the actual date depends on when the test runs
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never contains a 'T' (would indicate UTC ISO format leak)", () => {
    const d = new Date(2026, 4, 14, 23, 0, 0);
    expect(localDateString(d)).not.toContain("T");
  });
});

/* Weeks start on MONDAY — en-GB and ISO-8601, and what the partner-streak
   engine and the coach-prompt ids have always used. Every expectation here
   is a literal rather than a call to the function under test, so a silent
   re-anchor fails loudly instead of agreeing with itself. */
describe("localWeekKey", () => {
  it("returns the Monday on or before the given date", () => {
    // Thu 14 May 2026 — the source comment called this a Wednesday.
    const thu = new Date(2026, 4, 14);
    expect(localWeekKey(thu)).toBe("2026-05-11"); // Monday 11 May
  });

  it("returns the same date when called on a Monday", () => {
    const mon = new Date(2026, 4, 11);
    expect(localWeekKey(mon)).toBe("2026-05-11");
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // The whole point of the anchor, and the day the two conventions
    // disagree about: Sun 10 May belongs to the week that began Mon 4 May.
    const sun = new Date(2026, 4, 10);
    expect(localWeekKey(sun)).toBe("2026-05-04");
  });

  it("crosses month boundaries correctly", () => {
    // Sun 3 May 2026 belongs to the week beginning Mon 27 April.
    const sun = new Date(2026, 4, 3);
    expect(localWeekKey(sun)).toBe("2026-04-27");
    // Mon 1 June 2026 starts its own week.
    const monJun = new Date(2026, 5, 1);
    expect(localWeekKey(monJun)).toBe("2026-06-01");
  });

  it("crosses year boundaries correctly", () => {
    // Sat 2 Jan 2027 belongs to the week beginning Mon 28 Dec 2026.
    const sat = new Date(2027, 0, 2);
    expect(localWeekKey(sat)).toBe("2026-12-28");
  });
});

/* A weekKey is a MONDAY; a dayIndex is a plain day-of-week where 0 is
   SUNDAY. The two are one offset apart, and every call site that added the
   index straight onto the key shifted a run by a day — and a Sunday run by
   a whole week. The offset lives in one function now; this pins it. */
describe("dateForDayOfWeek", () => {
  it("maps each day-of-week onto the right date in a Monday week", () => {
    const weekKey = "2026-05-11"; // Monday 11 May 2026
    expect(dateForDayOfWeek(weekKey, 1)).toBe("2026-05-11"); // Mon
    expect(dateForDayOfWeek(weekKey, 3)).toBe("2026-05-13"); // Wed
    expect(dateForDayOfWeek(weekKey, 6)).toBe("2026-05-16"); // Sat
  });

  it("puts Sunday at the END of the week it names", () => {
    // The case a naive `weekKey + dayIndex` gets wrong by seven days: it
    // would answer 11 May, the Monday the week starts on.
    expect(dateForDayOfWeek("2026-05-11", 0)).toBe("2026-05-17");
  });

  it("agrees with localWeekKey for every day of a week", () => {
    // Round-trip: each date this produces must resolve back to the key.
    for (let dow = 0; dow < 7; dow++) {
      const date = dateForDayOfWeek("2026-05-11", dow);
      expect(localWeekKey(parseLocalDate(date))).toBe("2026-05-11");
    }
  });
});

describe("generateScheduledRunId", () => {
  it("produces a stable id for the same inputs", () => {
    const id1 = generateScheduledRunId(
      { dayIndex: 2, templateId: "tempo_run" },
      "2026-05-10"
    );
    const id2 = generateScheduledRunId(
      { dayIndex: 2, templateId: "tempo_run" },
      "2026-05-10"
    );
    expect(id1).toBe(id2);
  });

  it("includes weekKey, dayIndex, and templateId", () => {
    const id = generateScheduledRunId(
      { dayIndex: 3, templateId: "long_8k" },
      "2026-05-10"
    );
    expect(id).toContain("2026-05-10");
    expect(id).toContain("3");
    expect(id).toContain("long_8k");
  });

  it("starts with runday_ prefix", () => {
    const id = generateScheduledRunId(
      { dayIndex: 0, templateId: "easy" },
      "2026-05-10"
    );
    expect(id).toMatch(/^runday_/);
  });

  it("differs between weeks for the same template", () => {
    const id1 = generateScheduledRunId(
      { dayIndex: 2, templateId: "tempo" },
      "2026-05-10"
    );
    const id2 = generateScheduledRunId(
      { dayIndex: 2, templateId: "tempo" },
      "2026-05-17"
    );
    expect(id1).not.toBe(id2);
  });
});

describe("addLocalDays", () => {
  it("adds days without UTC drift", () => {
    const d = new Date(2026, 4, 14); // May 14 local
    const plus3 = addLocalDays(d, 3);
    expect(localDateString(plus3)).toBe("2026-05-17");
  });

  it("handles month boundary", () => {
    const d = new Date(2026, 4, 30); // May 30
    expect(localDateString(addLocalDays(d, 2))).toBe("2026-06-01");
  });

  it("handles year boundary", () => {
    const d = new Date(2026, 11, 30); // Dec 30
    expect(localDateString(addLocalDays(d, 3))).toBe("2027-01-02");
  });

  it("supports negative offsets", () => {
    const d = new Date(2026, 4, 14);
    expect(localDateString(addLocalDays(d, -7))).toBe("2026-05-07");
  });
});

describe("parseLocalDate", () => {
  it("parses YYYY-MM-DD as local midnight", () => {
    const d = parseLocalDate("2026-05-14");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May (0-indexed)
    expect(d.getDate()).toBe(14);
  });

  it("round-trips with localDateString", () => {
    const original = "2026-05-14";
    expect(localDateString(parseLocalDate(original))).toBe(original);
  });

  it("does not roll back a day in negative-offset timezones", () => {
    // The naive `new Date("2026-05-14")` parses as UTC midnight, which
    // becomes "2026-05-13" when displayed in PST. parseLocalDate must NOT.
    const d = parseLocalDate("2026-05-14");
    expect(d.getDate()).toBe(14);
  });
});

// ── localWeekKey — literal pins that lived beside the retired getWeekKey alias ────────────────────────────────

describe("localWeekKey (Monday anchor, literal dates)", () => {
  it("returns the same Monday for a Monday", () => {
    // 2025-01-06 is a Monday
    const result = localWeekKey(new Date("2025-01-06T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("returns the preceding Monday for a Wednesday", () => {
    // 2025-01-08 is a Wednesday → Monday is 2025-01-06
    const result = localWeekKey(new Date("2025-01-08T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("returns the preceding Monday for a Saturday", () => {
    // 2025-01-11 is a Saturday → Monday is 2025-01-06
    const result = localWeekKey(new Date("2025-01-11T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("keeps a Sunday in the week that is ending", () => {
    // 2025-01-05 is a Sunday → the week that began Monday 2024-12-30.
    // Under the old anchor this same date was a week START; it is the one
    // day of seven where the two conventions disagree.
    const result = localWeekKey(new Date("2025-01-05T12:00:00"));
    expect(result).toBe("2024-12-30");
  });

  it("handles year boundaries", () => {
    // 2025-01-01 is a Wednesday → Monday is 2024-12-30
    const result = localWeekKey(new Date("2025-01-01T12:00:00"));
    expect(result).toBe("2024-12-30");
  });
});
