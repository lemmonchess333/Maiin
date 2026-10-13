/**
 * Lift16: a set more than twice today's plan, or 25% past the best for its
 * reps, asks before it logs ("125 kg? Today's plan is 12.5 kg."). The plan
 * follows the load lifted, so a typo it logged moved next week's weight.
 * A yes logs it and it counts; Change it leaves the set open to fix.
 */
import { resetFirestore } from "@/test/firestoreHarness";
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: () => null,
}));
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { ComponentProps } from "react";
import type { LiftCompletionReceipt } from "@/lib/liftCompletion";

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
  useStreaks: () => ({
    awardEventBadge: vi.fn(),
    awardEventBadges: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWorkoutDraft", () => ({
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

type CompleteDay = ComponentProps<typeof WorkoutSession>["onCompleteDay"];
const receipt = (): LiftCompletionReceipt => ({
  workoutId: "programme-test",
  share: {
    uid: "test",
    type: "workout",
    source: { kind: "workout", id: "programme-test" },
    post: async () => ({ status: "declined" }),
  },
  syncStatus: "synced",
  sync: Promise.resolve("synced"),
});

function openSession() {
  const complete = vi.fn<CompleteDay>(async () => receipt());
  render(
    <WorkoutSession
      day={{
        dayName: "Shoulders",
        dayType: "upper",
        completed: false,
        exercises: [
          {
            exerciseId: "lateral-raise",
            name: "Lateral Raise",
            instanceId: "raise-1",
            sets: 2,
            reps: 12,
            weight: 12.5,
            restSeconds: 0,
          } as ProgramExercise,
        ],
      }}
      dayIndex={0}
      onCompleteDay={complete}
      onClose={vi.fn()}
    />
  );
  return complete;
}

const typeWeight = (set: string, kg: number) =>
  fireEvent.change(screen.getByRole("spinbutton", { name: `${set} weight` }), {
    target: { value: String(kg) },
  });
/** The set's own row: its two inputs and its tick. */
const row = (set: string) =>
  within(
    screen.getByRole("spinbutton", { name: `${set} weight` }).parentElement!
  );
const tick = (set: string) =>
  fireEvent.click(row(set).getByRole("button", { name: "Mark set complete" }));
const done = (set: string) =>
  row(set).queryByRole("button", { name: "Mark set complete" }) === null;

beforeEach(() => {
  vi.clearAllMocks();
  h.save.mockReturnValue(true);
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a set far past today's plan", () => {
  it("asks before it logs, and Change it leaves the set to fix", async () => {
    openSession();
    typeWeight("Set 1", 125);
    tick("Set 1");
    const question = await screen.findByRole("alertdialog", {
      name: "125 kg?",
    });
    expect(question).toHaveTextContent("Today's plan is 12.5 kg.");
    fireEvent.click(screen.getByRole("button", { name: "Change it" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("alertdialog")).toBeNull()
    );
    expect(done("Set 1")).toBe(false);
    typeWeight("Set 1", 12.5);
    tick("Set 1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(done("Set 1")).toBe(true);
  });

  it("logs it on a yes, and the session hands the plan that weight", async () => {
    const complete = openSession();
    tick("Warm-up 1");
    tick("Warm-up 2");
    typeWeight("Set 1", 125);
    tick("Set 1");
    fireEvent.click(await screen.findByRole("button", { name: "Log 125 kg" }));
    await vi.waitFor(() => expect(done("Set 1")).toBe(true));
    // Said once for the lift: the next set at that weight logs.
    typeWeight("Set 2", 125);
    tick("Set 2");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save workout" })
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(
      complete.mock.calls[0][1].setLogs[0].filter((set) => set.weight === 125)
    ).toMatchObject([{ completed: true }, { completed: true }]);
  });

  it("logs a heavier set within twice the plan without asking", () => {
    openSession();
    typeWeight("Set 1", 25);
    tick("Set 1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(done("Set 1")).toBe(true);
  });

  it("asks again when a done set is edited past the plan", async () => {
    openSession();
    tick("Set 1");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit completed set 1" })
    );
    fireEvent.change(await screen.findByLabelText("Weight (kg)"), {
      target: { value: "125" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("125 kg?")).toBeInTheDocument();
    expect(screen.getByText("Today's plan is 12.5 kg.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log 125 kg" }));
    await vi.waitFor(() =>
      expect(screen.queryByLabelText("Weight (kg)")).toBeNull()
    );
    expect(
      screen.getByRole("spinbutton", { name: "Set 1 weight" })
    ).toHaveValue(125);
  });
});
