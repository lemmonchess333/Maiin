import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";

const h = vi.hoisted(() => ({
  load: vi.fn(() => null), save: vi.fn(), clear: vi.fn(), error: vi.fn(),
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
  computeDraftIdentity: () => "test", createWorkoutCompletionId: () => "test",
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: h.error, success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/workout/PlateCalculatorSheet", () => ({ default: () => null }));
vi.mock("@/components/workout/RestTimerRing", () => ({ default: () => null }));
vi.mock("@/components/workout/StallModal", () => ({ default: () => null }));
vi.mock("@/lib/restTimerNotification", () => ({
  restNotificationDelaySeconds: () => 0,
  scheduleRestEndNotification: vi.fn(), cancelRestEndNotification: vi.fn(),
}));
import WorkoutSession from "../WorkoutSession";

function openSession() {
  const onLogExercise = vi.fn().mockResolvedValue(undefined);
  render(<WorkoutSession day={{
    dayName: "Test lift", dayType: "upper", completed: false,
    exercises: [{ exerciseId: "test", name: "Test exercise", sets: 3,
      reps: 8, weight: 0, restSeconds: 0 } as ProgramExercise],
  }} dayIndex={0} onLogExercise={onLogExercise}
    onCompleteDay={vi.fn()} onClose={vi.fn()} />);
  return onLogExercise;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("set completion through row controls", () => {
  it("rejects an invalid later set and keeps it editable", () => {
    openSession();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Set 2 reps" }), {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Mark set complete" })[1]);
    expect(h.error).toHaveBeenCalledWith("Reps can't be negative.");
    expect(screen.getByRole("spinbutton", { name: "Set 2 reps" })).toBeEnabled();
  });

  it("offers undo for a valid out-of-order set", () => {
    openSession();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark set complete" })[1]);
    expect(screen.getByRole("spinbutton", { name: "Set 2 reps" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
    expect(screen.getByRole("spinbutton", { name: "Set 2 reps" })).toBeEnabled();
  });

  it("logs progression once when row controls finish an exercise out of order", async () => {
    const log = openSession();
    // Cursor remains at set 1; completing set 3 must not finish the exercise.
    fireEvent.click(screen.getAllByRole("button", { name: "Mark set complete" })[2]);
    expect(log).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark set complete" })[1]);
    expect(log).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark set complete" }));
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
    expect(log).toHaveBeenCalledWith(0, 0, 8, 0, undefined);
  });
});
