/**
 * A failed read of the saved routines is not an empty list.
 *
 * The section hides itself when nothing is saved, and it hid itself the
 * same way when the read failed, so someone with saved routines was told,
 * by their absence, that they had none. A failed read now says so and
 * offers to try again. An empty list still hides the section.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import { Timestamp } from "firebase/firestore";
import SavedRoutinesSection from "../SavedRoutinesSection";

const ROUTINE = {
  name: "Bench day",
  exercises: [{ name: "Bench Press", setCount: 3 }],
  createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
};

function renderSection() {
  render(
    <MemoryRouter>
      <SavedRoutinesSection />
    </MemoryRouter>
  );
}

beforeEach(() => resetFirestore());
afterEach(() => cleanup());

describe("SavedRoutinesSection's load states", () => {
  it("lists saved routines (the anchor)", async () => {
    seedFirestore({ "users/u1/savedRoutines/r1": ROUTINE });
    renderSection();
    expect(await screen.findByText("Bench day")).toBeInTheDocument();
  });

  it("stays hidden when nothing is saved", async () => {
    renderSection();
    // The section shows while loading; it goes once the empty list lands.
    await vi.waitFor(() =>
      expect(screen.queryByLabelText("Saved routines")).toBeNull()
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the read failed, and lists the routines on Try again", async () => {
    seedFirestore({ "users/u1/savedRoutines/r1": ROUTINE });
    failNextFirestore("getDocs", { path: "users/u1/savedRoutines" });
    renderSection();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your saved routines"
    );
    expect(unfiredFailures()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Bench day")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
