/**
 * App1 Q62's pass each time the app comes to the front
 * (useReminderAttention): a push reminder sent earlier today is answered,
 * the phone's own reminders are counted and a quiet one is turned off, and
 * Home is told what to say once. Firestore is the one fake (ADR-0009).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/notifications");
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import {
  useReminderAttention,
  type ReminderSwitch,
} from "../useReminderAttention";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import {
  resetNotifications,
  setNotificationPermission,
} from "@/test/notificationsHarness";
import {
  clearReminderFires,
  recordScheduledReminder,
} from "@/lib/reminderFires";

const REMINDERS = "users/u1/settings/reminders";

function switches(on: Partial<Record<string, boolean>> = {}) {
  const make = (kind: string): ReminderSwitch => ({
    ready: true,
    on: on[kind] ?? true,
    turnOff: vi.fn(async () => {}),
  });
  return {
    meals: make("meals"),
    training: make("training"),
    streak: make("streak"),
    review: make("review"),
  };
}

beforeEach(() => {
  resetFirestore();
  resetNotifications();
  clearReminderFires();
  setNotificationPermission("granted");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useReminderAttention", () => {
  it("answers a push reminder sent earlier today, because the app is open", async () => {
    seedFirestore({
      [REMINDERS]: { streakSentAt: Date.now() - 60_000, streakEnabled: true },
    });
    renderHook(() => useReminderAttention("u1", "a", switches()));
    await waitFor(() =>
      expect(readDoc(REMINDERS)?.streakAnsweredAt).toBeDefined()
    );
    expect(readDoc(REMINDERS)?.reviewAnsweredAt).toBeUndefined();
  });

  it("turns off and says once a phone reminder ignored three days running", async () => {
    const day = 86_400_000;
    recordScheduledReminder(
      2001,
      "training",
      new Date(Date.now() - 4 * day),
      "day",
      Date.now() - 5 * day
    );
    const on = switches();
    const { result, rerender } = renderHook(
      ({ value }) => useReminderAttention("u1", "a", value),
      { initialProps: { value: on } }
    );
    await waitFor(() => expect(on.training.turnOff).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(readDoc(REMINDERS)?.trainingQuietShown).toBe(false)
    );
    expect(readDoc(REMINDERS)?.trainingQuietAt).toBeDefined();
    // Home names it while it is off, and not once it is said.
    rerender({ value: switches({ training: false }) });
    expect(result.current.quiet).toEqual(["training"]);
    await act(async () => {
      await result.current.markShown(result.current.quiet);
    });
    expect(result.current.quiet).toEqual([]);
    expect(readDoc(REMINDERS)?.trainingQuietShown).toBe(true);
  });

  it("names nothing a person turned back on", async () => {
    seedFirestore({
      [REMINDERS]: { mealsQuietAt: Date.now() - 1000, mealsQuietShown: false },
    });
    const { result, rerender } = renderHook(
      ({ value }) => useReminderAttention("u1", "a", value),
      { initialProps: { value: switches({ meals: false }) } }
    );
    await waitFor(() => expect(result.current.quiet).toEqual(["meals"]));
    rerender({ value: switches({ meals: true }) });
    expect(result.current.quiet).toEqual([]);
  });

  it("shows a reminder the server turned off as off, once", async () => {
    seedFirestore({
      [REMINDERS]: {
        streakEnabled: false,
        streakQuietAt: Date.now() - 1000,
        streakQuietShown: false,
      },
    });
    const on = switches();
    renderHook(() => useReminderAttention("u1", "a", on));
    await waitFor(() => expect(on.streak.turnOff).toHaveBeenCalledOnce());
    expect(on.review.turnOff).not.toHaveBeenCalled();
  });

  it("waits until every reminder's settings are read", async () => {
    seedFirestore({ [REMINDERS]: { streakSentAt: Date.now() - 60_000 } });
    const loading = switches();
    loading.meals.ready = false;
    const { rerender } = renderHook(
      ({ value }) => useReminderAttention("u1", "a", value),
      { initialProps: { value: loading } }
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(readDoc(REMINDERS)?.streakAnsweredAt).toBeUndefined();
    // Anchored: the same pass runs once they are.
    rerender({ value: switches() });
    await waitFor(() =>
      expect(readDoc(REMINDERS)?.streakAnsweredAt).toBeDefined()
    );
  });
});
