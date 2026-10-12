import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RacePredictionsCard from "../RacePredictionsCard";
import { finishTimeLabel } from "@/lib/runLabels";
import { predictRaceTimeS } from "@/lib/runPaces";

/* Pins the Analytics race-predictions surface: with a benchmark the four
 * distances render finish times from the SAME Riegel engine the planner
 * uses; without one the card is the designed cold-start state (how-to
 * paths + settings deep-link), never a blank. */

const mockUseAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => mockUseAuth(),
  useUid: () => mockUseAuth().user?.uid ?? null,
}));

function renderCard(runFitness: unknown) {
  mockUseAuth.mockReturnValue({ profile: { runFitness } });
  return render(
    <MemoryRouter>
      <RacePredictionsCard />
    </MemoryRouter>
  );
}

afterEach(() => {
  mockUseAuth.mockReset();
});

describe("finishTimeLabel", () => {
  it("formats sub-hour as m:ss and over-hour as h:mm:ss", () => {
    expect(finishTimeLabel(1500)).toBe("25:00");
    expect(finishTimeLabel(3661)).toBe("1:01:01");
    expect(finishTimeLabel(0)).toBe("--:--");
  });
});

describe("RacePredictionsCard", () => {
  const benchmark = { distanceM: 5000, timeS: 1500 }; // 25:00 5K

  it("renders all four predicted distances from the shared engine", () => {
    renderCard({
      benchmark,
      vdot: null,
      source: "derived",
      updatedAt: "2026-07-04T00:00:00Z",
    });
    expect(screen.getByText("Race predictions")).toBeInTheDocument();
    for (const label of ["5K", "10K", "Half", "Marathon"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // 5K = the benchmark itself (also echoed in the provenance line).
    expect(screen.getAllByText("25:00").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(finishTimeLabel(predictRaceTimeS(benchmark, 42195)))
    ).toBeInTheDocument();
  });

  it("shows benchmark provenance and the today-snapshot carve-out", () => {
    renderCard({
      benchmark,
      vdot: null,
      source: "derived",
      updatedAt: "2026-07-04T00:00:00Z",
    });
    expect(
      screen.getByText(/from a race or time trial you ran/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/independent of the selected range/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update" })).toHaveAttribute(
      "href",
      "/settings/run-plan"
    );
  });

  /* Pgm8 R1: a benchmark derived from a tempo stores no race result, only
     the VDOT the tempo implies, and the card predicts from that. */
  it("predicts from a tempo's VDOT, naming no race it never was", () => {
    renderCard({
      benchmark: null,
      vdot: 41.4,
      source: "derived",
      updatedAt: "2026-10-11T00:00:00Z",
    });
    expect(screen.getByText("Marathon")).toBeInTheDocument();
    expect(
      screen.getByText(/Based on your current fitness level/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/from a race or time trial/)).toBeNull();
  });

  it("cold start renders the how-to-get-predictions explainer with a settings deep-link", () => {
    renderCard(null);
    expect(
      screen.getByText(/Race predictions appear after a race or tempo/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Run a race, time trial or tempo outdoors/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set a race time/i })
    ).toHaveAttribute("href", "/settings/run-plan");
  });
});
