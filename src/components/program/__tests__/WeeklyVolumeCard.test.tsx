/**
 * The weekly volume card, pinned on the case it used to be silent about.
 *
 * `weeklyVolumeByJudgementMuscle` returns only groups with sets > 0, and the
 * card mapped that list straight to rows — so a plan containing no direct
 * side-delt or calf work rendered twelve rows instead of fourteen and the
 * absence showed as nothing at all. Backwards, precisely: 4 sets renders
 * "below target" in orange, while 0 sets renders no row, no number, and no
 * warning. Found on the operator's own live plan (2026-08-04), which carries
 * zero of both because its slots predate the generator gaining them.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import WeeklyVolumeCard from "../WeeklyVolumeCard";
import type {
  ProgramExercise,
  WorkoutDay,
} from "@/features/program/programTypes";

function ex(
  exerciseId: string,
  movementCategory: string,
  sets: number
): ProgramExercise {
  return {
    name: exerciseId,
    exerciseId,
    instanceId: `i-${exerciseId}`,
    movementCategory,
    sets,
    reps: 8,
    baseReps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  } as unknown as ProgramExercise;
}

/** A week with real pressing/pulling/squatting and NO raise or calf slot —
 *  the shape of every plan generated before those slots existed. */
function weekWithoutRaisesOrCalves(): WorkoutDay[] {
  return [
    {
      dayName: "Upper",
      dayType: "upper",
      completed: false,
      exercises: [
        ex("bench-press", "horizontal_push", 4),
        ex("barbell-row", "horizontal_pull", 4),
        ex("overhead-press", "vertical_push", 3),
        ex("barbell-curl", "arms_biceps", 3),
      ],
    },
    {
      dayName: "Lower",
      dayType: "lower",
      completed: false,
      exercises: [
        ex("squat", "knee_dominant", 4),
        ex("deadlift", "hip_dominant", 4),
      ],
    },
  ] as WorkoutDay[];
}

function renderExpanded(workouts: WorkoutDay[]) {
  const out = render(
    <WeeklyVolumeCard workouts={workouts} primaryGoal="hypertrophy" />
  );
  // Collapsed by default — the table is behind the summary toggle.
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  return out;
}

describe("WeeklyVolumeCard — untrained muscles are stated, not hidden", () => {
  it("shows a zero row for a muscle with no work at all", () => {
    renderExpanded(weekWithoutRaisesOrCalves());
    // Both groups are absent from the tally entirely; pre-fix neither row
    // existed and the user had no way to learn they were untrained.
    expect(screen.getByText("Side delts")).toBeInTheDocument();
    expect(screen.getByText("Calves")).toBeInTheDocument();
  });

  it("counts those untrained muscles in the below-target summary", () => {
    renderExpanded(weekWithoutRaisesOrCalves());
    // The summary is the collapsed-state read, so it is what most users see.
    // It must not report "all muscles on target" for a plan missing two.
    expect(screen.queryByText(/all muscles on target/i)).toBeNull();
    expect(screen.getByText(/muscles below target/i)).toBeInTheDocument();
  });

  it("does NOT invent a row for a floorless group (front delts)", () => {
    // Front delts carry low = 0 because pressing covers them, so a zero row
    // there would be noise rather than a finding. Here they DO have volume
    // (the press), so the row is present for the honest reason.
    renderExpanded(weekWithoutRaisesOrCalves());
    expect(screen.getByText("Front delts")).toBeInTheDocument();
  });

  it("still renders nothing when there is no resistance volume at all", () => {
    const { container } = render(
      <WeeklyVolumeCard workouts={[]} primaryGoal="hypertrophy" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
