import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import MilestonesTab from "../MilestonesTab";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
let uid: string | null = "u1";
vi.mock("@/lib/auth", () => ({ useUid: () => uid }));

const sources = {
  workouts: [
    {
      id: "workout",
      date: "2026-01-06",
      exercises: [],
      totalCalories: 0,
      durationMinutes: 30,
      notes: "",
      createdAt: Timestamp.fromMillis(1),
    },
  ],
  runs: [{ id: "run", date: "2026-01-07", distanceMetres: 5000 }],
  liftBests: [],
  badges: [],
  unit: "km" as const,
};

beforeEach(() => {
  resetFirestore();
  uid = "u1";
  seedFirestore({
    "users/u1/trainingBlocks/block": {
      id: "block",
      title: "Get stronger",
      focus: "strength",
      pace: "full",
      startDate: "2026-01-05",
      durationWeeks: 4,
      weeklyLiftTarget: 3,
      anchorExerciseIds: [],
      why: "",
      status: "completed",
      endedAt: new Date(2026, 1, 2, 12).getTime(),
      createdAt: 1,
    },
  });
});

describe("MilestonesTab", () => {
  it("links sessions and opens the saved block review without offering a new plan", async () => {
    render(
      <MemoryRouter>
        <MilestonesTab {...sources} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("link", { name: /First workout logged/ })
    ).toHaveAttribute("href", "/workout/workout");
    expect(
      screen.getByRole("link", { name: /First run logged/ })
    ).toHaveAttribute("href", "/run/run");
    const block = await screen.findByRole("button", {
      name: /Get stronger · block complete/,
    });
    fireEvent.click(block);
    expect(
      await screen.findByRole("dialog", { name: "Get stronger" })
    ).toBeInTheDocument();
    expect(screen.getByText(/planned lifts\./)).toHaveTextContent(
      "1 of 12 planned lifts."
    );
    expect(
      screen.queryByRole("button", { name: /Repeat|Start.*block/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "closed")
    );
  });

  it("hides the previous account's block and closes its review immediately", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <MilestonesTab {...sources} />
      </MemoryRouter>
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Get stronger · block complete/,
      })
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    uid = "u2";
    rerender(
      <MemoryRouter>
        <MilestonesTab {...sources} />
      </MemoryRouter>
    );
    expect(
      screen.queryByRole("button", { name: /Get stronger · block complete/ })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "closed")
    );
    expect(screen.queryByText(/planned lifts\./)).not.toBeInTheDocument();
  });
});
