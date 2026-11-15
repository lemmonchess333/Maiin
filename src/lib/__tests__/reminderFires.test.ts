// @vitest-environment jsdom — needs localStorage; the rest of this directory runs in the node environment.
/**
 * The phone's record of the reminders it schedules (App1 Q62,
 * `reminderFires.ts`): every time that passed is a fire, counted once,
 * when the app is running again.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearReminderFires,
  occurrencesBetween,
  recordCancelledReminder,
  recordReminderTap,
  recordScheduledReminder,
  takeReminderCount,
} from "../reminderFires";

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0);

afterEach(() => clearReminderFires());

describe("when a scheduled reminder fired", () => {
  it("a daily one every day at its time, a weekly one every week, a one-off once", () => {
    const daily = { at: at(10, 8).getTime(), every: "day" as const };
    expect(
      occurrencesBetween(daily, at(9, 0).getTime(), at(12, 9).getTime())
    ).toEqual([at(10, 8), at(11, 8), at(12, 8)].map((d) => d.getTime()));
    const weekly = { at: at(2, 7).getTime(), every: "week" as const };
    expect(
      occurrencesBetween(weekly, at(1, 0).getTime(), at(16, 9).getTime())
    ).toEqual([at(2, 7), at(9, 7), at(16, 7)].map((d) => d.getTime()));
    const once = { at: at(10, 20).getTime(), every: null };
    expect(
      occurrencesBetween(once, at(9, 0).getTime(), at(30, 0).getTime())
    ).toEqual([at(10, 20).getTime()]);
    // Nothing counted twice: only what passed after the last look.
    expect(
      occurrencesBetween(daily, at(11, 9).getTime(), at(12, 9).getTime())
    ).toEqual([at(12, 8).getTime()]);
  });
});

describe("the count when the app runs", () => {
  it("three training days unopened turn the reminder quiet", () => {
    recordScheduledReminder(
      2001,
      "training",
      at(10, 7),
      "day",
      at(9, 20).getTime()
    );
    expect(takeReminderCount(true, at(13, 9).getTime())).toEqual(["training"]);
    // Counted: nothing more to say until it fires again.
    expect(takeReminderCount(true, at(13, 10).getTime())).toEqual([]);
  });

  it("opening the app the same day answers it", () => {
    recordScheduledReminder(
      1001,
      "meals",
      at(10, 8),
      "day",
      at(9, 20).getTime()
    );
    for (const day of [10, 11, 12, 13])
      expect(takeReminderCount(true, at(day, 9).getTime())).toEqual([]);
  });

  it("what a cancelled reminder fired before it went still counts", () => {
    recordScheduledReminder(3, "streak", at(10, 20), null, at(10, 9).getTime());
    recordCancelledReminder(3, at(11, 9).getTime());
    recordScheduledReminder(3, "streak", at(11, 20), null, at(11, 9).getTime());
    recordCancelledReminder(3, at(12, 9).getTime());
    recordScheduledReminder(3, "streak", at(12, 20), null, at(12, 9).getTime());
    expect(takeReminderCount(true, at(13, 9).getTime())).toEqual(["streak"]);
  });

  it("a reminder taken back before its time never fired", () => {
    recordScheduledReminder(3, "streak", at(10, 20), null, at(10, 9).getTime());
    recordCancelledReminder(3, at(10, 12).getTime());
    expect(takeReminderCount(true, at(14, 9).getTime())).toEqual([]);
  });

  it("a tap answers it", () => {
    recordScheduledReminder(
      2001,
      "training",
      at(10, 7),
      "day",
      at(9, 20).getTime()
    );
    takeReminderCount(true, at(11, 9).getTime());
    recordReminderTap("training", at(12, 0).getTime() + 60_000);
    expect(takeReminderCount(true, at(13, 9).getTime())).toEqual([]);
  });

  it("counts nothing the system was not allowed to show", () => {
    recordScheduledReminder(
      2001,
      "training",
      at(10, 7),
      "day",
      at(9, 20).getTime()
    );
    expect(takeReminderCount(false, at(14, 9).getTime())).toEqual([]);
    // And those fires are gone, not held for later.
    expect(takeReminderCount(true, at(14, 10).getTime())).toEqual([]);
  });
});
