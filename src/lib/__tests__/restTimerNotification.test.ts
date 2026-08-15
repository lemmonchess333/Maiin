/**
 * restTimerNotification — the lock-screen half of the in-lift rest timer.
 *
 * Two layers under test:
 *  - `restNotificationDelaySeconds`, the pure planner WorkoutSession's
 *    visibility handler consults on hide;
 *  - the schedule/cancel wrappers, driven through the shared
 *    notifications fake (bare `vi.mock("@/lib/notifications")`, the
 *    module-boundary seam the reminder hooks use).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/notifications");
vi.mock("@/lib/platform", () => ({
  isNativePlatform: vi.fn(() => true),
}));

import { notificationsFake } from "@/test/notificationsFake";
import { isNativePlatform } from "@/lib/platform";
import {
  REST_NOTIFICATION_ID,
  restNotificationDelaySeconds,
  scheduleRestEndNotification,
  cancelRestEndNotification,
} from "@/lib/restTimerNotification";

const setNative = (v: boolean) =>
  (isNativePlatform as unknown as ReturnType<typeof vi.fn>).mockReturnValue(v);

beforeEach(() => {
  notificationsFake.reset();
  setNative(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("restNotificationDelaySeconds (pure planner)", () => {
  it("returns the remaining seconds mid-rest", () => {
    expect(
      restNotificationDelaySeconds({
        isResting: true,
        elapsedSeconds: 40,
        targetSeconds: 180,
        chimeFired: false,
      })
    ).toBe(140);
  });

  it("returns null when not resting", () => {
    expect(
      restNotificationDelaySeconds({
        isResting: false,
        elapsedSeconds: 40,
        targetSeconds: 180,
        chimeFired: false,
      })
    ).toBeNull();
  });

  it("returns null once the in-app chime has fired (no re-nag)", () => {
    expect(
      restNotificationDelaySeconds({
        isResting: true,
        elapsedSeconds: 181,
        targetSeconds: 180,
        chimeFired: true,
      })
    ).toBeNull();
  });

  it("returns null when under a second remains (or the target passed unchimed)", () => {
    expect(
      restNotificationDelaySeconds({
        isResting: true,
        elapsedSeconds: 180,
        targetSeconds: 180,
        chimeFired: false,
      })
    ).toBeNull();
    expect(
      restNotificationDelaySeconds({
        isResting: true,
        elapsedSeconds: 300,
        targetSeconds: 180,
        chimeFired: false,
      })
    ).toBeNull();
  });
});

describe("scheduleRestEndNotification", () => {
  it("schedules id 3001 at now + delay with the exercise in the body", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T10:00:00Z"));
    const ok = await scheduleRestEndNotification(90, "Bench Press");
    expect(ok).toBe(true);
    const scheduled = notificationsFake.at(REST_NOTIFICATION_ID);
    expect(scheduled).toBeTruthy();
    expect(scheduled?.title).toBe("Rest over");
    expect(scheduled?.body).toBe("Back to Bench Press.");
    expect(scheduled?.scheduleAt?.getTime()).toBe(
      new Date("2026-08-15T10:01:30Z").getTime()
    );
    // One-shot: no repeat flag — this must never re-arm like a reminder.
    expect(scheduled?.repeats).toBeUndefined();
  });

  it("falls back to generic copy without an exercise name", async () => {
    await scheduleRestEndNotification(60);
    expect(notificationsFake.at(REST_NOTIFICATION_ID)?.body).toBe(
      "Time for your next set."
    );
  });

  it("does nothing on web", async () => {
    setNative(false);
    const ok = await scheduleRestEndNotification(90);
    expect(ok).toBe(false);
    expect(notificationsFake.at(REST_NOTIFICATION_ID)).toBeUndefined();
  });

  it("checks — never requests — permission: denied means no schedule", async () => {
    notificationsFake.setPermission("denied");
    const ok = await scheduleRestEndNotification(90);
    expect(ok).toBe(false);
    expect(notificationsFake.at(REST_NOTIFICATION_ID)).toBeUndefined();
  });

  it("a second schedule replaces the first (stable id, no stacking)", async () => {
    await scheduleRestEndNotification(90, "Bench Press");
    await scheduleRestEndNotification(30, "Squat");
    expect(notificationsFake.all().length).toBe(1);
    expect(notificationsFake.at(REST_NOTIFICATION_ID)?.body).toBe(
      "Back to Squat."
    );
  });
});

describe("cancelRestEndNotification", () => {
  it("removes the pending entry", async () => {
    await scheduleRestEndNotification(90);
    await cancelRestEndNotification();
    expect(notificationsFake.at(REST_NOTIFICATION_ID)).toBeUndefined();
  });

  it("is a no-op when nothing is pending", async () => {
    await expect(cancelRestEndNotification()).resolves.toBeUndefined();
  });
});
