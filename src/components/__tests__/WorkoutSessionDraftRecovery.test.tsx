import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Workout } from "@/lib/savedWorkouts";
import { resetFirestore, readDoc } from "@/test/firestoreHarness";

const h = vi.hoisted(() => ({
  user: { uid: "strength-audit" },
  error: vi.fn(),
  success: vi.fn(),
  message: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: h.user } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: h.user,
    profile: {
      uid: h.user.uid,
      weight: 80,
      experience: "beginner",
      autoRestTimer: false,
    },
  }),
  useUidForStorageKey: () => h.user.uid,
  useUid: () => h.user.uid,
}));
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({ awardEventBadge: vi.fn(), awardEventBadges: vi.fn() }),
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
  toast: { error: h.error, success: h.success, message: h.message },
}));
vi.mock("@/lib/restTimerNotification", () => ({
  restNotificationDelaySeconds: () => 0,
  scheduleRestEndNotification: vi.fn(),
  cancelRestEndNotification: vi.fn(),
}));
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
vi.mock("@/components/workout/PlateCalculatorSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: () => null,
}));

import WorkoutSession from "@/components/WorkoutSession";
import { completeLift } from "@/lib/liftCompletion";

const day: ComponentProps<typeof WorkoutSession>["day"] = {
  dayName: "Audit strength",
  dayType: "upper",
  completed: false,
  exercises: [
    {
      exerciseId: "audit-press",
      instanceId: "audit-press-1",
      name: "Audit press",
      movementCategory: "horizontal_push",
      sets: 3,
      reps: 8,
      weight: 0,
      restSeconds: 0,
      progressionType: "linear",
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
      consecutiveFailures: 0,
      plateauCount: 0,
      performanceHistory: [],
      lastPerformance: { sets: 3, reps: 8, weight: 0, completed: false },
    },
  ],
};
const props = {
  day,
  dayIndex: -1,
  draftScope: "routine:audit",
  draftEpoch: 0,
  onClose: vi.fn(),
  onCompleteDay: vi.fn<ComponentProps<typeof WorkoutSession>["onCompleteDay"]>(
    async (_index, done) =>
      completeLift({
        uid: h.user.uid,
        author: {},
        source: "routine",
        completionId: done.completionId,
        startedAt: done.startedAt,
        ran: done.prescription?.exercises ?? day.exercises,
        setLogs: done.setLogs,
        exerciseNotes: done.exerciseNotes,
        durationMinutes: done.durationMinutes,
        bodyweightKg: 80,
        title: day.dayName,
        notes: day.dayName,
      })
  ),
};
async function open(
  overrides: Partial<ComponentProps<typeof WorkoutSession>> = {}
) {
  let session: ReturnType<typeof render>;
  await act(async () => {
    session = render(<WorkoutSession {...props} {...overrides} />);
  });
  return session!;
}
function draft() {
  const key = Object.keys(localStorage).find((key) =>
    key.startsWith("tropos_workout_draft:v2:")
  );
  return key ? JSON.parse(localStorage.getItem(key)!) : null;
}
async function finishRemaining() {
  for (const button of screen.queryAllByRole("button", {
    name: "Mark set complete",
  }))
    fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible()
  );
  fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Done" })).toBeVisible()
  );
  const done = props.onCompleteDay.mock.calls.at(-1)![1];
  const saved = readDoc(
    `users/${h.user.uid}/workouts/routine-${done.completionId}`
  );
  expect(saved).toBeDefined();
  return saved as unknown as Workout;
}
beforeEach(() => {
  cleanup();
  localStorage.clear();
  resetFirestore();
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

it("requires an explicit recovery choice and safely leaves the workout on modal dismissal", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
  session.unmount();
  const preserved = draft();
  const onClose = vi.fn(() => resumed.unmount());
  const resumed = await open({ onClose });

  const prompt = screen.getByRole("dialog", { name: "Resume workout?" });
  expect(prompt).toHaveAttribute("aria-modal", "true");
  expect(prompt).toHaveAccessibleDescription(
    "You left this workout in progress earlier."
  );
  expect(within(prompt).getByRole("button", { name: "Resume" })).toHaveFocus();
  // Mount refreshes the checkpoint timestamp without changing the workout.
  expect(draft()).toEqual({ ...preserved, savedAt: expect.any(Number) });
  const beforeDismissal = draft();

  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(draft()).toEqual(beforeDismissal);
  expect(props.onCompleteDay).not.toHaveBeenCalled();
});

/* Close keeps a workout that has a draft, and says so: Home and Train
   offer it back with Resume, which carries on without asking again. */
it("says the workout is kept when it is closed with a set done, and only then", async () => {
  const onClose = vi.fn();
  const fresh = await open({ onClose });
  fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(h.message).not.toHaveBeenCalled();
  fresh.unmount();

  const session = await open({ onClose });
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
  expect(h.message).toHaveBeenCalledWith("Workout kept", {
    description: "Open this routine again to carry on.",
  });
  expect(draft()?.setLogs[0][0].completed).toBe(true);
  session.unmount();

  // A programme day's workout comes back from Home or Train.
  h.message.mockClear();
  await open({ onClose, draftScope: "programme", dayIndex: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
  expect(h.message).toHaveBeenCalledWith("Workout kept", {
    description: "Resume it from Home or Train.",
  });
});

it("opened from Resume, carries on with the draft without asking", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
  session.unmount();
  await open({ resumeDraft: true });
  expect(
    screen.queryByRole("dialog", { name: "Resume workout?" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Edit completed set 1" })
  ).toBeInTheDocument();
});

it("control: a corrected completed set survives real remount and reaches the actual saved workout", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Edit completed set 1" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].reps).toBe(6));
  session.unmount();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toBeDisabled();
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue(6);
  const saved = await finishRemaining();
  expect(
    saved.exercises[0].sets.map((set: { reps: number }) => set.reps)
  ).toEqual([6, 8, 8]);
  expect(draft()).toBeNull();
});

it("undoing the only completed set must not resurrect that unperformed set in the saved workout after interruption", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toBeEnabled();
  session.unmount();
  await open();
  const resumed = screen.queryByRole("button", { name: "Resume" });
  if (resumed) fireEvent.click(resumed);
  // Perform only sets 2 and 3: set 1 was explicitly undone and never done.
  for (const index of [1, 2]) {
    const row = document.querySelector<HTMLElement>(
      `[data-set-row="${index}"]`
    )!;
    fireEvent.click(
      within(row).getByRole("button", {
        name: "Mark set complete",
      })
    );
  }
  const finish = screen.queryByRole("button", {
    name: "Finish workout",
  });
  if (finish) fireEvent.click(finish);
  const saved = await finishRemaining();
  expect(saved.exercises[0].sets).toHaveLength(2);
});

it("counter-control: Undo persists correctly while a different completed set remains", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Complete set 2" }));
  await waitFor(() =>
    expect(
      draft()?.setLogs[0].filter((set: { completed: boolean }) => set.completed)
    ).toHaveLength(2)
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
  await waitFor(() =>
    expect(
      draft()?.setLogs[0].map((set: { completed: boolean }) => set.completed)
    ).toEqual([true, false, false])
  );
  session.unmount();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toBeDisabled();
  expect(screen.getByRole("spinbutton", { name: "Set 2 reps" })).toBeEnabled();
});

it("keeps entered values after undoing the last completion, and Start fresh still retires that draft", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 weight" }), {
    target: { value: "12.5" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 reps" }), {
    target: { value: "6" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Exercise notes" }), {
    target: { value: "Machine pin 4" },
  });
  session.unmount();
  const resumed = await open();
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toBeEnabled();
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue(6);
  expect(screen.getByRole("spinbutton", { name: "Set 1 weight" })).toHaveValue(
    12.5
  );
  expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveValue(
    "Machine pin 4"
  );
  resumed.unmount();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
  expect(draft()).toBeNull();
  expect(screen.getByRole("spinbutton", { name: "Set 1 weight" })).toHaveValue(
    null
  );
  expect(
    screen.getByRole("spinbutton", { name: "Set 1 weight" })
  ).toHaveAttribute("placeholder", "0");
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue(8);
  expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveValue(
    ""
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 reps" }), {
    target: { value: "7" },
  });
  expect(draft()).toBeNull();
});
