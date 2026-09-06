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
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, profile: null }),
  useUidForStorageKey: () => "test",
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({ awardEventBadge: vi.fn() }),
}));
vi.mock("@/hooks/useWorkoutDraft", () => ({
  useWorkoutDraft: () => ({ load: h.load, save: h.save, clear: h.clear }),
  computeDraftIdentity: () => "test",
  createWorkoutCompletionId: () => "test",
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: h.error, success: h.success, message: vi.fn() },
}));
vi.mock("@/components/workout/PlateCalculatorSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/workout/RestTimerRing", () => ({ default: () => null }));
vi.mock("@/components/workout/StallModal", () => ({ default: () => null }));
vi.mock("@/lib/restTimerNotification", () => ({
  restNotificationDelaySeconds: () => 0,
  scheduleRestEndNotification: vi.fn(),
  cancelRestEndNotification: vi.fn(),
}));
import WorkoutSession from "../WorkoutSession";

function openSession(onCompleteDay = vi.fn(), onClose = vi.fn()) {
  const onLogExercise = vi.fn().mockResolvedValue(undefined);
  render(
    <WorkoutSession
      day={{
        dayName: "Test lift",
        dayType: "upper",
        completed: false,
        exercises: [
          {
            exerciseId: "test",
            name: "Test exercise",
            sets: 3,
            reps: 8,
            weight: 0,
            restSeconds: 0,
          } as ProgramExercise,
        ],
      }}
      dayIndex={0}
      onLogExercise={onLogExercise}
      onCompleteDay={onCompleteDay}
      onClose={onClose}
    />
  );
  return onLogExercise;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("set completion through row controls", () => {
  it("rejects an invalid later set and keeps it editable", () => {
    openSession();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Set 2 reps" }), {
      target: { value: "-1" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[1]
    );
    expect(h.error).toHaveBeenCalledWith("Reps can't be negative.");
    expect(
      screen.getByRole("spinbutton", { name: "Set 2 reps" })
    ).toBeEnabled();
  });

  it("offers undo for a valid out-of-order set", () => {
    openSession();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[1]
    );
    expect(
      screen.getByRole("spinbutton", { name: "Set 2 reps" })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
    expect(
      screen.getByRole("spinbutton", { name: "Set 2 reps" })
    ).toBeEnabled();
  });

  it("logs progression once when row controls finish an exercise out of order", async () => {
    const log = openSession();
    // Cursor remains at set 1; completing set 3 must not finish the exercise.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[2]
    );
    expect(log).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[1]
    );
    expect(log).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark set complete" }));
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
    expect(log).toHaveBeenCalledWith(0, 0, 8, 0, undefined);
  });
});

describe("workout save acknowledgement", () => {
  it("acknowledges only the awaited save and retains the draft on failure", async () => {
    let resolveSave: (() => void) | undefined;
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          })
      );
    const close = vi.fn();
    openSession(complete, close);
    for (let i = 0; i < 3; i++)
      fireEvent.click(
        screen.getAllByRole("button", { name: "Mark set complete" })[0]
      );
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Workout" })
      ).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    await vi.waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalledWith("Workout saved");
    fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(h.success).not.toHaveBeenCalledWith("Workout saved");
    await act(async () => {
      resolveSave!();
    });
    expect(h.success).toHaveBeenCalledWith("Workout saved");
    expect(close).toHaveBeenCalledOnce();
    expect(h.clear).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][1].completionId).toBe(
      complete.mock.calls[1][1].completionId
    );
  });
});
