import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/haptic", function() {
  return { haptic: vi.fn() };
});

import EditServingsSheet, { type EditServingsChanges } from "../EditServingsSheet";
import type { MealKey } from "../mealConstants";

afterEach(cleanup);

interface RenderSourceOverride {
  foodName: string;
  currentCount: number;
  currentTotalCalories: number;
  currentMeal?: MealKey | null;
}

function renderSheet(overrides: {
  source?: RenderSourceOverride | null;
  onCancel?: () => void;
  onSave?: (c: EditServingsChanges) => void | Promise<void>;
} = {}) {
  const baseSource: RenderSourceOverride =
    overrides.source === undefined
      ? { foodName: "Boiled egg", currentCount: 2, currentTotalCalories: 156, currentMeal: "breakfast" }
      : overrides.source ?? { foodName: "", currentCount: 0, currentTotalCalories: 0, currentMeal: null };
  const source = overrides.source === null
    ? null
    : { ...baseSource, currentMeal: baseSource.currentMeal ?? null };
  return render(
    <EditServingsSheet
      source={source}
      onCancel={overrides.onCancel ?? vi.fn()}
      onSave={overrides.onSave ?? vi.fn()}
    />,
  );
}

describe("EditServingsSheet", function() {
  it("renders nothing when source is null", function() {
    const { container } = renderSheet({ source: null });
    expect(container.firstChild).toBeNull();
  });

  it("initialises the stepper target to the current serving count", function() {
    renderSheet();
    expect(screen.getByLabelText(/2 servings/)).toBeInTheDocument();
  });

  it("increments the target when the + button is tapped", function() {
    renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
  });

  it("decrements the target when the − button is tapped, floored at 1", function() {
    renderSheet({ source: { foodName: "Toast", currentCount: 2, currentTotalCalories: 160 } });
    const decrease = screen.getByLabelText("Decrease servings");
    fireEvent.click(decrease);
    expect(screen.getByLabelText(/1 serving/)).toBeInTheDocument();
    // At 1 the button is disabled — tapping again shouldn't change state
    expect(decrease).toBeDisabled();
  });

  it("disables Save when the target equals the current count (no-op)", function() {
    renderSheet();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
  });

  it("enables Save once the target differs from the current count", function() {
    renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("calls onSave with the stepped target when Save is tapped", async function() {
    const onSave = vi.fn();
    renderSheet({ onSave });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ targetCount: 4, targetMeal: null });
  });

  it("calls onCancel when Cancel is tapped", function() {
    const onCancel = vi.fn();
    renderSheet({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows live calorie preview derived from current per-serving average", function() {
    // currentTotalCalories 156 / currentCount 2 = 78 cal per serving.
    // After incrementing to 3 → 234 cal preview.
    renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByText(/~ 234 cal/)).toBeInTheDocument();
    expect(screen.getByText(/\(\+1 serving\)/)).toBeInTheDocument();
  });

  it("preserves the stepper across in-place source rerenders (parent remounts via key)", function() {
    // The parent (Food.tsx) is responsible for remounting the sheet
    // when the user opens a different group, by keying the component
    // on the group id. An in-place source change must NOT reset the
    // user's stepper input — doing so would re-fire on every parent
    // render (Firestore listeners run constantly) and stomp the
    // user's tap-count mid-edit.
    const { rerender } = renderSheet();
    fireEvent.click(screen.getByLabelText("Increase servings"));
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
    rerender(
      <EditServingsSheet
        source={{ foodName: "Apple", currentCount: 1, currentTotalCalories: 95, currentMeal: "snacks" }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    // Same component instance → stepper target persists.
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
  });

  /* F5a — meal-slot picker. The Save signature now ships both the
     stepped count and the picked slot; tests below pin the four
     interaction shapes (slot only, count only, both, neither). */

  it("enables Save when the user picks a different meal slot from the current", function() {
    renderSheet({
      source: { foodName: "Yoghurt", currentCount: 1, currentTotalCalories: 120, currentMeal: "breakfast" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Snacks" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("calls onSave with targetMeal when ONLY the slot changed (count unchanged)", async function() {
    const onSave = vi.fn();
    renderSheet({
      source: { foodName: "Yoghurt", currentCount: 1, currentTotalCalories: 120, currentMeal: "breakfast" },
      onSave,
    });
    fireEvent.click(screen.getByRole("button", { name: "Snacks" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ targetCount: 1, targetMeal: "snacks" });
  });

  it("calls onSave with both targetCount and targetMeal when both changed", async function() {
    const onSave = vi.fn();
    renderSheet({
      source: { foodName: "Yoghurt", currentCount: 1, currentTotalCalories: 120, currentMeal: "breakfast" },
      onSave,
    });
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ targetCount: 2, targetMeal: "dinner" });
  });

  it("treats re-picking the original slot as no-change (targetMeal=null on Save)", async function() {
    const onSave = vi.fn();
    renderSheet({
      source: { foodName: "Yoghurt", currentCount: 1, currentTotalCalories: 120, currentMeal: "breakfast" },
      onSave,
    });
    // Bump count so Save isn't disabled, then explicitly re-pick the
    // original slot — that should NOT propagate as a slot change.
    fireEvent.click(screen.getByLabelText("Increase servings"));
    fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Breakfast" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ targetCount: 2, targetMeal: null });
  });
});
