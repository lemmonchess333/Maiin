/**
 * The manual logger clears and closes on the save, not on a timer.
 *
 * A successful save armed a 1.5-second timer that blanked all five fields
 * and closed the sheet. The sheet does not unmount on close — the parent
 * only flips `open` — so the timer stayed armed on the same component:
 * dismiss inside that window, reopen, start typing, and the previous
 * save's timer wiped what had just been typed and shut the sheet under
 * the user. Editing during the save had the same shape from the other
 * end.
 *
 * The fix is the absence of the timer rather than a shorter one: there is
 * no window left for a stale reset to land in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";

const createMealEntry = vi.fn();
const notifyMealsLogged = vi.fn();

vi.mock("@/lib/mealEntry", () => ({
  createMealEntry: (...args: unknown[]) => createMealEntry(...args),
  notifyMealsLogged: (...args: unknown[]) => notifyMealsLogged(...args),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({ addFavourite: vi.fn() }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import { ManualFoodLogger } from "@/components/ManualFoodLogger";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  createMealEntry.mockResolvedValue({ id: "m1" });
});

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ManualFoodLogger reset", () => {
  it("closes as soon as the save resolves", async () => {
    const onClose = vi.fn();
    render(<ManualFoodLogger open onClose={onClose} />);
    type("Meal name", "Porridge");
    type("Calories (kcal)", "300");
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(notifyMealsLogged).toHaveBeenCalled();
  });

  it("leaves no timer that can clear a later entry", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { rerender } = render(<ManualFoodLogger open onClose={onClose} />);
      type("Meal name", "Porridge");
      fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      // The sheet is dismissed and reopened well inside the old window,
      // and the user starts the next entry.
      rerender(<ManualFoodLogger open={false} onClose={onClose} />);
      rerender(<ManualFoodLogger open onClose={onClose} />);
      type("Meal name", "Chicken salad");
      type("Calories (kcal)", "420");

      // Past where the reset used to fire.
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByLabelText("Meal name")).toHaveValue("Chicken salad");
      expect(screen.getByLabelText("Calories (kcal)")).toHaveValue(420);
      // And the sheet was not closed a second time under the user.
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts the next entry empty after a save", async () => {
    const onClose = vi.fn();
    render(<ManualFoodLogger open onClose={onClose} />);
    type("Meal name", "Porridge");
    type("Protein (g)", "12");
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.getByLabelText("Meal name")).toHaveValue("");
    expect(screen.getByLabelText("Protein (g)")).toHaveValue(null);
  });

  it("keeps a failed entry on screen and does not close", async () => {
    createMealEntry.mockRejectedValueOnce(new Error("offline"));
    const onClose = vi.fn();
    render(<ManualFoodLogger open onClose={onClose} />);
    type("Meal name", "Porridge");
    type("Calories (kcal)", "300");
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /log meal/i })
      ).not.toBeDisabled()
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Meal name")).toHaveValue("Porridge");
  });
});
