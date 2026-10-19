/**
 * Unit tests for the pure challenge activity-window predicate
 * (functions/lib/challengeActivityWindow.js). This is where the bug's
 * correctness lives — the engines just apply this predicate — so the
 * boundary, half-open, fail-closed, and source-date-precedence behaviour
 * is pinned exhaustively here without needing the emulator.
 *
 * Vitest import style matches challengeDefs.test.js (plain-CommonJS module
 * consumed through Vite's interop; module format is unchanged globally).
 */
import { describe, it, expect } from "vitest";
import {
  isValidDateKey,
  instantToDateKey,
  sourceActivityDateKey,
  challengeContainsActivityDate,
  openOnDayBound,
} from "../lib/challengeActivityWindow";

const ts = (iso) => ({ toDate: () => new Date(iso) });
const july = {
  startDate: ts("2026-07-01T00:00:00.000Z"),
  endDate: ts("2026-08-01T00:00:00.000Z"),
};

describe("isValidDateKey", () => {
  it("accepts well-formed real calendar days", () => {
    expect(isValidDateKey("2026-07-01")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isValidDateKey("2024-02-29")).toBe(true); // 2024 is
  });

  it("rejects malformed, out-of-range, or non-string values", () => {
    expect(isValidDateKey("12/07/2026")).toBe(false);
    expect(isValidDateKey("2026-07-32")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-7-1")).toBe(false);
    expect(isValidDateKey(20260701)).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });
});

describe("sourceActivityDateKey", () => {
  it("uses an explicit local activity date before timestamps", () => {
    expect(
      sourceActivityDateKey({
        date: "2026-06-30",
        completedAt: ts("2026-07-01T00:05:00.000Z"),
      })
    ).toBe("2026-06-30");
  });

  it("falls back to completedAt for legacy runs", () => {
    expect(
      sourceActivityDateKey({ completedAt: ts("2026-07-12T18:00:00Z") })
    ).toBe("2026-07-12");
  });

  it("falls back to createdAt when date + completedAt are absent", () => {
    expect(
      sourceActivityDateKey({ createdAt: ts("2026-07-12T23:30:00Z") })
    ).toBe("2026-07-12");
  });

  it("returns null (fail-closed) when no usable source day exists", () => {
    expect(sourceActivityDateKey({})).toBe(null);
    expect(sourceActivityDateKey(null)).toBe(null);
    expect(sourceActivityDateKey({ date: "not-a-date" })).toBe(null);
  });

  it("ignores a malformed explicit date and uses the timestamp fallback", () => {
    expect(
      sourceActivityDateKey({
        date: "2026-7-1",
        completedAt: ts("2026-07-02T10:00:00Z"),
      })
    ).toBe("2026-07-02");
  });
});

describe("challengeContainsActivityDate — half-open [start, end)", () => {
  it("includes the start day and excludes the end day", () => {
    expect(challengeContainsActivityDate(july, "2026-07-01")).toBe(true);
    expect(challengeContainsActivityDate(july, "2026-07-15")).toBe(true);
    expect(challengeContainsActivityDate(july, "2026-07-31")).toBe(true);
    expect(challengeContainsActivityDate(july, "2026-06-30")).toBe(false);
    expect(challengeContainsActivityDate(july, "2026-08-01")).toBe(false);
  });

  it("does NOT credit a future challenge (start after the activity)", () => {
    const august = {
      startDate: ts("2026-08-01T00:00:00Z"),
      endDate: ts("2026-09-01T00:00:00Z"),
    };
    expect(challengeContainsActivityDate(august, "2026-07-31")).toBe(false);
  });

  it("fails closed for missing or malformed boundaries", () => {
    expect(challengeContainsActivityDate({}, "2026-07-12")).toBe(false);
    expect(challengeContainsActivityDate(july, "12/07/2026")).toBe(false);
    expect(challengeContainsActivityDate(july, "2026-07-32")).toBe(false);
    expect(
      challengeContainsActivityDate(
        { startDate: july.endDate, endDate: july.startDate },
        "2026-07-12"
      )
    ).toBe(false);
    expect(
      challengeContainsActivityDate(
        { startDate: july.startDate, endDate: july.startDate },
        "2026-07-01"
      )
    ).toBe(false);
  });
});

describe("instantToDateKey — boundary type normalization", () => {
  it("normalizes Date, Timestamp-like, number, and ISO boundaries", () => {
    expect(instantToDateKey(new Date("2026-07-12T01:00:00Z"))).toBe(
      "2026-07-12"
    );
    expect(instantToDateKey(ts("2026-07-12T01:00:00Z"))).toBe("2026-07-12");
    expect(
      instantToDateKey({ toMillis: () => Date.parse("2026-07-12T01:00:00Z") })
    ).toBe("2026-07-12");
    expect(instantToDateKey(Date.parse("2026-07-12T01:00:00Z"))).toBe(
      "2026-07-12"
    );
    expect(instantToDateKey("2026-07-12T01:00:00Z")).toBe("2026-07-12");
  });

  it("returns null for unusable inputs", () => {
    expect(instantToDateKey(null)).toBe(null);
    expect(instantToDateKey(undefined)).toBe(null);
    expect(instantToDateKey("garbage")).toBe(null);
    expect(instantToDateKey({})).toBe(null);
  });
});

describe("openOnDayBound — the end-date query never drops a creditable challenge", () => {
  /* syncChallengeProgress and reconcileParticipationChallenges read only
     challenges with `endDate > openOnDayBound(day)`, then apply
     challengeContainsActivityDate. The query is only safe if it returns
     every challenge the predicate would accept, so this walks windows of
     several lengths (a day, a week, a month, a mid-day end) across days
     before, inside, on the edges of and after each one. */
  const day = (offset) =>
    new Date(Date.UTC(2026, 6, 1) + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const windows = [
    ["2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"],
    ["2026-07-06T00:00:00.000Z", "2026-07-13T00:00:00.000Z"],
    ["2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"],
    ["2026-07-10T00:00:00.000Z", "2026-07-20T15:30:00.000Z"],
  ];

  it("returns every challenge the window predicate accepts", () => {
    let accepted = 0;
    for (const [start, end] of windows) {
      const challenge = { startDate: ts(start), endDate: ts(end) };
      for (let offset = -3; offset <= 40; offset++) {
        const key = day(offset);
        if (!challengeContainsActivityDate(challenge, key)) continue;
        accepted++;
        // What Firestore evaluates for `endDate > bound`.
        expect(new Date(end) > openOnDayBound(key)).toBe(true);
      }
    }
    // Anchor: the walk reached days the predicate accepts. With none, the
    // loop above would assert nothing.
    // The mid-day window's end is on 20 July, so it accepts 10-19 July.
    expect(accepted).toBe(1 + 7 + 31 + 10);
  });

  it("leaves out a challenge that ended on or before the day", () => {
    const july = new Date("2026-08-01T00:00:00.000Z");
    expect(july > openOnDayBound("2026-08-01")).toBe(false);
    expect(july > openOnDayBound("2026-07-31")).toBe(true);
  });

  it("is UTC midnight of the day, and null for an invalid day", () => {
    expect(openOnDayBound("2026-07-15")?.toISOString()).toBe(
      "2026-07-15T00:00:00.000Z"
    );
    expect(openOnDayBound("2026-02-30")).toBeNull();
    expect(openOnDayBound(undefined)).toBeNull();
  });
});
