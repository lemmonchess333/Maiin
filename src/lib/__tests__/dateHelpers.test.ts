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
  localDayIndex,
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

describe("localWeekKey", () => {
  it("returns the Sunday on or before the given date", () => {
    // Wed May 14, 2026
    const wed = new Date(2026, 4, 14);
    expect(localWeekKey(wed)).toBe("2026-05-10"); // Sunday May 10
  });

  it("returns the same date when called on a Sunday", () => {
    // Sun May 10, 2026
    const sun = new Date(2026, 4, 10);
    expect(localWeekKey(sun)).toBe("2026-05-10");
  });

  it("crosses month boundaries correctly", () => {
    // Mon May 4, 2026 — Sunday of that week is May 3 (within May)
    const mon = new Date(2026, 4, 4);
    expect(localWeekKey(mon)).toBe("2026-05-03");
    // Mon Jun 1, 2026 — Sunday is May 31
    const monJun = new Date(2026, 5, 1);
    expect(localWeekKey(monJun)).toBe("2026-05-31");
  });

  it("crosses year boundaries correctly", () => {
    // Sat Jan 2, 2027 — Sunday is Dec 27, 2026
    const sat = new Date(2027, 0, 2);
    expect(localWeekKey(sat)).toBe("2026-12-27");
  });
});

describe("localDayIndex", () => {
  it("returns 0 for Sunday, 6 for Saturday", () => {
    expect(localDayIndex(new Date(2026, 4, 10))).toBe(0); // Sun
    expect(localDayIndex(new Date(2026, 4, 11))).toBe(1); // Mon
    expect(localDayIndex(new Date(2026, 4, 16))).toBe(6); // Sat
  });
});

describe("generateScheduledRunId", () => {
  it("produces a stable id for the same inputs", () => {
    const id1 = generateScheduledRunId({ dayIndex: 2, templateId: "tempo_run" }, "2026-05-10");
    const id2 = generateScheduledRunId({ dayIndex: 2, templateId: "tempo_run" }, "2026-05-10");
    expect(id1).toBe(id2);
  });

  it("includes weekKey, dayIndex, and templateId", () => {
    const id = generateScheduledRunId({ dayIndex: 3, templateId: "long_8k" }, "2026-05-10");
    expect(id).toContain("2026-05-10");
    expect(id).toContain("3");
    expect(id).toContain("long_8k");
  });

  it("starts with runday_ prefix", () => {
    const id = generateScheduledRunId({ dayIndex: 0, templateId: "easy" }, "2026-05-10");
    expect(id).toMatch(/^runday_/);
  });

  it("differs between weeks for the same template", () => {
    const id1 = generateScheduledRunId({ dayIndex: 2, templateId: "tempo" }, "2026-05-10");
    const id2 = generateScheduledRunId({ dayIndex: 2, templateId: "tempo" }, "2026-05-17");
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
