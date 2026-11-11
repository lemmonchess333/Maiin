/**
 * The Monday review notification (useReviewReminder) — what the OS is
 * holding, not what was called. Firestore is the one fake (ADR-0009),
 * seeded as the app writes sessions and meals; the notifications fake
 * holds the schedule.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/notifications");
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
}));

import {
  useReviewReminderInternal,
  retireReviewReminder,
} from "../useReviewReminder";
import {
  REVIEW_NOTIFICATION,
  REVIEW_NOTIFICATION_ID,
  REVIEW_ROUTE,
} from "@/lib/reviewReminder";
import { reviewViewedKey } from "@/lib/reviewEligibility";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import {
  resetNotifications,
  scheduledAt,
  scheduledIds,
  setNotificationPermission,
  settleNotifications,
} from "@/test/notificationsHarness";

/** Monday 26 October 2026 starts the week under way in most tests. */
const MONDAY_EARLY = new Date(2026, 9, 26, 7, 30);
const WEDNESDAY = new Date(2026, 9, 28, 12, 0);
const LAST_WEEK_DAY = "2026-10-21";
const THIS_WEEK_DAY = "2026-10-27";

async function run(pushOwns: boolean | null = false) {
  const hook = renderHook(
    ({ key }: { key: string }) => useReviewReminderInternal(pushOwns, key, ""),
    { initialProps: { key: "a" } }
  );
  await act(async () => {
    await settleNotifications();
  });
  return hook;
}

beforeEach(() => {
  resetFirestore();
  resetNotifications();
  localStorage.clear();
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await settleNotifications();
});

describe("useReviewReminderInternal", () => {
  it("on a Monday morning, schedules 09:00 for last week's review, opening it", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
    });
    await run();
    expect(scheduledIds()).toEqual([REVIEW_NOTIFICATION_ID]);
    expect(scheduledAt(REVIEW_NOTIFICATION_ID)).toMatchObject({
      ...REVIEW_NOTIFICATION,
      scheduleAt: new Date(2026, 9, 26, 9, 0),
      route: REVIEW_ROUTE,
    });
  });

  it("leaves it unscheduled once that review has been read", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
    });
    localStorage.setItem(`u1:${reviewViewedKey("2026-10-19")}`, "1");
    const hook = await run();
    // POSITIVE anchor: the switch has loaded and is on.
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.prefs.enabled).toBe(true);
    expect(scheduledIds()).toEqual([]);
  });

  it("mid-week, schedules next Monday for the week under way once it has a log", async () => {
    vi.useFakeTimers({ now: WEDNESDAY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/meals/m1": { date: THIS_WEEK_DAY, totalCalories: 500 },
    });
    await run();
    expect(scheduledAt(REVIEW_NOTIFICATION_ID)?.scheduleAt).toEqual(
      new Date(2026, 10, 2, 9, 0)
    );
  });

  it("mid-week, schedules for someone who logged before, on a quiet week", async () => {
    vi.useFakeTimers({ now: WEDNESDAY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/runs/r1": { date: "2026-09-01", distance: 5000 },
    });
    await run();
    expect(scheduledIds()).toEqual([REVIEW_NOTIFICATION_ID]);
  });

  it("schedules nothing for a new account with nothing logged", async () => {
    vi.useFakeTimers({ now: WEDNESDAY, toFake: ["Date"] });
    const hook = await run();
    expect(hook.result.current.loading).toBe(false);
    expect(scheduledIds()).toEqual([]);
  });

  it("schedules nothing when the switch is off", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
      "users/u1/settings/reviewReminder": { enabled: false },
    });
    const hook = await run();
    expect(hook.result.current.prefs.enabled).toBe(false);
    expect(scheduledIds()).toEqual([]);
  });

  it("leaves the Monday to the server's recap push when that is on", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
    });
    const hook = await run(true);
    expect(hook.result.current.loading).toBe(false);
    expect(scheduledIds()).toEqual([]);
  });

  it("reaches no one who has not allowed notifications", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    setNotificationPermission("denied");
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
    });
    const hook = await run();
    expect(hook.result.current.prefs.enabled).toBe(true);
    expect(scheduledIds()).toEqual([]);
  });

  it("turning the switch off takes it away", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
    });
    const hook = await run();
    expect(scheduledIds()).toEqual([REVIEW_NOTIFICATION_ID]);
    await act(async () => {
      await hook.result.current.updatePrefs({ enabled: false });
      await settleNotifications();
    });
    expect(scheduledIds()).toEqual([]);
  });
});

describe("retireReviewReminder", () => {
  it("takes away the notification for the review just read", async () => {
    vi.useFakeTimers({ now: MONDAY_EARLY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/workouts/w1": { date: LAST_WEEK_DAY, exercises: [] },
    });
    await run();
    expect(scheduledIds()).toEqual([REVIEW_NOTIFICATION_ID]);
    await retireReviewReminder("2026-10-19", MONDAY_EARLY);
    expect(scheduledIds()).toEqual([]);
  });

  it("keeps next Monday's when an older review is read mid-week", async () => {
    vi.useFakeTimers({ now: WEDNESDAY, toFake: ["Date"] });
    seedFirestore({
      "users/u1/meals/m1": { date: THIS_WEEK_DAY, totalCalories: 500 },
    });
    await run();
    await retireReviewReminder("2026-10-19", WEDNESDAY);
    expect(scheduledIds()).toEqual([REVIEW_NOTIFICATION_ID]);
  });
});
