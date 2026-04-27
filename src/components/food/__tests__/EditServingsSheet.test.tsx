import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/haptic", function() {
  return { haptic: vi.fn() };
});

import EditServingsSheet from "../EditServingsSheet";

afterEach(cleanup);

function renderSheet(overrides: {
  source?: { foodName: string; currentCount: number; currentTotalCalories: number } | null;
  onCancel?: () => void;
  onSave?: (n: number) => void | Promise<void>;
} = {}) {
  const source = overrides.source === undefined
    ? { foodName: "Boiled egg", currentCount: 2, currentTotalCalories: 156 }
    : overrides.source;
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
    expect(onSave).toHaveBeenCalledWith(4);
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
        source={{ foodName: "Apple", currentCount: 1, currentTotalCalories: 95 }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    // Same component instance → stepper target persists.
    expect(screen.getByLabelText(/3 servings/)).toBeInTheDocument();
  });
});
