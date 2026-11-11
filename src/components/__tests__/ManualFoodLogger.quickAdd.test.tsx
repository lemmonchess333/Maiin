/**
 * Quick add needs no name (Mob2, call 4): "about 400 kcal at the café" is
 * logged as calories, saved under "Quick add", and kept out of the pantry,
 * where it would come back as a food to repeat. A product's form still
 * asks for the product's name.
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
const notifyMealsLogged = vi.fn();
const addFavourite = vi.fn();

vi.mock("@/lib/mealEntry", () => ({
  createMealEntry: (...args: unknown[]) => createMealEntry(...args),
  notifyMealsLogged: (...args: unknown[]) => notifyMealsLogged(...args),
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

describe("ManualFoodLogger — Quick add", () => {
  it("is titled Quick add and says the name is optional", () => {
    render(<ManualFoodLogger open onClose={vi.fn()} />);
    expect(screen.getByText("Quick add")).toBeInTheDocument();
    expect(screen.getByLabelText("Meal name")).toHaveAttribute(
      "placeholder",
      "Name (optional)"
    );
  });

  it("logs calories with no name as Quick add, and keeps it out of the pantry", async () => {
    render(<ManualFoodLogger open onClose={vi.fn()} />);
    type("Calories (kcal)", "400");
    const log = screen.getByRole("button", { name: /log meal/i });
    expect(log).toBeEnabled();
    fireEvent.click(log);
    await waitFor(() => expect(createMealEntry).toHaveBeenCalledTimes(1));
    const [, entry] = createMealEntry.mock.calls[0];
    expect(entry.foodName).toBe("Quick add");
    expect(entry.items[0]).toMatchObject({ name: "Quick add", calories: 400 });
    expect(entry.totalCalories).toBe(400);
    expect(addFavourite).not.toHaveBeenCalled();
  });

  it("still files a named entry in the pantry", async () => {
    render(<ManualFoodLogger open onClose={vi.fn()} />);
    type("Meal name", "Flat white");
    type("Calories (kcal)", "120");
    fireEvent.click(screen.getByRole("button", { name: /log meal/i }));
    await waitFor(() => expect(addFavourite).toHaveBeenCalledTimes(1));
    expect(createMealEntry.mock.calls[0][1].foodName).toBe("Flat white");
  });

  it("a product's form still needs the product's name", () => {
    render(<ManualFoodLogger open onClose={vi.fn()} barcode="5000112548167" />);
    type("Calories (kcal)", "140");
    expect(screen.getByRole("button", { name: /log meal/i })).toBeDisabled();
  });
});
