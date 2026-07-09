/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PantrySuggestion } from "../FoodSuggestionsDropdown";

vi.mock("framer-motion", () => ({
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
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import FoodSuggestionsDropdown, {
  type QuickAddSection,
  type OFFResult,
} from "../FoodSuggestionsDropdown";
import type { QuickAddItem } from "@/lib/quickAddOrder";

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

function makeOff(over: Partial<OFFResult> = {}): OFFResult {
  return {
    name: over.name ?? "Granola",
    brand: over.brand ?? "",
    calories: over.calories ?? 400,
    protein: over.protein ?? 10,
    carbs: over.carbs ?? 60,
    fat: over.fat ?? 12,
    servingSize: over.servingSize ?? "100g",
    unitConfidence: over.unitConfidence,
  };
}

function renderOff(offResults: OFFResult[]) {
  render(
    <FoodSuggestionsDropdown
      suggestions={[]}
      offResults={offResults}
      pantryResults={[]}
      offEmpty={false}
      offSearchQuery="granola"
      onSelectSuggestion={vi.fn()}
      onSelectOff={vi.fn()}
      onSelectPantry={vi.fn()}
      onLogManually={vi.fn()}
    />
  );
}

describe("FoodSuggestionsDropdown — OFF serving-size hint (Eval4 slice)", () => {
  it("shows 'serving size needed' instead of 'per …' on a low-confidence row", () => {
    renderOff([makeOff({ unitConfidence: "low", servingSize: "100g" })]);
    expect(screen.getByText(/serving size needed/i)).toBeInTheDocument();
    expect(screen.queryByText(/per 100g/i)).toBeNull();
  });

  it("shows 'per <serving>' and no hint on a high-confidence row", () => {
    renderOff([makeOff({ unitConfidence: "high", servingSize: "40g" })]);
    expect(screen.getByText(/per 40g/i)).toBeInTheDocument();
    expect(screen.queryByText(/serving size needed/i)).toBeNull();
  });
});

/* ── wave2 D: empty-focus Quick Add section ─────────────────────────────
   The standing FoodQuickAddRow chip strip was retired; its items render
   here while the input is focused + empty. The long-press → remove
   gesture suite below is PORTED from FoodQuickAddRow.test.tsx (coverage
   moved with the feature, not deleted). */

import { beforeEach, afterEach } from "vitest";

function makeItem(over: Partial<QuickAddItem> = {}): QuickAddItem {
  return {
    key: over.key ?? "oats",
    name: over.name ?? "Oats",
    cal: over.cal ?? 200,
    pro: over.pro ?? 8,
    carb: over.carb ?? 30,
    fat: over.fat ?? 4,
    portionSize: over.portionSize ?? "1 bowl",
    favouriteId: over.favouriteId,
  };
}

function renderQuickAdd(quickAdd: Partial<QuickAddSection> = {}) {
  const section: QuickAddSection = {
    items: [makeItem()],
    asExamples: false,
    adding: null,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...quickAdd,
  };
  render(
    <FoodSuggestionsDropdown
      suggestions={[]}
      offResults={[]}
      pantryResults={[]}
      quickAdd={section}
      offEmpty={false}
      offSearchQuery={null}
      onSelectSuggestion={vi.fn()}
      onSelectOff={vi.fn()}
      onSelectPantry={vi.fn()}
      onLogManually={vi.fn()}
    />
  );
  return section;
}

describe("FoodSuggestionsDropdown — empty-focus Quick Add (wave2 D)", () => {
  it("renders the user's items under a 'Quick Add' header with kcal", () => {
    renderQuickAdd({ items: [makeItem({ name: "Protein Shake", cal: 250 })] });
    expect(screen.getByText(/quick add/i)).toBeInTheDocument();
    expect(screen.getByText("Protein Shake")).toBeInTheDocument();
    expect(screen.getByText(/250 kcal/)).toBeInTheDocument();
  });

  it("frames seeded items as 'Examples' for cold-start accounts", () => {
    renderQuickAdd({ asExamples: true });
    expect(screen.getByText(/examples/i)).toBeInTheDocument();
    expect(screen.queryByText(/quick add/i)).toBeNull();
  });

  it("tap fires onAdd with the item (instant-log semantics)", () => {
    const onAdd = vi.fn();
    const item = makeItem({ name: "Oats" });
    renderQuickAdd({ items: [item], onAdd });
    fireEvent.click(screen.getByRole("button", { name: /oats/i }));
    expect(onAdd).toHaveBeenCalledWith(item);
  });

  it("rows are disabled while a save is in flight (adding non-null)", () => {
    const onAdd = vi.fn();
    renderQuickAdd({ adding: "oats", onAdd });
    const row = screen.getByRole("button", { name: /oats/i });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("renders nothing when quickAdd is null (typed-query mode untouched)", () => {
    render(
      <FoodSuggestionsDropdown
        suggestions={[]}
        offResults={[]}
        pantryResults={[makePantry({ name: "Greek yoghurt" })]}
        quickAdd={null}
        offEmpty={false}
        offSearchQuery={null}
        onSelectSuggestion={vi.fn()}
        onSelectOff={vi.fn()}
        onSelectPantry={vi.fn()}
        onLogManually={vi.fn()}
      />
    );
    expect(screen.queryByText(/quick add/i)).toBeNull();
    expect(screen.queryByText(/examples/i)).toBeNull();
    expect(screen.getByText("Greek yoghurt")).toBeInTheDocument();
  });
});

describe("FoodSuggestionsDropdown quick-add — long-press → remove (ported from FoodQuickAddRow)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onRemove after 500ms hold on a favourite-backed row", () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    renderQuickAdd({
      items: [makeItem({ favouriteId: "oats" })],
      onRemove,
      onAdd,
    });
    const row = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(500);
    expect(onRemove).toHaveBeenCalledWith("oats", "Oats");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does NOT fire on a row without a favouriteId (recents/defaults)", () => {
    const onRemove = vi.fn();
    renderQuickAdd({ items: [makeItem({ favouriteId: undefined })], onRemove });
    const row = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(600);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("cancels the long-press when the finger drifts > 10px (scroll intent)", () => {
    const onRemove = vi.fn();
    renderQuickAdd({ items: [makeItem({ favouriteId: "oats" })], onRemove });
    const row = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(row, { clientX: 130, clientY: 100 });
    vi.advanceTimersByTime(600);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("cancels the long-press on early release (pointerUp before 500ms)", () => {
    const onRemove = vi.fn();
    renderQuickAdd({ items: [makeItem({ favouriteId: "oats" })], onRemove });
    const row = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(300);
    fireEvent.pointerUp(row);
    vi.advanceTimersByTime(300);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("suppresses the trailing click after a long-press (ghost-click guard)", () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    renderQuickAdd({
      items: [makeItem({ favouriteId: "oats" })],
      onRemove,
      onAdd,
    });
    const row = screen.getByRole("button", { name: /oats/i });
    fireEvent.pointerDown(row, { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(500);
    fireEvent.click(row);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("calls onAdd on a normal tap (no long-press)", () => {
    const onAdd = vi.fn();
    renderQuickAdd({ items: [makeItem({ favouriteId: "oats" })], onAdd });
    fireEvent.click(screen.getByRole("button", { name: /oats/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("preventDefault on contextmenu for favourite rows, no-op otherwise", () => {
    renderQuickAdd({
      items: [
        makeItem({ name: "Oats", key: "oats", favouriteId: "oats" }),
        makeItem({ name: "Toast", key: "toast", favouriteId: undefined }),
      ],
    });
    const oats = screen.getByRole("button", { name: /oats/i });
    const toastRow = screen.getByRole("button", { name: /toast/i });

    const oatsEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    oats.dispatchEvent(oatsEvent);
    expect(oatsEvent.defaultPrevented).toBe(true);

    const toastEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    toastRow.dispatchEvent(toastEvent);
    expect(toastEvent.defaultPrevented).toBe(false);
  });
});
