/**
 * The manual logger as a scanned product's details (F2d).
 *
 * A barcode the food database did not have used to end in a toast. Type
 * details opens this form for the product: the meal keeps the code, and
 * "Add to my pantry", on by default, files the product under it so the
 * next scan of the same pack finds it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const createMealEntry = vi.fn();
const addFavourite = vi.fn();

vi.mock("@/lib/mealEntry", () => ({
  createMealEntry: (...args: unknown[]) => createMealEntry(...args),
  notifyMealsLogged: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "u1" }));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({ addFavourite }),
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

function fillProduct() {
  type("Product name", "Corner shop flapjack");
  type("Calories (kcal)", "320");
  type("Protein (g)", "5");
}

describe("ManualFoodLogger — a product the scan did not find", () => {
  it("files the product in the pantry under its barcode, with the switch on", async () => {
    const onSaved = vi.fn();
    render(
      <ManualFoodLogger
        open
        onClose={vi.fn()}
        onSaved={onSaved}
        barcode="5012345678900"
      />
    );
    expect(
      screen.getByRole("switch", { name: "Add to my pantry" })
    ).toHaveAttribute("aria-checked", "true");
    fillProduct();
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(createMealEntry.mock.calls[0][1]).toMatchObject({
      foodName: "Corner shop flapjack",
      totalCalories: 320,
      barcode: "5012345678900",
    });
    expect(addFavourite).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Corner shop flapjack",
        calories: 320,
        source: "barcode",
        barcode: "5012345678900",
      })
    );
  });

  it("logs a one-off without filing it when the switch is off", async () => {
    const onSaved = vi.fn();
    render(
      <ManualFoodLogger
        open
        onClose={vi.fn()}
        onSaved={onSaved}
        barcode="5012345678900"
      />
    );
    fillProduct();
    fireEvent.click(screen.getByRole("switch", { name: "Add to my pantry" }));
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(createMealEntry).toHaveBeenCalledTimes(1);
    expect(addFavourite).not.toHaveBeenCalled();
  });

  it("keeps the ordinary manual log as it was: no switch, no barcode", async () => {
    const onSaved = vi.fn();
    render(<ManualFoodLogger open onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.queryByRole("switch")).toBeNull();
    type("Meal name", "Porridge");
    type("Calories (kcal)", "300");
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(createMealEntry.mock.calls[0][1]).not.toHaveProperty("barcode");
    expect(addFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Porridge", source: "manual" })
    );
    expect(addFavourite.mock.calls[0][0]).not.toHaveProperty("barcode");
  });
});
