/**
 * The streak and review reminders' one switch and one time, read alike by
 * the app and the server (App1 Q26). Both copies run: the app's decides
 * what Settings shows and whether the phone schedules a reminder, the
 * server's (`functions/lib/reminderChoices.js`) whether a push goes and at
 * what hour. If they disagree, a reminder goes twice or not at all, so
 * every stored shape, old and new, gets one answer.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as client from "@/lib/reminderChoices";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/reminderChoices.js") as {
  STREAK_REMINDER_HOURS: readonly number[];
  DEFAULT_STREAK_REMINDER_TIME: string;
  REVIEW_REMINDER_HOUR: number;
  REMINDERS_SETTINGS_DOC: string;
  reminderDelivery: typeof client.reminderDelivery;
  streakReminderTime: typeof client.streakReminderTime;
  streakReminderChoice: typeof client.streakReminderChoice;
  reviewReminderChoice: typeof client.reviewReminderChoice;
};

const PUSH: unknown[] = [
  undefined,
  null,
  {},
  { enabled: false },
  { enabled: true },
  { enabled: true, streak: false, recap: false },
  { enabled: true, streak: true, recap: true },
  { enabled: true, streak: true, recap: false, badge: false },
  { enabled: "yes", streak: null, recap: 1 },
  { streak: true, recap: true },
];

const OLD_STREAK: unknown[] = [
  undefined,
  {},
  { enabled: true, primingShown: true, time: "21:15" },
  { enabled: true, primingShown: false },
  { enabled: false, primingShown: true, time: "06:30" },
  { enabled: null },
  { firstWeekNudgeDateKey: "2026-09-07", time: "nope" },
];

const OLD_REVIEW: unknown[] = [
  undefined,
  {},
  { enabled: true },
  { enabled: false },
  { enabled: null },
];

const REMINDERS: unknown[] = [
  undefined,
  {},
  { streakEnabled: true, streakTime: "19:00", reviewEnabled: false },
  { streakEnabled: false, reviewEnabled: true },
  { streakTime: "23:00" },
  { streakEnabled: "true", streakTime: 19, reviewEnabled: 0 },
];

describe("one reminder choice on both sides", () => {
  it("shares the hours, the default time, the review's hour and the document", () => {
    expect([...server.STREAK_REMINDER_HOURS]).toEqual([
      ...client.STREAK_REMINDER_HOURS,
    ]);
    expect(server.DEFAULT_STREAK_REMINDER_TIME).toBe(
      client.DEFAULT_STREAK_REMINDER_TIME
    );
    expect(server.REVIEW_REMINDER_HOUR).toBe(client.REVIEW_REMINDER_HOUR);
    expect(server.REMINDERS_SETTINGS_DOC).toBe(client.REMINDERS_SETTINGS_DOC);
  });

  it("reads every stored time alike", () => {
    for (const time of [
      "00:00",
      "07:59",
      "08:00",
      "12:30",
      "21:59",
      "22:00",
      "23:59",
      "24:00",
      "9:00",
      "",
      null,
      undefined,
      1900,
    ])
      expect(server.streakReminderTime(time)).toBe(
        client.streakReminderTime(time)
      );
  });

  it("reads every stored streak shape alike", () => {
    for (const reminders of REMINDERS)
      for (const streakReminder of OLD_STREAK)
        for (const push of PUSH) {
          const stored = { reminders, streakReminder, push };
          expect(server.streakReminderChoice(stored)).toEqual(
            client.streakReminderChoice(stored)
          );
        }
  });

  it("reads every stored review shape alike", () => {
    for (const reminders of REMINDERS)
      for (const reviewReminder of OLD_REVIEW)
        for (const push of PUSH) {
          const stored = { reminders, reviewReminder, push };
          expect(server.reviewReminderChoice(stored)).toEqual(
            client.reviewReminderChoice(stored)
          );
        }
  });

  it("picks the same channel for every reminder", () => {
    for (const kind of ["training", "meals", "streak", "review"] as const)
      for (const enabled of [true, false])
        for (const push of PUSH)
          expect(server.reminderDelivery(kind, enabled, push)).toBe(
            client.reminderDelivery(kind, enabled, push)
          );
  });
});
