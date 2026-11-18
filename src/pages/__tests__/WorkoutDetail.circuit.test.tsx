/**
 * A saved circuit on its workout's page (Circ1 (11)): it reads as its
 * minutes, rounds and moves, with each move drawn and how it ran, never
 * as a lift with "No exercises recorded"; and it offers neither a
 * correction of sets nor a lift's share card, which have nothing to show
 * for it, while Share to feed posts the circuit's own post.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: { displayName: "Alex", uid: "u1" },
  }),
  useUid: () => "u1",
}));
vi.mock("@/components/share/ShareCardSheet", () => ({ default: () => null }));
vi.mock("@/components/social/CircleShareSheet", () => ({
  default: () => null,
}));

import WorkoutDetail from "../WorkoutDetail";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { circuitWorkoutFields } from "@/lib/circuitCompletion";
import { builtInCircuit } from "@/features/circuit/builtInCircuits";

const circuit = builtInCircuit({ kit: "home_gym", minutes: 20 });
const SAVED = circuitWorkoutFields({
  uid: "u1",
  completionId: "c1",
  startedAt: new Date(2026, 7, 1, 7, 0).getTime(),
  circuit,
  outcome: {
    intervalsDone: 20,
    roundsDone: 4,
    workSecondsDone: 800,
    activeSeconds: 1180,
    finished: true,
    effort: "right",
  },
  bodyweightKg: 70,
});

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/workout/${id}`]}>
      <Routes>
        <Route path="/workout/:workoutId" element={<WorkoutDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => resetFirestore());
afterEach(cleanup);

describe("WorkoutDetail, a circuit (Circ1 (11))", () => {
  it("reads as its minutes, rounds and moves", async () => {
    seedFirestore({ "users/u1/workouts/free-c1": SAVED });
    renderAt("free-c1");
    expect(
      await screen.findByRole("heading", { name: "20-minute circuit" })
    ).toBeInTheDocument();
    expect(screen.getByText("Circuit")).toBeInTheDocument();
    expect(screen.getByText("rounds")).toBeInTheDocument();
    expect(screen.getByText("moves")).toBeInTheDocument();
    for (const move of circuit.moves)
      expect(screen.getByText(move.name)).toBeInTheDocument();
    // The row is worked one side at a time.
    expect(screen.getByText("Switch sides halfway")).toBeInTheDocument();
    expect(
      screen.getByText("40 s on, 20 s off · Level 1 · Felt right")
    ).toBeInTheDocument();
    expect(screen.queryByText("No exercises recorded")).toBeNull();
  });

  it("offers no correction of sets and no lift share card", async () => {
    seedFirestore({ "users/u1/workouts/free-c1": SAVED });
    renderAt("free-c1");
    await screen.findByRole("heading", { name: "20-minute circuit" });
    expect(
      screen.queryByRole("button", { name: "Correct workout" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    // A Circle hears the session as any other, with no numbers, and the
    // feed gets the circuit's own post (WorkoutFeedShareSheet's test).
    expect(
      screen.getByRole("button", { name: "Share to circle" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Share to feed" })
    ).toBeInTheDocument();
  });
});
