/**
 * FoodRow — the swipe Delete panel shows only while the row is off zero.
 *
 * At rest the row covers the red panel exactly, but the food log card's
 * rounded corner clips both layers with the same soft edge, and the red
 * showed through it as a hairline along the last row's bottom corners
 * (seen on an iPhone screenshot). The panel's opacity is a transform of
 * the row's offset, so this suite runs the real framer-motion; the
 * sibling FoodRow.test.tsx mocks it away to drive clicks.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import FoodRow, { type FoodRowGroup } from "../FoodRow";

vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

afterEach(cleanup);

const group: FoodRowGroup = {
  id: "lunch-chicken-salad",
  foodName: "Chicken salad",
  items: [{ portionSize: "1 bowl" }],
  count: 1,
  totalCal: 420,
  totalPro: 35,
  totalCarb: 25,
  totalFat: 18,
};

function row(isOpen: boolean) {
  return (
    <FoodRow
      group={group}
      isOpen={isOpen}
      onOpenChange={vi.fn()}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

describe("FoodRow — the Delete panel under the row", () => {
  it("is invisible while the row rests at zero", () => {
    render(row(false));
    expect(screen.getByLabelText("Delete Chicken salad")).toHaveStyle({
      opacity: "0",
    });
  });

  it("shows once the row slides open, and hides again when it closes", async () => {
    const { rerender } = render(row(false));
    const panel = screen.getByLabelText("Delete Chicken salad");
    rerender(row(true));
    await waitFor(() => expect(panel).toHaveStyle({ opacity: "1" }));
    rerender(row(false));
    await waitFor(() => expect(panel).toHaveStyle({ opacity: "0" }));
  });

  it("stays reachable by a screen reader at rest", () => {
    // Opacity, not visibility or display: hiding the panel from sight
    // must not take "Delete Chicken salad" out of the accessibility tree.
    render(row(false));
    expect(
      screen.getByRole("button", { name: "Delete Chicken salad" })
    ).toBeInTheDocument();
  });
});
