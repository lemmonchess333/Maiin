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

/** The v2 exhaustion shape: honest misses, a ~4% reset, a rebuild that
 *  only reached the old ceiling. Mirrors the classifier's own fixture. */
function stalledHistory(): PerformanceRecord[] {
  const entries = [
    { weight: 60, repsCompleted: 8 },
    { weight: 60, repsCompleted: 6 },
    { weight: 60, repsCompleted: 6 },
    { weight: 57.5, repsCompleted: 8 }, // the reset
    { weight: 60, repsCompleted: 8 },
    { weight: 60, repsCompleted: 7 },
  ];
  return entries.map((e, i) => {
    const d = new Date(2026, 0, 5 + i * 7);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      weight: e.weight,
      repsCompleted: e.repsCompleted,
      repsTarget: 8,
    };
  });
}

/** Programme context that satisfies the maturity + deficit gates. */
const MATURE = { weekNumber: 8, nutritionGoal: "recomp" };

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
      performanceHistory: stalledHistory(),
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
          element={
            <ExperienceSuggestionCard workouts={workouts} context={MATURE} />
          }
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

  it("surfaces the evidence for a stored beginner — lifts, sessions, e1RM", () => {
    renderCard(stalledWeek(), { experience: "beginner" });
    expect(
      screen.getByText(/Ready for intermediate programming/i)
    ).toBeInTheDocument();
    // Per-lift evidence rows: the answer to "what's this based on?" lives
    // ON the card, with the classifier's own numbers.
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getAllByText(/6 sessions · 5 wks · e1RM \+0%/)).toHaveLength(
      2
    );
    // The criteria statement — including that advanced is never automatic.
    expect(
      screen.getByText(/Advanced is never suggested automatically/i)
    ).toBeInTheDocument();
  });

  it("the deload counter-explanation is ruled out IN the copy", () => {
    renderCard(stalledWeek(), { experience: "beginner" });
    expect(
      screen.getByText(/not just a week that needed to be easy/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/missed reps AND a load reset/i)
    ).toBeInTheDocument();
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
