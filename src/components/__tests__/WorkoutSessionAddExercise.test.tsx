/**
 * "Add exercise" in a session (Mob1 call 1), through the real session
 * screen: an exercise added today joins the end of the session with its
 * role's numbers, is saved with it, and stands outside the plan, so the
 * progression baseline the plan is moved against is the plan's alone.
 * A session that starts with no exercises opens on Add exercise.
 */
import {
  deferReads,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
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
import { localDateString } from "@/lib/dateHelpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { ComponentProps } from "react";
import type { LiftCompletionReceipt } from "@/lib/liftCompletion";

const h = vi.hoisted(() => ({
  load: vi.fn((): unknown => null),
  save: vi.fn(),
  clear: vi.fn(),
  user: null as { uid: string } | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: null }),
  useUidForStorageKey: () => "test",
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));
vi.mock("firebase/firestore");
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({
    awardEventBadge: vi.fn(),
    awardEventBadges: vi.fn(),
  }),
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
/* The exercise list is its own component, with its own tests; here it
   only has to hand back what was ticked. */
vi.mock("@/components/program/ExercisePicker", () => ({
  default: (props: {
    headerTitle?: string;
    pickAction?: string;
    onSelect: (exercise: { id: string; name: string }) => void;
    onMultiSelect?: (exercises: { id: string; name: string }[]) => void;
    onClose: () => void;
  }) => (
    <div
      role="dialog"
      aria-label={props.headerTitle}
      data-pick-action={props.pickAction}
    >
      <button
        type="button"
        onClick={() => {
          // As the picker does: hand back what was ticked, then close.
          props.onMultiSelect?.([
            { id: "lateral-raise", name: "Lateral Raise" },
          ]);
          props.onClose();
        }}
      >
        Pick Lateral Raise
      </button>
    </div>
  ),
}));
import WorkoutSession from "../WorkoutSession";
import { WORKOUT } from "@/test/journeyScreens";
import { roleRepsFor } from "@/features/program/roleTable";

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

function openSession(exercises?: ProgramExercise[]) {
  const complete = vi.fn<CompleteDay>(async () => receipt());
  render(
    <WorkoutSession
      day={{
        dayName: "Push",
        dayType: "upper",
        completed: false,
        exercises: exercises ?? [
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
/** Opens an exercise's menu, which loads on its first opening. */
const menu = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: `More for ${name}` }));
  await screen.findByRole("dialog");
};

/** Adds a lateral raise through the session's own Add exercise. */
async function addLateralRaise() {
  fireEvent.click(screen.getByRole("button", { name: WORKOUT.addExercise }));
  const picker = await screen.findByRole("dialog", {
    name: WORKOUT.addExercise,
  });
  // The picker's add mode, not a swap's one-exercise mode.
  expect(picker).not.toHaveAttribute("data-pick-action");
  fireEvent.click(screen.getByRole("button", { name: "Pick Lateral Raise" }));
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** Every set the session has left, filling any blank weight first. */
function completeAll() {
  for (let guard = 0; guard < 50; guard++) {
    for (const field of screen.queryAllByRole("spinbutton", {
      name: /weight$/,
    }) as HTMLInputElement[])
      if (!field.value && !field.disabled)
        fireEvent.change(field, { target: { value: "10" } });
    const open = screen
      .queryAllByRole("button", { name: WORKOUT.markSet })
      .filter((b) => !(b as HTMLButtonElement).disabled);
    if (open.length === 0) {
      const next = screen.queryByRole("button", { name: "Next exercise" });
      if (!next) return;
      fireEvent.click(next);
      continue;
    }
    fireEvent.click(open[0]);
  }
  throw new Error("The session did not finish");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.load.mockReturnValue(null);
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

const raiseRole = roleRepsFor(
  "general",
  { exerciseId: "lateral-raise" },
  "beginner"
);

describe("Add exercise", () => {
  it("adds an exercise for today, with its role's numbers, and moves to it", async () => {
    openSession();
    await addLateralRaise();
    expect(heading()).toBe("Lateral Raise");
    expect(
      screen.getByRole("button", { name: "Lateral Raise" })
    ).toBeInTheDocument();
    // Its role's working sets and reps, not Train's old 3 × 10.
    expect(
      screen.getByText(new RegExp(`^Target: ${raiseRole.sets}×`))
    ).toBeInTheDocument();
  });

  it("saves the added exercise with the session and leaves it out of the plan's baseline", async () => {
    const complete = openSession();
    await addLateralRaise();
    completeAll();
    fireEvent.click(await screen.findByRole("button", { name: WORKOUT.save }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const data = complete.mock.calls[0][1];
    const prescription = data.prescription!;
    expect(prescription.exercises.map((ex) => ex.exerciseId)).toEqual([
      "bench-press",
      "cable-fly",
      "lateral-raise",
    ]);
    // Its own slot, which no plan day holds.
    expect(prescription.exercises[2].instanceId).not.toMatch(/^(bench|fly)-1$/);
    expect(prescription.progressionBaseline.map((ex) => ex.instanceId)).toEqual(
      ["bench-1", "fly-1"]
    );
    // Its working sets, done (warm-ups never reach the save).
    expect(data.setLogs[2]).toHaveLength(raiseRole.sets);
    expect(data.setLogs[2].every((set) => set.completed)).toBe(true);
    // Not a swap: Finish has nothing to ask about it.
    expect(prescription.swaps ?? []).toEqual([]);
  });

  it("offers no swap for an added exercise, which stands in for nothing", async () => {
    openSession();
    await addLateralRaise();
    await menu("Lateral Raise");
    expect(
      screen.queryByRole("button", { name: /^Swap for today/ })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Skip today" })
    ).toBeInTheDocument();
  });

  it("a session with no exercises opens on Add exercise and grows from there", async () => {
    const complete = openSession([]);
    expect(await screen.findByText("No exercises yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: WORKOUT.markSet })).toBeNull();
    await addLateralRaise();
    expect(heading()).toBe("Lateral Raise");
    completeAll();
    fireEvent.click(await screen.findByRole("button", { name: WORKOUT.save }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const data = complete.mock.calls[0][1];
    expect(data.prescription!.exercises).toHaveLength(1);
    expect(data.prescription!.progressionBaseline).toEqual([]);
    expect(data.setLogs).toHaveLength(1);
  });
});

describe("Start fresh", () => {
  const BENCH = lift({
    exerciseId: "bench-press",
    name: "Bench Press",
    instanceId: "bench-1",
  });
  const FLY = lift({
    exerciseId: "cable-fly",
    name: "Cable Fly",
    instanceId: "fly-1",
  });
  const RAISE = lift({
    exerciseId: "lateral-raise",
    name: "Lateral Raise",
    instanceId: "today-1",
  });
  const row = (completed: boolean) => ({
    reps: 8,
    weight: 15,
    completed,
    type: "working" as const,
  });
  /** A kept session that grew: a raise added today, in a superset with
   *  the fly, a set of each done and a note on the raise. */
  const grownDraft = (planned: ProgramExercise[]) => ({
    dayIndex: 0,
    dayName: "Push",
    setLogs: [...planned, RAISE].map(() => [row(true), row(false)]),
    exerciseNotes: { [planned.length]: "Seat at 4" },
    elapsedSeconds: 600,
    currentExIndex: planned.length,
    savedAt: Date.now(),
    identity: "test",
    completionId: "test",
    completionCommandId: "test",
    prescription: {
      dayName: "Push",
      exercises: [...planned, RAISE],
      progressionBaseline: planned,
      supersets: planned.length
        ? [{ ids: [planned[planned.length - 1].instanceId!, "today-1"] }]
        : [],
    },
  });

  it("starts the day as it was set out: no added exercise, no superset, no sets or notes", async () => {
    h.load.mockReturnValue(grownDraft([BENCH, FLY]));
    const complete = openSession([BENCH, FLY]);
    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(screen.queryByRole("button", { name: /^Lateral Raise/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cable Fly" }));
    expect(screen.queryByText(/^Superset with/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveValue(
      ""
    );
    completeAll();
    fireEvent.click(await screen.findByRole("button", { name: WORKOUT.save }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const data = complete.mock.calls[0][1];
    expect(data.prescription!.exercises.map((ex) => ex.instanceId)).toEqual([
      "bench-1",
      "fly-1",
    ]);
    expect(data.prescription!.supersets ?? []).toEqual([]);
    expect(data.setLogs).toHaveLength(2);
    expect(data.exerciseNotes).toEqual({});
  });

  it("an empty workout starts empty again", async () => {
    h.load.mockReturnValue(grownDraft([]));
    openSession([]);
    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(await screen.findByText("No exercises yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: WORKOUT.markSet })).toBeNull();
  });
});

describe("keeping a session that has grown", () => {
  it("keeps an empty workout's added exercise before any set is done", async () => {
    openSession([]);
    await screen.findByText("No exercises yet");
    expect(h.save).not.toHaveBeenCalled();
    await addLateralRaise();
    await vi.waitFor(() => expect(h.save).toHaveBeenCalled());
    const kept = h.save.mock.calls.at(-1)![0] as {
      prescription: { exercises: { exerciseId: string }[] };
      setLogs: { completed: boolean }[][];
    };
    expect(kept.prescription.exercises.map((ex) => ex.exerciseId)).toEqual([
      "lateral-raise",
    ]);
    expect(kept.setLogs.flat().some((set) => set.completed)).toBe(false);
  });

  it("keeps a superset made before any set is done", async () => {
    openSession([
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
    ]);
    expect(h.save).not.toHaveBeenCalled();
    await menu("Bench Press");
    fireEvent.click(
      screen.getByRole("button", { name: "Superset with Cable Fly" })
    );
    await vi.waitFor(() =>
      expect(h.save).toHaveBeenCalledWith(
        expect.objectContaining({
          prescription: expect.objectContaining({
            supersets: [{ ids: ["bench-1", "fly-1"] }],
          }),
        })
      )
    );
  });
});

describe("an exercise added before last time is read", () => {
  it("starts from the weight it was last lifted at once last time arrives", async () => {
    h.user = { uid: "u1" };
    seedFirestore({
      "users/u1/workouts/old": {
        date: localDateString(new Date(Date.now() - 7 * 86_400_000)),
        completionId: "old",
        notes: "Push",
        totalCalories: 0,
        durationMinutes: 40,
        exercises: [
          {
            exerciseId: "lateral-raise",
            exerciseName: "Lateral Raise",
            category: "vertical_push",
            caloriesBurned: 0,
            sets: [1, 2, 3].map((setNumber) => ({
              setNumber,
              reps: 14,
              weightKg: 9,
              type: "working",
            })),
          },
        ],
      },
    });
    // The read of last time is still out when the raise is added.
    deferReads();
    openSession();
    await addLateralRaise();
    const firstSet = () =>
      screen.getByRole("spinbutton", { name: "Set 1 weight" });
    expect(firstSet()).not.toHaveValue(9);
    resumeReads();
    await act(async () => {
      releaseAllReads();
    });
    await vi.waitFor(() => expect(firstSet()).toHaveValue(9));
    // The exercise follows it too, as one added after the read does.
    expect(screen.getByText(/^Target: .*@ 9 kg$/)).toBeInTheDocument();
  });
});
