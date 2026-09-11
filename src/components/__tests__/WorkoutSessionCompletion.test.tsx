import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
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
  message: vi.fn(),
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
  useStreaks: () => ({ awardEventBadge: vi.fn() }),
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
  toast: { error: h.error, success: h.success, message: h.message },
}));
vi.mock("@/components/workout/PlateCalculatorSheet", () => ({
  default: () => null,
}));
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
  vi.useRealTimers();
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
    expect(log).toHaveBeenCalledWith(0, 0, 8, 0, undefined, { id: "test" });
  });
});

it("a supported PR appears only on its row and Undo removes it", async () => {
  h.user = { uid: "pr-user" };
  seedFirestore({
    "users/pr-user/stats/prMap": {
      map: {
        "Test exercise": {
          "1rm": null,
          "3rm": null,
          "5rm": null,
          "8rm": { weight: 60, reps: 8, date: "2026-07-01" },
          "10rm": null,
        },
      },
      sessionCounts: { "Test exercise": 5 },
      volumeBest: {},
    },
  });
  await act(async () => {
    openSession();
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 weight" }), {
    target: { value: "62.5" },
  });
  fireEvent.click(
    screen.getAllByRole("button", { name: "Mark set complete" })[0]
  );
  expect(screen.getByText("PR")).toBeInTheDocument();
  expect(h.success).not.toHaveBeenCalled();
  expect(h.message).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
  expect(screen.queryByText("PR")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(h.success).not.toHaveBeenCalledWith("Workout saved");
    await act(async () => {
      resolveSave!();
    });
    expect(h.success).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(close).toHaveBeenCalledOnce();
    expect(h.clear).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][1].completionId).toBe(
      complete.mock.calls[1][1].completionId
    );
  });
});

async function finishAndSave(complete = vi.fn().mockResolvedValue(undefined)) {
  openSession(complete);
  for (let i = 0; i < 3; i++) {
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
  }
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save Workout" })
    ).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
}

it("keeps the recovery draft while queued, then clears it only when synced", async () => {
  let settle!: (outcome: "synced" | "failed") => void;
  const sync = new Promise<"synced" | "failed">((resolve) => {
    settle = resolve;
  });
  await finishAndSave(
    vi.fn().mockResolvedValue({ syncStatus: "queued", sync })
  );
  await vi.waitFor(() =>
    expect(
      screen.getByText("Saved on this phone · waiting to sync")
    ).toBeVisible()
  );
  expect(h.clear).not.toHaveBeenCalled();
  expect(h.save).toHaveBeenCalledWith(
    expect.objectContaining({ completionPending: true, completionId: "test" })
  );
  await act(async () => settle("synced"));
  expect(screen.getByText("Synced")).toBeVisible();
  expect(h.clear).toHaveBeenCalledWith("test");
});

it("a reconnect rejection keeps the session and retries the same completion", async () => {
  let settle!: (outcome: "synced" | "failed") => void;
  const sync = new Promise<"synced" | "failed">((resolve) => {
    settle = resolve;
  });
  const complete = vi
    .fn()
    .mockResolvedValueOnce({ syncStatus: "queued", sync })
    .mockResolvedValueOnce(undefined);
  await finishAndSave(complete);
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument()
  );
  await act(async () => settle("failed"));
  expect(
    screen.getByText("Needs attention · your session is here to retry")
  ).toBeVisible();
  expect(h.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
  await vi.waitFor(() => expect(screen.getByText("Synced")).toBeVisible());
  expect(complete.mock.calls[0][1]).toEqual(complete.mock.calls[1][1]);
});

it("never reports an offline save when recovery storage refuses the write", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  h.save.mockReturnValue(false);
  const complete = vi.fn();
  await finishAndSave(complete);
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Retry sync" })
    ).toBeInTheDocument()
  );
  expect(complete).not.toHaveBeenCalled();
  expect(h.clear).not.toHaveBeenCalled();
  expect(
    screen.queryByText("Saved on this phone · waiting to sync")
  ).not.toBeInTheDocument();
  vi.restoreAllMocks();
});

it("ignores a late completion acknowledgement after account switch", async () => {
  h.user = { uid: "outgoing-user" };
  let settle!: (outcome: "synced" | "failed") => void;
  const sync = new Promise<"synced" | "failed">((resolve) => {
    settle = resolve;
  });
  await finishAndSave(
    vi.fn().mockResolvedValue({ syncStatus: "queued", sync })
  );
  await vi.waitFor(() =>
    expect(
      screen.getByText("Saved on this phone · waiting to sync")
    ).toBeVisible()
  );
  h.user = { uid: "incoming-user" };
  await act(async () => settle("synced"));
  expect(h.clear).not.toHaveBeenCalled();
});

it("shows the previous note with its date, and reuses it only on request", async () => {
  h.user = { uid: "notes-user" };
  seedFirestore({
    "users/notes-user/workouts/previous": {
      date: "2026-09-06",
      exercises: [
        {
          exerciseId: "test",
          exerciseName: "Test exercise",
          notes: "Seat at 4",
          sets: [{ reps: 8, weightKg: 20 }],
        },
      ],
    },
  });
  await act(async () => openSession());
  expect(screen.getByText("Seat at 4")).toBeVisible();
  expect(screen.getByText(/Last note/).textContent).toContain("6 Sept 2026");
  expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveValue(
    ""
  );
  fireEvent.click(screen.getByRole("button", { name: "Use and edit note" }));
  expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveValue(
    "Seat at 4"
  );
  expect(screen.getByRole("textbox", { name: "Exercise notes" })).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", { name: "Exercise notes" }), {
    target: { value: "Seat at 5" },
  });
  expect(
    screen.queryByRole("button", { name: "Use and edit note" })
  ).not.toBeInTheDocument();
});

it("reopens an unsynced completion with its original date and retry identity", async () => {
  const startedAt = new Date("2026-09-06T12:00:00").getTime();
  h.load.mockReturnValueOnce({
    dayIndex: 0,
    dayName: "Test lift",
    identity: "test",
    completionId: "pending-original",
    completionCommandId: "pending-original",
    completionPending: true,
    startedAt,
    elapsedSeconds: 1500,
    currentExIndex: 0,
    exerciseNotes: { 0: "Seat at 4" },
    setLogs: [[{ reps: 8, weight: 20, completed: true, type: "working" }]],
  } as never);
  const complete = vi.fn().mockResolvedValue(undefined);
  openSession(complete);
  expect(screen.queryByText("Resume workout?")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
  await vi.waitFor(() => expect(screen.getByText("Synced")).toBeVisible());
  expect(complete).toHaveBeenCalledWith(
    0,
    expect.objectContaining({
      completionId: "pending-original",
      startedAt,
      durationMinutes: 25,
      exerciseNotes: { 0: "Seat at 4" },
    })
  );
});

it("recognises a server-acknowledged completion after reopening instead of writing again", async () => {
  h.user = { uid: "reopened-user" };
  h.load.mockReturnValueOnce({
    dayIndex: 0,
    dayName: "Test lift",
    identity: "test",
    completionId: "landed-original",
    completionCommandId: "landed-original",
    completionPending: true,
    elapsedSeconds: 1500,
    currentExIndex: 0,
    exerciseNotes: {},
    setLogs: [[{ reps: 8, weight: 20, completed: true, type: "working" }]],
  } as never);
  seedFirestore({
    "users/reopened-user/workouts/programme-landed-original": {
      completionId: "landed-original",
      date: "2026-09-06",
      exercises: [],
    },
  });
  const complete = vi.fn();
  await act(async () => openSession(complete));
  await vi.waitFor(() => expect(screen.getByText("Synced")).toBeVisible());
  expect(complete).not.toHaveBeenCalled();
  expect(h.clear).toHaveBeenCalledWith("landed-original");
});

describe("completed-set corrections", () => {
  it("can correct an older set after Undo expires without changing other sets", async () => {
    // Advance only Undo's timeout. Faking performance/RAF and then restoring
    // them strands Motion's shared frame loop on CI, including later tests.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    openSession();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
    await act(async () => vi.advanceTimersByTime(4100));
    vi.useRealTimers();
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Undo last set" })).toBeNull()
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit completed set 1" })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Weight (kg)" }), {
      target: { value: "12.5" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByRole("spinbutton", { name: "Set 1 weight" })
    ).toHaveValue(12.5);
    expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue(
      6
    );
    expect(
      screen.getByRole("spinbutton", { name: "Set 1 reps" })
    ).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Set 2 reps" })).toHaveValue(
      8
    );
    expect(
      screen.getByRole("spinbutton", { name: "Set 2 reps" })
    ).toBeEnabled();
  });

  it("keeps an invalid correction in the sheet and Cancel preserves the set", async () => {
    openSession();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit completed set 1" })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), {
      target: { value: "-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Reps can't be negative."
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue(
      8
    );
  });

  it("replaces the final progression result and saves the corrected workout", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    const log = openSession(complete);
    for (let i = 0; i < 3; i++)
      fireEvent.click(
        screen.getAllByRole("button", { name: "Mark set complete" })[0]
      );
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit workout" })).toBeVisible()
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit workout" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Edit completed set 3" })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith(0, 0, 6, 0, undefined, {
      id: "test",
      correction: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish workout" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(
      complete.mock.calls[0][1].setLogs[0].map(
        (set: { reps: number }) => set.reps
      )
    ).toEqual([8, 8, 6]);
    expect(screen.queryByRole("button", { name: "Edit workout" })).toBeNull();
  });
});

describe("WorkoutSession — an accidental extra set can be removed", () => {
  /* "+ Add Set" had no inverse, so a mis-tap left an uncompleted set the
     session counted as outstanding: finishing the three sets the programme
     prescribed still routed the lifter through "Finish early". */
  const rows = () => screen.getAllByLabelText(/^Set \d+ reps$/);

  /* The set-type popover is the menu each set already has; its trigger
     is the numbered badge at the head of the row. */
  it("removes the extra through the set's own menu", () => {
    openSession();
    expect(rows()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Set" }));
    expect(rows()).toHaveLength(4);

    // Open set 4's menu and remove it.
    fireEvent.click(screen.getAllByTitle("Set type: working")[3]);
    fireEvent.click(screen.getByRole("button", { name: /Remove set/i }));
    expect(rows()).toHaveLength(3);
  });

  it("does NOT offer removal on a prescribed set", () => {
    /* The boundary. Removing one of the three the programme asked for is a
       change to the prescription, not a correction of a mis-tap. */
    openSession();
    fireEvent.click(screen.getAllByTitle("Set type: working")[2]);
    expect(screen.queryByRole("button", { name: /Remove set/i })).toBeNull();
  });

  it("does NOT offer removal on a set that is not the last", () => {
    // Splicing from the middle renumbers every set after it and moves the
    // completion cursor under the lifter.
    openSession();
    fireEvent.click(screen.getByRole("button", { name: "+ Add Set" }));
    fireEvent.click(screen.getAllByTitle("Set type: working")[1]);
    expect(screen.queryByRole("button", { name: /Remove set/i })).toBeNull();
  });
});

describe("WorkoutSession — rest timer", () => {
  /* The fixture carries `restSeconds: 0` and a null profile, so every rest
     falls back to the 90s default. That makes the default the thing a leak
     would visibly overwrite. */
  const restLabel = () =>
    screen.getByRole("group", { name: "Rest timer" }).textContent ?? "";

  function startFirstRest() {
    openSession();
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
  }

  it("+15 s extends the rest in progress", () => {
    startFirstRest();
    expect(restLabel()).toContain("90");
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    expect(restLabel()).toContain("105");
  });

  it("does NOT carry the extension into the next rest", () => {
    /* The reported bug. A `manualRestRef` latched on the first "+15 s" and
       made `startRest` skip re-deriving the target, so every later rest in
       the session began at 105 — a one-off extension quietly becoming a
       preference. */
    startFirstRest();
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    expect(restLabel()).toContain("105");

    // End this rest and complete the next set: a fresh rest, fresh target.
    fireEvent.click(screen.getByRole("button", { name: "End rest" }));
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
    expect(restLabel()).toContain("90");
  });

  it("extends repeatedly within one rest — the counterweight", () => {
    // A fix that reset the target on every render would pass the test above
    // while making the button useless.
    startFirstRest();
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    expect(restLabel()).toContain("120");
  });
});

describe("WorkoutSession — timers survive a locked phone", () => {
  /* Both timers derive from a wall-clock anchor, so these tests move the
     SYSTEM CLOCK forward and then fire a single interval tick. That is what
     a backgrounded WebView does: iOS freezes the timers while real time
     keeps passing, so the ticks a counter would have accumulated never
     arrive. A test that only advanced fake timers could not tell a derived
     clock from a counted one. */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date(2026, 8, 11, 9, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  /** Jump wall time forward, then let exactly one tick repaint. */
  async function background(ms: number) {
    vi.setSystemTime(Date.now() + ms);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }

  it("the workout clock counts real time, not ticks it received", async () => {
    /* The reported case: five minutes with the screen off showed 0:01 while
       the completion screen recorded 5 minutes, because the clock counted
       interval ticks and `handleFinish` read the wall-clock anchor. */
    openSession();
    await background(5 * 60_000);
    expect(screen.getByText(/0\/3 sets · 5:0\d/)).toBeInTheDocument();
  });

  it("still advances second by second in the foreground", async () => {
    // The counterweight: a clock wired only to wall-clock jumps would pass
    // the test above while sitting frozen during an ordinary set.
    openSession();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/0\/3 sets · 0:0[23]/)).toBeInTheDocument();
  });

  it("re-arms the completion alert when an expired rest is extended", async () => {
    /* Extending an already-finished rest starts a fresh countdown. The
       chime flag stayed set from the first expiry, so the second one passed
       in silence — a timer running with no alert at the end of it. */
    const { haptic } = await import("@/lib/haptic");
    openSession();
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);

    // Run past the 90s target: the alert fires once.
    await background(95_000);
    const chime = [200, 100, 200];
    expect(haptic).toHaveBeenCalledWith(chime);
    (haptic as unknown as { mockClear: () => void }).mockClear();

    // Extend the expired rest, then run past the NEW target.
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    await background(20_000);
    expect(haptic).toHaveBeenCalledWith(chime);
  });
});
