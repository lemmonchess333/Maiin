import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Meal } from "@/hooks/useMeals";
import type { MealCopyResult, MealCopySelection } from "@/lib/mealCopy";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/mealEntry", () => ({ createMealEntry: vi.fn() }));

import CopyMealsSheet from "../CopyMealsSheet";

afterEach(cleanup);

const oats: Meal = {
  id: "oats", date: "2026-09-07", foodName: "Oats", meal: "breakfast",
  items: [{ name: "Oats", portionSize: "80 g", calories: 400, protein: 20, carbs: 60, fat: 10 }],
  totalCalories: 400, totalProtein: 20, totalCarbs: 60, totalFat: 10,
  confidence: "manual", createdAt: new Date(),
};
const rice: Meal = { ...oats, id: "rice", foodName: "Rice", meal: "lunch", totalCalories: 300 };

function setup(onSave = vi.fn<(selection: readonly MealCopySelection[]) => Promise<MealCopyResult>>()
  .mockResolvedValue({ created: [], error: null })) {
  const onClose = vi.fn();
  const view = render(<CopyMealsSheet sources={[oats, rice]} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose, ...view };
}

describe("CopyMealsSheet", () => {
  it("allows selection and portion changes without logging before the explicit action", async () => {
    const { onSave, onClose } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Rice" }));
    fireEvent.change(screen.getByLabelText("Portion for Oats"), { target: { value: "0.5" } });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("1 meal selected · 200 kcal");
    expect(screen.getByRole("status")).toHaveTextContent("Protein 10 g");
    fireEvent.click(screen.getByRole("button", { name: "Log selected meals" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith([{ source: oats, multiplier: 0.5, destinationId: expect.any(String) }]);
  });

  it("requires a selection and a valid portion for every selected entry", () => {
    setup();
    const save = screen.getByRole("button", { name: "Log selected meals" });
    fireEvent.change(screen.getByLabelText("Portion for Oats"), { target: { value: "0" } });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("greater than 0");
    fireEvent.click(screen.getByRole("checkbox", { name: "Oats" }));
    expect(save).not.toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Rice" }));
    expect(save).toBeDisabled();
  });

  it("retains unsaved choices and stable identities after a partial failure", async () => {
    const onSave = vi.fn<(selection: readonly MealCopySelection[]) => Promise<MealCopyResult>>()
      .mockResolvedValueOnce({ created: [{ sourceId: "oats", id: "accepted-oats", slot: "breakfast" }], error: new Error("full") })
      .mockResolvedValueOnce({ created: [{ sourceId: "rice", id: "accepted-rice", slot: "lunch" }], error: null });
    const { onClose, rerender } = setup(onSave);
    fireEvent.change(screen.getByLabelText("Portion for Rice"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Log selected meals" }));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Oats" })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Portion for Rice")).toHaveValue("1.5");
    expect(screen.getByRole("alert")).toHaveTextContent("remaining choices are still here");
    // A listener now reports a populated slot: the open sheet still owns
    // its untouched remaining choices, including this adjusted portion.
    rerender(<CopyMealsSheet sources={[]} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Log selected meals" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[1][0]).toEqual([onSave.mock.calls[0][0][1]]);
  });

  it("keeps editing available after a failed save and ignores repeated taps while saving", async () => {
    let reject!: (error: Error) => void;
    const onSave = vi.fn<(selection: readonly MealCopySelection[]) => Promise<MealCopyResult>>()
      .mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const { onClose } = setup(onSave);
    const save = screen.getByRole("button", { name: "Log selected meals" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Portion for Oats")).toBeDisabled();
    reject(new Error("unavailable"));
    await waitFor(() => expect(screen.getByLabelText("Portion for Oats")).not.toBeDisabled());
    expect(save).not.toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
