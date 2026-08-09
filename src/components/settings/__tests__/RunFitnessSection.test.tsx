import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RunFitnessSection from "../RunFitnessSection";
import type { UserProfile } from "@/lib/auth";

// Pace Insights pulls in auth/subscription/running-stats hooks; this render
// test covers RunFitnessSection's own UI, so stub the insight hook (its logic
// is unit-tested via resolvePaceInsight).
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsight: () => ({ insight: null, accept: vi.fn(), dismiss: vi.fn() }),
}));

function renderWith(
  profile: Partial<UserProfile>,
  updateProfile = vi.fn().mockResolvedValue(undefined)
) {
  render(
    <MemoryRouter>
      <RunFitnessSection
        profile={profile as UserProfile}
        updateProfile={updateProfile}
      />
    </MemoryRouter>
  );
  return updateProfile;
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

describe("RunFitnessSection — pending auto-derive (RUN-EV-08)", () => {
  const pending = {
    benchmark: { distanceM: 5000, timeS: 1200 },
    vdot: 49.8,
    source: "derived" as const,
    updatedAt: "2026-08-08T00:00:00.000Z",
    sourceRunId: "run-1",
    sourceRunAt: "2026-08-07T08:00:00.000Z",
    pendingConfirmation: true,
  };

  it("shows the consent callout only while pending", () => {
    renderWith({ runFitness: pending });
    expect(
      screen.getByRole("button", { name: /Use for pace targets/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove/i })).toBeInTheDocument();
  });

  it("no callout once confirmed", () => {
    renderWith({
      runFitness: { ...pending, pendingConfirmation: false },
    });
    expect(
      screen.queryByRole("button", { name: /Use for pace targets/i })
    ).toBeNull();
  });

  it("accept writes the FULL object with pendingConfirmation false", async () => {
    const updateProfile = renderWith({ runFitness: pending });
    fireEvent.click(
      screen.getByRole("button", { name: /Use for pace targets/i })
    );
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0][0]).toEqual({
      runFitness: { ...pending, pendingConfirmation: false },
    });
  });

  it("remove clears the benchmark entirely (template-pace fallback)", async () => {
    const updateProfile = renderWith({ runFitness: pending });
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0][0]).toEqual({ runFitness: null });
  });

  it("names the source run's date in the provenance line", () => {
    renderWith({ runFitness: pending });
    expect(screen.getByText(/From your run on/i)).toBeInTheDocument();
  });
});
