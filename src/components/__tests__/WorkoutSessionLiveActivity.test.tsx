/**
 * What the real session screen hands the lift's Live Activity (Wid2 call
 * 2): the day's name, the lead lift's drawing, and the set the cursor is
 * on as the card words it, from the first set to the finish, which takes
 * the card away (call 4). The card itself is `liftLiveActivity.test.ts`'s.
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
  user: null as { uid: string } | null,
  load: vi.fn(() => null),
  save: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: null }),
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
const cards = vi.hoisted(() => [] as unknown[]);
vi.mock("@/hooks/useLiftLiveActivity", () => ({
  useLiftLiveActivity: (card: unknown) => {
    cards.push(card);
  },
}));
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
    // Both lifts here are loaded, and a loaded lift can't be ticked at 0 kg.
    weight: 15,
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
      planLifts={[
        { exerciseId: "bench-press", instanceId: "bench-1" },
        { exerciseId: "bench-press", instanceId: "bench-light" },
      ]}
      dayIndex={0}
      onCompleteDay={complete}
      onClose={vi.fn()}
    />
  );
  return complete;
}

/** Every set the current exercise has left. */
function completeCurrent() {
  for (;;) {
    const open = screen.queryAllByRole("button", {
      name: "Mark set complete",
    });
    const enabled = open.filter((b) => !(b as HTMLButtonElement).disabled);
    if (enabled.length === 0) return;
    fireEvent.click(enabled[0]);
    // A tick the validator refuses leaves the box: fail rather than spin.
    if (
      enabled[0].isConnected &&
      enabled[0].getAttribute("aria-label") === "Mark set complete"
    )
      throw new Error("A set did not complete");
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  cards.length = 0;
  h.user = null;
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

/** The card the screen asked for last. */
const lastCard = () => cards.at(-1) as Record<string, unknown> | null;

describe("the lift's Live Activity", () => {
  it("starts on the first set, with the day's name and its lead lift's drawing", () => {
    openSession();
    expect(lastCard()).toEqual({
      name: "Push",
      // The bench press leads the day and has a flipbook.
      art: "bench-press",
      set: {
        exerciseName: "Bench Press",
        setLabel: "Set 1 of 2",
        load: "15 kg × 8",
        fact: "1/2",
      },
      setsDone: 0,
    });
  });

  it("moves to the next set as one is ticked", () => {
    openSession();
    const tick = screen.getAllByRole("button", { name: "Mark set complete" });
    fireEvent.click(tick[0]);
    expect(lastCard()).toMatchObject({
      set: { exerciseName: "Bench Press", setLabel: "Set 2 of 2", fact: "2/2" },
      setsDone: 1,
    });
  });

  it("goes the moment the workout reaches its finish", async () => {
    openSession();
    completeCurrent();
    completeCurrent();
    await screen.findByRole("button", { name: "Save workout" });
    expect(lastCard()).toBeNull();
  });
});
