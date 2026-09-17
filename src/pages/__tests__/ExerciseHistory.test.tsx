/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// framer-motion → plain elements
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const { initial: _i, animate: _a, transition: _tr, ...rest } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

// useWorkouts — empty + loaded for both empty-state branches. Spy so we can
// assert ExerciseHistory opts into COMPLETE lifetime coverage (packet 16).
const workoutsMock = vi.hoisted(() => ({
  value: { workouts: [], loading: false },
  spy: vi.fn(),
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: (opts?: unknown) => {
    workoutsMock.spy(opts);
    return workoutsMock.value;
  },
}));

vi.mock("@/components/ExerciseFormContent", () => ({
  default: () => <div>Exercise guidance ready</div>,
}));
import ExerciseHistory from "../ExerciseHistory";
import { localDateString } from "@/lib/dateHelpers";

/**
 * A session date inside the page's DEFAULT range pill.
 *
 * The two fixtures below used to carry a literal ("2026-07-20") and the
 * page opens on "3M", so they were only ever inside the window while the
 * clock happened to be within 90 days of that literal. Measured rather
 * than reasoned about: with the process clock shifted forward, both
 * tests pass on 2026-10-17 and fail on 2026-10-18 — exactly 90 days
 * after the literal — with "expected length 2, got 1" and "unable to
 * find BW × 10", neither of which reads as a date problem.
 *
 * Neither test is about the range filter; they are about how a timed
 * hold and a bodyweight set RENDER. So the fixture is pinned to the
 * clock instead of to a day, and the window can never expire out from
 * under them.
 */
const RECENT_SESSION_DATE = localDateString(
  new Date(Date.now() - 7 * 86_400_000)
);

function renderAt(name: string, tab?: "form") {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/history/exercise/${encodeURIComponent(name)}`,
          state: tab ? { initialTab: tab } : undefined,
        },
      ]}
    >
      <Routes>
        <Route path="/history/exercise/:name" element={<ExerciseHistory />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ExerciseHistory — empty states (shared hexagon EmptyState)", () => {
  beforeEach(() => {
    workoutsMock.value = { workouts: [], loading: false };
    workoutsMock.spy.mockClear();
  });

  it("requests COMPLETE lifetime workout coverage (packet 16)", () => {
    renderAt("Bench Press");
    expect(workoutsMock.spy).toHaveBeenCalledWith({ coverage: "complete" });
  });

  it("not-found: a name absent from logs AND the DB renders the hexagon EmptyState with a Browse-exercises action", () => {
    const { container } = renderAt("Totally Made Up Lift");
    expect(screen.getByText("Exercise not found")).toBeInTheDocument();
    expect(
      screen.getByText(/isn't in your logs or the exercise database/i)
    ).toBeInTheDocument();
    // Single action — the shared primitive's button (no separate top Back).
    expect(
      screen.getByRole("button", { name: "Browse exercises" })
    ).toBeInTheDocument();
    // Brand hexagon present.
    expect(container.querySelector("polygon")).toBeTruthy();
  });

  it("no-history: a real DB exercise with zero logged sessions renders the hexagon EmptyState routing to Train", () => {
    // "Bench Press" exists in the EXERCISES DB; no workouts logged for it.
    renderAt("Bench Press");
    expect(screen.getByText("No sessions logged yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Log Bench Press on a workout/i)
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Go to Train" });
    expect(cta).toHaveAttribute("href", "/program");
  });

  it("renders the loading skeleton (neither empty state) while workouts load", () => {
    workoutsMock.value = { workouts: [], loading: true } as any;
    renderAt("Bench Press");
    expect(screen.queryByText("No sessions logged yet")).toBeNull();
    expect(screen.queryByText("Exercise not found")).toBeNull();
  });

  it("opens Form immediately while workout history is still loading", async () => {
    workoutsMock.value = { workouts: [], loading: true };
    renderAt("Bench Press", "form");
    expect(await screen.findByText("Exercise guidance ready")).toBeVisible();
    expect(screen.queryByText("Sessions")).toBeNull();
    expect(screen.queryByText("Best weight")).toBeNull();
  });

  it("renders a timed hold in seconds instead of as repetition PRs", () => {
    workoutsMock.value = {
      loading: false,
      workouts: [
        {
          id: "w1",
          date: RECENT_SESSION_DATE,
          exercises: [
            {
              exerciseId: "plank",
              exerciseName: "Plank",
              category: "core",
              repUnit: "seconds",
              sets: [
                { setNumber: 1, reps: 30, weightKg: 0 },
                { setNumber: 2, reps: 45, weightKg: 0 },
              ],
              caloriesBurned: 0,
            },
          ],
          totalCalories: 0,
          durationMinutes: 5,
          notes: "",
        },
      ],
    } as any;
    renderAt("Plank");
    expect(screen.getByText("Longest hold")).toBeInTheDocument();
    expect(screen.getAllByText("45s")).toHaveLength(2);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("75s total") === true
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Personal bests by reps")).toBeNull();
  });

  it("keeps the highest-rep bodyweight set when opening saved history", () => {
    workoutsMock.value = {
      loading: false,
      workouts: [
        {
          id: "bodyweight-session",
          date: RECENT_SESSION_DATE,
          exercises: [
            {
              exerciseId: "push-ups",
              exerciseName: "Push-Ups",
              sets: [
                { setNumber: 1, reps: 6, weightKg: 0 },
                { setNumber: 2, reps: 10, weightKg: 0 },
              ],
            },
          ],
          totalCalories: 0,
          durationMinutes: 5,
          notes: "",
        },
      ],
    } as any;
    renderAt("Push-Ups");
    expect(screen.getByText("BW × 10")).toBeInTheDocument();
  });
});
