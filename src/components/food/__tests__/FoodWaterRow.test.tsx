/**
 * The Food diary's water row (Mob2, call 2): the day on screen's water,
 * the two everyday sizes one tap each, and Undo for the last tap. Driven
 * through the real hook on the one Firestore fake (ADR-0009).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: {} }),
  useUid: () => "u1",
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import FoodWaterRow from "../FoodWaterRow";
import { flushWater } from "@/lib/waterActions";
import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const YESTERDAY = localDateString(
  new Date(new Date().setDate(new Date().getDate() - 1))
);
const PATH = `users/u1/waterLog/${YESTERDAY}`;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(async () => {
  await flushWater("u1");
  cleanup();
});

describe("FoodWaterRow", () => {
  it("adds water to the day on screen, and takes the last tap back", async () => {
    seedFirestore({ [PATH]: { ml: 500, targetMl: 2000 } });
    render(<FoodWaterRow date={YESTERDAY} />);
    expect(await screen.findByText(/logged/)).toHaveTextContent(
      "500 ml logged"
    );

    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    expect(screen.getByText(/·/)).toHaveTextContent("+250 ml · 750 ml");
    await act(async () => {
      await flushWater("u1");
    });
    expect(readDoc(PATH)).toMatchObject({ ml: 750 });

    fireEvent.click(screen.getByRole("button", { name: "Undo 250 ml" }));
    await act(async () => {
      await flushWater("u1");
    });
    await waitFor(() =>
      expect(screen.getByText(/logged/)).toHaveTextContent("500 ml logged")
    );
    expect(readDoc(PATH)).toMatchObject({ ml: 500 });
  });

  it("offers the two everyday sizes", async () => {
    render(<FoodWaterRow date={YESTERDAY} />);
    expect(await screen.findByText(/logged/)).toHaveTextContent("0 ml logged");
    expect(screen.getByRole("button", { name: "Add 250 ml" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add 500 ml" })).toBeEnabled();
  });
});
