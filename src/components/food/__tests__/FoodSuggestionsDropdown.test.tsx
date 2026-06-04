/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PantrySuggestion } from "../FoodSuggestionsDropdown";

vi.mock("framer-motion", () => ({
  get m() {
    return (this as { motion: unknown }).motion;
  },
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const { initial: _i, animate: _a, transition: _tn, ...rest } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
}));

import FoodSuggestionsDropdown from "../FoodSuggestionsDropdown";

function makePantry(over: Partial<PantrySuggestion> = {}): PantrySuggestion {
  return {
    id: over.id ?? "oats",
    name: over.name ?? "Oats",
    calories: over.calories ?? 200,
    protein: over.protein ?? 8,
    carbs: over.carbs ?? 30,
    fat: over.fat ?? 4,
    servingSize: over.servingSize ?? "1 bowl",
    useCount: over.useCount ?? 3,
    source: over.source ?? "manual",
  };
}

describe("FoodSuggestionsDropdown — pantry section (PR 4)", () => {
  it("renders the 'Your pantry' header + items at the top when pantryResults is non-empty", () => {
    render(
      <FoodSuggestionsDropdown
        suggestions={[]}
        offResults={[]}
        pantryResults={[makePantry({ name: "Greek yoghurt" })]}
        offEmpty={false}
        offSearchQuery={null}
        onSelectSuggestion={vi.fn()}
        onSelectOff={vi.fn()}
        onSelectPantry={vi.fn()}
        onLogManually={vi.fn()}
      />
    );
    expect(screen.getByText(/your pantry/i)).toBeInTheDocument();
    expect(screen.getByText("Greek yoghurt")).toBeInTheDocument();
  });

  it("does NOT render the 'Your pantry' header when pantryResults is empty", () => {
    render(
      <FoodSuggestionsDropdown
        suggestions={[
          {
            name: "Banana",
            calories: 100,
            protein: 1,
            carbs: 25,
            fat: 0,
            serving: "1 medium",
          },
        ]}
        offResults={[]}
        pantryResults={[]}
        offEmpty={false}
        offSearchQuery={null}
        onSelectSuggestion={vi.fn()}
        onSelectOff={vi.fn()}
        onSelectPantry={vi.fn()}
        onLogManually={vi.fn()}
      />
    );
    expect(screen.queryByText(/your pantry/i)).toBeNull();
  });

  it("fires onSelectPantry with the picked item", () => {
    const onSelectPantry = vi.fn();
    const oats = makePantry({ id: "oats", name: "Oats" });
    render(
      <FoodSuggestionsDropdown
        suggestions={[]}
        offResults={[]}
        pantryResults={[oats]}
        offEmpty={false}
        offSearchQuery={null}
        onSelectSuggestion={vi.fn()}
        onSelectOff={vi.fn()}
        onSelectPantry={onSelectPantry}
        onLogManually={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Oats"));
    expect(onSelectPantry).toHaveBeenCalledWith(oats);
  });

  it("renders pantry section above local DB suggestions in the DOM order", () => {
    render(
      <FoodSuggestionsDropdown
        suggestions={[
          {
            name: "Banana",
            calories: 100,
            protein: 1,
            carbs: 25,
            fat: 0,
            serving: "1 medium",
          },
        ]}
        offResults={[]}
        pantryResults={[makePantry({ id: "oats", name: "Oats" })]}
        offEmpty={false}
        offSearchQuery={null}
        onSelectSuggestion={vi.fn()}
        onSelectOff={vi.fn()}
        onSelectPantry={vi.fn()}
        onLogManually={vi.fn()}
      />
    );
    const oatsButton = screen.getByText("Oats");
    const bananaButton = screen.getByText(/Banana/);
    // Pantry section's button must appear before the local DB
    // section's button in document order.
    expect(
      oatsButton.compareDocumentPosition(bananaButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("renders multiple pantry items in the order received (no internal sort)", () => {
    render(
      <FoodSuggestionsDropdown
        suggestions={[]}
        offResults={[]}
        pantryResults={[
          makePantry({ id: "a", name: "Apple" }),
          makePantry({ id: "b", name: "Bread" }),
          makePantry({ id: "c", name: "Cheese" }),
        ]}
        offEmpty={false}
        offSearchQuery={null}
        onSelectSuggestion={vi.fn()}
        onSelectOff={vi.fn()}
        onSelectPantry={vi.fn()}
        onLogManually={vi.fn()}
      />
    );
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent ?? "");
    const apple = labels.findIndex((l) => l.includes("Apple"));
    const bread = labels.findIndex((l) => l.includes("Bread"));
    const cheese = labels.findIndex((l) => l.includes("Cheese"));
    expect(apple).toBeLessThan(bread);
    expect(bread).toBeLessThan(cheese);
  });
});
