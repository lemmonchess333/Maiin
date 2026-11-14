import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const attention = require("../lib/reminderAttention");

const SENT = Date.parse("2026-11-12T20:00:00Z");
const sentDayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

describe("a reminder ignored three times running goes quiet (App1 Q62)", () => {
  it("has nothing to settle before the first push", () => {
    expect(attention.settleReminderPush("streak", {})).toEqual({
      settled: false,
      ignored: 0,
      quiet: false,
    });
  });

  it("counts a push nobody answered, and starts again at an answer", () => {
    const unanswered = { streakSentAt: SENT, streakIgnored: 1 };
    expect(attention.settleReminderPush("streak", unanswered)).toEqual({
      settled: true,
      ignored: 2,
      quiet: false,
    });
    // The app opened after it: answered.
    expect(
      attention.settleReminderPush("streak", {
        ...unanswered,
        streakAnsweredAt: { toMillis: () => SENT + 60_000 },
      })
    ).toMatchObject({ ignored: 0, quiet: false });
    // An answer to an older push says nothing about this one.
    expect(
      attention.settleReminderPush("streak", {
        ...unanswered,
        streakAnsweredAt: { seconds: (SENT - 86_400_000) / 1000 },
      })
    ).toMatchObject({ ignored: 2 });
  });

  it("counts a log on the day of the streak reminder as its answer", () => {
    const stored = { streakSentAt: SENT, streakIgnored: 2 };
    expect(
      attention.settleReminderPush("streak", stored, {
        actedDayKeys: ["2026-11-12"],
        sentDayKey,
      })
    ).toMatchObject({ ignored: 0, quiet: false });
    expect(
      attention.settleReminderPush("streak", stored, {
        actedDayKeys: ["2026-11-13"],
        sentDayKey,
      })
    ).toEqual({ settled: true, ignored: 3, quiet: true });
  });

  it("goes quiet on the third ignored: the switch off, the count from 0, a mark for Home", () => {
    expect(attention.IGNORED_LIMIT).toBe(3);
    expect(attention.quietPatch("review", "AT")).toEqual({
      reviewEnabled: false,
      reviewIgnored: 0,
      reviewSentAt: null,
      reviewQuietAt: "AT",
      reviewQuietShown: false,
    });
    expect(attention.settledPatch("streak", 2, "NOW")).toEqual({
      streakIgnored: 2,
      streakSentAt: "NOW",
    });
  });

  it("reads Timestamps, Dates and numbers, and nothing else, as times", () => {
    expect(attention.millisOf(5)).toBe(5);
    expect(attention.millisOf(new Date(7))).toBe(7);
    expect(attention.millisOf({ toMillis: () => 9 })).toBe(9);
    expect(attention.millisOf({ seconds: 1, nanoseconds: 5e6 })).toBe(1005);
    for (const value of [null, undefined, "x", NaN, {}])
      expect(attention.millisOf(value)).toBeNull();
  });
});
