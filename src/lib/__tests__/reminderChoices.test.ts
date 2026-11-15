/**
 * One switch and one time per reminder (App1 Q26): what every stored shape
 * means. Until the new fields are written, the old ones answer with what
 * they meant: the reminder was on if either old switch would have sent it,
 * except a phone switch turned off by hand, which stays off unless the push
 * was also chosen by hand.
 */
import { describe, it, expect } from "vitest";
import {
  reminderDelivery,
  reviewReminderChoice,
  streakReminderChoice,
  streakReminderTime,
  STREAK_REMINDER_HOURS,
} from "../reminderChoices";

describe("the evening streak reminder", () => {
  it.each<[string, Parameters<typeof streakReminderChoice>[0], boolean]>([
    ["nothing stored", {}, false],
    // The old Push notifications switch, or Q66's one ask, with the push's
    // own streak switch left at its default: the server sent it.
    ["push on", { push: { enabled: true } }, true],
    [
      "the old first-week opt-in",
      { push: { enabled: true, streak: true, recap: false, badge: false } },
      true,
    ],
    [
      "push on, its streak switch off",
      { push: { enabled: true, streak: false } },
      false,
    ],
    [
      "the phone's switch on",
      { streakReminder: { enabled: true, primingShown: true } },
      true,
    ],
    [
      "the phone's switch on before its priming answer",
      { streakReminder: { enabled: true, primingShown: false } },
      false,
    ],
    [
      "the phone's switch turned off, the push left at its default",
      {
        streakReminder: { enabled: false, primingShown: true },
        push: { enabled: true },
      },
      false,
    ],
    [
      "the phone's switch turned off, the push chosen by hand",
      {
        streakReminder: { enabled: false, primingShown: true },
        push: { enabled: true, streak: true },
      },
      true,
    ],
    [
      "a first-week marker alone, push on",
      {
        streakReminder: { firstWeekNudgeDateKey: "2026-09-07" },
        push: { enabled: true },
      },
      true,
    ],
    [
      "the new switch off over every old one on",
      {
        reminders: { streakEnabled: false },
        streakReminder: { enabled: true, primingShown: true },
        push: { enabled: true, streak: true },
      },
      false,
    ],
    [
      "the new switch on over every old one off",
      {
        reminders: { streakEnabled: true },
        streakReminder: { enabled: false, primingShown: true },
        push: { enabled: false },
      },
      true,
    ],
  ])("%s", (_name, stored, enabled) => {
    expect(streakReminderChoice(stored).enabled).toBe(enabled);
  });

  it("keeps the phone's old time, as a whole hour, until a new one is chosen", () => {
    expect(streakReminderChoice({}).time).toBe("20:00");
    expect(
      streakReminderChoice({ streakReminder: { time: "21:15" } }).time
    ).toBe("21:00");
    expect(
      streakReminderChoice({
        reminders: { streakTime: "18:00" },
        streakReminder: { time: "21:15" },
      }).time
    ).toBe("18:00");
    // Push only, never a time: the default evening, not the server's old 19:00.
    expect(streakReminderChoice({ push: { enabled: true } }).time).toBe(
      "20:00"
    );
  });

  it("holds a time to the hours either channel can send at", () => {
    expect(STREAK_REMINDER_HOURS[0]).toBe(8);
    expect(STREAK_REMINDER_HOURS.at(-1)).toBe(21);
    expect(streakReminderTime("07:00")).toBe("08:00");
    expect(streakReminderTime("23:30")).toBe("21:00");
    expect(streakReminderTime("19:45")).toBe("19:00");
    for (const bad of ["7:00", "24:00", "20:60", "", null, 20])
      expect(streakReminderTime(bad)).toBeNull();
  });
});

describe("the Monday review reminder", () => {
  it.each<[string, Parameters<typeof reviewReminderChoice>[0], boolean]>([
    // On unless turned off (Mob2 call 10).
    ["nothing stored", {}, true],
    ["the phone's switch off", { reviewReminder: { enabled: false } }, false],
    [
      "the phone's switch off, the recap push at its default",
      { reviewReminder: { enabled: false }, push: { enabled: true } },
      false,
    ],
    [
      "the phone's switch off, the recap push chosen by hand",
      {
        reviewReminder: { enabled: false },
        push: { enabled: true, recap: true },
      },
      true,
    ],
    [
      "the old first-week opt-in, recap off: the phone's default",
      { push: { enabled: true, streak: true, recap: false } },
      true,
    ],
    [
      "the new switch off",
      { reminders: { reviewEnabled: false }, push: { enabled: true } },
      false,
    ],
    [
      "the new switch on over the phone's old Off",
      {
        reminders: { reviewEnabled: true },
        reviewReminder: { enabled: false },
      },
      true,
    ],
  ])("%s", (_name, stored, enabled) => {
    expect(reviewReminderChoice(stored).enabled).toBe(enabled);
  });
});

describe("how a reminder goes: the phone or push, never both", () => {
  it("sends training days and meals from the phone, push or not", () => {
    for (const kind of ["training", "meals"] as const) {
      expect(reminderDelivery(kind, true, { enabled: true })).toBe("local");
      expect(reminderDelivery(kind, true, {})).toBe("local");
    }
  });

  it("sends the streak and the review by push when the account takes push", () => {
    for (const kind of ["streak", "review"] as const) {
      expect(reminderDelivery(kind, true, { enabled: true })).toBe("push");
      expect(reminderDelivery(kind, true, { enabled: false })).toBe("local");
      expect(reminderDelivery(kind, true, null)).toBe("local");
    }
  });

  it("sends nothing that is off", () => {
    expect(reminderDelivery("streak", false, { enabled: true })).toBe("off");
    expect(reminderDelivery("meals", false, {})).toBe("off");
  });
});
