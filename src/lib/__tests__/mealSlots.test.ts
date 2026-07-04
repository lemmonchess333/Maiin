import { describe, it, expect } from "vitest";
import { mealSlotFor, mealLoggedAt } from "../mealSlots";

/** Firestore-Timestamp-shaped stub for a local wall-clock hour. */
function tsAtHour(hour: number, minute = 0) {
  const d = new Date(2026, 6, 3, hour, minute, 0, 0);
  return { toDate: () => d };
}

describe("mealLoggedAt", () => {
  it("narrows a Timestamp-like createdAt to its Date", () => {
    const d = mealLoggedAt(tsAtHour(8, 12));
    expect(d?.getHours()).toBe(8);
    expect(d?.getMinutes()).toBe(12);
  });

  it("returns null for missing or non-Timestamp values", () => {
    expect(mealLoggedAt(undefined)).toBeNull();
    expect(mealLoggedAt(null)).toBeNull();
    expect(mealLoggedAt("2026-07-03T08:00:00Z")).toBeNull();
    expect(mealLoggedAt({ seconds: 123 })).toBeNull();
  });
});

describe("mealSlotFor", () => {
  it("explicit meal field always wins over the log time", () => {
    expect(mealSlotFor({ meal: "dinner", createdAt: tsAtHour(8) })).toBe(
      "dinner"
    );
    expect(mealSlotFor({ meal: "snacks", createdAt: tsAtHour(13) })).toBe(
      "snacks"
    );
  });

  it("ignores a foreign meal value and falls through to time", () => {
    expect(mealSlotFor({ meal: "brunch", createdAt: tsAtHour(9) })).toBe(
      "breakfast"
    );
  });

  it("derives from local hour: <11 breakfast, <17 lunch, else dinner", () => {
    expect(mealSlotFor({ createdAt: tsAtHour(6) })).toBe("breakfast");
    expect(mealSlotFor({ createdAt: tsAtHour(10, 59) })).toBe("breakfast");
    expect(mealSlotFor({ createdAt: tsAtHour(11) })).toBe("lunch");
    expect(mealSlotFor({ createdAt: tsAtHour(16, 59) })).toBe("lunch");
    expect(mealSlotFor({ createdAt: tsAtHour(17) })).toBe("dinner");
    expect(mealSlotFor({ createdAt: tsAtHour(23) })).toBe("dinner");
  });

  it("never auto-assigns snacks from time alone", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(mealSlotFor({ createdAt: tsAtHour(hour) })).not.toBe("snacks");
    }
  });

  it("falls back to lunch when createdAt is missing or malformed", () => {
    expect(mealSlotFor(undefined)).toBe("lunch");
    expect(mealSlotFor({})).toBe("lunch");
    expect(mealSlotFor({ createdAt: "not-a-timestamp" })).toBe("lunch");
  });
});
