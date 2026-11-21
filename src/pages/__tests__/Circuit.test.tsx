import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BackDismissProvider } from "@/lib/BackDismissProvider";
import { useBackDismissController } from "@/lib/backDismiss";
import { restoreRealTimers } from "@/test/fakeTimers";

/**
 * Circuit mode's page (Circ1 (10), (11), (A)), on a fake clock: the
 * runner walks the count in, work and rest on the session player; a
 * pause stops the step; a step that ended while the screen looked away
 * ends on time, and more than one pauses the circuit with none of the time
 * away counted; a finished circuit saves as a circuit with the
 * Easy / Right / Hard tap, and only its own minutes; under 7 minutes
 * nothing is saved; a finish that saves asks before Discard or Back drops
 * it; skipping to the end is not finishing; a history read that is slow
 * or fails is never taken for no history, and what is chosen from it is
 * marked so. The save itself is `circuitCompletion.test.ts`'s.
 */
const h = vi.hoisted(() => ({
  completeCircuit: vi.fn(),
  history: [] as unknown[],
  read: null as null | (() => Promise<unknown[]>),
  /** Whether the last back press was taken by the page. */
  backTaken: false,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "lifter" },
    profile: {
      equipment: "minimal",
      weightKg: 70,
      injuries: [],
      displayName: "Sam Lee",
    },
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/confetti", () => ({ throwConfetti: () => () => {} }));
vi.mock("@/lib/savedWorkouts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/savedWorkouts")>()),
  fetchSavedWorkouts: () => (h.read ? h.read() : Promise.resolve(h.history)),
}));
vi.mock("@/lib/circuitCompletion", () => ({
  completeCircuit: h.completeCircuit,
}));
// The saved finish's post is the share row's (SessionShareRow's tests).
vi.mock("@/components/workout/CompletionExtras", () => ({
  default: ({ share }: { share: { source: { id: string } } }) => (
    <p>The post for {share.source.id}</p>
  ),
}));

import Circuit from "../Circuit";

function renderPage(wrap: (page: ReactNode) => ReactNode = (page) => page) {
  return render(
    <MemoryRouter initialEntries={["/circuit"]}>
      {wrap(
        <Routes>
          <Route path="/circuit" element={<Circuit />} />
          <Route path="/program" element={<p>Train</p>} />
        </Routes>
      )}
    </MemoryRouter>
  );
}

/** What the Android back button calls, as a button the test can press. */
function BackButton() {
  const { dispatchBack } = useBackDismissController();
  return (
    <button type="button" onClick={() => (h.backTaken = dispatchBack())}>
      Phone back
    </button>
  );
}

const FAKE_CLOCK = {
  toFake: [
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "Date",
  ] as (
    "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval" | "Date"
  )[],
};

/** Lets the clock run, a second at a time, so each tick renders. */
async function seconds(n: number) {
  for (let i = 0; i < n; i++)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
}

/** The real clock's timeout, kept before any test fakes it. */
const realTimeout = globalThis.setTimeout;

/** Lets a dialog fade out. framer times its 150 ms on the real clock,
 *  but draws a frame only when the fake clock fires jsdom's: so real time
 *  goes by, then a frame is drawn, until the fade is well past its end. */
async function fadeOut() {
  for (let i = 0; i < 12; i++)
    await act(async () => {
      await new Promise((resolve) => realTimeout(resolve, 30));
      vi.advanceTimersByTime(16);
    });
}

/** The clock jumps, as it does after the screen looked away. */
async function jump(n: number) {
  await act(async () => {
    vi.advanceTimersByTime(n * 1000);
  });
  // One more tick lets the page catch the player up.
  await seconds(1);
}

/** The clock runs on, ten seconds a render: never more than one step
 *  ends between two renders, as on a screen that stays awake. */
async function onTheClock(n: number) {
  for (let left = n; left > 0; left -= 10)
    await act(async () => {
      vi.advanceTimersByTime(Math.min(10, left) * 1000);
    });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

const endCircuit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "End circuit" }));
  });
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "End circuit",
      })
    );
  });
};

const saveCircuit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save circuit" }));
  });
};

const TEN_MINUTE = /^10-minute circuit\s?10 min/;

async function startTenMinute(wrap?: (page: ReactNode) => ReactNode) {
  renderPage(wrap);
  // The history read resolves and the six circuits are offered. The clock
  // is faked once they are: finding them waits on real timers.
  const row = await screen.findByRole("button", { name: TEN_MINUTE });
  vi.useFakeTimers(FAKE_CLOCK);
  await act(async () => {
    fireEvent.click(row);
  });
}

const timer = () => screen.getByRole("timer").textContent;
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

beforeEach(() => {
  h.completeCircuit.mockReset().mockResolvedValue({
    workoutId: "free-c1",
    syncStatus: "synced",
    share: {
      uid: "lifter",
      type: "workout",
      source: { kind: "workout", id: "free-c1" },
      post: vi.fn(),
    },
  });
  h.history = [];
  h.read = null;
  h.backTaken = false;
});
afterEach(async () => {
  setVisibility("visible");
  await restoreRealTimers();
});

/** The 10-minute circuit, done once and called Easy: it comes back a
 *  rung up, 45 s on and 15 s off. */
const EASY_LAST_TIME = [
  {
    date: "2026-05-01",
    format: "circuit",
    circuit: {
      circuitId: "builtin-minimal-10-standard",
      name: "10-minute circuit",
      kind: "intervals",
      kit: "minimal",
      minutes: 10,
      lowImpact: false,
      level: 0,
      workSeconds: 40,
      restSeconds: 20,
      rounds: 2,
      moves: [
        {
          kind: "move",
          unit: "seconds",
          exerciseId: "plank",
          name: "Plank",
          impact: "low",
        },
      ],
      intervalsDone: 10,
      roundsDone: 2,
      workSecondsDone: 400,
      activeSeconds: 580,
      finished: true,
      effort: "easy",
    },
  },
];

describe("the circuit runner (Circ1 (10))", () => {
  it("counts in, then works and rests, move after move", async () => {
    await startTenMinute();
    expect(screen.getByText("Get ready")).toBeInTheDocument();
    expect(heading()).toBe("Next: Bodyweight Squat");
    expect(timer()).toBe("0:10");
    expect(screen.getByText("Round 1 of 2 · Move 1 of 5")).toBeInTheDocument();

    await seconds(10);
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(heading()).toBe("Bodyweight Squat");
    expect(timer()).toBe("0:40");

    await seconds(40);
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(heading()).toBe("Next: Push-Ups");
    expect(timer()).toBe("0:20");
    expect(screen.getByText("Round 1 of 2 · Move 2 of 5")).toBeInTheDocument();

    await seconds(20);
    expect(heading()).toBe("Push-Ups");
    expect(timer()).toBe("0:40");
  });

  it("names the voice button once, its state pressed or not", async () => {
    await startTenMinute();
    const voice = screen.getByRole("button", { name: "Voice" });
    expect(voice).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      fireEvent.click(voice);
    });
    expect(screen.getByRole("button", { name: "Voice" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("does not burn an interval while paused", async () => {
    await startTenMinute();
    await seconds(25);
    expect(timer()).toBe("0:25");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    expect(screen.getByText("Paused")).toBeInTheDocument();
    await seconds(90);
    expect(timer()).toBe("0:25");
    expect(heading()).toBe("Bodyweight Squat");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    });
    await seconds(25);
    expect(heading()).toBe("Next: Push-Ups");
  });

  it("ends a step on time when it ended while the screen looked away", async () => {
    await startTenMinute();
    await seconds(2);
    // From 2 s to 16 s with no tick between: the count in ended at 10 s.
    await jump(13);
    expect(heading()).toBe("Bodyweight Squat");
    expect(timer()).toBe("0:34");
  });

  it("pauses where it was left when more than one step went by, counting none of it", async () => {
    await startTenMinute();
    await seconds(2);
    // From 2 s to 76 s with no tick between: the count in, the squats and
    // the rest all ended while nobody was following.
    await jump(74);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(heading()).toBe("Next: Bodyweight Squat");
    expect(timer()).toBe("0:08");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    });
    await seconds(8);
    expect(heading()).toBe("Bodyweight Squat");
    expect(timer()).toBe("0:40");
  });

  it("never finishes a circuit left in the background", async () => {
    await startTenMinute();
    await seconds(2);
    // Hidden, the clock keeps ticking and nothing moves on.
    act(() => setVisibility("hidden"));
    await onTheClock(600);
    await act(async () => {
      setVisibility("visible");
    });
    await seconds(1);
    expect(screen.queryByText("Circuit done")).not.toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(timer()).toBe("0:08");
    // Ended there, it ran under 7 minutes: nothing is saved.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "End circuit" }));
    });
    expect(
      screen.getByRole("button", { name: "End without saving" })
    ).toBeInTheDocument();
  });

  it("asks before Back leaves a circuit under way", async () => {
    await startTenMinute((page) => (
      <BackDismissProvider>
        <BackButton />
        {page}
      </BackDismissProvider>
    ));
    await seconds(15);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Phone back" }));
    });
    expect(screen.getByRole("alertdialog")).toHaveTextContent("End circuit?");
    // The clock stopped while it asks.
    await seconds(10);
    expect(timer()).toBe("0:35");
    expect(screen.queryByText("Train")).not.toBeInTheDocument();
  });

  it("goes straight back to the circuit on Keep going", async () => {
    // Under the app's Back handling, as on a phone: the question's own
    // Back guard hands over to the page's as it closes.
    await startTenMinute((page) => (
      <BackDismissProvider>{page}</BackDismissProvider>
    ));
    await seconds(15);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "End circuit" }));
    });
    await seconds(5);
    expect(timer()).toBe("0:35");
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Keep going",
        })
      );
    });
    await fadeOut();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Paused")).not.toBeInTheDocument();
    // The clock runs on from where it stopped, and the question stays shut.
    await seconds(5);
    expect(timer()).toBe("0:30");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("the finish (Circ1 (11), (A))", () => {
  it("saves a finished circuit with its one tap, shows its post, then Done goes back to Train", async () => {
    await startTenMinute();
    // Into the first work interval a second at a time, then on the clock
    // to the end of the circuit's 590 s.
    await seconds(12);
    await onTheClock(578);
    expect(screen.getByText("Circuit done")).toBeInTheDocument();
    // A first circuit is the reward register (DS4 call 3).
    expect(screen.getByText("first")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Easy" }));
    });
    expect(screen.getByRole("button", { name: "Easy" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save circuit" }));
    });
    expect(h.completeCircuit).toHaveBeenCalledTimes(1);
    const finished = h.completeCircuit.mock.calls[0][0];
    expect(finished).toMatchObject({
      uid: "lifter",
      bodyweightKg: 70,
      author: { displayName: "Sam Lee" },
      circuit: { id: "builtin-minimal-10-standard", level: 0 },
      outcome: {
        intervalsDone: 10,
        roundsDone: 2,
        workSecondsDone: 400,
        activeSeconds: 580,
        finished: true,
        effort: "easy",
      },
    });
    // Saved, the finish stays with the circuit's post, until Done.
    expect(screen.getByText("The post for free-c1")).toBeInTheDocument();
    expect(screen.queryByText("Train")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(screen.getByText("Train")).toBeInTheDocument();
  });

  it("counts only the circuit's own time when the clock jumps past its end", async () => {
    await startTenMinute();
    await seconds(12);
    // Into the last work interval (550 s to 590 s)...
    await onTheClock(548);
    expect(heading()).toBe("Burpees");
    // ...then an hour with no tick: only the last step ended meanwhile.
    await jump(3600);
    expect(screen.getByText("Circuit done")).toBeInTheDocument();
    await saveCircuit();
    expect(h.completeCircuit.mock.calls[0][0].outcome).toMatchObject({
      intervalsDone: 10,
      roundsDone: 2,
      activeSeconds: 580,
      finished: true,
    });
  });

  it("saves a circuit ended at 8 minutes as what was done of it", async () => {
    await startTenMinute();
    await seconds(12);
    // 8 minutes after the count in: eight intervals, work and rest.
    await onTheClock(478);
    await endCircuit();
    expect(screen.getByText("Circuit ended")).toBeInTheDocument();
    await saveCircuit();
    expect(h.completeCircuit.mock.calls[0][0].outcome).toEqual({
      intervalsDone: 8,
      roundsDone: 1,
      workSecondsDone: 320,
      activeSeconds: 480,
      finished: false,
    });
  });

  const discardQuestion = () =>
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Discard",
    });

  it("offers Discard on a finish that saves, and asks before it drops it", async () => {
    // iOS has no Back: the way out without saving is on the screen.
    await startTenMinute();
    await seconds(12);
    await onTheClock(478);
    await endCircuit();
    await fadeOut();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Discard this circuit?"
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await fadeOut();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Circuit ended")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });
    await act(async () => {
      fireEvent.click(discardQuestion());
    });
    expect(screen.getByText("Train")).toBeInTheDocument();
    expect(h.completeCircuit).not.toHaveBeenCalled();
  });

  it("offers Discard after a failed save too", async () => {
    h.completeCircuit.mockReset().mockRejectedValue(new Error("offline"));
    await startTenMinute();
    await seconds(12);
    await onTheClock(478);
    await endCircuit();
    await saveCircuit();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });
    await act(async () => {
      fireEvent.click(discardQuestion());
    });
    expect(screen.getByText("Train")).toBeInTheDocument();
    expect(h.completeCircuit).toHaveBeenCalledTimes(1);
  });

  it("asks before Back drops a finish that saves", async () => {
    await startTenMinute((page) => (
      <BackDismissProvider>
        <BackButton />
        {page}
      </BackDismissProvider>
    ));
    await seconds(12);
    await onTheClock(478);
    await endCircuit();
    await fadeOut();
    const back = async () =>
      act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Phone back" }));
      });
    await back();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Discard this circuit?"
    );
    // Back again answers the question with Cancel: the finish stays.
    await back();
    await fadeOut();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Circuit ended")).toBeInTheDocument();
    expect(screen.queryByText("Train")).not.toBeInTheDocument();
    // And asks again on the next.
    await back();
    await act(async () => {
      fireEvent.click(discardQuestion());
    });
    expect(screen.getByText("Train")).toBeInTheDocument();
    expect(h.completeCircuit).not.toHaveBeenCalled();
  });

  it("lets Back leave a finish that saves nothing", async () => {
    await startTenMinute((page) => (
      <BackDismissProvider>
        <BackButton />
        {page}
      </BackDismissProvider>
    ));
    for (let i = 0; i < 20; i++)
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      });
    await seconds(1);
    expect(screen.getByText("Circuit ended")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Phone back" }));
    });
    expect(h.backTaken).toBe(false);
  });

  it("waits on Back while the circuit saves", async () => {
    let settle: () => void = () => {};
    h.completeCircuit.mockReset().mockReturnValue(
      new Promise((resolve) => {
        settle = () =>
          resolve({
            workoutId: "free-c1",
            syncStatus: "synced",
            share: {
              uid: "lifter",
              type: "workout",
              source: { kind: "workout", id: "free-c1" },
              post: vi.fn(),
            },
          });
      })
    );
    await startTenMinute((page) => (
      <BackDismissProvider>
        <BackButton />
        {page}
      </BackDismissProvider>
    ));
    await seconds(12);
    await onTheClock(478);
    await endCircuit();
    await saveCircuit();
    await fadeOut();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Phone back" }));
    });
    // Taken, so it leaves nothing, and asks nothing.
    expect(h.backTaken).toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Circuit ended")).toBeInTheDocument();
    await act(async () => {
      settle();
    });
    expect(screen.getByText("The post for free-c1")).toBeInTheDocument();
    // Saved, nothing is left to lose: Back leaves.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Phone back" }));
    });
    expect(h.backTaken).toBe(false);
  });

  it("offers today's rung from the circuit's history", async () => {
    h.history = EASY_LAST_TIME;
    renderPage();
    const row = await screen.findByRole("button", { name: TEN_MINUTE });
    expect(row).toHaveTextContent("45 s on, 15 s off");
    // Today's level, and the last time it was done.
    expect(row).toHaveTextContent("Level 2 · last time 1 May, felt easy");
  });

  it("offers first rungs when the history is slow, and moves them when it lands", async () => {
    let land: (workouts: unknown[]) => void = () => {};
    h.read = () => new Promise((resolve) => (land = resolve));
    vi.useFakeTimers(FAKE_CLOCK);
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole("button", { name: TEN_MINUTE })).toHaveTextContent(
      "40 s on, 20 s off"
    );
    await act(async () => {
      land(EASY_LAST_TIME);
    });
    expect(screen.getByRole("button", { name: TEN_MINUTE })).toHaveTextContent(
      "45 s on, 15 s off"
    );
  });

  it("never calls a circuit a first when the history could not be read", async () => {
    h.read = () => new Promise(() => {});
    vi.useFakeTimers(FAKE_CLOCK);
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TEN_MINUTE }));
    });
    await seconds(12);
    await onTheClock(578);
    expect(screen.getByText("Circuit done")).toBeInTheDocument();
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    // Saved, it is marked as chosen without its history, so the ladder
    // leaves its first rung out rather than start again from it.
    await saveCircuit();
    expect(h.completeCircuit.mock.calls[0][0].circuit).toMatchObject({
      level: 0,
      historyUnknown: true,
    });
  });

  it("marks nothing when the history was read", async () => {
    h.history = EASY_LAST_TIME;
    await startTenMinute();
    await seconds(12);
    // A rung up, 45 s on and 15 s off: 585 s after the count in.
    await onTheClock(590);
    await saveCircuit();
    const { circuit } = h.completeCircuit.mock.calls[0][0];
    expect(circuit.level).toBe(1);
    expect(circuit).not.toHaveProperty("historyUnknown");
  });

  it("saves nothing under 7 minutes, and says so before it ends", async () => {
    await startTenMinute();
    await seconds(70);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "End circuit" }));
    });
    expect(
      screen.getByText(
        "You’ve done 1 min. A circuit saves from 7 min, so this one won’t be saved."
      )
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "End without saving" })
      );
    });
    expect(h.completeCircuit).not.toHaveBeenCalled();
    expect(screen.getByText("Train")).toBeInTheDocument();
  });

  it("does not count skipping to the end as finishing", async () => {
    await startTenMinute();
    // Skip every step: the count in, 10 intervals and 9 rests.
    for (let i = 0; i < 20; i++)
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      });
    await seconds(1);
    expect(screen.getByText("Circuit ended")).toBeInTheDocument();
    expect(
      screen.getByText("You did 0 min. A circuit saves from 7 min.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save circuit" })
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(h.completeCircuit).not.toHaveBeenCalled();
  });
});
