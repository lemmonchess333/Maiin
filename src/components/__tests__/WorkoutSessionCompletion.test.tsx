import {
  seedFirestore,
  resetFirestore,
  readDoc,
} from "@/test/firestoreHarness";
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
  awardEventBadge: vi.fn(),
  awardEventBadges: vi.fn(),
  authReads: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => {
    h.authReads();
    return { user: h.user, profile: null };
  },
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
    awardEventBadge: h.awardEventBadge,
    awardEventBadges: h.awardEventBadges,
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

function openSession(
  onCompleteDay = vi.fn(),
  onClose = vi.fn(),
  exercise: Partial<ProgramExercise> = {}
) {
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
            ...exercise,
          } as ProgramExercise,
        ],
      }}
      dayIndex={0}
      onCompleteDay={onCompleteDay}
      onClose={onClose}
    />
  );
  return onCompleteDay;
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

  it("keeps completed exercises in the draft until the workout is saved", async () => {
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
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Workout" })).toBeVisible()
    );
    expect(log).not.toHaveBeenCalled();
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

it("rebuilds corrected records from full history without dropping an older valid record", async () => {
  h.user = { uid: "pr-user" };
  const path = "users/pr-user/stats/prMap";
  seedFirestore({
    [path]: {
      invalidated: true,
      revision: 3,
      map: {},
      sessionCounts: {},
      volumeBest: {},
    },
    ...Object.fromEntries(
      Array.from({ length: 55 }, (_, i) => [
        `users/pr-user/workouts/history-${i}`,
        {
          date: i < 5 ? `2025-01-0${i + 1}` : "2026-07-01",
          exercises: [
            {
              exerciseName: i < 5 ? "Test exercise" : "Other exercise",
              sets: [{ weightKg: i < 5 ? 120 : 80, reps: 8 }],
            },
          ],
        },
      ])
    ),
  });
  await act(async () => {
    openSession();
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 weight" }), {
    target: { value: "125" },
  });
  fireEvent.click(
    screen.getAllByRole("button", { name: "Mark set complete" })[0]
  );
  expect(screen.getByText("PR")).toBeInTheDocument();
  for (let i = 0; i < 2; i++)
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
  fireEvent.click(await screen.findByRole("button", { name: "Save Workout" }));
  await vi.waitFor(() => expect(readDoc(path)?.invalidated).toBe(false));
  expect(readDoc(path)).toMatchObject({
    revision: 4,
    map: {
      "Test exercise": { "8rm": { weight: 125 } },
      "Other exercise": { "8rm": { weight: 80 } },
    },
  });
});

it("an open session cannot replace records invalidated by a newer correction", async () => {
  h.user = { uid: "pr-user" };
  const path = "users/pr-user/stats/prMap";
  seedFirestore({
    [path]: {
      revision: 3,
      map: {
        "Test exercise": { "8rm": { weight: 60, reps: 8, date: "2026-07-01" } },
      },
      sessionCounts: { "Test exercise": 5 },
      volumeBest: {},
    },
  });
  await act(async () => {
    openSession();
  });
  seedFirestore({ [path]: { revision: 4, invalidated: true, map: {} } });
  for (let i = 0; i < 3; i++)
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
  fireEvent.click(await screen.findByRole("button", { name: "Save Workout" }));
  await vi.waitFor(() => expect(readDoc(path)?.revision).toBe(5));
  expect(readDoc(path)).toMatchObject({ invalidated: true, map: {} });
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
    expect(
      screen.getByRole("heading", { name: "Review workout" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    await vi.waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(
      screen.getByRole("heading", { name: "Review workout" })
    ).toBeInTheDocument();
    expect(h.clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalledWith("Workout saved");
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("heading", { name: "Review workout" })
    ).toBeInTheDocument();
    expect(h.success).not.toHaveBeenCalledWith("Workout saved");
    await act(async () => {
      resolveSave!();
    });
    expect(h.success).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Workout saved" })
    ).toBeInTheDocument();
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
    expect(screen.getByText("Waiting to sync")).toBeVisible()
  );
  expect(
    screen.getByRole("heading", { name: "Saved on this phone" })
  ).toBeInTheDocument();
  expect(h.clear).not.toHaveBeenCalled();
  expect(h.save).toHaveBeenCalledWith(
    expect.objectContaining({ completionPending: true, completionId: "test" })
  );
  await act(async () => settle("synced"));
  expect(screen.getByText("Synced")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Workout saved" })
  ).toBeInTheDocument();
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
  expect(
    screen.getByRole("heading", { name: "Review workout" })
  ).toBeInTheDocument();
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
    screen.getByRole("heading", { name: "Review workout" })
  ).toBeInTheDocument();
  expect(screen.queryByText("Waiting to sync")).not.toBeInTheDocument();
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
    expect(screen.getByText("Waiting to sync")).toBeVisible()
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
    expect(log).not.toHaveBeenCalled();
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
  /* "Add set" had no inverse, so a mis-tap left an uncompleted set the
     session counted as outstanding: finishing the three sets the programme
     prescribed still routed the lifter through "Finish early". */
  const rows = () => screen.getAllByLabelText(/^Set \d+ reps$/);

  /* The set-type popover is the menu each set already has; its trigger
     is the numbered badge at the head of the row. */
  it("removes the extra through the set's own menu", () => {
    openSession();
    expect(rows()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Add set" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Add set" }));
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

  it("ticks both displays without re-rendering the set editor or saving drafts", async () => {
    openSession();
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
    // Let mount work settle, then observe real editor renders via its auth read.
    await act(async () => {});
    h.authReads.mockClear();
    h.save.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/1\/3 sets · 0:03/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rest timer" })).toHaveTextContent(
      "87 s"
    );
    expect(h.authReads).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Set 2 reps" }), {
      target: { value: "10" },
    });
    expect(h.authReads).toHaveBeenCalled();
    expect(h.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ elapsedSeconds: 3 })
    );
  });

  it("stops paint pulses while hidden and catches up on foreground immediately", async () => {
    openSession();
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
    await act(async () => {});
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    h.authReads.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/1\/3 sets · 0:00/)).toBeInTheDocument();
    expect(h.authReads).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText(/1\/3 sets · 1:00/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rest timer" })).toHaveTextContent(
      "30 s"
    );
    hidden.mockRestore();
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

it("Undo followed by finishing early saves only the final completed work", async () => {
  const complete = vi.fn().mockResolvedValue(undefined);
  openSession(complete);
  for (let i = 0; i < 3; i++)
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Edit workout" })
    ).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit workout" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Finish early" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Review completed work" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
  await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(
    complete.mock.calls[0][1].setLogs[0].filter(
      (set: { completed: boolean }) => set.completed
    )
  ).toHaveLength(2);
  expect(complete.mock.calls[0][1].prescription.exercises[0]).toMatchObject({
    sets: 3,
    reps: 8,
    weight: 0,
  });
});

describe("Plate-Club badges are awarded the moment the workout saves", () => {
  /* The server awards these from onWorkoutCreated too; this pins that the
     client no longer waits for that round-trip. The owner reported the
     badge appearing only after leaving and returning to the screen — by
     then the function had finished. Now the same completed sets the
     command carries are scored here, in `acknowledge`, and handed to the
     transactional award. */
  async function completeAndSave(
    exercise: Partial<ProgramExercise>,
    kg: string
  ) {
    const onCompleteDay = vi.fn(); // resolves undefined → synced → acknowledge()
    await act(async () => {
      openSession(onCompleteDay, vi.fn(), exercise);
    });
    for (const n of [1, 2, 3]) {
      fireEvent.change(
        screen.getByRole("spinbutton", { name: `Set ${n} weight` }),
        { target: { value: kg } }
      );
    }
    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Mark set complete" })[0]
      );
    }
    // Presence, not visibility. The completion card mounts at opacity 0
    // (framer entrance) and in this file it never gets past that once the
    // "timers survive a locked phone" describe has run: that group fakes
    // `Date` and jumps the system clock, and every later entrance stalls
    // at 0 for as long as you care to wait (bisected: these three pass
    // alone and with every other group, fail only after that one).
    //
    // The SYMPTOM and that bisection hold — re-confirmed independently by
    // running the suite under `--sequence.shuffle`, which fails 3-7 tests
    // in this file depending on seed and no others once the order-
    // dependent files elsewhere were fixed. The MECHANISM this comment
    // used to assert — "framer's frame loop is left with a stale
    // timestamp" — is wrong. What follows is measured, and is the whole
    // chain, so the next attempt starts further along than the last two
    // did.
    //
    // 1. The element the assertion fails on is fine. Walking its
    //    ancestors at the failure shows the stuck one is the
    //    `fixed inset-0 z-50` overlay carrying an INLINE `opacity: 0` —
    //    a framer entrance that never ran.
    // 2. `requestAnimationFrame` never fires again after this group.
    //    Probed directly: a frame requested in a later test does not
    //    resolve within 300 ms, and the global is still jsdom's own
    //    function.
    // 3. jsdom explains it exactly. `browser/Window.js` starts the rAF
    //    driver with `setInterval` ONLY on the 0 -> 1 transition of
    //    `numberOfOngoingAnimationFrameCallbacks`, and only a callback
    //    actually firing (`removeAnimationFrameCallback`) brings that
    //    count back down. A frame requested while `setInterval` is faked
    //    schedules the driver on the FAKE clock; `useRealTimers()` then
    //    discards it with the count stranded above zero, so the `=== 1`
    //    guard means no later rAF can ever restart it. A one-way kill,
    //    for the rest of the file.
    //
    // That also disposes of the clock-jump story on its own terms:
    // motion-dom reads `performance.now()` (`frameloop/sync-time.mjs`,
    // `frameloop/batcher.mjs`), which a partial toFake of
    // setInterval/clearInterval/Date leaves untouched — measured. So a
    // real device waking from sleep cannot hit this either; the
    // monotonic clock does not jump.
    //
    // FOUR fixes tried and measured, none of which works — do not spend
    // the time again:
    //   - `shouldClearNativeTimers: false`: no change on any seed.
    //   - dropping "Date" from `toFake`: WORSE (10 failing; the group
    //     needs it).
    //   - reassigning `globalThis.requestAnimationFrame` after the group:
    //     no change, because motion-dom captures the original at import
    //     (`createRenderBatcher(requestAnimationFrame, true)`), so a
    //     later global is never consulted.
    //   - adding requestAnimationFrame/cancelAnimationFrame to `toFake`,
    //     and draining with `advanceTimersByTime(32)` before
    //     `useRealTimers()`: neither revives the driver.
    //
    // There are TWO latches, not one, which is why every single-point fix
    // above fails. Draining jsdom's counter DOES revive the driver —
    // sweeping `cancelAnimationFrame(1..2000)` after `useRealTimers()`
    // (cancelling is what decrements, and an unissued handle is a no-op)
    // takes the probe from `raf=false` to `raf=true`. The tests still
    // fail, and that is the second latch: motion-dom's batcher only
    // reschedules through `wake()`, which is guarded by
    // `if (!runNextFrame)`. While the driver was dead, framer enqueued
    // work, set `runNextFrame = true`, and handed `processBatch` to an
    // rAF that never fired. Only `processBatch` clears that flag, and it
    // is closure-private, so the batcher is stuck whether or not frames
    // are flowing again.
    //
    // Which points at one fix rather than a cleverer hook: give this
    // group its own FILE, so it gets a fresh jsdom window and a fresh
    // module registry and can stall neither. (Not faking `setInterval`
    // here is the other option — the group needs a controllable clock,
    // not necessarily that timer — but it is the one the tests below it
    // depend on.)
    // The file's own last test ("finishing early") sidesteps it the same
    // way — wait for the button to exist, click it; fireEvent does not
    // care about opacity. The award is what is under test here, not the
    // animation.
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Workout" })
      ).toBeInTheDocument()
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    });
    await vi.waitFor(() => expect(onCompleteDay).toHaveBeenCalled());
    return onCompleteDay;
  }

  it("a 100 kg compound set awards plate_club AND two_plate on save, in one call", async () => {
    await completeAndSave({ exerciseId: "squat", name: "Squat" }, "100");
    await vi.waitFor(() =>
      expect(h.awardEventBadges).toHaveBeenCalledWith([
        "plate_club",
        "two_plate",
      ])
    );
    expect(h.awardEventBadges).toHaveBeenCalledTimes(1);
  });

  it("scores what the command carries: the weight on the completed sets, not the plan", async () => {
    // Prescribed 0 kg, lifted 62.5 — the logged weight is what counts.
    const cmd = await completeAndSave(
      { exerciseId: "deadlift", name: "Deadlift", weight: 0 },
      "62.5"
    );
    const sent = cmd.mock.calls[0][1] as {
      setLogs: { weight: number; completed: boolean }[][];
    };
    expect(sent.setLogs[0].every((l) => l.completed && l.weight === 62.5)).toBe(
      true
    );
    await vi.waitFor(() =>
      expect(h.awardEventBadges).toHaveBeenCalledWith(["plate_club"])
    );
  });

  it("a non-compound lift at 140 kg awards nothing", async () => {
    await completeAndSave(
      { exerciseId: "barbell-curl", name: "Barbell Curl" },
      "140"
    );
    // `acknowledge` is where the award lives, and its first line clears
    // the draft — so the draft-clear spy is the proof that the code path
    // ran and chose to award nothing, rather than never running at all.
    await vi.waitFor(() => expect(h.clear).toHaveBeenCalled());
    expect(h.awardEventBadges).not.toHaveBeenCalled();
  });
});
