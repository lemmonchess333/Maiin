import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";
import {
  resetNotifications,
  scheduledAt,
  scheduledIds,
  settleNotifications,
} from "@/test/notificationsHarness";
import { useStreakReminderInternal } from "../useStreakReminder";
import { STREAK_NOTIFICATION_ID } from "../streakNotificationId";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
vi.mock("@/lib/notifications");
let streak = { currentStreak: 3, hasLoggedToday: false, loading: false };
vi.mock("@/features/streaks/useStreaks", () => ({ useStreaks: () => streak }));

beforeEach(() => {
  resetFirestore();
  resetNotifications();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 6, 12));
  streak = { currentStreak: 3, hasLoggedToday: false, loading: false };
  seedFirestore({
    "users/u1/settings/streakReminder": {
      enabled: true,
      primingShown: true,
      time: "20:00",
    },
  });
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await act(async () => {
    await settleNotifications();
  });
});

it("arms a non-repeating alarm, then cancels it when push takes ownership", async () => {
  const { result, rerender } = renderHook(
    ({ push }) => useStreakReminderInternal(push),
    { initialProps: { push: false } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(scheduledAt(STREAK_NOTIFICATION_ID)).toBeDefined()
  );
  expect(scheduledAt(STREAK_NOTIFICATION_ID)?.repeats).not.toBe(true);
  expect(scheduledAt(STREAK_NOTIFICATION_ID)?.scheduleAt?.getDate()).toBe(6);
  rerender({ push: true });
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
});

it("cancels after a log or an ended streak", async () => {
  const { result, rerender } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(scheduledAt(STREAK_NOTIFICATION_ID)).toBeDefined()
  );
  streak = { ...streak, hasLoggedToday: true };
  rerender();
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
  streak = { ...streak, hasLoggedToday: false, currentStreak: 0 };
  rerender();
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
});

it.each(["22:00", "23:30", "07:00"])(
  "does not arm an overnight reminder at %s",
  async (time) => {
    seedFirestore({
      "users/u1/settings/streakReminder": {
        enabled: true,
        primingShown: true,
        time,
      },
    });
    const { result } = renderHook(() => useStreakReminderInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await settleNotifications();
    });
    expect(scheduledIds()).toEqual([]);
  }
);

it("does not schedule tomorrow using today's stale streak", async () => {
  vi.setSystemTime(new Date(2026, 8, 6, 21));
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
});
