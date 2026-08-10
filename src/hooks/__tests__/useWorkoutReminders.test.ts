/**
 * useWorkoutRemindersInternal — one weekly-repeating notification per
 * non-rest weekday.
 *
 * The hook's own header records why that shape exists: pre-PR-M it was a
 * SINGLE id scheduled for the next workout day, which "fired exactly once
 * and then silently stopped". That is the failure mode this whole surface
 * has — nothing throws, nothing logs, the reminders just quietly stop. So
 * the assertions are about the resulting schedule:
 *
 *   - `repeatEvery: "week"` on every entry. Without it the OS delivers
 *     once and never re-arms, which is the exact regression above.
 *   - Rest days carry NO notification. Being pinged to train on your rest
 *     day is the reminder actively working against the programme.
 *   - Editing the schedule (a day flipping lift → rest) removes that
 *     day's entry. The hook cancels all seven ids each pass, so "cancel
 *     was called" says nothing about what survived.
 *
 * The clock is fixed at a Wednesday: weekday arithmetic ("is today still
 * ahead?") is meaningless without knowing what day it is.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/notifications");
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));

let mockUser: { uid: string } | null = { uid: "u1" };
let mockProfile: Record<string, unknown> | null = {};
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
  useUid: () => ({ user: mockUser, profile: mockProfile }).user?.uid ?? null,
}));

import { useWorkoutRemindersInternal } from "../useWorkoutReminders";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";
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
 * Assert an EMPTY schedule the honest way.
 *
 * `await waitFor(() => expect(scheduledIds()).toEqual([]))` is satisfied
 * on its first poll by the initial state — CLAUDE.md's negative-assertion
 * trap — so it passes at t=0 and cannot see a write that lands later. It
 * is also, for the same reason, the shape that goes red when a previous
 * test's pass leaks in. Drain first, then assert once.
 *
 * On failure it reports each id's generation, which narrows where a
 * write came from. Read it knowing its limit: the generation is stamped
 * when `schedule_` is CALLED, so a leaked pass that resumes during this
 * test is stamped with THIS generation, not the one it belongs to. A
 * below-current generation proves a leak; a current one does not rule
 * one out. Keeping no pass alive across a test boundary is
 * `settleNotifications`' job, not this message's.
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

const PATH = "users/u1/settings/workoutReminders";
/** Id 2001 + dayOfWeek, Sunday = 0. */
const ID = (day: number) => 2001 + day;

/** Wed 15 Jul 2026, 09:00 local — getDay() === 3. */
const NOW = new Date(2026, 6, 15, 9, 0, 0);

/** Sun rest, Mon lift, Tue run, Wed lift, Thu rest, Fri lift, Sat run. */
const SCHEDULE = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "rest" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

const ON = { enabled: true, time: "07:00" };

beforeEach(() => {
  resetFirestore();
  resetNotifications();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockUser = { uid: "u1" };
  mockProfile = { weekSchedule: SCHEDULE };
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
   * This drained a FIXED ten microtask turns, which is a guess about the
   * hook's control flow, and it is wrong the moment a pass runs one turn
   * longer than the guess. `settleNotifications` waits for a checkable
   * condition instead — nothing suspended, nothing new started across a
   * drain — and throws if that never holds, so a pass that will not stop
   * is reported against the test that owns it. Real timers are restored
   * FIRST so the drain can advance, then cleanup sets each pass's
   * `cancelled`, then we wait for them to actually observe it.
   */
  vi.useRealTimers();
  cleanup();
  await act(async () => {
    await settleNotifications();
  });
});

describe("which days get reminded", () => {
  it("skips REST days", async () => {
    // Being told to train on a rest day is the reminder working against
    // the programme, not just noise.
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() =>
      expect(scheduledIds()).toEqual([ID(1), ID(2), ID(3), ID(5), ID(6)])
    );
    expect(scheduledAt(ID(0))).toBeUndefined(); // Sunday rest
    expect(scheduledAt(ID(4))).toBeUndefined(); // Thursday rest
  });

  it("reminds EVERY day when the user has no schedule", async () => {
    // A user mid-onboarding has no weekSchedule; defaulting to silence
    // would mean their reminder toggle appears to do nothing.
    mockProfile = {};
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toHaveLength(7));
  });

  it("reminds every day when the schedule is malformed", async () => {
    // Not 7 entries → not trustworthy → fall back to reminding, rather
    // than silently dropping days.
    mockProfile = { weekSchedule: [{ day: 0, type: "rest" }] };
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toHaveLength(7));
  });

  it("schedules NOTHING while the toggle is off", async () => {
    seedFirestore({ [PATH]: { ...ON, enabled: false } });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });

  it("schedules nothing when permission is denied", async () => {
    setNotificationPermission("denied");
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });
});

describe("weekly repeat", () => {
  it("marks every entry as repeating WEEKLY", async () => {
    // The pre-PR-M regression: without this each reminder fires once and
    // then silently stops forever.
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toHaveLength(5));

    for (const p of [ID(1), ID(2), ID(3), ID(5), ID(6)]) {
      expect(scheduledAt(p)?.repeats, `id ${p}`).toBe(true);
      expect(scheduledAt(p)?.repeatEvery, `id ${p}`).toBe("week");
    }
  });
});

describe("anchor date", () => {
  it("pushes TODAY a full week out once its time has passed", async () => {
    // Wednesday 07:00, clock is Wednesday 09:00. Anchoring in the past
    // means the OS never fires it, so this week's Wednesday is skipped
    // AND the weekly repeat never starts.
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledAt(ID(3))).toBeDefined());

    const at = scheduledAt(ID(3))!.scheduleAt!;
    expect(at.getDay()).toBe(3);
    expect(at.getDate()).toBe(22); // next Wednesday, not the 15th
    expect(at.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("anchors each day on its OWN weekday", async () => {
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toHaveLength(5));

    // Friday (5) is still ahead this week → the 17th.
    expect(scheduledAt(ID(5))!.scheduleAt!.getDay()).toBe(5);
    expect(scheduledAt(ID(5))!.scheduleAt!.getDate()).toBe(17);
    // Every anchor honours the configured time.
    for (const p of scheduledIds()) {
      expect(scheduledAt(p)!.scheduleAt!.getHours(), `id ${p}`).toBe(7);
    }
  });

  it("skips a malformed time entirely", async () => {
    seedFirestore({ [PATH]: { enabled: true, time: "7am" } });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });
});

describe("reacting to changes", () => {
  it("drops a day that flips from LIFT to REST", async () => {
    // The hook cancels all seven ids each pass, so only the surviving
    // set proves the edit took effect.
    seedFirestore({ [PATH]: ON });
    const { result, rerender } = renderHook(() =>
      useWorkoutRemindersInternal()
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledAt(ID(5))).toBeDefined());

    mockProfile = {
      weekSchedule: SCHEDULE.map((d) =>
        d.day === 5 ? { day: 5, type: "rest" } : d
      ),
    };
    rerender();

    await waitFor(() => expect(scheduledAt(ID(5))).toBeUndefined());
    expect(scheduledIds()).toEqual([ID(1), ID(2), ID(3), ID(6)]);
  });

  it("re-anchors every day after a time edit", async () => {
    seedFirestore({ [PATH]: ON });
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(scheduledIds()).toHaveLength(5));

    await act(async () => {
      await result.current.updateReminders({ time: "18:15" });
    });

    await waitFor(() =>
      expect(scheduledAt(ID(3))?.scheduleAt?.getHours()).toBe(18)
    );
    for (const p of scheduledIds()) {
      expect(scheduledAt(p)!.scheduleAt!.getHours(), `id ${p}`).toBe(18);
    }
  });

  it("defaults to OFF for a user with no settings doc", async () => {
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reminders.enabled).toBe(false);
    await expectNothingScheduled();
  });

  it("stops loading and schedules nothing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expectNothingScheduled();
  });
});

describe("the last reschedule pass wins", () => {
  /**
   * The user-facing property, and the one the original bug broke: a
   * superseded pass must never overwrite the intent that replaced it.
   *
   * Each pass is cancel-all-seven then schedule-what-applies, so the last
   * pass holds the truth — but only if passes cannot interleave.
   * Unserialised, a pass suspended on an await resumes AFTER the newer
   * pass has run its cancels and writes over them: the user switches
   * reminders off and they come back.
   *
   * `deferSchedules()` parks the first pass exactly where a real
   * in-flight OS call would be, so the second pass is provably issued
   * while the first is mid-write. That is the interleaving the chain has
   * to prevent, and a plain unmount-then-assert could not create it.
   */
  it("a toggle-off issued mid-write is not overwritten by the pass it replaced", async () => {
    seedFirestore({ [PATH]: ON });
    deferSchedules();

    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.reminders.enabled).toBe(true));

    // The enabled pass is now parked on its first schedule call. Turn
    // reminders OFF while it is suspended.
    await act(async () => {
      await result.current.updateReminders({ enabled: false });
    });

    releaseSchedules();
    // Drained, then asserted SYNCHRONOUSLY. `await waitFor(() =>
    // expect(scheduledIds()).toEqual([]))` here passes on its first poll,
    // before the parked pass has resumed — the negative-assertion trap
    // CLAUDE.md documents, and it made this test pass with the chain
    // removed. Give the stale write every chance to land, then check.
    await act(async () => {
      await settleNotifications();
    });

    expect(scheduledIds()).toEqual([]);
  });

  it("the same pass DOES schedule when nothing supersedes it", async () => {
    /* The control. Without it the assertion above is satisfied by a hook
       broken badly enough to schedule nothing at all. */
    seedFirestore({ [PATH]: ON });
    deferSchedules();

    const { result } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.reminders.enabled).toBe(true));

    releaseSchedules();
    await waitFor(() =>
      expect(scheduledIds()).toEqual([ID(1), ID(2), ID(3), ID(5), ID(6)])
    );
  });

  it("a torn-down pass stops after the call already in flight", async () => {
    /**
     * The honest limit of what teardown can promise. A promise already
     * dispatched cannot be recalled, so the schedule call the pass is
     * suspended inside WILL land — at most one id. What must not happen
     * is the remaining days landing behind it.
     *
     * #1911 tried to assert zero by having the stale pass cancel its own
     * write. That did produce zero here, and broke the case above: the
     * cancel could delete an id the newer pass had legitimately
     * rescheduled. CI caught it losing exactly one of five. Asserting the
     * reachable contract is better than engineering a worse race to make
     * a rounder number true.
     */
    seedFirestore({ [PATH]: ON });
    deferSchedules();

    const { result, unmount } = renderHook(() => useWorkoutRemindersInternal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.reminders.enabled).toBe(true));

    unmount();
    releaseSchedules();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const landed = scheduledIds();
    expect(landed.length).toBeLessThanOrEqual(1);
    // The four days behind the in-flight one must never appear.
    expect(landed).not.toContain(ID(2));
    expect(landed).not.toContain(ID(3));
    expect(landed).not.toContain(ID(5));
    expect(landed).not.toContain(ID(6));
  });
});
