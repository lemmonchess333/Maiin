/**
 * The weekly challenge card's leaders (Trim1 call 3(a)).
 *
 * Until 12 November 2026 the rows under the card were the friends board:
 * the people you follow who had chosen Show my week. The board went, and
 * the rows are the weekly challenge's own board, as every other challenge
 * shows its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Timestamp } from "firebase/firestore";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" }, profile: { displayName: "Mel" } }),
  useUid: () => "me",
}));
const lifts = vi.hoisted(() => ({ count: 1 }));
vi.mock("../myWeekLifts", () => ({
  countMyWeekLifts: async () => lifts.count,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
/* The avatars read block state; the rows' words are what is under test. */
vi.mock("@/components/Avatar", () => ({ default: () => <span /> }));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => <span />,
}));

import WeeklyChallengeCard from "../WeeklyChallengeCard";
import type { Challenge, ChallengeParticipant } from "../useChallenges";

const joinedAt = Timestamp.fromDate(new Date("2026-09-07T08:00:00Z"));
const weekly = {
  id: "weekly-2026-09-07",
  name: "Weekly Warrior",
  description: "Train twice this week",
  type: "weekly",
  metric: "workout_count",
  tiers: { bronze: 2, silver: 4, gold: 6 },
  startDate: Timestamp.fromDate(new Date("2026-09-07T00:00:00Z")),
  endDate: Timestamp.fromDate(new Date("2026-09-14T00:00:00Z")),
  participantCount: 5,
} as unknown as Challenge;

const entry = (
  uid: string,
  displayName: string,
  currentValue: number,
  rank: number
): ChallengeParticipant => ({
  uid,
  displayName,
  currentValue,
  rank,
  tierAchieved: null,
  joinedAt,
});
/** Ranked as `useChallenges` hands it over. */
const BOARD = [
  entry("a", "Ana", 5, 1),
  entry("b", "Ben", 4, 2),
  entry("me", "Mel", 1, 3),
  entry("d", "Dee", 1, 3),
  entry("e", "Eli", 0, 5),
];
const mine = (currentValue: number): ChallengeParticipant =>
  entry("me", "Mel", currentValue, 3);

function card(props: Partial<Parameters<typeof WeeklyChallengeCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <WeeklyChallengeCard
        weekly={weekly}
        joined
        progress={mine(1)}
        leaderboard={BOARD}
        hasChallenges
        onJoin={async () => {}}
        onLeave={async () => {}}
        {...props}
      />
    </MemoryRouter>
  );
}
const leaders = () => screen.queryByRole("list", { name: "Leading this week" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  lifts.count = 1;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WeeklyChallengeCard — the challenge's own leaders", () => {
  it("lists the challenge's top three, with the person's own row as You", () => {
    card();
    const rows = within(leaders() as HTMLElement).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Ana");
    expect(rows[0]).toHaveTextContent("5 sessions");
    expect(rows[1]).toHaveTextContent("Ben");
    // Their own row says You, and one session is singular.
    expect(rows[2]).toHaveTextContent("You");
    expect(rows[2]).toHaveTextContent("1 session");
    expect(rows[2]).not.toHaveTextContent("1 sessions");
    expect(screen.queryByText("Dee")).toBeNull();
  });

  it("says nothing about people you follow", () => {
    card();
    expect(screen.queryByText("People you follow")).toBeNull();
    expect(screen.queryByText(/you follow/i)).toBeNull();
  });

  it("someone who has not joined is shown no leaders", () => {
    card({ joined: false, progress: undefined });
    expect(
      screen.getByRole("button", { name: "Join weekly challenge" })
    ).toBeInTheDocument();
    expect(leaders()).toBeNull();
    expect(screen.queryByText("Ana")).toBeNull();
  });

  it("joined with nothing counted yet, the card is the action alone", () => {
    lifts.count = 0;
    card({ progress: mine(0) });
    expect(leaders()).toBeNull();
    expect(
      screen.getByRole("button", { name: /Start today’s session/ })
    ).toBeInTheDocument();
  });

  it("nobody with nothing counted is listed as a leader", () => {
    card({ leaderboard: [entry("me", "Mel", 1, 1), entry("e", "Eli", 0, 2)] });
    const rows = within(leaders() as HTMLElement).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(screen.queryByText("Eli")).toBeNull();
  });

  it("a participant stored with no name reads Athlete", () => {
    card({
      leaderboard: [
        { ...entry("x", "", 3, 1), displayName: undefined },
        entry("me", "Mel", 1, 2),
      ],
    });
    expect(
      within(leaders() as HTMLElement).getByText("Athlete")
    ).toBeInTheDocument();
  });

  it("with no challenge live it is one line, with nothing to tap", () => {
    card({ weekly: undefined, joined: false, hasChallenges: false });
    expect(screen.getByText("No active challenges")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Follow people/)).toBeNull();
  });
});
