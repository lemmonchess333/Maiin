/**
 * The server's run-move date derivation, pinned on its own for the first
 * time. Until now its only coverage was the client/server cross-test in
 * src/, which is the right place to prove PARITY and the wrong place to
 * be the sole pin on the copy that decides what gets stored.
 *
 * Every expectation is a literal date. A suite that recomputes its answer
 * through `dateForDay` would pass under either anchor and pin nothing.
 */
import { describe, it, expect } from "vitest";
import { dateForDay, computeRunMove } from "../lib/runReschedule";

describe("dateForDay — a getDay() weekday inside the week the key names", () => {
  describe("Monday-anchored key (the client's anchor since RunWk2)", () => {
    // Mon 2026-03-02 opens the week Mon 2 .. Sun 8 March.
    const KEY = "2026-03-02";
    it.each([
      [1, "2026-03-02"], // Monday — the key itself
      [2, "2026-03-03"],
      [3, "2026-03-04"],
      [4, "2026-03-05"],
      [5, "2026-03-06"],
      [6, "2026-03-07"],
      [0, "2026-03-08"], // Sunday — the week's LAST day, six days on
    ])("weekday %i → %s", (dayIndex, date) => {
      expect(dateForDay(KEY, dayIndex)).toBe(date);
    });

    it("never lands a Sunday on the key's own date — the old arithmetic did", () => {
      // `base + dayIndex * DAY_MS` with dayIndex 0 returned the Monday.
      expect(dateForDay(KEY, 0)).not.toBe(KEY);
    });
  });

  describe("Sunday-anchored key (a client not yet migrated to schema v4)", () => {
    // Sun 2026-03-01 opened the week Sun 1 .. Sat 7 March under the old
    // anchor. The anchor is read off the key, so this client's move still
    // lands where it asked — no flag day.
    const KEY = "2026-03-01";
    it.each([
      [0, "2026-03-01"],
      [1, "2026-03-02"],
      [3, "2026-03-04"],
      [6, "2026-03-07"],
    ])("weekday %i → %s", (dayIndex, date) => {
      expect(dateForDay(KEY, dayIndex)).toBe(date);
    });
  });

  it("rejects an out-of-range weekday and a malformed key", () => {
    expect(dateForDay("2026-03-02", 7)).toBeNull();
    expect(dateForDay("2026-03-02", -1)).toBeNull();
    expect(dateForDay("2026-03-02", 2.5)).toBeNull();
    expect(dateForDay("not-a-date", 1)).toBeNull();
  });
});

describe("computeRunMove — the stored date follows dateForDay", () => {
  const weekSchedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    type: day === 2 || day === 0 ? "run" : "rest",
  }));
  const source = {
    id: "run-1",
    dayIndex: 2,
    date: "2026-03-03",
    weekKey: "2026-03-02", // Monday-anchored
    templateId: "easy_30",
    type: "easy",
  };

  it("moving a Tuesday run to Sunday lands on the week's LAST day", () => {
    const moved = computeRunMove(source, 0, weekSchedule);
    expect(moved).not.toBeNull();
    expect(moved.date).toBe("2026-03-08");
    expect(moved.dayIndex).toBe(0);
  });
});
