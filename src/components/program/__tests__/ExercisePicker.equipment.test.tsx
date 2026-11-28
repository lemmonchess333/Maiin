import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({ workouts: [], loading: false }),
}));
vi.mock("@/components/ExerciseFormContent", () => ({
  default: () => null,
}));

import ExercisePicker from "../ExercisePicker";

describe("ExercisePicker equipment filter chips", () => {
  afterEach(() => cleanup());

  it("narrows exercises by selected equipment chip and resets to Any kit", () => {
    render(
      <MemoryRouter>
        <ExercisePicker
          open
          onSelect={vi.fn()}
          onClose={vi.fn()}
          headerTitle="Add exercise"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Push-Ups")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bodyweight" }));
    expect(screen.queryByText("Bench Press")).toBeNull();
    expect(screen.getByText("Push-Ups")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Barbell" }));
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.queryByText("Push-Ups")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Any kit" }));
    expect(screen.getByText("Push-Ups")).toBeInTheDocument();
  });
});
