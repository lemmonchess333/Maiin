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

import ExerciseHistory from "../ExerciseHistory";

function renderAt(name: string) {
  return render(
    <MemoryRouter
      initialEntries={[`/history/exercise/${encodeURIComponent(name)}`]}
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
});
