import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  readDoc,
} from "@/test/firestoreHarness";
import {
  resetNotifications,
  scheduledAt,
  scheduledIds,
  settleNotifications,
} from "@/test/notificationsHarness";
import { useStreakReminderInternal } from "../useStreakReminder";
import {
  STREAK_NOTIFICATION_ID,
  FIRST_WEEK_NOTIFICATION_ID,
} from "../streakNotificationId";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
vi.mock("@/lib/notifications");
let streak = {
  currentStreak: 3,
  savableStreak: 3,
  hasLoggedToday: false,
  loading: false,
};
vi.mock("@/features/streaks/useStreaks", () => ({ useStreaks: () => streak }));

beforeEach(() => {
  resetFirestore();
  resetNotifications();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 6, 12));
  streak = {
    currentStreak: 3,
    savableStreak: 3,
    hasLoggedToday: false,
    loading: false,
  };
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
  streak = {
    ...streak,
    hasLoggedToday: false,
    currentStreak: 0,
    savableStreak: 0,
  };
  rerender();
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
});

it("arms the evening after a rest day, when the streak shows 0 but a log keeps it", async () => {
  // Shown 0 since this morning (today/yesterday rule); 40 days end the day
  // before yesterday, and logging today keeps them with yesterday forgiven.
  streak = {
    currentStreak: 0,
    savableStreak: 40,
    hasLoggedToday: false,
    loading: false,
  };
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(scheduledAt(STREAK_NOTIFICATION_ID)).toBeDefined()
  );
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

it("keeps a claimed first-week nudge armed when its own marker fails to save, and saves it again", async () => {
  streak = {
    currentStreak: 1,
    savableStreak: 1,
    hasLoggedToday: true,
    loading: false,
  };
  failNextFirestore("setDoc", {
    path: "users/u1/settings/streakReminder",
    code: "unavailable",
  });
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(
      readDoc("users/u1/settings/streakReminder")?.firstWeekNudgeDateKey
    ).toBe("2026-09-07")
  );
  await act(async () => {
    await settleNotifications();
  });
  // The claim stops the server sending one, so this is the only nudge.
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)?.scheduleAt?.getDate()).toBe(
    7
  );
  expect(readDoc("users/u1/settings/pushState")?.firstWeekNudgeDateKey).toBe(
    "2026-09-07"
  );
});

it("arms again for the claimed date on a phone whose marker never saved", async () => {
  localStorage.setItem("tropos:first-week-nudge-device:v1:u1", "phone-A");
  // The day after the log: the claim stands, the local marker never landed.
  streak = {
    currentStreak: 2,
    savableStreak: 2,
    hasLoggedToday: false,
    loading: false,
  };
  seedFirestore({
    "users/u1/settings/pushState": {
      firstWeekNudgeDateKey: "2026-09-07",
      firstWeekNudgeDevice: "phone-A",
    },
  });
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(
      readDoc("users/u1/settings/streakReminder")?.firstWeekNudgeDateKey
    ).toBe("2026-09-07")
  );
  await act(async () => {
    await settleNotifications();
  });
  const armed = scheduledAt(FIRST_WEEK_NOTIFICATION_ID)?.scheduleAt;
  expect(armed?.getDate()).toBe(7);
  expect(armed?.getHours()).toBe(20);
});

it("uses the shared push marker to prevent a second local first-week nudge", async () => {
  streak = {
    currentStreak: 1,
    savableStreak: 1,
    hasLoggedToday: true,
    loading: false,
  };
  seedFirestore({
    "users/u1/settings/pushState": { firstWeekNudgeDateKey: "2026-08-11" },
  });
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeUndefined();
  expect(readDoc("users/u1/settings/pushState")?.firstWeekNudgeDateKey).toBe(
    "2026-08-11"
  );
});

it("keeps the nudge armed when its claim cannot reach the server, and claims it on the next pass", async () => {
  streak = {
    currentStreak: 1,
    savableStreak: 1,
    hasLoggedToday: true,
    loading: false,
  };
  failNextFirestore("commit", { code: "unavailable" });
  const first = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeDefined();
  expect(readDoc("users/u1/settings/pushState")).toBeUndefined();
  first.unmount();

  const next = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(next.result.current.loading).toBe(false));
  await waitFor(() =>
    expect(readDoc("users/u1/settings/pushState")?.firstWeekNudgeDateKey).toBe(
      "2026-09-07"
    )
  );
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeDefined();
});

it("claims one account-wide marker after the local nudge is armed", async () => {
  streak = {
    currentStreak: 1,
    savableStreak: 1,
    hasLoggedToday: true,
    loading: false,
  };
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(
      readDoc("users/u1/settings/streakReminder")?.firstWeekNudgeDateKey
    ).toBe("2026-09-07")
  );
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeDefined();
  expect(readDoc("users/u1/settings/pushState")?.firstWeekNudgeDateKey).toBe(
    "2026-09-07"
  );
});
