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

function MealComposer() {
  const [targetMeal, setTargetMeal] = useState<MealKey | null>("dinner");
  return (
    <FoodComposerCard
      {...props}
      targetMeal={targetMeal}
      onTargetMeal={(meal) =>
        setTargetMeal((current) => (current === meal ? null : meal))
      }
    />
  );
}

describe("Food composer meal selection", () => {
  it("clears a meal by tapping its selected pill and can select it again", () => {
    render(<MealComposer />);
    const dinner = screen.getByRole("radio", { name: "Dinner" });
    expect(dinner).toHaveAttribute("aria-checked", "true");

    fireEvent.click(dinner);
    const group = screen.getByRole("radiogroup", { name: "Add to meal" });
    expect(within(group).queryByRole("radio", { checked: true })).toBeNull();
    expect(dinner).toHaveFocus();

    fireEvent.click(dinner);
    expect(dinner).toHaveAttribute("aria-checked", "true");
  });

  it.each([" ", "Enter"])("clears a selected meal with the %j key", (key) => {
    render(<MealComposer />);
    const dinner = screen.getByRole("radio", { name: "Dinner" });
    fireEvent.keyDown(dinner, { key });
    expect(dinner).toHaveAttribute("aria-checked", "false");
    expect(dinner).toHaveFocus();
  });

  it("changes meal with arrow keys without clearing it at a navigation boundary", () => {
    render(<MealComposer />);
    const dinner = screen.getByRole("radio", { name: "Dinner" });
    const breakfast = screen.getByRole("radio", { name: "Breakfast" });
    fireEvent.keyDown(dinner, { key: "Home" });
    expect(breakfast).toHaveAttribute("aria-checked", "true");
    expect(breakfast).toHaveFocus();

    fireEvent.keyDown(breakfast, { key: "Home" });
    expect(breakfast).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(breakfast, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Lunch" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});
