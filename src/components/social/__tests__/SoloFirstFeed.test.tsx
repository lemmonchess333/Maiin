import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the data hooks + heavy children so the test pins SoloFirstFeed's
// COMPOSITION (which sections render, and the share cold-start branch).
const mockUseChallenges = vi.fn();
const mockUseWorkouts = vi.fn();
const mockUseRecentRuns = vi.fn();
vi.mock("@/hooks/useRecentRuns", () => ({
  useRecentRuns: () => mockUseRecentRuns(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { displayName: "Alex" } }),
  useUid: () => null,
}));
vi.mock("@/features/challenges/useChallenges", () => ({
  useChallenges: () => mockUseChallenges(),
}));
/* `workoutTonnageKg` is the REAL implementation, deliberately: the share
   card's volume is one of the things this suite asserts, and stubbing the
   sum would make that assertion about the stub. `importOriginal` keeps the
   hook mocked (it needs Firestore) while the pure helper beside it stays
   genuine. */
vi.mock("@/hooks/useWorkouts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useWorkouts")>()),
  useWorkouts: () => mockUseWorkouts(),
}));
vi.mock("@/features/challenges/ChallengeCard", () => ({
  ChallengeCard: ({
    challenge,
    joined,
  }: {
    challenge: { id: string };
    joined: boolean;
  }) => (
    <div data-testid="challenge-card" data-joined={String(joined)}>
      {challenge.id}
    </div>
  ),
}));
vi.mock("@/components/share/ShareCardSheet", () => ({
  ShareCardSheet: ({ open, data }: { open: boolean; data: unknown }) => (
    <div data-testid="share-sheet">
      {open ? "open" : "closed"}
      <span data-testid="share-data">{JSON.stringify(data)}</span>
    </div>
  ),
}));
/* Spc1 PR5 — the suggested-spaces row renders router Links; this suite
   renders without a Router (same reason ChallengeCard is mocked). */
vi.mock("@/features/spaces/SpacesDirectory", () => ({
  default: () => <div data-testid="spaces-row" />,
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
  mockUseRecentRuns.mockReturnValue({ runs: [] });
});

describe("SoloFirstFeed", () => {
  it("renders the partner-streak hero and the aspirational gym-space row", () => {
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
    expect(screen.getByText("Start a partner streak")).toBeInTheDocument();
    expect(screen.getByText("Your gym's space is coming")).toBeInTheDocument();
  });

  it("surfaces the global monthly challenge when present", () => {
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
    expect(screen.getByTestId("challenge-card")).toHaveTextContent(
      "global-monthly-2026-06-01"
    );
  });

  it("greets a fresh account un-joined, and enrols nobody on mount", () => {
    // The anchor card of the cold-start stack enrolled its viewer as a
    // side effect of rendering, so a brand-new account was in a challenge
    // it had never been offered. Joining is the tap the card shows.
    const joinChallenge = vi.fn();
    mockUseChallenges.mockReturnValue({
      challenges: [GLOBAL],
      myProgress: {},
      leaderboards: {},
      joinChallenge,
      leaveChallenge: vi.fn(),
    });
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
    expect(screen.getByTestId("challenge-card")).toHaveAttribute(
      "data-joined",
      "false"
    );
    expect(joinChallenge).not.toHaveBeenCalled();
  });

  it("collapses the challenge slot when no global challenge exists yet", () => {
    mockUseChallenges.mockReturnValue({
      challenges: [{ id: "weekly-2026-06-01" }], // no global-monthly-
      myProgress: {},
      leaderboards: {},
      joinChallenge: vi.fn(),
      leaveChallenge: vi.fn(),
    });
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
    expect(screen.queryByTestId("challenge-card")).not.toBeInTheDocument();
  });

  it("share card shows the cold-start prompt (no button) when nothing is logged", () => {
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
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
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /create a share card/i })
    ).toBeInTheDocument();
  });

  it("the hero CTA navigates to the Find tab", () => {
    const onNavigate = vi.fn();
    render(
      <SoloFirstFeed onFindPeople={onNavigate} onOpenTogether={onNavigate} />
    );
    fireEvent.click(screen.getByRole("button", { name: /find a partner/i }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it("the gym-space row CTA navigates to the Together tab", () => {
    const onNavigate = vi.fn();
    render(
      <SoloFirstFeed onFindPeople={onNavigate} onOpenTogether={onNavigate} />
    );
    fireEvent.click(screen.getByRole("button", { name: /browse spaces/i }));
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe("SoloFirstFeed — latest run or lift", () => {
  const run = {
    id: "r1",
    completedAt: new Date("2026-06-10T12:00:00"),
    distance: 5000,
    duration: 1800,
    avgPace: 360,
    elevationGain: 42,
  };
  const lift = (date: string) => ({
    id: "w1",
    date: date.slice(0, 10),
    createdAt: { toDate: () => new Date(date) },
    exercises: [{ sets: [{ reps: 5, weightKg: 100 }] }],
  });
  const show = () =>
    render(<SoloFirstFeed onFindPeople={vi.fn()} onOpenTogether={vi.fn()} />);
  it("offers a run-only account its saved run with the correct units", () => {
    mockUseRecentRuns.mockReturnValue({ runs: [run] });
    show();
    fireEvent.click(
      screen.getByRole("button", { name: /create a share card/i })
    );
    expect(
      JSON.parse(screen.getByTestId("share-data").textContent!)
    ).toMatchObject({
      template: "run",
      distanceKm: 5,
      durationSec: 1800,
      paceSecPerKm: 360,
      elevationM: 42,
    });
  });
  it.each([
    ["2026-06-10T10:00:00", "run"],
    ["2026-06-10T14:00:00", "lift"],
  ])("chooses the latest session when the lift is at %s", (date, template) => {
    mockUseWorkouts.mockReturnValue({ workouts: [lift(date)] });
    mockUseRecentRuns.mockReturnValue({ runs: [run] });
    show();
    expect(
      JSON.parse(screen.getByTestId("share-data").textContent!).template
    ).toBe(template);
  });
  it("skips invalid runs and keeps the eligible lift", () => {
    mockUseWorkouts.mockReturnValue({
      workouts: [lift("2026-06-09T12:00:00")],
    });
    mockUseRecentRuns.mockReturnValue({ runs: [{ ...run, isInvalid: true }] });
    show();
    expect(
      JSON.parse(screen.getByTestId("share-data").textContent!).template
    ).toBe("lift");
  });
});
