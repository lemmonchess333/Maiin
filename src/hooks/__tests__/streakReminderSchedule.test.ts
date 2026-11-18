import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  readDoc,
  deferWrites,
  resumeWrites,
  pendingWrites,
  releaseWrite,
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

it("arms a non-repeating alarm, then cancels it when push carries the reminder", async () => {
  const { result, rerender } = renderHook(
    ({ push }: { push: Record<string, unknown> }) =>
      useStreakReminderInternal(push),
    { initialProps: { push: {} } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(scheduledAt(STREAK_NOTIFICATION_ID)).toBeDefined()
  );
  expect(scheduledAt(STREAK_NOTIFICATION_ID)?.repeats).not.toBe(true);
  expect(scheduledAt(STREAK_NOTIFICATION_ID)?.scheduleAt?.getDate()).toBe(6);
  // Push on: the server sends it, at the same hour, and the phone stands
  // aside (App1 Q26: never both).
  rerender({ push: { enabled: true } });
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

it.each([
  ["22:00", 21],
  ["23:30", 21],
])(
  "holds a late time of %s to the last evening hour, never overnight",
  async (time, hour) => {
    seedFirestore({
      "users/u1/settings/streakReminder": {
        enabled: true,
        primingShown: true,
        time,
      },
    });
    const { result } = renderHook(() => useStreakReminderInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.prefs.time).toBe("21:00");
    await waitFor(() =>
      expect(scheduledAt(STREAK_NOTIFICATION_ID)?.scheduleAt?.getHours()).toBe(
        hour
      )
    );
  }
);

it("holds an early time to 08:00, which has passed at noon", async () => {
  seedFirestore({
    "users/u1/settings/streakReminder": {
      enabled: true,
      primingShown: true,
      time: "07:00",
    },
  });
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.prefs.time).toBe("08:00");
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
});

it("arms at the hour chosen in the new shape, which wins over the old switch", async () => {
  seedFirestore({
    "users/u1/settings/reminders": { streakEnabled: true, streakTime: "18:00" },
    "users/u1/settings/streakReminder": {
      enabled: false,
      primingShown: true,
      time: "20:00",
    },
  });
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.prefs).toEqual({ enabled: true, time: "18:00" });
  await waitFor(() =>
    expect(scheduledAt(STREAK_NOTIFICATION_ID)?.scheduleAt?.getHours()).toBe(18)
  );
});

it("writes the one switch and the one time in the new shape only", async () => {
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(scheduledAt(STREAK_NOTIFICATION_ID)).toBeDefined()
  );
  await act(async () => {
    await result.current.updatePrefs({ time: "19:30" });
  });
  await act(async () => {
    await result.current.updatePrefs({ enabled: false });
    await settleNotifications();
  });
  expect(readDoc("users/u1/settings/reminders")).toEqual({
    streakTime: "19:00",
    streakEnabled: false,
  });
  // The old document keeps what it said; nothing reads it now.
  expect(readDoc("users/u1/settings/streakReminder")).toEqual({
    enabled: true,
    primingShown: true,
    time: "20:00",
  });
  expect(result.current.prefs).toEqual({ enabled: false, time: "19:00" });
  expect(scheduledIds()).toEqual([]);
});

it("reads a push-only account as on, carried by push, and arms nothing", async () => {
  seedFirestore({});
  const { result } = renderHook(() =>
    useStreakReminderInternal({ enabled: true })
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.prefs.enabled).toBe(true);
  expect(result.current.delivery).toBe("push");
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledIds()).toEqual([]);
});

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

it("keeps the claimed nudge armed when a new day reads the push consent again", async () => {
  streak = {
    currentStreak: 1,
    savableStreak: 1,
    hasLoggedToday: true,
    loading: false,
  };
  const { result, rerender } = renderHook(
    ({ push, key }: { push: Record<string, unknown> | null; key: string }) =>
      useStreakReminderInternal(push, key),
    {
      initialProps: {
        push: {} as Record<string, unknown> | null,
        key: "2026-09-06",
      },
    }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(
      readDoc("users/u1/settings/streakReminder")?.firstWeekNudgeDateKey
    ).toBe("2026-09-07")
  );
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeDefined();
  // The next morning the app comes back: until the new day's read lands,
  // whether push sends the reminders is not known.
  vi.setSystemTime(new Date(2026, 8, 7, 9));
  streak = { ...streak, hasLoggedToday: false };
  rerender({ push: null, key: "2026-09-07" });
  await act(async () => {
    await settleNotifications();
  });
  rerender({ push: {}, key: "2026-09-07" });
  await act(async () => {
    await settleNotifications();
  });
  const armed = scheduledAt(FIRST_WEEK_NOTIFICATION_ID)?.scheduleAt;
  expect(armed?.getDate()).toBe(7);
  expect(armed?.getHours()).toBe(20);
});

it("leaves nothing armed when switched off while the nudge's marker saves", async () => {
  streak = {
    currentStreak: 1,
    savableStreak: 1,
    hasLoggedToday: true,
    loading: false,
  };
  deferWrites();
  const { result } = renderHook(() => useStreakReminderInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(pendingWrites()).toEqual(["users/u1/settings/streakReminder"])
  );
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeDefined();
  // Off, before the marker's save is answered; then the answers land,
  // the Off first.
  let off!: Promise<void>;
  act(() => {
    off = result.current.updatePrefs({ enabled: false });
  });
  await waitFor(() => expect(pendingWrites()).toHaveLength(2));
  resumeWrites();
  await act(async () => {
    expect(releaseWrite(1)).toBe(true);
    await off;
  });
  await act(async () => {
    expect(releaseWrite(0)).toBe(true);
    await settleNotifications();
  });
  await act(async () => {
    await settleNotifications();
  });
  expect(result.current.prefs.enabled).toBe(false);
  expect(readDoc("users/u1/settings/reminders")?.streakEnabled).toBe(false);
  expect(scheduledAt(FIRST_WEEK_NOTIFICATION_ID)).toBeUndefined();
});
