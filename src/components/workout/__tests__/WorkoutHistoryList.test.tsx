import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkoutHistoryList from "../WorkoutHistoryList";
import type { Workout } from "@/hooks/useWorkouts";

describe("WorkoutHistoryList", () => {
  it("makes older records reachable in batches without losing their identity", () => {
    const workouts = Array.from(
      { length: 12 },
      (_, index) =>
        ({
          id: `saved-${index}`,
          date: "2026-08-01",
          notes: `Session ${index} — Programme Week 3`,
        }) as Workout
    );
    render(
      <MemoryRouter>
        <WorkoutHistoryList workouts={workouts} />
      </MemoryRouter>
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Saved workouts" }));
    expect(screen.getByText("All dates · 12 sessions")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show more workouts" }));
    expect(screen.getAllByRole("link")).toHaveLength(12);
    expect(screen.getByRole("link", { name: /Session 11/ })).toHaveAttribute(
      "href",
      "/workout/saved-11"
    );
    expect(
      screen.queryByRole("button", { name: "Show more workouts" })
    ).toBeNull();
  });
});
