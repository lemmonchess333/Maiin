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
  it("returns the Monday on or before the given date", () => {
    // Wed May 13, 2026 → Mon May 11
    const wed = new Date(2026, 4, 13);
    expect(localWeekKey(wed)).toBe("2026-05-11");
  });

  it("returns the same date when called on a Monday", () => {
    // Mon May 11, 2026
    const mon = new Date(2026, 4, 11);
    expect(localWeekKey(mon)).toBe("2026-05-11");
  });

  it("keys a Sunday to the Monday that OPENED its week, not the one after", () => {
    // Sun May 10, 2026 is the last day of the Mon May 4 week. Under the
    // old Sunday anchor this same date keyed to itself, so this case is
    // the one that actually distinguishes the two anchors.
    const sun = new Date(2026, 4, 10);
    expect(localWeekKey(sun)).toBe("2026-05-04");
  });

  it("crosses month boundaries correctly", () => {
    // Wed May 6, 2026 — Monday of that week is May 4 (within May)
    const wed = new Date(2026, 4, 6);
    expect(localWeekKey(wed)).toBe("2026-05-04");
    // Wed Jun 3, 2026 — Monday is Jun 1
    const wedJun = new Date(2026, 5, 3);
    expect(localWeekKey(wedJun)).toBe("2026-06-01");
    // Tue Jun 2, 2026 — Monday is Jun 1; and Sun May 31 keys BACK into May
    expect(localWeekKey(new Date(2026, 4, 31))).toBe("2026-05-25");
  });

  it("crosses year boundaries correctly", () => {
    // Sat Jan 2, 2027 — Monday is Dec 28, 2026
    const sat = new Date(2027, 0, 2);
    expect(localWeekKey(sat)).toBe("2026-12-28");
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
  // Every date below sits in the week that began Mon 2025-01-06,
  // except the year-boundary case. Literals rather than computed
  // expectations: a suite that derives its answer from the helper
  // passes under any anchor and so pins nothing.
  it("returns the Monday of the week for a Monday", () => {
    // 2025-01-06 is a Monday
    const result = localWeekKey(new Date("2025-01-06T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("returns the previous Monday for a Wednesday", () => {
    // 2025-01-08 is a Wednesday → Monday is 2025-01-06
    const result = localWeekKey(new Date("2025-01-08T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("returns the previous Monday for a Saturday", () => {
    // 2025-01-11 is a Saturday → Monday is 2025-01-06
    const result = localWeekKey(new Date("2025-01-11T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("returns the previous Monday for a Sunday — the week's LAST day", () => {
    // 2025-01-12 is a Sunday → Monday is 2025-01-06. A Sunday closing
    // its week rather than opening one is the whole anchor change.
    const result = localWeekKey(new Date("2025-01-12T12:00:00"));
    expect(result).toBe("2025-01-06");
  });

  it("handles year boundaries", () => {
    // 2025-01-01 is a Wednesday → Monday is 2024-12-30
    const result = localWeekKey(new Date("2025-01-01T12:00:00"));
    expect(result).toBe("2024-12-30");
  });
});
