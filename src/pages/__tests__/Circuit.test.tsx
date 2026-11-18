import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { restoreRealTimers } from "@/test/fakeTimers";

/**
 * Circuit mode's page (Circ1 (10), (11), (A)), on a fake clock: the
 * runner walks the count in, work and rest on the session player; a
 * pause stops the step; a clock that jumped (a screen that slept) lands
 * on the step it says; a finished circuit saves as a circuit with the
 * Easy / Right / Hard tap; under 7 minutes nothing is saved; and
 * skipping to the end is not finishing. The save itself is
 * `circuitCompletion.test.ts`'s.
 */
const h = vi.hoisted(() => ({
  completeCircuit: vi.fn(),
  history: [] as unknown[],
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "lifter" },
    profile: { equipment: "minimal", weightKg: 70, injuries: [] },
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/confetti", () => ({ throwConfetti: () => () => {} }));
vi.mock("@/lib/savedWorkouts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/savedWorkouts")>()),
  fetchSavedWorkouts: () => Promise.resolve(h.history),
}));
vi.mock("@/lib/circuitCompletion", () => ({
  completeCircuit: h.completeCircuit,
}));

import Circuit from "../Circuit";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/circuit"]}>
      <Routes>
        <Route path="/circuit" element={<Circuit />} />
        <Route path="/program" element={<p>Train</p>} />
      </Routes>
    </MemoryRouter>
  );
}

/** Lets the clock run, a second at a time, so each tick renders. */
async function seconds(n: number) {
  for (let i = 0; i < n; i++)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
}

/** The clock jumps, as it does after the screen slept. */
async function jump(n: number) {
  await act(async () => {
    vi.advanceTimersByTime(n * 1000);
  });
  // One more tick lets the page catch the player up.
  await seconds(1);
}

async function startTenMinute() {
  renderPage();
  // The history read resolves and the six circuits are offered. The clock
  // is faked once they are: finding them waits on real timers.
  const row = await screen.findByRole("button", {
    name: /^10-minute circuit\s?10 min/,
  });
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
  });
  await act(async () => {
    fireEvent.click(row);
  });
}

const timer = () => screen.getByRole("timer").textContent;
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

beforeEach(() => {
  h.completeCircuit
    .mockReset()
    .mockResolvedValue({ workoutId: "free-c1", syncStatus: "synced" });
  h.history = [];
});
afterEach(async () => {
  await restoreRealTimers();
});

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

  it("lands on the step the clock says after a jump, as after the screen slept", async () => {
    await startTenMinute();
    await seconds(2);
    // From 2 s to 77 s with no tick between: the count in (10 s), the
    // squats (40 s) and the rest (20 s) all ended while it was dark.
    await jump(74);
    expect(heading()).toBe("Push-Ups");
    expect(timer()).toBe("0:33");
  });
});

describe("the finish (Circ1 (11), (A))", () => {
  it("saves a finished circuit with its one tap, then goes back to Train", async () => {
    await startTenMinute();
    // Into the first work interval a second at a time, then on the clock
    // to the end of the circuit's 590 s.
    await seconds(12);
    await jump(577);
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
    expect(screen.getByText("Train")).toBeInTheDocument();
  });

  it("offers today's rung from the circuit's history", async () => {
    // Easy last time: the 10-minute circuit comes back at rung 1.
    h.history = [
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
    renderPage();
    const row = await screen.findByRole("button", {
      name: /^10-minute circuit\s?10 min/,
    });
    expect(row).toHaveTextContent("45 s on, 15 s off");
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
