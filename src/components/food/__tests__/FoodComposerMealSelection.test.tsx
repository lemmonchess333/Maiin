import { createRef, useState } from "react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FoodComposerCard from "../FoodComposerCard";
import type { MealKey } from "../mealConstants";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const props: ComponentProps<typeof FoodComposerCard> = {
  nlInput: "",
  setNlInput: vi.fn(),
  nlParsing: false,
  inputFocused: false,
  setInputFocused: vi.fn(),
  setSuggestionsActive: vi.fn(),
  placeholderPrompt: "Search food or describe a meal",
  onParse: vi.fn(),
  inputRef: createRef<HTMLTextAreaElement>(),
  targetMeal: null,
  onTargetMeal: vi.fn(),
  showSuggestions: false,
  suggestions: [],
  offResults: [],
  pantryResults: [],
  offEmpty: false,
  offSearchQuery: null,
  onSelectSuggestion: vi.fn(),
  onSelectOff: vi.fn(),
  onSelectPantry: vi.fn(),
  scanUsage: {
    loading: false,
    remaining: 0,
    limit: 0,
    isUnlimited: true,
    resetDate: new Date("2026-06-10T00:00:00Z"),
  },
  scanOverrides: { onClick: vi.fn() },
  onUpgrade: vi.fn(),
  onManualOpen: vi.fn(),
};

function MealComposer({ start = "dinner" as MealKey | null }) {
  const [targetMeal, setTargetMeal] = useState<MealKey | null>(start);
  return (
    <FoodComposerCard
      {...props}
      targetMeal={targetMeal}
      onTargetMeal={setTargetMeal}
    />
  );
}

const chip = () => screen.getByRole("button", { name: /change meal$/i });
const menu = () => screen.queryByRole("menu", { name: "Add to meal" });
const item = (name: string) => screen.getByRole("menuitemradio", { name });

/**
 * Food11 call 3: the meal is one chip in the field, which opens the four
 * meals. It replaced a row of four meal buttons above the field, where a
 * tap on the selected one cleared it.
 */
describe("Food composer meal selection", () => {
  it("names the meal a log goes to, with its menu shut", () => {
    render(<MealComposer />);
    expect(chip()).toHaveAccessibleName("Add to Dinner. Change meal");
    expect(chip()).toHaveTextContent(/^Dinner$/);
    expect(chip()).toHaveAttribute("aria-haspopup", "menu");
    expect(chip()).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toBeNull();
  });

  it("opens the four meals, the chosen one checked and focused", () => {
    render(<MealComposer />);
    fireEvent.click(chip());
    expect(chip()).toHaveAttribute("aria-expanded", "true");
    const items = within(menu()!).getAllByRole("menuitemradio");
    expect(items.map((el) => el.textContent)).toEqual([
      "Breakfast",
      "Lunch",
      "Snacks",
      "Dinner",
    ]);
    expect(item("Dinner")).toHaveAttribute("aria-checked", "true");
    expect(item("Lunch")).toHaveAttribute("aria-checked", "false");
    expect(item("Dinner")).toHaveFocus();
  });

  it("picks another meal in two taps and shuts the menu", () => {
    render(<MealComposer />);
    fireEvent.click(chip());
    fireEvent.click(item("Breakfast"));
    expect(menu()).toBeNull();
    expect(chip()).toHaveAccessibleName("Add to Breakfast. Change meal");
  });

  it("picking the meal already chosen only shuts the menu", () => {
    const onTargetMeal = vi.fn();
    render(
      <FoodComposerCard
        {...props}
        targetMeal="dinner"
        onTargetMeal={onTargetMeal}
      />
    );
    fireEvent.click(chip());
    fireEvent.click(item("Dinner"));
    expect(onTargetMeal).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(chip()).toHaveFocus();
  });

  it("moves through the meals with the arrow keys, round the ends", () => {
    render(<MealComposer />);
    fireEvent.click(chip());
    fireEvent.keyDown(item("Dinner"), { key: "ArrowDown" });
    expect(item("Breakfast")).toHaveFocus();
    fireEvent.keyDown(item("Breakfast"), { key: "ArrowUp" });
    expect(item("Dinner")).toHaveFocus();
    fireEvent.keyDown(item("Dinner"), { key: "Home" });
    expect(item("Breakfast")).toHaveFocus();
    fireEvent.keyDown(item("Breakfast"), { key: "End" });
    expect(item("Dinner")).toHaveFocus();
    // Moving is not choosing.
    expect(item("Dinner")).toHaveAttribute("aria-checked", "true");
  });

  it("Escape shuts the menu and gives the chip back the focus", () => {
    render(<MealComposer />);
    fireEvent.click(chip());
    fireEvent.keyDown(item("Dinner"), { key: "Escape" });
    expect(menu()).toBeNull();
    expect(chip()).toHaveFocus();
    expect(chip()).toHaveAccessibleName("Add to Dinner. Change meal");
  });

  it("a tap outside shuts the menu and changes nothing", () => {
    const { container } = render(<MealComposer />);
    fireEvent.click(chip());
    fireEvent.click(container.querySelector('[role="presentation"]')!);
    expect(menu()).toBeNull();
    expect(chip()).toHaveAccessibleName("Add to Dinner. Change meal");
  });

  it("puts the suggestions away as the menu opens", () => {
    const setSuggestionsActive = vi.fn();
    render(
      <FoodComposerCard
        {...props}
        targetMeal="dinner"
        setSuggestionsActive={setSuggestionsActive}
      />
    );
    fireEvent.click(chip());
    expect(setSuggestionsActive).toHaveBeenCalledWith(false);
  });

  it('reads "Meal" when none is chosen, as after a change of day', () => {
    render(<MealComposer start={null} />);
    const unset = screen.getByRole("button", { name: "Choose a meal" });
    expect(unset).toHaveTextContent(/^Meal$/);
    fireEvent.click(unset);
    expect(
      within(menu()!).queryByRole("menuitemradio", { checked: true })
    ).toBeNull();
    // Opened with nothing chosen, the focus is on the first meal.
    expect(item("Breakfast")).toHaveFocus();
    fireEvent.click(item("Snacks"));
    expect(chip()).toHaveAccessibleName("Add to Snacks. Change meal");
  });
});
