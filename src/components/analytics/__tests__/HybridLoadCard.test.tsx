import { describe, it, expect, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import HybridLoadCard from "../HybridLoadCard";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

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

  it("renders Fitness, Fatigue, Form, trajectory chart, and combined lifting + running provenance", async () => {
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

    const raceDate = localDateString(
      addLocalDays(new Date(2026, 9, 20, 12, 0, 0), 10)
    );
    render(
      <HybridLoadCard
        workouts={workouts}
        runs={runs}
        todayKey={TODAY}
        programState={{
          goal: "recomp",
          currentPhase: "Taper",
          weekNumber: 8,
          splitType: "upper_lower",
          updatedAt: Date.now(),
          workouts: [],
          runDays: [
            { dayIndex: 2, templateId: "easy_30min", type: "easy" },
            { dayIndex: 6, templateId: "race", type: "race", date: raceDate },
          ],
          runPlan: {
            mode: "race_prep",
            raceGoal: { distance: "half_marathon", targetDate: raceDate },
          } as never,
        }}
      />
    );
    expect(await screen.findByText("Fitness and form")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Fitness and fatigue trajectory")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Fitness").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Fatigue").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Form")).toBeInTheDocument();
    expect(screen.getByText(/Race day/)).toBeInTheDocument();
    expect(
      screen.getByText(/Combined lifting and running/)
    ).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Hide forecast" });
    fireEvent.click(toggle);
    expect(screen.queryByText(/Race day/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show forecast" })
    ).toBeInTheDocument();

    const grid = screen.getByText("Form").parentElement?.parentElement;
    expect(grid?.className).toContain("@max-[17em]:grid-cols-1");
    expect(grid?.parentElement?.className).toContain("@container");
  });
});
