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

/** The row's line, read whole: its figures sit in spans of their own. */
const line = (pattern: RegExp) => (_: string, el: Element | null) =>
  el?.tagName === "P" && pattern.test(el.textContent ?? "");

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
    expect(await screen.findByText(line(/of 2/))).toHaveTextContent(
      "500 ml of 2 L"
    );

    fireEvent.click(screen.getByRole("button", { name: "Add 250 ml" }));
    expect(screen.getByText(/·/)).toHaveTextContent("+250 ml · 750 ml of 2 L");
    await act(async () => {
      await flushWater("u1");
    });
    expect(readDoc(PATH)).toMatchObject({ ml: 750 });

    fireEvent.click(screen.getByRole("button", { name: "Undo 250 ml" }));
    await act(async () => {
      await flushWater("u1");
    });
    await waitFor(() =>
      expect(screen.getByText(line(/of 2/))).toHaveTextContent("500 ml of 2 L")
    );
    expect(readDoc(PATH)).toMatchObject({ ml: 500 });
  });

  it("offers the two everyday sizes", async () => {
    render(<FoodWaterRow date={YESTERDAY} />);
    expect(await screen.findByText(line(/of 2/))).toHaveTextContent(
      "0 ml of 2 L"
    );
    expect(screen.getByRole("button", { name: "Add 250 ml" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add 500 ml" })).toBeEnabled();
  });

  it("says the day against its target, and fills the bar to it", async () => {
    seedFirestore({ [PATH]: { ml: 1500, targetMl: 2000 } });
    const { container } = render(<FoodWaterRow date={YESTERDAY} />);
    expect(await screen.findByText(line(/of 2/))).toHaveTextContent(
      "1.5 L of 2 L"
    );
    const fill = container.querySelector("[data-water-bar] > div");
    expect((fill as HTMLElement).style.width).toBe("75%");
  });

  it("says plainly once the target is met, with the bar full", async () => {
    seedFirestore({ [PATH]: { ml: 2500, targetMl: 2000 } });
    const { container } = render(<FoodWaterRow date={YESTERDAY} />);
    expect(await screen.findByText(/reached/)).toHaveTextContent(
      "2.5 L · 2 L reached"
    );
    const fill = container.querySelector("[data-water-bar] > div");
    expect((fill as HTMLElement).style.width).toBe("100%");
    expect(container.textContent).not.toMatch(/!/);
  });
});
