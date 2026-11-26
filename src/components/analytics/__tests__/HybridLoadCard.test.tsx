import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import HybridLoadCard from "../HybridLoadCard";

const TODAY = "2026-10-20";

function daysAgoKey(daysAgo: number): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  return localDateString(
    addLocalDays(new Date(y, m - 1, d, 12, 0, 0), -daysAgo)
  );
}

describe("HybridLoadCard", () => {
  it("renders nothing on cold-start / insufficient history", () => {
    const { container } = render(
      <HybridLoadCard workouts={[]} runs={[]} todayKey={TODAY} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Fitness, Fatigue, Form, and combined lifting + running provenance", () => {
    const workouts = [];
    const runs = [];
    for (let d = 42; d >= 0; d -= 2) {
      if (d % 4 === 0) {
        workouts.push({
          date: daysAgoKey(d),
          exercises: [
            {
              exerciseId: "bench-press",
              exerciseName: "Bench Press",
              category: "Chest",
              caloriesBurned: 120,
              sets: Array.from({ length: 16 }, (_, idx) => ({
                setNumber: idx + 1,
                type: "working" as const,
                weightKg: 80,
                reps: 8,
                rpe: 8,
              })),
            },
          ],
        });
      } else {
        runs.push({
          day: daysAgoKey(d),
          date: daysAgoKey(d),
          duration: 2400,
          distance: 8000,
          activityType: "easy",
          type: "run",
          relativeEffort: null,
          isInvalid: false,
          savedAnyway: false,
        });
      }
    }

    render(<HybridLoadCard workouts={workouts} runs={runs} todayKey={TODAY} />);
    expect(screen.getByText("Fitness and form")).toBeInTheDocument();
    expect(screen.getByText("Fitness")).toBeInTheDocument();
    expect(screen.getByText("Fatigue")).toBeInTheDocument();
    expect(screen.getByText("Form")).toBeInTheDocument();
    expect(
      screen.getByText(/Combined lifting and running/)
    ).toBeInTheDocument();

    const grid = screen.getByText("Fitness").parentElement?.parentElement;
    expect(grid?.className).toContain("@max-[17em]:grid-cols-1");
    expect(grid?.parentElement?.className).toContain("@container");
  });
});
