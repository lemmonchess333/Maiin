import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the data hooks + heavy children so the test pins SoloFirstFeed's
// COMPOSITION (which sections render, and the share cold-start branch).
const mockUseChallenges = vi.fn();
const mockUseWorkouts = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { displayName: "Alex" } }),
}));
vi.mock("@/features/challenges/useChallenges", () => ({
  useChallenges: () => mockUseChallenges(),
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => mockUseWorkouts(),
}));
vi.mock("@/features/challenges/ChallengeCard", () => ({
  ChallengeCard: ({ challenge }: { challenge: { id: string } }) => (
    <div data-testid="challenge-card">{challenge.id}</div>
  ),
}));
vi.mock("@/components/share/ShareCardSheet", () => ({
  ShareCardSheet: ({ open }: { open: boolean }) => (
    <div data-testid="share-sheet">{open ? "open" : "closed"}</div>
  ),
}));

import SoloFirstFeed from "../SoloFirstFeed";

const GLOBAL = {
  id: "global-monthly-2026-06-01",
  name: "June Hybrid Hero",
  metric: "hybrid_score",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseChallenges.mockReturnValue({
    challenges: [GLOBAL],
    myProgress: {},
    leaderboards: {},
    joinChallenge: vi.fn(),
    leaveChallenge: vi.fn(),
  });
  mockUseWorkouts.mockReturnValue({ workouts: [] });
});

describe("SoloFirstFeed", () => {
  it("renders the partner-streak hero and the aspirational crew row", () => {
    render(<SoloFirstFeed onNavigateTab={vi.fn()} />);
    expect(screen.getByText("Start a partner streak")).toBeInTheDocument();
    expect(
      screen.getByText("Crews unlock when your gym's here")
    ).toBeInTheDocument();
  });

  it("surfaces the global monthly challenge when present", () => {
    render(<SoloFirstFeed onNavigateTab={vi.fn()} />);
    expect(screen.getByTestId("challenge-card")).toHaveTextContent(
      "global-monthly-2026-06-01"
    );
  });

  it("collapses the challenge slot when no global challenge exists yet", () => {
    mockUseChallenges.mockReturnValue({
      challenges: [{ id: "weekly-2026-06-01" }], // no global-monthly-
      myProgress: {},
      leaderboards: {},
      joinChallenge: vi.fn(),
      leaveChallenge: vi.fn(),
    });
    render(<SoloFirstFeed onNavigateTab={vi.fn()} />);
    expect(screen.queryByTestId("challenge-card")).not.toBeInTheDocument();
  });

  it("share card shows the cold-start prompt (no button) when nothing is logged", () => {
    render(<SoloFirstFeed onNavigateTab={vi.fn()} />);
    expect(
      screen.getByText("Log a workout or run, then share it as a card.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create a share card/i })
    ).not.toBeInTheDocument();
  });

  it("share card offers a CTA when a workout exists", () => {
    mockUseWorkouts.mockReturnValue({
      workouts: [
        {
          id: "w1",
          date: "2026-06-10",
          exercises: [
            { sets: [{ reps: 5, weightKg: 100 }] },
            { sets: [{ reps: 8, weightKg: 60 }] },
          ],
        },
      ],
    });
    render(<SoloFirstFeed onNavigateTab={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /create a share card/i })
    ).toBeInTheDocument();
  });

  it("the hero CTA navigates to the Find tab", () => {
    const onNavigateTab = vi.fn();
    render(<SoloFirstFeed onNavigateTab={onNavigateTab} />);
    fireEvent.click(screen.getByRole("button", { name: /find a partner/i }));
    expect(onNavigateTab).toHaveBeenCalledWith("find");
  });

  it("the crew row CTA navigates to the Crews tab", () => {
    const onNavigateTab = vi.fn();
    render(<SoloFirstFeed onNavigateTab={onNavigateTab} />);
    fireEvent.click(screen.getByRole("button", { name: /create a crew/i }));
    expect(onNavigateTab).toHaveBeenCalledWith("crews");
  });
});
