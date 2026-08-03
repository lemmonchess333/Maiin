/**
 * Experience-suggestion surface: renders ONLY on classifier evidence, honours
 * the persisted dismissal, and its two actions do exactly what the module
 * header promises — deep-link to the plan editor (never a silent level
 * change) and persist the dismissal signature via updateProfile.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ExperienceSuggestionCard from "../ExperienceSuggestionCard";
import type {
  PerformanceRecord,
  WorkoutDay,
} from "@/features/program/programTypes";

const mockUseAuth = vi.fn();
const mockUpdateProfile = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/auth", () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

afterEach(() => {
  mockUseAuth.mockReset();
  mockUpdateProfile.mockClear();
});

/** Six weekly flat sessions — the classifier's stall evidence. */
function flatHistory(): PerformanceRecord[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(2026, 0, 5 + i * 7);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      weight: 60,
      repsCompleted: 8,
      repsTarget: 8,
    };
  });
}

function stalledWeek(): WorkoutDay[] {
  const main = (exerciseId: string, name: string) =>
    ({
      name,
      exerciseId,
      instanceId: `i-${exerciseId}`,
      movementCategory: "horizontal_push",
      sets: 3,
      reps: 8,
      baseReps: 8,
      weight: 60,
      progressionType: "double",
      lastSuccessfulWeight: 60,
      lastAttemptedWeight: 60,
      consecutiveFailures: 0,
      plateauCount: 0,
      performanceHistory: flatHistory(),
      lastPerformance: null,
    }) as unknown as WorkoutDay["exercises"][number];
  return [
    {
      dayName: "Day A",
      dayType: "upper",
      completed: false,
      exercises: [main("bench-press", "Bench Press"), main("squat", "Squat")],
    },
  ] as WorkoutDay[];
}

function renderCard(
  workouts: WorkoutDay[] | undefined,
  profile: Record<string, unknown>
) {
  mockUseAuth.mockReturnValue({ profile, updateProfile: mockUpdateProfile });
  return render(
    <MemoryRouter initialEntries={["/program"]}>
      <Routes>
        <Route
          path="/program"
          element={<ExperienceSuggestionCard workouts={workouts} />}
        />
        <Route
          path="/settings/lift-plan"
          element={<div>LIFT PLAN EDITOR</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ExperienceSuggestionCard", () => {
  it("renders nothing without classifier evidence (the permanent default)", () => {
    const { container } = renderCard([], { experience: "beginner" });
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces the stall evidence for a stored beginner, naming the lifts", () => {
    renderCard(stalledWeek(), { experience: "beginner" });
    expect(
      screen.getByText(/Ready for intermediate programming/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Bench Press and Squat/i)).toBeInTheDocument();
  });

  it("a dismissed signature stays dismissed", () => {
    const { container } = renderCard(stalledWeek(), {
      experience: "beginner",
      experienceSuggestionDismissed: {
        signature: "intermediate:linear_progress_exhausted",
        at: 1,
      },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("Dismiss persists the suggestion's signature via updateProfile", () => {
    renderCard(stalledWeek(), { experience: "beginner" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    const patch = mockUpdateProfile.mock.calls[0][0];
    expect(patch.experienceSuggestionDismissed.signature).toBe(
      "intermediate:linear_progress_exhausted"
    );
    expect(typeof patch.experienceSuggestionDismissed.at).toBe("number");
  });

  it("Review level deep-links to the plan editor — never changes the level itself", () => {
    renderCard(stalledWeek(), { experience: "beginner" });
    fireEvent.click(screen.getByRole("button", { name: "Review level" }));
    expect(screen.getByText("LIFT PLAN EDITOR")).toBeInTheDocument();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
