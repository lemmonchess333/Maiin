/**
 * Supersets in a session (Mob1 call 2), through the real session screen:
 * made from an exercise's menu, logged set by set in turn (A1 → B1 → A2 →
 * B2) with the rest after the round, saved on the session's prescription,
 * and undone from the same menu. The order itself is `superset.test.ts`'s.
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
const menu = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `More for ${name}` }));

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

/** Bench press and push-ups, two sets each with a rest the timer runs, and
 *  neither with a warm-up ramp, so a set's number is the round's. */
const benchAndPushUps = () => [
  lift({
    exerciseId: "bench-press",
    name: "Bench Press",
    instanceId: "bench-1",
    restSeconds: 90,
  }),
  lift({
    exerciseId: "push-ups",
    name: "Push-Ups",
    instanceId: "push-1",
    weight: 0,
    restSeconds: 90,
  }),
];
const choose = async (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};
/** Ticks the current exercise's next set. */
const tick = () =>
  fireEvent.click(
    screen
      .getAllByRole("button", { name: WORKOUT.markSet })
      .find((b) => !(b as HTMLButtonElement).disabled)!
  );
const resting = () => screen.queryByRole("group", { name: "Rest timer" });
const counter = () =>
  screen.getByText(
    (_, el) =>
      el?.tagName === "P" &&
      /^(Set|Warm-up) \d of \d/.test(el.textContent ?? "")
  ).textContent;

describe("Supersets", () => {
  it("goes A1 → B1 → A2 → B2, resting after the round's last exercise", async () => {
    const complete = openSession(benchAndPushUps());
    menu("Bench Press");
    await choose("Superset with Push-Ups");
    expect(screen.getByText("Superset with Push-Ups")).toBeInTheDocument();

    tick(); // A1
    expect(heading()).toBe("Push-Ups");
    expect(counter()).toMatch(/^Set 1 of 2/);
    // Straight on to B: no rest inside the round.
    expect(resting()).toBeNull();

    tick(); // B1
    expect(heading()).toBe("Bench Press");
    expect(counter()).toMatch(/^Set 2 of 2/);
    expect(resting()).not.toBeNull();

    tick(); // A2: the round's rest, seen above, ends as B comes round.
    expect(heading()).toBe("Push-Ups");
    expect(counter()).toMatch(/^Set 2 of 2/);
    await vi.waitFor(() => expect(resting()).toBeNull());

    tick(); // B2: the last set, so the review opens.
    fireEvent.click(await screen.findByRole("button", { name: WORKOUT.save }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(complete.mock.calls[0][1].prescription?.supersets).toEqual([
      { ids: ["bench-1", "push-1"] },
    ]);
  });

  it("an exercise added today can join one", async () => {
    openSession(benchAndPushUps());
    await addLateralRaise();
    fireEvent.click(screen.getByRole("button", { name: "Push-Ups" }));
    menu("Push-Ups");
    await choose("Superset with Lateral Raise");
    expect(screen.getByText("Superset with Lateral Raise")).toBeInTheDocument();
  });

  it("comes apart from the same menu, back to straight sets", async () => {
    openSession(benchAndPushUps());
    menu("Bench Press");
    await choose("Superset with Push-Ups");
    menu("Bench Press");
    expect(
      screen.queryByRole("button", { name: "Superset with Push-Ups" })
    ).toBeNull();
    await choose("Remove from superset");
    expect(screen.queryByText(/^Superset with/)).toBeNull();
    tick();
    expect(heading()).toBe("Bench Press");
    expect(resting()).not.toBeNull();
  });
});
