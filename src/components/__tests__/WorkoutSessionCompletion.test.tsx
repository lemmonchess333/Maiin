import {
  seedFirestore,
  resetFirestore,
  readDoc,
} from "@/test/firestoreHarness";
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
/* Every save hands back a share now, as the writers' always did; the row
   that offers it is SessionShareRow's own tests' to cover. */
const shareRow = vi.hoisted(() => ({ action: undefined as unknown }));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: (props: { action: unknown }) => {
    shareRow.action = props.action;
    return null;
  },
}));
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { ComponentProps } from "react";
import type { LiftCompletionReceipt } from "@/lib/liftCompletion";

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
vi.mock("@/lib/restTimerNotification", () => ({
  restNotificationDelaySeconds: () => 0,
  scheduleRestEndNotification: vi.fn(),
  cancelRestEndNotification: vi.fn(),
}));
import WorkoutSession from "../WorkoutSession";
import { WORKOUT } from "@/test/journeyScreens";

/**
 * What a writer hands back (`completeLift`): saved now, or, given the
 * queue's promise, waiting to sync. The share posts nothing.
 */
function receipt(queued?: Promise<"synced" | "failed">): LiftCompletionReceipt {
  return {
    workoutId: "programme-test",
    share: {
      uid: "test",
      type: "workout",
      source: { kind: "workout", id: "programme-test" },
      post: async () => ({ status: "declined" }),
    },
    syncStatus: queued ? "queued" : "synced",
    sync: queued ?? Promise.resolve("synced"),
  };
}

type CompleteDay = ComponentProps<typeof WorkoutSession>["onCompleteDay"];
/** A writer whose save lands at once, or (given the queue's promise)
 *  waits to sync. */
const writer = (queued?: Promise<"synced" | "failed">) =>
  vi.fn<CompleteDay>(async () => receipt(queued));

function openSession(
  onCompleteDay = writer(),
  onClose = vi.fn(),
  exercise: Partial<ProgramExercise> = {},
  extra: Partial<ComponentProps<typeof WorkoutSession>> = {}
) {
  render(
    <WorkoutSession
      {...extra}
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

/* The E2E journeys finish a session on this screen by these names
   (src/test/journeyScreens.ts, `finishLiftViaUi`). Finished here the same
   way, so a renamed control fails in the unit suite, not in a journey. */
it("finishes a session by the names the journeys use", async () => {
  const log = openSession();
  expect(screen.getByRole("button", { name: WORKOUT.close })).toBeVisible();
  for (let set = 0; set < 3; set++)
    fireEvent.click(
      screen.getAllByRole("button", { name: WORKOUT.markSet })[0]
    );
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: WORKOUT.save })).toBeVisible()
  );
  fireEvent.click(screen.getByRole("button", { name: WORKOUT.save }));
  await vi.waitFor(() =>
    expect(screen.getByRole("button", { name: WORKOUT.done })).toBeVisible()
  );
  expect(log).toHaveBeenCalledTimes(1);
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

  it("completes a hold timed past 100 seconds (Lift4 (14))", () => {
    openSession(writer(), vi.fn(), {
      exerciseId: "plank",
      name: "Plank",
      reps: 60,
      repUnit: "seconds",
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Set 1 seconds" }),
      { target: { value: "120" } }
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
    expect(h.error).not.toHaveBeenCalled();
    expect(
      screen.getByRole("spinbutton", { name: "Set 1 seconds" })
    ).toBeDisabled();
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
      expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible()
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

describe("the new-best moment (DS3)", () => {
  const seedBest = (bucket: "8rm" | "3rm" = "8rm") => {
    h.user = { uid: "pr-user" };
    seedFirestore({
      "users/pr-user/stats/prMap": {
        map: {
          "Test exercise": {
            "1rm": null,
            "3rm": null,
            "5rm": null,
            "8rm": null,
            "10rm": null,
            [bucket]: {
              weight: 60,
              reps: bucket === "8rm" ? 8 : 3,
              date: "2026-07-01",
            },
          },
        },
        sessionCounts: { "Test exercise": 5 },
        volumeBest: {},
      },
    });
  };
  const liftFirstSet = (weight: string) => {
    fireEvent.change(screen.getByRole("spinbutton", { name: "Set 1 weight" }), {
      target: { value: weight },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
  };
  const spoken = () => screen.queryByText(/^New best on /);

  it("says a set that beat the best on the spot: the lift, the figure, what it beat", async () => {
    seedBest();
    await act(async () => {
      openSession();
    });
    liftFirstSet("62.5");
    const card = screen.getByTestId("new-best-moment");
    expect(card).toHaveTextContent("Test exercise");
    expect(card).toHaveTextContent("62.5 kg × 8");
    expect(card).toHaveTextContent("Was 60 kg × 8, 1 Jul");
    expect(spoken()).toHaveAttribute("role", "status");
    expect(spoken()?.textContent).toBe(
      "New best on Test exercise: 62.5 kg for 8 reps. Previous best 60 kg for 8 reps."
    );
  });

  it("stays quiet for a set that did not beat the best", async () => {
    seedBest();
    await act(async () => {
      openSession();
    });
    liftFirstSet("57.5");
    // Anchored: the set really completed, it just set no best.
    expect(
      screen.getByRole("button", { name: "Edit completed set 1" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("new-best-moment")).toBeNull();
    expect(spoken()).toBeNull();
  });

  it("stays quiet for a first set at a new rep range that is not a best", async () => {
    // The only record is a heavy triple; 8 reps at 50 kg is the first
    // 8-rep set, below the best: the finish screen lists it as a first,
    // not as a new best, and so does not the workout screen.
    seedBest("3rm");
    await act(async () => {
      openSession();
    });
    liftFirstSet("50");
    expect(
      screen.getByRole("button", { name: "Edit completed set 1" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("new-best-moment")).toBeNull();
  });

  it("goes when the set is undone, with the record it announced", async () => {
    seedBest();
    await act(async () => {
      openSession();
    });
    liftFirstSet("62.5");
    expect(screen.getByTestId("new-best-moment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last set" }));
    expect(spoken()).toBeNull();
    await vi.waitFor(() =>
      expect(screen.queryByTestId("new-best-moment")).toBeNull()
    );
  });

  it("carries its own Undo, since it covers the bottom of the list", async () => {
    seedBest();
    await act(async () => {
      openSession();
    });
    liftFirstSet("62.5");
    fireEvent.click(screen.getByRole("button", { name: "Undo this set" }));
    // The set is open again, and the best went with it.
    expect(
      screen.getAllByRole("button", { name: "Mark set complete" })
    ).toHaveLength(3);
    expect(screen.queryByText("PR")).toBeNull();
    expect(spoken()).toBeNull();
  });

  it("goes when that set is corrected, since the figure it named changed", async () => {
    seedBest();
    await act(async () => {
      openSession();
    });
    liftFirstSet("62.5");
    expect(screen.getByTestId("new-best-moment")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit completed set 1" })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Weight (kg)" }), {
      target: { value: "57.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spoken()).toBeNull();
    await vi.waitFor(() =>
      expect(screen.queryByTestId("new-best-moment")).toBeNull()
    );
  });

  it("goes by itself after a few seconds, after the undo window", async () => {
    seedBest();
    await act(async () => {
      openSession();
    });
    // Advance only the timeouts, as the correction test below does:
    // faking animation frames strands Motion's frame loop.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    liftFirstSet("62.5");
    expect(
      screen.getByRole("button", { name: "Undo this set" })
    ).toBeInTheDocument();
    // Past the 4 s undo window, the best is still on screen, without
    // an Undo that would no longer work.
    await act(async () => vi.advanceTimersByTime(4100));
    expect(spoken()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Undo this set" })).toBeNull();
    await act(async () => vi.advanceTimersByTime(2000));
    vi.useRealTimers();
    expect(spoken()).toBeNull();
    await vi.waitFor(() =>
      expect(screen.queryByTestId("new-best-moment")).toBeNull()
    );
  });

  it("finishes with the best from before the workout, however many steps it took", async () => {
    // Three rising sets in one rep range are three moments, each against
    // the set before it, which the moment dates "today". The finish sums
    // up the workout, so its "Was" is the best the lifter came in with:
    // "Was 65 kg × 8" there reads as the old best and is not.
    seedBest();
    await act(async () => {
      openSession();
    });
    const lift = (set: number, weight: string) => {
      fireEvent.change(
        screen.getByRole("spinbutton", { name: `Set ${set} weight` }),
        { target: { value: weight } }
      );
      fireEvent.click(
        screen.getAllByRole("button", { name: "Mark set complete" })[0]
      );
    };
    lift(1, "62.5");
    lift(2, "65");
    // The first set's card may still be leaving as the second arrives.
    expect(
      screen.getAllByTestId("new-best-moment").map((card) => card.textContent)
    ).toContainEqual(expect.stringContaining("Was 62.5 kg × 8, today"));
    // The last set finishes the workout.
    lift(3, "67.5");
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible()
    );
    const bests = screen
      .getByRole("heading", { name: /New bests/ })
      .closest("section")!;
    expect(bests).toHaveTextContent("67.5 kg × 8");
    expect(bests).toHaveTextContent("Was 60 kg × 8");
    expect(bests).not.toHaveTextContent("Was 65 kg × 8");
  });
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
  fireEvent.click(await screen.findByRole("button", { name: "Save workout" }));
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
  fireEvent.click(await screen.findByRole("button", { name: "Save workout" }));
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
          new Promise<LiftCompletionReceipt>((resolve) => {
            resolveSave = () => resolve(receipt());
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
        screen.getByRole("button", { name: "Save workout" })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole("heading", { name: "Review workout" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
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

async function finishAndSave(complete = writer()) {
  openSession(complete);
  for (let i = 0; i < 3; i++) {
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
  }
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save workout" })
    ).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
}

it("hands the finish screen the share the save came back with", async () => {
  shareRow.action = undefined;
  const saved = receipt();
  await finishAndSave(vi.fn<CompleteDay>(async () => saved));
  await vi.waitFor(() => expect(shareRow.action).toBe(saved.share));
});

it("keeps the recovery draft while queued, then clears it only when synced", async () => {
  let settle!: (outcome: "synced" | "failed") => void;
  const sync = new Promise<"synced" | "failed">((resolve) => {
    settle = resolve;
  });
  await finishAndSave(writer(sync));
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
    .mockResolvedValueOnce(receipt(sync))
    .mockResolvedValueOnce(receipt());
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
  await finishAndSave(writer(sync));
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
  const complete = writer();
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
    const complete = writer();
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
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(
      complete.mock.calls[0][1].setLogs[0].map(
        (set: { reps: number }) => set.reps
      )
    ).toEqual([8, 8, 6]);
    expect(screen.queryByRole("button", { name: "Edit workout" })).toBeNull();
  });
});

describe("WorkoutSession — the record of a hard run before it (Lift4 (14))", () => {
  async function finished(hardRunBefore?: (startedAt: number) => boolean) {
    const complete = writer();
    openSession(complete, vi.fn(), {}, hardRunBefore ? { hardRunBefore } : {});
    for (let i = 0; i < 3; i++)
      fireEvent.click(
        screen.getAllByRole("button", { name: "Mark set complete" })[0]
      );
    fireEvent.click(
      await screen.findByRole("button", { name: "Save workout" })
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    return complete.mock.calls[0][1];
  }

  it("carries a long or hard run in the day before the start to the save", async () => {
    const asked: number[] = [];
    const data = await finished((startedAt) => {
      asked.push(startedAt);
      return true;
    });
    expect(data.afterHardRun).toBe(true);
    // Asked about the session's own start.
    expect(asked[0]).toBe(data.startedAt);
  });

  it("records nothing without one", async () => {
    expect((await finished(() => false)).afterHardRun).toBeUndefined();
    cleanup();
    expect((await finished()).afterHardRun).toBeUndefined();
  });
});

describe("WorkoutSession — an accidental extra set can be removed", () => {
  /* "Add set" had no inverse, so a mis-tap left an uncompleted set the
     session counted as outstanding: finishing the three sets the programme
     prescribed still routed the lifter through "Finish early". */
  const rows = () => screen.getAllByLabelText(/^Set \d+ reps$/);

  /* The set type sheet is the menu each set already has; its trigger is
     the numbered badge at the head of the row. */
  it("removes the extra through the set's own menu", () => {
    openSession();
    expect(rows()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Add set" }));
    expect(rows()).toHaveLength(4);

    // Open set 4's menu and remove it.
    fireEvent.click(
      screen.getByRole("button", { name: "Set 4. Change set type" })
    );
    fireEvent.click(screen.getByRole("button", { name: /Remove set/i }));
    expect(rows()).toHaveLength(3);
  });

  it("does NOT offer removal on a prescribed set", () => {
    /* The boundary. Removing one of the three the programme asked for is a
       change to the prescription, not a correction of a mis-tap. */
    openSession();
    fireEvent.click(
      screen.getByRole("button", { name: "Set 3. Change set type" })
    );
    expect(screen.queryByRole("button", { name: /Remove set/i })).toBeNull();
  });

  it("does NOT offer removal on a set that is not the last", () => {
    // Splicing from the middle renumbers every set after it and moves the
    // completion cursor under the lifter.
    openSession();
    fireEvent.click(screen.getByRole("button", { name: "Add set" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Set 2. Change set type" })
    );
    expect(screen.queryByRole("button", { name: /Remove set/i })).toBeNull();
  });
});

describe("WorkoutSession — a set's type is picked from its badge", () => {
  /* As in Hevy and MacroFactor: tap the set's badge, pick a type. Each
     type says what it does, because a W on its own told nobody why the
     row was there. */
  const badge = (name: string) =>
    screen.getByRole("button", { name: `${name}. Change set type` });

  it("opens a sheet naming the set, with every type explained", () => {
    openSession();
    fireEvent.click(badge("Set 2"));
    const sheet = screen.getByRole("dialog", { name: "Set type" });
    expect(sheet).toHaveTextContent("Set 2");
    for (const name of ["Working set", "Warm-up", "Drop set", "To failure"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^.?${name}`) })
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: /^.?Working set/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("renumbers the sets that count when one becomes a warm-up", () => {
    openSession();
    fireEvent.click(badge("Set 1"));
    fireEvent.click(screen.getByRole("button", { name: /^W?Warm-up/ }));
    expect(badge("Warm-up 1")).toHaveTextContent("W");
    expect(badge("Set 1")).toHaveTextContent("1");
    expect(badge("Set 2")).toHaveTextContent("2");
    expect(screen.getByLabelText("Warm-up 1 weight")).toBeInTheDocument();
  });

  it("marks a drop set with its letter, and keeps its number in its name", () => {
    openSession();
    fireEvent.click(badge("Set 3"));
    fireEvent.click(screen.getByRole("button", { name: /^D?Drop set/ }));
    expect(badge("Set 3, drop set")).toHaveTextContent("D");
  });

  it("corrects a done set's type, and its edit names it", () => {
    openSession();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[0]
    );
    fireEvent.click(badge("Set 1"));
    fireEvent.click(screen.getByRole("button", { name: /^W?Warm-up/ }));
    expect(
      screen.getByRole("button", { name: "Edit completed warm-up 1" })
    ).toBeInTheDocument();
  });
});

describe("WorkoutSession — a done set's type can be corrected", () => {
  it("takes back a best when the set turns out to be a warm-up", async () => {
    /* A done set has fed the session's bests; a warm-up may not. */
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
    fireEvent.click(
      screen.getByRole("button", { name: "Set 1. Change set type" })
    );
    fireEvent.click(screen.getByRole("button", { name: /^W?Warm-up/ }));
    expect(screen.queryByText("PR")).not.toBeInTheDocument();
  });
});

describe("WorkoutSession — Previous shows the same set last time", () => {
  it("captions each set with last session's set of the same number", async () => {
    h.user = { uid: "prev-user" };
    seedFirestore({
      "users/prev-user/workouts/last": {
        date: "2026-09-06",
        exercises: [
          {
            exerciseId: "test",
            exerciseName: "Test exercise",
            sets: [
              { reps: 8, weightKg: 60 },
              { reps: 6, weightKg: 62.5 },
              { reps: 4, weightKg: 65 },
            ],
          },
        ],
      },
    });
    await act(async () => openSession());
    for (const [set, label] of [
      ["set 1", "60 × 8"],
      ["set 2", "62.5 × 6"],
      ["set 3", "65 × 4"],
    ]) {
      expect(
        screen.getByRole("button", {
          name: `Last time ${label}. Use it for ${set}`,
        })
      ).toBeInTheDocument();
    }
  });

  it("fills a set from last time on a tap, until the set is done", async () => {
    h.user = { uid: "prev-user" };
    seedFirestore({
      "users/prev-user/workouts/last": {
        date: "2026-09-06",
        exercises: [
          {
            exerciseId: "test",
            exerciseName: "Test exercise",
            sets: [
              { reps: 8, weightKg: 60 },
              { reps: 6, weightKg: 62.5 },
            ],
          },
        ],
      },
    });
    await act(async () => openSession());
    const weight = screen.getByLabelText("Set 2 weight");
    const reps = screen.getByLabelText("Set 2 reps");
    fireEvent.change(weight, { target: { value: "50" } });
    fireEvent.change(reps, { target: { value: "3" } });
    expect(weight).toHaveValue(50);
    const lastTime = () =>
      screen.getByRole("button", {
        name: "Last time 62.5 × 6. Use it for set 2",
      });
    fireEvent.click(lastTime());
    expect(weight).toHaveValue(62.5);
    expect(reps).toHaveValue(6);

    // A done set is the record of what was lifted: last time no longer
    // writes over it.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[1]
    );
    expect(lastTime()).toBeDisabled();
  });

  it("gives a warm-up no previous figure", async () => {
    /* Captioned with a working set, every ramp row read "100 × 5" on a
       100 kg squat, and a tap loaded the top set as the first warm-up. */
    h.user = { uid: "prev-user" };
    seedFirestore({
      "users/prev-user/workouts/last": {
        date: "2026-09-06",
        exercises: [
          {
            exerciseId: "squat",
            exerciseName: "Barbell Squat",
            sets: [
              { reps: 5, weightKg: 100 },
              { reps: 5, weightKg: 100 },
              { reps: 5, weightKg: 100 },
            ],
          },
        ],
      },
    });
    await act(async () =>
      openSession(writer(), vi.fn(), {
        exerciseId: "squat",
        name: "Barbell Squat",
        weight: 100,
      })
    );
    // The working sets carry last time's figure...
    expect(
      screen.getByRole("button", {
        name: "Last time 100 × 5. Use it for set 1",
      })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Warm-up 1 weight")).toHaveValue(20);
    // ...and the three warm-ups carry none.
    expect(
      screen.queryAllByRole("button", { name: /Use it for warm-up/ })
    ).toHaveLength(0);
  });
});

describe("WorkoutSession — warm-ups are optional", () => {
  /* A 100 kg squat gets a three-set ramp (20, 50 and 70 kg). The ramp used
     to take the first numbers, so the first working set was "Set 4 of 6",
     and an unticked warm-up held the exercise open. */
  const squat = {
    exerciseId: "squat",
    name: "Barbell Squat",
    weight: 100,
  } satisfies Partial<ProgramExercise>;
  /** The line under the exercise's name, read as one string. */
  const setLine = (pattern: RegExp) =>
    screen.getByText(
      (_, element) =>
        element?.tagName === "P" && pattern.test(element.textContent ?? "")
    );

  it("numbers the working sets from 1, after a lettered ramp", () => {
    openSession(writer(), vi.fn(), squat);
    expect(
      screen
        .getAllByRole("button", { name: /\. Change set type$/ })
        .map((button) => button.textContent)
    ).toEqual(["W", "W", "W", "1", "2", "3"]);
    expect(screen.getByLabelText("Set 1 weight")).toHaveValue(100);
    expect(screen.getByLabelText("Warm-up 1 weight")).toHaveValue(20);
    expect(setLine(/^Warm-up 1 of 3 · 0 done$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Complete warm-up 1" })
    ).toBeInTheDocument();
    // The session's progress counts the sets that count.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          /^0\/3 sets/.test(element.textContent ?? "")
      )
    ).toBeInTheDocument();
  });

  it("moves on from a skipped ramp instead of going back to it", () => {
    openSession(writer(), vi.fn(), squat);
    // Straight to the first working set.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Mark set complete" })[3]
    );
    expect(
      screen.getByRole("button", { name: "Complete set 2" })
    ).toBeInTheDocument();
    expect(setLine(/^Set 2 of 3 · 1 done$/)).toBeInTheDocument();
  });

  it("finishes the exercise when the working sets are done", () => {
    openSession(writer(), vi.fn(), squat);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Mark set complete" }).at(-1)!
      );
    }
    // Three warm-ups left unticked do not hold the workout open: it is
    // the only exercise, so its last working set finishes the session.
    expect(
      screen.getByRole("button", { name: "Save workout" })
    ).toBeInTheDocument();
  });
});

describe("WorkoutSession — rest timer", () => {
  /* The exercise carries a 90s rest and the profile fixes none, so every
     rest is 90s. That makes it the thing a leak would visibly overwrite. */
  // The time left reads as a clock (DS3): "1:30", not "90 s".
  const restLabel = () =>
    screen.getByRole("group", { name: "Rest timer" }).textContent ?? "";

  function startFirstRest() {
    openSession(writer(), vi.fn(), { restSeconds: 90 });
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
  }

  it("rests as the plan suggests when none is fixed (Lift4 (5))", () => {
    // A 5-rep bench is a heavy main lift: 3 minutes.
    openSession(writer(), vi.fn(), {
      exerciseId: "bench-press",
      name: "Bench Press",
      reps: 5,
    });
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
    expect(restLabel()).toContain("3:00");
  });

  it("+15 s extends the rest in progress", () => {
    startFirstRest();
    expect(restLabel()).toContain("1:30");
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    expect(restLabel()).toContain("1:45");
  });

  it("does NOT carry the extension into the next rest", () => {
    /* The reported bug. A `manualRestRef` latched on the first "+15 s" and
       made `startRest` skip re-deriving the target, so every later rest in
       the session began at 105 — a one-off extension quietly becoming a
       preference. */
    startFirstRest();
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    expect(restLabel()).toContain("1:45");

    // End this rest and complete the next set: a fresh rest, fresh target.
    fireEvent.click(screen.getByRole("button", { name: "End rest" }));
    fireEvent.click(screen.getAllByLabelText("Mark set complete")[0]);
    expect(restLabel()).toContain("1:30");
  });

  it("extends repeatedly within one rest — the counterweight", () => {
    // A fix that reset the target on every render would pass the test above
    // while making the button useless.
    startFirstRest();
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    fireEvent.click(screen.getByLabelText("Add 15 seconds of rest"));
    expect(restLabel()).toContain("2:00");
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
  /* Unmount and settle BEFORE handing the clock back. Faking
     `setInterval` here puts jsdom's rAF driver on the fake clock, and
     leaving mid-animation strands both jsdom's frame counter and
     motion-dom's `runNextFrame` flag — after which every entrance
     animation later in this FILE sits at `opacity: 0` and five
     completion-screen assertions fail `toBeVisible()`. Unmounting
     cancels the animation; the extra tick lets the pending frame fire on
     jsdom's own driver, which is what opens both latches. The full
     mechanism, and the five fixes that do NOT work, are recorded above
     `completeAndSave` in the Plate-Club group.

     Found by `--sequence.shuffle`: written order put every victim ahead
     of this block, so the file passed. */
  afterEach(async () => {
    cleanup();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    vi.useRealTimers();
  });

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
    openSession(writer(), vi.fn(), { restSeconds: 90 });
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
      "1:27"
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
    openSession(writer(), vi.fn(), { restSeconds: 90 });
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
      "0:30"
    );
    hidden.mockRestore();
  });

  it("re-arms the completion alert when an expired rest is extended", async () => {
    /* Extending an already-finished rest starts a fresh countdown. The
       chime flag stayed set from the first expiry, so the second one passed
       in silence — a timer running with no alert at the end of it. */
    const { haptic } = await import("@/lib/haptic");
    openSession(writer(), vi.fn(), { restSeconds: 90 });
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
  const complete = writer();
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
  fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
  await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(
    complete.mock.calls[0][1].setLogs[0].filter(
      (set: { completed: boolean }) => set.completed
    )
  ).toHaveLength(2);
  expect(complete.mock.calls[0][1].prescription!.exercises[0]).toMatchObject({
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
    const onCompleteDay = writer();
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
    /* Presence, not visibility — and this one is a preference, not a
       workaround. The award is what is under test; `fireEvent` does not
       care about opacity, and the file's last test ("finishing early")
       reads the same way.

       It WAS a workaround. Every entrance animation after the "timers
       survive a locked phone" group used to stall at `opacity: 0`
       forever, and the cause is worth keeping because it is two latches
       rather than one, which is why every single-point fix failed:

       1. jsdom's `browser/Window.js` starts the rAF driver with
          `setInterval` only on the 0 -> 1 transition of
          `numberOfOngoingAnimationFrameCallbacks`, and only a callback
          FIRING brings the count back down. A frame requested while
          `setInterval` is faked puts the driver on the fake clock;
          restoring real timers discards it with the count stranded
          above zero, so no later rAF can restart it.
       2. motion-dom's batcher reschedules only through `wake()`, guarded
          by `if (!runNextFrame)`. Framer had already set that flag and
          handed `processBatch` to the frame that never fired, and only
          `processBatch` clears it — closure-private, so the batcher
          stays stuck even once frames flow again.

       Measured, not read: `frameData.timestamp` sits frozen at the value
       it had when the group ended, for as long as you care to wait.

       The fix is in that group's `afterEach`: unmount, then advance the
       FAKE clock once more before handing it back. The pending frame
       then fires on jsdom's own driver — decrementing the counter, which
       clears latch 1, and running `processBatch`, which clears latch 2 —
       with nothing left to reschedule because the component is gone.
       Both latches, one hook.

       Five things that do NOT work, measured rather than reasoned about,
       so nobody spends the time again:

       - `shouldClearNativeTimers: false` — no change on any seed.
       - dropping "Date" from `toFake` — worse; the group needs it.
       - reassigning `globalThis.requestAnimationFrame` afterwards —
         motion-dom captured the original at import, so a later global is
         never consulted.
       - adding rAF to `toFake` and draining — the near-miss. It moves
         the pending frame onto VITEST's clock, so jsdom's counter never
         decrements and latch 1 stays shut.
       - sweeping `cancelAnimationFrame(1..2000)` after `useRealTimers()`
         — this one genuinely revives the driver, and the tests still
         fail, which is how the second latch was found.

       One more thing the mechanism settles: a real device waking from
       sleep cannot hit any of this. motion-dom reads `performance.now()`
       (`frameloop/sync-time.mjs`), and the monotonic clock does not
       jump — so this group's own subject is not a route to the bug its
       neighbours were working around. */
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save workout" })
      ).toBeInTheDocument()
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
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

/* DS3: the screen names the day as Train does and says what comes next. */
describe("wayfinding between exercises", () => {
  function openPullDay() {
    render(
      <WorkoutSession
        day={{
          dayName: "Pull — Lat Focus",
          dayType: "upper",
          completed: false,
          exercises: [
            {
              exerciseId: "pull-ups",
              name: "Pull-Ups",
              sets: 1,
              reps: 8,
              weight: 0,
              restSeconds: 0,
            } as ProgramExercise,
            {
              exerciseId: "barbell-row",
              name: "Barbell Row",
              sets: 3,
              reps: 10,
              weight: 32.5,
              restSeconds: 0,
            } as ProgramExercise,
          ],
        }}
        dayIndex={0}
        onCompleteDay={vi.fn()}
        onClose={vi.fn()}
      />
    );
  }

  it("names the day as Train and Home do", () => {
    openPullDay();
    expect(screen.getByText("Pull · Lat focus")).toBeInTheDocument();
    expect(screen.queryByText("Pull — Lat Focus")).toBeNull();
  });

  it("names the next exercise with sets left, and nothing once only this one is", () => {
    openPullDay();
    const upNext = () => screen.getByText("Up next").parentElement!;
    expect(upNext()).toHaveTextContent("Barbell Row");
    expect(upNext()).toHaveTextContent("3 sets × 10 reps · 32.5 kg");

    fireEvent.click(screen.getByRole("button", { name: "Barbell Row" }));
    expect(upNext()).toHaveTextContent("Pull-Ups");

    fireEvent.click(screen.getByRole("button", { name: "Pull-Ups" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark set complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Barbell Row" }));
    expect(
      screen.getByRole("button", { name: "Pull-Ups, done" })
    ).toBeVisible();
    expect(screen.queryByText("Up next")).toBeNull();
  });
});

describe("the session's target (Lift4 (3))", () => {
  it("names a climbing lift's range", () => {
    openSession(writer(), vi.fn(), {
      exerciseId: "bench-press",
      name: "Bench Press",
      reps: 10,
      baseReps: 8,
      repRangeMax: 12,
      progressionType: "double",
      weight: 60,
    });
    expect(screen.getByText(/^Target:/)).toHaveTextContent(
      "Target: 3×8–12 @ 60 kg"
    );
  });
});

describe("the plate hint (Lift4 (6))", () => {
  it("loads the plan's 2.5 kg step with a 1.25 kg plate a side", () => {
    openSession(writer(), vi.fn(), {
      exerciseId: "bench-press",
      name: "Bench Press",
      weight: 62.5,
    });
    expect(screen.getByText(/Per side:/)).toHaveTextContent(
      "Per side: 20 + 1.25"
    );
    expect(screen.queryByText(/kg short/)).toBeNull();
  });

  it("says what the plates can't make", () => {
    openSession(writer(), vi.fn(), {
      exerciseId: "bench-press",
      name: "Bench Press",
      weight: 61,
    });
    expect(screen.getByText(/Per side:/)).toHaveTextContent(
      "Per side: 20 · 1 kg short"
    );
  });
});
