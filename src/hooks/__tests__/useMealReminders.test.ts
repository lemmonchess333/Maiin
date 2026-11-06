/**
 * useMealRemindersInternal — the hook that decides which meal reminders
 * the OS is holding.
 *
 * Every rule here fails SILENTLY in production. A reminder that doesn't
 * fire produces no error, no log, and no UI difference — the user simply
 * stops being reminded and, months later, might mention it. So the
 * assertions are about the resulting SCHEDULE, never about call counts:
 *
 *   - `repeats: true` on every scheduled meal. The payload's own comment
 *     records that omitting it "silently stopped" the reminders after
 *     their first delivery. A call-count test passes either way.
 *   - Disabling a meal (or the master switch) leaves NO residue. The hook
 *     reschedules by cancelling all three ids and re-adding the enabled
 *     ones, so "cancel was called" proves nothing about what survived.
 *   - A past time schedules TOMORROW, not a moment in the past — an
 *     already-elapsed fire time is one the OS never delivers.
 *
 * The clock is fixed because "next occurrence" is entirely relative to it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/notifications");
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));
const captureError = vi.fn();
vi.mock("@/lib/errorReporting", () => ({
  captureError: (...a: unknown[]) => captureError(...a),
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
  useUid: () => ({ user: mockUser, profile: {} }).user?.uid ?? null,
}));

import { useMealRemindersInternal } from "../useMealReminders";
import { scheduleNotification } from "@/lib/notifications";
import {
  setReminderLocallyOff,
  isReminderLocallyOff,
} from "@/lib/localReminderChoice";
import {
  seedFirestore,
  deferReads,
  pendingReads,
  releaseAllReads,
  resetFirestore,
  failNextFirestore,
  deferWrites,
  releaseAllWrites,
  releaseWrite,
  pendingWrites,
  resumeWrites,
} from "@/test/firestoreHarness";
import {
  resetNotifications,
  scheduledIds,
  scheduledAt,
  setNotificationPermission,
  deferSchedules,
  releaseSchedules,
  scheduleProvenance,
  settleNotifications,
} from "@/test/notificationsHarness";

/**
 * Drain, then assert an empty schedule once. See
 * useWorkoutReminders.test.ts for why `waitFor` is the wrong tool for a
 * negative assertion, and what the generation numbers in the failure
 * message mean.
 */
async function expectNothingScheduled(): Promise<void> {
  await act(async () => {
    await settleNotifications();
  });
  const { epoch, byId } = scheduleProvenance();
  expect(
    scheduledIds(),
    `current generation ${epoch}; ids by generation ${JSON.stringify(byId)}`
  ).toEqual([]);
}

const BREAKFAST = 1001;
const LUNCH = 1002;
const DINNER = 1003;
const PATH = "users/u1/settings/mealReminders";

/** Wed 15 Jul 2026, 09:00 local — after breakfast, before lunch/dinner. */
const NOW = new Date(2026, 6, 15, 9, 0, 0);

const ALL_ON = {
  enabled: true,
  breakfast: { enabled: true, time: "08:00" },
  lunch: { enabled: true, time: "12:30" },
  dinner: { enabled: true, time: "18:30" },
};

beforeEach(() => {
  localStorage.clear();
  resetFirestore();
  resetNotifications();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockUser = { uid: "u1" };
});

afterEach(async () => {
  /**
   * Unmount and SETTLE before the next test's `beforeEach` clears the
   * schedule — the hygiene that was missing.
   *
   * The reschedule effect is an async pass with up to 14 await points.
   * When a test ends with one in flight, that pass keeps resolving into
   * whatever the fake holds next. RTL's auto-cleanup unmounts (which sets
   * the pass's `cancelled`), but unmounting does not WAIT for the pass to
   * observe it, and the shared `setup.ts` drain bails while fake timers
   * are installed — which they are here, for `Date`. So the window
   * between "unmounted" and "actually stopped" stayed open across the
   * test boundary.
   *
   * That window is why this file failed only on CI: a slower machine is
   * likelier to still be inside the pass when the next test starts. It
   * has never reproduced locally — 56 runs across three strategies,
   * including artificially slowed fake operations and shuffled test
   * order.
   *
   * This drained a FIXED ten microtask turns, which is a guess about
   * the hook's control flow, and it is wrong the moment a pass runs one
   * turn longer than the guess. `settleNotifications` waits for a
   * checkable condition instead — nothing suspended, nothing new
   * started across a drain — and throws if that never holds. Real
   * timers are restored FIRST so the drain can advance, then cleanup
   * sets each pass's `cancelled`, then we wait for them to observe it.
   */
  vi.useRealTimers();
  cleanup();
  await act(async () => {
    await settleNotifications();
  });
});

describe("scheduling", () => {
  it("schedules every enabled meal when the master switch is on", async () => {
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(scheduledIds()).toEqual([BREAKFAST, LUNCH, DINNER])
    );
  });

  it("schedules NOTHING while the master switch is off", async () => {
    // Individual meals stay enabled — the master switch alone must
    // suppress them, or turning reminders off does nothing.
    seedFirestore({ [PATH]: { ...ALL_ON, enabled: false } });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });

  it("leaves NO residue for a disabled meal", async () => {
    // The hook cancels all three then re-adds the enabled ones, so
    // "cancelNotification(1002) was called" proves nothing about what
    // survived the rescheduling.
    seedFirestore({
      [PATH]: { ...ALL_ON, lunch: { enabled: false, time: "12:30" } },
    });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toEqual([BREAKFAST, DINNER]));
    expect(scheduledAt(LUNCH)).toBeUndefined();
  });

  it("marks every meal as REPEATING", async () => {
    // Without this the OS delivers once and never re-arms — the exact
    // regression the payload's `repeats` comment was written for.
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toHaveLength(3));

    for (const id of [BREAKFAST, LUNCH, DINNER]) {
      expect(scheduledAt(id)?.repeats, `id ${id}`).toBe(true);
    }
  });
});

describe("next occurrence", () => {
  it("schedules a still-upcoming time for TODAY", async () => {
    // 12:30 lunch, clock at 09:00 → today.
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledAt(LUNCH)).toBeDefined());

    expect(scheduledAt(LUNCH)!.scheduleAt!.getDate()).toBe(15);
    expect(scheduledAt(LUNCH)!.scheduleAt!.getHours()).toBe(12);
  });

  it("rolls an already-passed time to TOMORROW", async () => {
    // 08:00 breakfast, clock at 09:00. Scheduling it in the past means
    // the OS never delivers it and the reminder just stops.
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledAt(BREAKFAST)).toBeDefined());

    const at = scheduledAt(BREAKFAST)!.scheduleAt!;
    expect(at.getDate()).toBe(16);
    expect(at.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("skips a malformed time rather than scheduling an invalid date", async () => {
    seedFirestore({
      [PATH]: { ...ALL_ON, dinner: { enabled: true, time: "25:99" } },
    });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toEqual([BREAKFAST, LUNCH]));
  });
});

describe("permission", () => {
  it("schedules nothing when permission is denied", async () => {
    // Denied is a SOFT failure — scheduleNotification returns false and
    // the hook carries on, so only the empty schedule reveals it.
    setNotificationPermission("denied");
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });
});

describe("settings persistence", () => {
  it("reschedules to the NEW time after an edit, without duplicating", async () => {
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledAt(DINNER)).toBeDefined());

    await act(async () => {
      await result.current.updateReminders({
        dinner: { enabled: true, time: "19:45" },
      });
    });

    await waitFor(() =>
      expect(scheduledAt(DINNER)?.scheduleAt?.getHours()).toBe(19)
    );
    // Ids are unique per meal, so a stale duplicate would show up as a
    // fourth entry rather than a second dinner.
    expect(scheduledIds()).toEqual([BREAKFAST, LUNCH, DINNER]);
  });

  it("keeps the optimistic update when the WRITE fails", async () => {
    // A background save failure must not roll back the toggle the user
    // just flipped; it's reported instead.
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));

    failNextFirestore("setDoc", { path: PATH });
    await act(async () => {
      await expect(
        result.current.updateReminders({ enabled: false })
      ).rejects.toThrow("saved on this phone");
    });

    expect(result.current.reminders.enabled).toBe(false);
    expect(captureError).toHaveBeenCalled();
  });

  it("falls back to defaults when no settings doc exists", async () => {
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Default is master-OFF — a new user must not be opted in to
    // notifications they never asked for.
    expect(result.current.reminders.enabled).toBe(false);
    await expectNothingScheduled();
  });

  it("stops loading and schedules nothing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });
});

describe("the last reschedule pass wins", () => {
  /**
   * The meal half, pinned here rather than inherited from the workout
   * hook. CLAUDE.md's first recurring-mistake rule is that the tested
   * copy does not prove the running copy — and it held: when the workout
   * hook's chain was mutated away, only the workout test failed.
   */
  it("a toggle-off issued mid-write is not overwritten by the pass it replaced", async () => {
    seedFirestore({ [PATH]: ALL_ON });
    deferSchedules();

    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.reminders.enabled).toBe(true));

    await act(async () => {
      await result.current.updateReminders({ enabled: false });
    });

    releaseSchedules();
    // Drained, then asserted synchronously — under waitFor this passes on
    // the first poll, before the parked pass resumes.
    await act(async () => {
      await settleNotifications();
    });

    await expectNothingScheduled();
  });

  it("the same pass DOES schedule when nothing supersedes it", async () => {
    /* The control — without it the assertion above is satisfied by a hook
       broken badly enough to schedule nothing at all. */
    seedFirestore({ [PATH]: ALL_ON });
    deferSchedules();

    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.reminders.enabled).toBe(true));

    releaseSchedules();
    await waitFor(() =>
      expect(scheduledIds()).toEqual([BREAKFAST, LUNCH, DINNER])
    );
  });

  it("a torn-down pass stops after the call already in flight", async () => {
    /* At most the one dispatched call lands; the meals behind it never
       do. See useWorkoutReminders.test.ts for why zero is not the
       reachable contract. */
    seedFirestore({ [PATH]: ALL_ON });
    deferSchedules();

    const { result, unmount } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.reminders.enabled).toBe(true));

    unmount();
    releaseSchedules();
    await act(async () => {
      await settleNotifications();
    });

    const landed = scheduledIds();
    expect(landed.length).toBeLessThanOrEqual(1);
    expect(landed).not.toContain(LUNCH);
    expect(landed).not.toContain(DINNER);
  });
});

it("moves a logged slot's reminder to tomorrow, leaving other slots today", async () => {
  seedFirestore({ [PATH]: ALL_ON });
  const activity = {
    ready: true,
    dateKey: "2026-07-15",
    meals: [] as ("breakfast" | "lunch" | "dinner")[],
    workout: false,
  };
  const { result, rerender } = renderHook(
    ({ activity }) => useMealRemindersInternal(activity),
    { initialProps: { activity } }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(scheduledIds()).toEqual([BREAKFAST, LUNCH, DINNER])
  );
  expect(scheduledAt(LUNCH)?.scheduleAt?.getDate()).toBe(15);
  rerender({ activity: { ...activity, meals: ["lunch"] } });
  await act(async () => {
    await settleNotifications();
  });
  expect(scheduledAt(LUNCH)?.scheduleAt?.getDate()).toBe(16);
  expect(scheduledAt(DINNER)?.scheduleAt?.getDate()).toBe(15);
});

describe("reminder recovery", () => {
  it("preserves an existing OS reminder on a failed read, then retries", async () => {
    await scheduleNotification({
      id: 1001,
      title: "Existing reminder",
      body: "",
      scheduleAt: new Date(Date.now() + 60_000),
      repeats: true,
    });
    seedFirestore({ [PATH]: ALL_ON });
    failNextFirestore("getDoc", { path: PATH, code: "unavailable" });
    const { result } = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(result.current.failed).toBe(true));
    await act(settleNotifications);
    expect(scheduledIds()).toEqual([1001]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(false);
    await act(settleNotifications);
    expect(scheduledIds().length).toBeGreaterThan(1);
  });

  it("keeps a failed off save off after reopening, until explicitly enabled", async () => {
    seedFirestore({ [PATH]: ALL_ON });
    const first = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(settleNotifications);
    expect(scheduledIds().length).toBeGreaterThan(1);
    failNextFirestore("setDoc", { path: PATH, code: "permission-denied" });
    await act(async () => {
      await expect(
        first.result.current.updateReminders({ enabled: false })
      ).rejects.toThrow("saved on this phone");
    });
    await act(settleNotifications);
    expect(scheduledIds()).toEqual([]);
    first.unmount();
    const reopened = renderHook(() => useMealRemindersInternal());
    await waitFor(() => expect(reopened.result.current.loading).toBe(false));
    await act(settleNotifications);
    expect(reopened.result.current.reminders.enabled).toBe(false);
    expect(scheduledIds()).toEqual([]);
    await act(async () => {
      await reopened.result.current.updateReminders({ enabled: true });
    });
    await act(settleNotifications);
    expect(reopened.result.current.reminders.enabled).toBe(true);
    expect(scheduledIds().length).toBeGreaterThan(1);
  });

  it("preserves an existing reminder while activity is unresolved", async () => {
    await scheduleNotification({
      id: 1001,
      title: "Existing reminder",
      body: "",
      scheduleAt: new Date(Date.now() + 60_000),
      repeats: true,
    });
    seedFirestore({ [PATH]: ALL_ON });
    const { result } = renderHook(() =>
      useMealRemindersInternal({
        ready: false,
        dateKey: "2026-07-15",
        meals: [],
        workout: false,
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(settleNotifications);
    expect(scheduledIds()).toEqual([1001]);
  });
});

it("turns off while an older save is still pending, and keeps the newer choice", async () => {
  seedFirestore({ [PATH]: ALL_ON });
  const { result } = renderHook(() => useMealRemindersInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(settleNotifications);
  expect(scheduledIds().length).toBeGreaterThan(1);
  deferWrites();
  let edit!: Promise<void>;
  act(() => {
    edit = result.current.updateReminders({
      dinner: { enabled: true, time: "19:00" },
    });
  });
  await waitFor(() => expect(result.current.saving).toBe(true));
  let off!: Promise<void>;
  act(() => {
    off = result.current.updateReminders({ enabled: false });
  });
  await act(settleNotifications);
  expect(result.current.reminders.enabled).toBe(false);
  expect(scheduledIds()).toEqual([]);
  expect(pendingWrites()).toHaveLength(2);
  await act(async () => {
    releaseAllWrites();
    await Promise.all([edit, off]);
  });
  await act(settleNotifications);
  expect(result.current.reminders.enabled).toBe(false);
  expect(result.current.saving).toBe(false);
  expect(result.current.reminders.dinner.time).toBe("19:00");
  expect(scheduledIds()).toEqual([]);
  resumeWrites();
  await act(async () => {
    await result.current.updateReminders({ enabled: true });
  });
  await act(settleNotifications);
  expect(scheduledAt(1003)?.scheduleAt?.getHours()).toBe(19);
});

it("cancels from the saved local off choice even when the settings read fails", async () => {
  expect(setReminderLocallyOff("u1", "meal", true)).toBe(true);
  expect(isReminderLocallyOff("another-user", "meal")).toBe(false);
  await scheduleNotification({
    id: 1001,
    title: "Existing reminder",
    body: "",
    scheduleAt: new Date(Date.now() + 60_000),
    repeats: true,
  });
  failNextFirestore("getDoc", { path: PATH, code: "unavailable" });
  const { result } = renderHook(() => useMealRemindersInternal());
  await waitFor(() => expect(result.current.failed).toBe(true));
  await act(settleNotifications);
  expect(scheduledIds()).toEqual([]);
});

it("does not let a late enable from a departed session clear a newer off choice", async () => {
  seedFirestore({ [PATH]: { ...ALL_ON, enabled: false } });
  const first = renderHook(() => useMealRemindersInternal());
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  deferWrites();
  let pending!: Promise<void>;
  act(() => {
    pending = first.result.current.updateReminders({ enabled: true });
  });
  await waitFor(() => expect(first.result.current.saving).toBe(true));
  first.unmount();
  expect(setReminderLocallyOff("u1", "meal", true)).toBe(true);
  await act(async () => {
    releaseAllWrites();
    await pending;
  });
  expect(isReminderLocallyOff("u1", "meal")).toBe(true);
  const next = renderHook(() => useMealRemindersInternal());
  await waitFor(() => expect(next.result.current.loading).toBe(false));
  await act(settleNotifications);
  expect(next.result.current.reminders.enabled).toBe(false);
  expect(scheduledIds()).toEqual([]);
});

it("ignores an old account's enable acknowledgement after a direct UID change", async () => {
  seedFirestore({
    [PATH]: { ...ALL_ON, enabled: false },
    "users/u2/settings/mealReminders": { ...ALL_ON, enabled: false },
  });
  const { result, rerender } = renderHook(() => useMealRemindersInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  deferWrites();
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.updateReminders({ enabled: true });
  });
  await waitFor(() => expect(result.current.saving).toBe(true));
  mockUser = { uid: "u2" };
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(setReminderLocallyOff("u1", "meal", true)).toBe(true);
  await act(async () => {
    releaseAllWrites();
    await pending;
    await settleNotifications();
  });
  expect(result.current.reminders.enabled).toBe(false);
  expect(result.current.saving).toBe(false);
  expect(isReminderLocallyOff("u1", "meal")).toBe(true);
  expect(scheduledIds()).toEqual([]);
});

it("keeps the new account's pending save separate from the old account", async () => {
  seedFirestore({
    [PATH]: { ...ALL_ON, enabled: false },
    "users/u2/settings/mealReminders": { ...ALL_ON, enabled: false },
  });
  const { result, rerender } = renderHook(() => useMealRemindersInternal());
  await waitFor(() => expect(result.current.loading).toBe(false));
  deferWrites();
  let oldSave!: Promise<void>;
  act(() => {
    oldSave = result.current.updateReminders({ enabled: true });
  });
  await waitFor(() => expect(pendingWrites()).toHaveLength(1));
  mockUser = { uid: "u2" };
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.saving).toBe(false);
  let newSave!: Promise<void>;
  act(() => {
    newSave = result.current.updateReminders({
      breakfast: { enabled: true, time: "10:00" },
    });
  });
  await waitFor(() => expect(pendingWrites()).toHaveLength(2));
  await act(async () => {
    expect(releaseWrite(0)).toBe(true);
    await oldSave;
  });
  expect(result.current.saving).toBe(true);
  expect(result.current.reminders.enabled).toBe(false);
  await act(async () => {
    releaseAllWrites();
    await newSave;
  });
  expect(result.current.saving).toBe(false);
  expect(result.current.reminders.breakfast.time).toBe("10:00");
});

it("preserves native reminders while a switched account's settings are unknown", async () => {
  seedFirestore({
    [PATH]: { ...ALL_ON, enabled: true },
    "users/u2/settings/mealReminders": { ...ALL_ON, enabled: false },
  });
  const loadingRenders: Array<{ uid: string | undefined; loading: boolean }> =
    [];
  const { result, rerender } = renderHook(() => {
    const value = useMealRemindersInternal();
    loadingRenders.push({ uid: mockUser?.uid, loading: value.loading });
    return value;
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(settleNotifications);
  await scheduleNotification({
    id: 1001,
    title: "Existing account B reminder",
    body: "",
    scheduleAt: new Date(Date.now() + 60_000),
    repeats: true,
  });
  const before = scheduledAt(1001);
  deferReads();
  mockUser = { uid: "u2" };
  rerender();
  await waitFor(() =>
    expect(pendingReads()).toEqual(["users/u2/settings/mealReminders"])
  );
  expect
    .soft(loadingRenders.find((render) => render.uid === "u2")?.loading)
    .toBe(true);
  expect(result.current.loading).toBe(true);
  await act(settleNotifications);
  expect(scheduledAt(1001)).toEqual(before);
  await act(async () => {
    releaseAllReads();
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await expectNothingScheduled();
});
