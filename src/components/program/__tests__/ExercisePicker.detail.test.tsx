/**
 * ExercisePicker — the row has TWO tap targets (owner request 2026-09-02:
 * "you should be able to click on them to also see them, not just press
 * the plus"):
 *   - the body opens a detail sheet showing the exercise's Form content
 *     with an Add/Added action, WITHOUT changing the selection;
 *   - the trailing circle (role=checkbox) toggles selection WITHOUT
 *     opening the sheet.
 * The sheet's action toggles the same selection the batch bar reads.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [], loading: false }),
}));
vi.mock("@/components/ExerciseFormContent", () => ({
  default: ({ exerciseName }: { exerciseName: string }) => (
    <div data-testid="form-content">Form for {exerciseName}</div>
  ),
}));

import ExercisePicker from "../ExercisePicker";

function mount() {
  const onMultiSelect = vi.fn();
  render(
    <MemoryRouter>
      <ExercisePicker
        open
        onSelect={vi.fn()}
        onMultiSelect={onMultiSelect}
        onClose={vi.fn()}
        headerTitle="Add Exercise"
      />
    </MemoryRouter>
  );
  return { onMultiSelect };
}

describe("ExercisePicker row: see it vs add it", () => {
  it("the trailing circle selects without opening the sheet", () => {
    mount();
    const box = screen.getByRole("checkbox", { name: "Dips" });
    expect(box).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("form-content")).toBeNull();
    expect(screen.getByText(/1 exercise selected/)).toBeInTheDocument();
  });

  it("the row body opens the detail sheet without touching the selection", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    expect(screen.getByTestId("form-content")).toHaveTextContent(
      "Form for Dips"
    );
    // The open sheet makes the page behind it inert (modal semantics), so
    // the row's checkbox is queried with `hidden` from here on.
    expect(
      screen.getByRole("checkbox", { name: "Dips", hidden: true })
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/exercise selected/)).toBeNull();
  });

  it("the sheet's action toggles the same selection the batch bar reads", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to workout" }));
    expect(
      screen.getByRole("checkbox", { name: "Dips", hidden: true })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "Selected — tap to unselect" })
    ).toBeInTheDocument();
    expect(screen.getByText(/1 exercise selected/)).toBeInTheDocument();
  });
});
