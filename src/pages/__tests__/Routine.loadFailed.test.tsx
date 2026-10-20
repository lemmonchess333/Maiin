/**
 * A routine that couldn't be read is not a routine that doesn't exist.
 *
 * The page turned a failed read into "Routine not found", the same words
 * as a deleted routine, with no way to try again. It now says the read
 * failed and offers to try again; "not found" is kept for a routine that
 * is really gone. Read through the real savedRoutines module and the one
 * Firestore fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  failNextFirestore,
  readsAt,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: { weightKg: 80 } }),
}));
vi.mock("@/components/WorkoutSession", () => ({
  default: () => <div>Routine session</div>,
}));

import Routine from "../Routine";

const ROUTINE = "users/u1/savedRoutines/r1";

function renderRoutine() {
  render(
    <MemoryRouter initialEntries={["/routine/r1"]}>
      <Routes>
        <Route path="/routine/:routineId" element={<Routine />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => resetFirestore());
afterEach(() => cleanup());

describe("Routine's load states", () => {
  it("opens a routine that exists (the anchor)", async () => {
    seedFirestore({ [ROUTINE]: { name: "Bench day", exercises: [] } });
    renderRoutine();
    expect(await screen.findByText("Routine session")).toBeInTheDocument();
  });

  it("still says not found for a routine that is gone", async () => {
    renderRoutine();
    expect(await screen.findByText("Routine not found")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the read failed, and opens the routine on Try again", async () => {
    seedFirestore({ [ROUTINE]: { name: "Bench day", exercises: [] } });
    failNextFirestore("getDoc", { path: ROUTINE });
    renderRoutine();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this routine"
    );
    expect(unfiredFailures()).toEqual([]);
    expect(screen.queryByText("Routine not found")).toBeNull();

    /* Only Try again reads it again. The mocked useAuth hands back a new
       user object on every render, as an auth refresh can, and the page
       read the routine again on each one: the failure showed for a frame
       and then the next read replaced it. (The fake logs a read that
       answers; the failed one threw before it.) */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(readsAt(ROUTINE)).toHaveLength(0);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Routine session")).toBeInTheDocument();
    expect(readsAt(ROUTINE)).toHaveLength(1);
  });
});
