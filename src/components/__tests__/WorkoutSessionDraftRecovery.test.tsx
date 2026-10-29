import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode, useState, type ComponentProps } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { BackDismissProvider } from "@/lib/BackDismissProvider";
import { useBackDismiss, useBackDismissController } from "@/lib/backDismiss";
import type { Workout } from "@/lib/savedWorkouts";
import {
  resetFirestore,
  readDoc,
  seedFirestore,
} from "@/test/firestoreHarness";

const h = vi.hoisted(() => ({
  user: { uid: "strength-audit" },
  signedIn: true,
  error: vi.fn(),
  success: vi.fn(),
  message: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.signedIn ? h.user : null;
    },
  },
}));
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
import Routine from "@/pages/Routine";
import { completeLift } from "@/lib/liftCompletion";
import { listWorkoutDrafts } from "@/hooks/useWorkoutDraft";
import { resumableWorkout, routineInProgress } from "@/lib/sessionsInFlight";
import { sessionDayContext } from "@/features/program/sessionDay";

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
  h.signedIn = true;
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

/* Leaving keeps a workout that has a draft, and says so: Home and Train
   offer it back with Resume, a programme day's and a routine's alike,
   which carries on without asking again. */
const KEPT = [
  "Workout kept",
  { description: "Resume it from Home or Train." },
] as const;
/** Open the workout as a page does: leaving it takes the screen away. */
async function openLeaving(
  overrides: Partial<ComponentProps<typeof WorkoutSession>> = {}
) {
  const view: { current?: ReturnType<typeof render> } = {};
  view.current = await open({
    ...overrides,
    onClose: () => view.current?.unmount(),
  });
}
/** The "Workout kept" toasts so far. */
function keptSaid() {
  return h.message.mock.calls.filter(([title]) => title === "Workout kept");
}
/** Let what the screen says as it goes land. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function doFirstSet() {
  fireEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
  await waitFor(() => expect(draft()?.setLogs[0][0].completed).toBe(true));
}

it("says the workout is kept when it is closed with a set done, and only then", async () => {
  await openLeaving();
  fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
  await settle();
  expect(screen.queryByRole("button", { name: "Close workout" })).toBeNull();
  expect(keptSaid()).toEqual([]);

  await openLeaving();
  await doFirstSet();
  fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
  await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
  expect(draft()?.setLogs[0][0].completed).toBe(true);

  // A programme day's workout says the same.
  h.message.mockClear();
  await openLeaving({ draftScope: "programme", dayIndex: 0 });
  await doFirstSet();
  fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
  await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
});

describe("every way out of a kept workout says so, once", () => {
  let back: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    window.history.replaceState({}, "", "/program");
    // The browser answers the provider's own Back with a popstate, which
    // it must not take for the person's.
    back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() =>
        window.dispatchEvent(new PopStateEvent("popstate"))
      );
  });
  afterEach(() => back.mockRestore());

  /** Train: the session is opened over the page, and Back closes it. */
  function Train(sessionProps: Partial<ComponentProps<typeof WorkoutSession>>) {
    const [open, setOpen] = useState(true);
    const close = () => setOpen(false);
    useBackDismiss(open, close);
    const { dispatchBack } = useBackDismissController();
    return (
      <>
        {/* What the Android back button calls. */}
        <button type="button" onClick={() => dispatchBack()}>
          Android back
        </button>
        {open ? (
          <WorkoutSession
            {...props}
            draftScope="programme"
            dayIndex={0}
            {...sessionProps}
            onClose={close}
          />
        ) : (
          <p>Train</p>
        )}
      </>
    );
  }
  async function openTrain() {
    await act(async () => {
      render(
        <BackDismissProvider>
          <Train />
        </BackDismissProvider>
      );
    });
  }

  it("Train's Back in the browser", async () => {
    await openTrain();
    await doFirstSet();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText("Train")).toBeInTheDocument();
    await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
    await settle();
    expect(keptSaid()).toHaveLength(1);
  });

  it("Close, which goes back over its own history entry", async () => {
    await openTrain();
    await doFirstSet();
    fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
    expect(await screen.findByText("Train")).toBeInTheDocument();
    await waitFor(() => expect(back).toHaveBeenCalledOnce());
    await settle();
    expect(keptSaid()).toEqual([KEPT]);
  });

  it("the Android back button", async () => {
    await openTrain();
    await doFirstSet();
    fireEvent.click(screen.getByRole("button", { name: "Android back" }));
    expect(await screen.findByText("Train")).toBeInTheDocument();
    await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
  });

  it("Back from a routine's page, which leaves the page", async () => {
    function DeviceBack() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(-1)}>
          Device back
        </button>
      );
    }
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/program", "/routine/audit"]}>
          <DeviceBack />
          <Routes>
            <Route path="/program" element={<p>Train</p>} />
            <Route
              path="/routine/:routineId"
              element={<WorkoutSession {...props} />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
    await doFirstSet();
    fireEvent.click(screen.getByRole("button", { name: "Device back" }));
    expect(await screen.findByText("Train")).toBeInTheDocument();
    await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
  });

  it("nothing for a workout finished, or started afresh with nothing done", async () => {
    await openLeaving();
    await doFirstSet();
    await finishRemaining();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(keptSaid()).toEqual([]);

    // Kept, then opened again and started afresh.
    const first = await open();
    await doFirstSet();
    first.unmount();
    await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
    h.message.mockClear();
    await openLeaving();
    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(draft()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Close workout" })).toBeNull();
    expect(keptSaid()).toEqual([]);
  });

  it("nothing on opening a kept workout, though development sets every effect up twice", async () => {
    const first = await open();
    await doFirstSet();
    first.unmount();
    await waitFor(() => expect(keptSaid()).toHaveLength(1));
    h.message.mockClear();

    let resumed: ReturnType<typeof render>;
    await act(async () => {
      resumed = render(
        <StrictMode>
          <WorkoutSession {...props} resumeDraft />
        </StrictMode>
      );
    });
    await settle();
    expect(
      screen.getByRole("button", { name: "Edit completed set 1" })
    ).toBeInTheDocument();
    expect(keptSaid()).toEqual([]);
    resumed!.unmount();
    await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
  });

  it("nothing once the account has signed out", async () => {
    const first = await open();
    await doFirstSet();
    h.signedIn = false;
    first.unmount();
    await settle();
    expect(draft()?.setLogs[0][0].completed).toBe(true);
    expect(keptSaid()).toEqual([]);
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

it("keeps entered values before completing the first set", async () => {
  const session = await open();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 weight" }), {
    target: { value: "12.5" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 reps" }), {
    target: { value: "6" },
  });
  await waitFor(() => expect(draft()?.setLogs[0][0].weight).toBe(12.5));
  expect(draft().setLogs[0][0]).toMatchObject({ reps: 6, completed: false });
  session.unmount();
  await open({ resumeDraft: true });
  expect(screen.getByRole("spinbutton", { name: "Set 1 weight" })).toHaveValue(
    12.5
  );
  expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue(6);
  expect(screen.queryByRole("dialog", { name: "Resume workout?" })).toBeNull();
});

it("keeps a note entered before completing any set", async () => {
  const session = await open();
  fireEvent.change(screen.getByRole("textbox", { name: "Exercise notes" }), {
    target: { value: "Rack pin 4" },
  });
  await waitFor(() => expect(draft()?.exerciseNotes[0]).toBe("Rack pin 4"));
  session.unmount();
  await open({ resumeDraft: true });
  expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveValue(
    "Rack pin 4"
  );
});

it("keeps an added set before completing any set", async () => {
  const session = await open();
  fireEvent.click(screen.getByRole("button", { name: "Add set" }));
  await waitFor(() => expect(draft()?.setLogs[0]).toHaveLength(4));
  session.unmount();
  await open({ resumeDraft: true });
  expect(screen.getByRole("spinbutton", { name: "Set 4 reps" })).toHaveValue(8);
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
  await waitFor(() => expect(draft()?.setLogs[0][0].reps).toBe(7));
});

/* A routine's workout under way. Home's and Train's strip offers it from
   the draft the routine's page kept, and its Resume opens the page, which
   carries on without asking again. The page and the reader both build the
   session from `routineSession.ts`; this pins that they agree. */
describe("a routine's workout, resumed from the In progress strip", () => {
  const ROUTINE = {
    name: "Audit routine",
    sourceActivityId: "a1",
    sourceAuthorId: h.user.uid,
    sourceAuthorName: "Me",
    exercises: [
      {
        name: "Audit press",
        exerciseId: "audit-press",
        summary: "3×8",
        setCount: 3,
        targetReps: 8,
        targetWeightKg: 0,
      },
    ],
  };
  function Address() {
    const { pathname, search } = useLocation();
    return <p data-testid="address">{pathname + search}</p>;
  }
  async function openRoutinePage(at: string) {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/", at]}>
          <Address />
          <Routes>
            <Route path="/" element={<p>Home</p>} />
            <Route path="/program" element={<p>Train</p>} />
            <Route path="/routine/:routineId" element={<Routine />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await screen.findByRole("button", { name: "Close workout" });
  }
  /** What Home and Train offer from the drafts on this phone. */
  function offered() {
    const workout = resumableWorkout(
      listWorkoutDrafts(h.user.uid),
      null,
      sessionDayContext(null, null),
      new Map([["r1", { id: "r1", ...ROUTINE }]])
    );
    return workout?.kind === "routine" ? routineInProgress(workout) : null;
  }

  beforeEach(() => {
    seedFirestore({ [`users/${h.user.uid}/savedRoutines/r1`]: ROUTINE });
  });

  it("carries on with the routine's draft without asking, and takes the flag off the address", async () => {
    await openRoutinePage("/routine/r1");
    expect(offered()).toBeNull();
    await doFirstSet();
    fireEvent.click(screen.getByRole("button", { name: "Close workout" }));
    expect(await screen.findByText("Train")).toBeInTheDocument();
    await waitFor(() => expect(keptSaid()).toEqual([KEPT]));
    cleanup();

    const strip = offered();
    expect(strip).toEqual({
      sport: "lift",
      name: "Audit routine",
      sets: 1,
      elapsedSeconds: expect.any(Number),
      resumeTarget: "/routine/r1?resume=1",
    });

    await openRoutinePage(strip!.resumeTarget);
    expect(
      screen.queryByRole("dialog", { name: "Resume workout?" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit completed set 1" })
    ).toBeInTheDocument();
    // A reload or a Back to the page asks again.
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent(/^\/routine\/r1$/)
    );
  });

  it("opened from the routine's own row instead, asks first", async () => {
    await openRoutinePage("/routine/r1");
    await doFirstSet();
    cleanup();
    expect(offered()).not.toBeNull();

    await openRoutinePage("/routine/r1");
    expect(
      screen.getByRole("dialog", { name: "Resume workout?" })
    ).toBeInTheDocument();
  });
});
