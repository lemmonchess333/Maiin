/**
 * ExercisePicker for a swap or a replace (`pickAction`): one exercise,
 * picked by its row's circle, which does the action at once. Without it,
 * "Swap for today" read "1 exercise selected — Add to workout", and
 * ticking two swapped twice; then a bar repeated the action, a fourth tap
 * on every swap. The row's body still opens the exercise.
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
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <ExercisePicker
        open
        onSelect={onSelect}
        onClose={onClose}
        headerTitle="Swap Bench Press for today"
        pickAction="Swap for today"
      />
    </MemoryRouter>
  );
  return { onSelect, onClose };
}

describe("ExercisePicker with one exercise to pick", () => {
  it("the row's circle does the swap at once, with no bar to confirm it", () => {
    const { onSelect, onClose } = mount();
    // Nothing to tick: the circle is the action, named for it.
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Swap for today: Push-Ups" })
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ name: "Push-Ups" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/exercises? selected/)).toBeNull();
  });

  it("the row's body opens the exercise and swaps nothing", async () => {
    const { onSelect, onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    expect(await screen.findByTestId("form-content")).toHaveTextContent(
      "Form for Dips"
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the detail sheet's button does the action", async () => {
    const { onSelect, onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Dips details" }));
    await screen.findByTestId("form-content");
    expect(screen.queryByRole("button", { name: "Add to workout" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Swap for today" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ name: "Dips" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ExercisePicker replacing an exercise (Lift8 (4))", () => {
  function replaceBench() {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={onSelect}
          onClose={vi.fn()}
          headerTitle="Replace Bench Press"
          pickAction="Replace"
          currentExerciseId="bench-press"
        />
      </MemoryRouter>
    );
    return { onSelect };
  }

  it("opens on the replaced exercise's group, not every exercise", () => {
    replaceBench();
    expect(screen.getByText(/^Chest · \d+ exercises$/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Replace: Barbell Squat" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Replace: Incline Bench Press" })
    ).toBeInTheDocument();
  });

  it("marks the exercise being replaced, and never offers it", () => {
    const { onSelect } = replaceBench();
    expect(
      screen.queryByRole("button", { name: "Replace: Bench Press" })
    ).toBeNull();

    expect(screen.getByText("Current")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Bench Press details" })
    );
    const current = screen.getByRole("button", { name: "Current exercise" });
    expect(current).toBeDisabled();
    fireEvent.click(current);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
