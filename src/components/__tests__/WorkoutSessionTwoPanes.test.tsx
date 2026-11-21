/**
 * The live workout on the iPhone Duo's inner display open on its side
 * (index.css `split`): the session's exercises listed down one half, each
 * named, the current one's sets down the other. Folding mid-set is a
 * resize of the same page: the panes are the same elements laid out
 * again, so a weight typed and not yet ticked is still there, in the same
 * input, after the fold and after the unfold.
 */
import { resetFirestore } from "@/test/firestoreHarness";
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: () => null,
}));
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";

const h = vi.hoisted(() => ({
  load: vi.fn(() => null),
  save: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, profile: null }),
  useUidForStorageKey: () => "test",
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: null },
}));
vi.mock("firebase/firestore");
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({}),
}));
vi.mock("@/hooks/useWorkoutDraft", async (importOriginal) => ({
  // The pure helpers (`draftLayout`) stay real.
  ...(await importOriginal<typeof import("@/hooks/useWorkoutDraft")>()),
  useWorkoutDraft: () => ({ load: h.load, save: h.save, clear: h.clear }),
  computeDraftIdentity: () => "test",
  createWorkoutCompletionId: () => "test",
}));
vi.mock("@/hooks/RemindersProvider", () => ({
  useStreakReminder: () => ({
    prefs: { enabled: false },
    loading: false,
    updatePrefs: vi.fn(),
    requestPermission: vi.fn(),
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/workout/PlateCalculatorSheet", () => ({
  default: () => null,
}));
vi.mock("@/lib/restTimerNotification", () => ({
  restNotificationDelaySeconds: () => 0,
  scheduleRestEndNotification: vi.fn(),
  cancelRestEndNotification: vi.fn(),
}));
import WorkoutSession from "../WorkoutSession";
import { LiftUnitContext } from "@/hooks/useLiftUnit";
import { SPLIT_QUERY } from "@/lib/wideScreen";

const original = window.matchMedia;
let setOpen: (open: boolean) => void = () => {};
beforeEach(() => {
  resetFirestore();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  let split = false;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === SPLIT_QUERY ? split : false;
    },
    media: query,
    // Only the split query changes here, so only its listeners hear.
    addEventListener: (_: string, fn: () => void) => {
      if (query === SPLIT_QUERY) listeners.add(fn);
    },
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
  setOpen = (open) =>
    act(() => {
      split = open;
      for (const fn of listeners) fn();
    });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.matchMedia = original;
});

function openSession() {
  render(
    <LiftUnitContext value="kg">
      <WorkoutSession
        day={{
          dayName: "Push",
          dayType: "upper",
          completed: false,
          exercises: [
            {
              exerciseId: "barbell-bench-press",
              name: "Bench Press",
              instanceId: "bench-1",
              sets: 3,
              reps: 8,
              weight: 60,
              restSeconds: 0,
            } as ProgramExercise,
            {
              exerciseId: "overhead-press",
              name: "Overhead Press",
              instanceId: "ohp-1",
              sets: 3,
              reps: 8,
              weight: 35,
              restSeconds: 0,
            } as ProgramExercise,
          ],
        }}
        dayIndex={0}
        onCompleteDay={vi.fn()}
        onClose={vi.fn()}
      />
    </LiftUnitContext>
  );
}

const railButton = (name: string) => screen.getByRole("button", { name });

describe("WorkoutSession on the Duo's inner display", () => {
  it("names every exercise in the list only when there are two panes", () => {
    openSession();
    // A phone: the current exercise named beside its drawing, the next
    // one a drawing alone.
    expect(railButton("Overhead Press")).not.toHaveTextContent(
      "Overhead Press"
    );
    setOpen(true);
    expect(railButton("Overhead Press")).toHaveTextContent("Overhead Press");
    expect(railButton("Bench Press")).toHaveTextContent("Bench Press");
    setOpen(false);
    expect(railButton("Overhead Press")).not.toHaveTextContent(
      "Overhead Press"
    );
  });

  it("keeps a typed weight, in the same input, through a fold and back", () => {
    openSession();
    const weight = screen.getByRole("spinbutton", { name: "Set 1 weight" });
    fireEvent.change(weight, { target: { value: "62.5" } });
    setOpen(true);
    const opened = screen.getByRole("spinbutton", { name: "Set 1 weight" });
    expect(opened).toBe(weight);
    expect(opened).toHaveValue(62.5);
    setOpen(false);
    expect(screen.getByRole("spinbutton", { name: "Set 1 weight" })).toBe(
      weight
    );
    expect(weight).toHaveValue(62.5);
  });
});
