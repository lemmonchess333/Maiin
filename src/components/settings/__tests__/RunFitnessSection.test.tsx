import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RunFitnessSection from "../RunFitnessSection";
import type { UserProfile } from "@/lib/auth";

// Pace Insights pulls in auth/subscription/running-stats hooks; this render
// test covers RunFitnessSection's own UI, so stub the insight hook (its logic
// is unit-tested via resolvePaceInsight).
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsight: () => ({ insight: null, accept: vi.fn(), dismiss: vi.fn() }),
}));

function renderWith(profile: Partial<UserProfile>) {
  return render(
    <MemoryRouter>
      <RunFitnessSection
        profile={profile as UserProfile}
        updateProfile={vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>
  );
}

describe("RunFitnessSection", () => {
  it("prompts to set fitness when no benchmark", () => {
    renderWith({ runFitness: null });
    expect(screen.getByText("Set your fitness")).toBeInTheDocument();
  });

  it("shows VDOT + personalized paces when a benchmark exists", () => {
    renderWith({
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 1200 },
        vdot: 49.8,
        source: "manual",
        updatedAt: "2026-06-11T00:00:00.000Z",
      },
    });
    expect(screen.getByText("Personalized paces")).toBeInTheDocument();
    expect(screen.getByText("Threshold")).toBeInTheDocument();
    expect(screen.getByText(/VDOT/)).toBeInTheDocument();
  });
});
