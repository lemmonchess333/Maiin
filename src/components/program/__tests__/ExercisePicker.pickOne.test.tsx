/**
 * ExercisePicker for a swap or a replace (`pickAction`): one exercise, and
 * the bar says the action. Without it, "Swap for today" read "1 exercise
 * selected — Add to workout", and ticking two swapped twice.
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
  it("keeps one choice, and the bar says the action", () => {
    const { onSelect, onClose } = mount();
    const dips = screen.getByRole("checkbox", { name: "Dips" });
    const pushUps = screen.getByRole("checkbox", { name: "Push-Ups" });
    fireEvent.click(dips);
    fireEvent.click(pushUps);
    expect(dips).toHaveAttribute("aria-checked", "false");
    expect(pushUps).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/exercises? selected/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Swap for today" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ name: "Push-Ups" });
    expect(onClose).toHaveBeenCalled();
  });

  it("a second tap on the choice clears it", async () => {
    mount();
    const dips = screen.getByRole("checkbox", { name: "Dips" });
    fireEvent.click(dips);
    fireEvent.click(dips);
    expect(dips).toHaveAttribute("aria-checked", "false");
    // The bar slides away rather than vanishing.
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Swap for today" })
      ).toBeNull()
    );
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
      screen.queryByRole("checkbox", { name: "Barbell Squat" })
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: "Incline Bench Press" })
    ).toBeInTheDocument();
  });

  it("marks the exercise being replaced, and never offers it", () => {
    const { onSelect } = replaceBench();
    expect(screen.queryByRole("checkbox", { name: "Bench Press" })).toBeNull();
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
