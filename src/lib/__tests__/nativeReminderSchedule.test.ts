/**
 * The schedule a native reminder is sent with, and how Settings reads a
 * pending one back.
 *
 * Repeating reminders went to the plugin as `{ at, every, repeats: true }`.
 * The iOS plugin reads `at` first and arms a time-interval trigger of
 * now → `at` that repeats (LocalNotificationsPlugin.swift), so a breakfast
 * reminder set at 05:00 for 08:00 repeated every three hours. Nothing tested
 * the native path: every reminder suite mocks this module. Dates are built in
 * local time, so the expectations hold in every CI timezone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  schedule: vi.fn(async () => ({ notifications: [] })),
  checkPermissions: vi.fn(async () => ({ display: "granted" })),
  getPending: vi.fn(async () => ({ notifications: [] as unknown[] })),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: plugin,
}));

import {
  getPendingNotifications,
  nativeSchedule,
  nextFireOf,
  scheduleNotification,
} from "../notifications";

/** 2026-10-20 is a Tuesday; 2026-10-22 a Thursday. */
const at = (day: number, hour: number, minute = 0, second = 0) =>
  new Date(2026, 9, day, hour, minute, second);

describe("nativeSchedule", () => {
  it("a one-off reminder is sent at its time", () => {
    expect(nativeSchedule({ scheduleAt: at(20, 8) }, at(20, 5))).toEqual({
      at: at(20, 8),
    });
  });

  it("a daily reminder is a calendar trigger on its hour and minute", () => {
    const schedule = nativeSchedule(
      { scheduleAt: at(20, 8, 30), repeats: true },
      at(20, 5)
    );
    expect(schedule).toEqual({ on: { hour: 8, minute: 30 } });
    // No `at` for the plugin to turn into a three-hour interval.
    expect(schedule).not.toHaveProperty("at");
    expect(schedule).not.toHaveProperty("every");
  });

  it("a daily reminder under a minute away is still a calendar trigger", () => {
    // As an interval the plugin threw: a repeat must be at least 60 s apart.
    expect(
      nativeSchedule(
        { scheduleAt: at(20, 8), repeats: true },
        at(20, 7, 59, 30)
      )
    ).toEqual({ on: { hour: 8, minute: 0 } });
  });

  it("tomorrow's time, when today's has passed, is the next occurrence", () => {
    expect(
      nativeSchedule({ scheduleAt: at(21, 8), repeats: true }, at(20, 9))
    ).toEqual({ on: { hour: 8, minute: 0 } });
  });

  it("a reminder deferred past today's occurrence is sent once", () => {
    // Breakfast already logged at 05:00, so the hook starts it tomorrow. A
    // calendar trigger would fire at 08:00 today; the next pass re-arms it.
    expect(
      nativeSchedule({ scheduleAt: at(21, 8), repeats: true }, at(20, 5))
    ).toEqual({ at: at(21, 8) });
  });

  it("a weekly reminder carries iOS's weekday, 1 = Sunday", () => {
    expect(
      nativeSchedule(
        { scheduleAt: at(22, 18), repeats: true, repeatEvery: "week" },
        at(20, 5)
      )
    ).toEqual({ on: { weekday: 5, hour: 18, minute: 0 } });
  });

  it("a weekly reminder deferred a week is sent once", () => {
    // Thursday's session is done; the hook moves it to next Thursday.
    expect(
      nativeSchedule(
        { scheduleAt: at(29, 18), repeats: true, repeatEvery: "week" },
        at(22, 10)
      )
    ).toEqual({ at: at(29, 18) });
  });

  it("no time is no schedule (fire now)", () => {
    expect(nativeSchedule({ repeats: true }, at(20, 5))).toBeUndefined();
  });
});

describe("nextFireOf", () => {
  it("reads `at` as the ISO string iOS returns, or a Date", () => {
    expect(nextFireOf({ at: at(20, 8).toISOString() })).toEqual(at(20, 8));
    expect(nextFireOf({ at: at(20, 8) })).toEqual(at(20, 8));
  });

  it("works out a daily calendar trigger's next fire", () => {
    expect(nextFireOf({ on: { hour: 8, minute: 0 } }, at(20, 5))).toEqual(
      at(20, 8)
    );
    expect(nextFireOf({ on: { hour: 8, minute: 0 } }, at(20, 9))).toEqual(
      at(21, 8)
    );
  });

  it("works out a weekly calendar trigger's next fire", () => {
    const thursday = { on: { weekday: 5, hour: 18, minute: 0 } };
    expect(nextFireOf(thursday, at(20, 5))).toEqual(at(22, 18));
    expect(nextFireOf(thursday, at(22, 19))).toEqual(at(29, 18));
  });

  it("anything else has no known fire time", () => {
    expect(nextFireOf(undefined)).toBeNull();
    expect(nextFireOf({ every: "day" })).toBeNull();
    expect(nextFireOf({ at: "not a date" })).toBeNull();
  });
});

describe("the native module", () => {
  beforeEach(() => {
    plugin.schedule.mockClear();
  });

  it("schedules a repeating reminder with the calendar shape", async () => {
    const next = new Date();
    next.setHours(next.getHours() + 3, 0, 0, 0);
    await scheduleNotification({
      id: 1001,
      title: "Time for breakfast",
      body: "",
      scheduleAt: next,
      repeats: true,
    });
    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: 1001,
          schedule: { on: { hour: next.getHours(), minute: 0 } },
        }),
      ],
    });
  });

  it("Settings reads the next fire of either shape iOS hands back", async () => {
    plugin.getPending.mockResolvedValueOnce({
      notifications: [
        {
          id: 1,
          title: "a",
          body: "",
          schedule: { at: "2026-10-21T07:00:00.000Z" },
        },
        {
          id: 2,
          title: "b",
          body: "",
          schedule: { on: { hour: 8, minute: 0 } },
        },
      ],
    });
    const [oneOff, daily] = await getPendingNotifications();
    expect(oneOff.scheduleAt).toBe("2026-10-21T07:00:00.000Z");
    expect(daily.scheduleAt).not.toBeNull();
    expect(new Date(daily.scheduleAt!).getHours()).toBe(8);
  });
});
