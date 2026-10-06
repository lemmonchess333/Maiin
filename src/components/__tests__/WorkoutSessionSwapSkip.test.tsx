/**
 * "Swap for today" and "Skip" in each exercise's menu, and the one question
 * Finish asks about a swap (Lift4 (11)), through the real session screen.
 * What the plan does with the answer is `sessionSwapCompletion.test.ts`'s.
 */
import { resetFirestore } from "@/test/firestoreHarness";
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: () => null,
}));
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
/* The exercise list is its own component, with its own tests; here it
   only has to hand back a choice. */
vi.mock("@/components/program/ExercisePicker", () => ({
  default: (props: {
    headerTitle?: string;
    pickAction?: string;
    onSelect: (exercise: { id: string; name: string }) => void;
  }) => (
    <div
      role="dialog"
      aria-label={props.headerTitle}
      data-pick-action={props.pickAction}
    >
      <button
        type="button"
        onClick={() =>
          props.onSelect({ id: "db-bench", name: "Dumbbell Bench Press" })
        }
      >
        Pick Dumbbell Bench Press
      </button>
    </div>
  ),
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

const lift = (over: Partial<ProgramExercise>) =>
  ({
    sets: 2,
    reps: 8,
    weight: 0,
    restSeconds: 0,
    ...over,
  }) as ProgramExercise;

function openSession() {
  const complete = vi.fn<CompleteDay>(async () => receipt());
  render(
    <WorkoutSession
      day={{
        dayName: "Push",
        dayType: "upper",
        completed: false,
        exercises: [
          lift({
            exerciseId: "bench-press",
            name: "Bench Press",
            instanceId: "bench-1",
          }),
          lift({
            exerciseId: "cable-fly",
            name: "Cable Fly",
            instanceId: "fly-1",
          }),
        ],
      }}
      dayIndex={0}
      onCompleteDay={complete}
      onClose={vi.fn()}
    />
  );
  return complete;
}

const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
const menu = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `More for ${name}` }));
/** Picks a choice in the open sheet and waits for the sheet to close. */
const choose = async (label: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};
/** Every set the current exercise has left. */
function completeCurrent() {
  for (;;) {
    const open = screen.queryAllByRole("button", {
      name: "Mark set complete",
    });
    const enabled = open.filter((b) => !(b as HTMLButtonElement).disabled);
    if (enabled.length === 0) return;
    fireEvent.click(enabled[0]);
  }
}

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

describe("Skip", () => {
  it("leaves an exercise out of today's session and moves on", async () => {
    const complete = openSession();
    menu("Bench Press");
    await choose(/^Skip/);
    expect(heading()).toBe("Cable Fly");
    expect(
      screen.getByRole("button", { name: "Bench Press, skipped" })
    ).toBeInTheDocument();
    completeCurrent();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save workout" })
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const data = complete.mock.calls[0][1];
    expect(data.setLogs[0]).toEqual([]);
    expect(data.setLogs[1]).toHaveLength(2);
    // Nothing to ask: no swap.
    expect(data.prescription?.swaps ?? []).toEqual([]);
  });

  it("brings the sets back with Don't skip", async () => {
    openSession();
    menu("Bench Press");
    await choose(/^Skip/);
    fireEvent.click(
      screen.getByRole("button", { name: "Bench Press, skipped" })
    );
    expect(screen.getByText("Skipped today")).toBeInTheDocument();
    menu("Bench Press");
    await choose(/^Don't skip/);
    expect(screen.queryByText("Skipped today")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Mark set complete" })
    ).toHaveLength(2);
  });
});

describe("Swap for today", () => {
  async function swapBench() {
    menu("Bench Press");
    fireEvent.click(screen.getByRole("button", { name: /^Swap for today/ }));
    const pick = await screen.findByRole("button", {
      name: "Pick Dumbbell Bench Press",
    });
    // One exercise, named by the action: the picker's add-many mode read
    // "1 exercise selected — Add to workout" and swapped once per tick.
    expect(
      screen.getByRole("dialog", { name: "Swap Bench Press for today" })
    ).toHaveAttribute("data-pick-action", "Swap for today");
    fireEvent.click(pick);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(heading()).toBe("Dumbbell Bench Press");
  }

  async function finish(complete: ReturnType<typeof openSession>) {
    completeCurrent();
    completeCurrent();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save workout" })
    );
    // Finish asks before it saves.
    expect(complete).not.toHaveBeenCalled();
    expect(
      await screen.findAllByText("Keep Dumbbell Bench Press in your plan?")
    ).not.toHaveLength(0);
  }

  it("keeps the plan's lift when the answer is just for today", async () => {
    const complete = openSession();
    await swapBench();
    await finish(complete);
    fireEvent.click(screen.getByRole("button", { name: /^Just for today/ }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const prescription = complete.mock.calls[0][1].prescription!;
    expect(prescription.exercises[0]).toMatchObject({
      exerciseId: "db-bench",
      instanceId: "bench-1",
    });
    expect(prescription.progressionBaseline[0].exerciseId).toBe("bench-press");
    expect(prescription.swaps).toEqual([{ index: 0, keep: false }]);
  });

  it("carries a kept swap to the plan", async () => {
    const complete = openSession();
    await swapBench();
    await finish(complete);
    fireEvent.click(
      screen.getByRole("button", { name: /^Keep it in my plan/ })
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(complete.mock.calls[0][1].prescription!.swaps).toEqual([
      { index: 0, keep: true },
    ]);
  });

  it("goes back to the planned exercise from the same menu", async () => {
    openSession();
    await swapBench();
    menu("Dumbbell Bench Press");
    await choose(/^Back to Bench Press/);
    expect(heading()).toBe("Bench Press");
  });

  it("is offered only before a set of the exercise is done", () => {
    openSession();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
    menu("Bench Press");
    expect(
      screen.queryByRole("button", { name: /^Swap for today/ })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Leave the rest out/ })
    ).toBeInTheDocument();
  });
});
