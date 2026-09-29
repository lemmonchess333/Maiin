/**
 * LeaderboardCard and FullLeaderboard each show ONE board, stamped with
 * the account and the board (the card's `challenge`, the full view's tab)
 * it was built for. Both derive their loading state and their rows from
 * that stamp, so:
 *   - a different board reads as loading until its own read lands — never
 *     as the previous board's athletes under the new board's name;
 *   - a slower read for a board already left can't land under the one on
 *     screen. Before, the full view had no guard at all: whichever tab's
 *     read finished LAST wrote its entries, under whichever tab was open.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ChallengeType, LeaderboardEntry } from "@/lib/leaderboard";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({
  boards: {} as Partial<Record<string, () => Promise<LeaderboardEntry[]>>>,
  /* One object for the whole run, as AuthProvider holds it: both
     components key their read effect on `user`, so a fresh object per
     render would restart the read on every render. */
  auth: { user: { uid: "me" }, profile: { displayName: "Me" } },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => h.auth,
  useUid: () => h.auth.user.uid,
}));
/* Partial: the names and units stay the real shared table; only the
   board read is scripted per test. */
vi.mock("@/lib/leaderboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/leaderboard")>()),
  buildLeaderboard: (_uid: string, type: ChallengeType) => h.boards[type]!(),
}));

import LeaderboardCard from "../LeaderboardCard";
import FullLeaderboard from "../FullLeaderboard";
import { CHALLENGE_LABELS } from "@/lib/leaderboard";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

/** `n` athletes with activity this week, highest first. */
function athletes(n: number, prefix: string): LeaderboardEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    uid: `${prefix}-${i}`,
    name: "",
    value: n - i,
    rank: i + 1,
  }));
}

const never = () => new Promise<LeaderboardEntry[]>(() => {});

beforeEach(() => {
  resetFirestore();
  h.boards = {};
});
afterEach(() => cleanup());

describe("LeaderboardCard", () => {
  it("a different board reads as loading until its own read lands", async () => {
    seedFirestore({
      "users/hy-0/public/profile": { displayName: "Hybrid Leader" },
    });
    h.boards = {
      weekly_hybrid: async () => athletes(3, "hy"),
      weekly_distance: never,
    };
    const view = render(<LeaderboardCard challenge="weekly_hybrid" />);
    // POSITIVE anchor: the first board's athletes are showing.
    expect(await screen.findByText("Hybrid Leader")).toBeInTheDocument();

    view.rerender(<LeaderboardCard challenge="weekly_distance" />);

    expect(
      screen.getByRole("status", { name: "Loading leaderboard" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Hybrid Leader")).toBeNull();
  });
});

describe("FullLeaderboard", () => {
  const openTab = (type: ChallengeType) =>
    fireEvent.click(
      screen.getByRole("button", { name: CHALLENGE_LABELS[type].title })
    );

  it("a tab switch reads as loading until the new tab's read lands", async () => {
    h.boards = {
      weekly_hybrid: async () => athletes(3, "hy"),
      weekly_volume: never,
    };
    render(<FullLeaderboard onBack={() => {}} />);
    // POSITIVE anchor: the first tab's board (a sub-cohort one) is showing.
    expect(await screen.findByText(/3 active this week/)).toBeInTheDocument();

    openTab("weekly_volume");

    expect(screen.queryByText(/active this week/)).toBeNull();
    expect(screen.queryByText("No activity this week")).toBeNull();
  });

  it("a slower read for a tab already left can't land under the one on screen", async () => {
    let landHybrid!: (entries: LeaderboardEntry[]) => void;
    h.boards = {
      weekly_hybrid: () =>
        new Promise<LeaderboardEntry[]>((resolve) => {
          landHybrid = resolve;
        }),
      weekly_volume: async () => athletes(5, "vol"),
    };
    render(<FullLeaderboard onBack={() => {}} />);
    openTab("weekly_volume");
    // POSITIVE anchor: the tab on screen has its own board.
    expect(await screen.findByText(/5 active this week/)).toBeInTheDocument();

    // The first tab's read finishes late.
    await act(async () => {
      landHybrid(athletes(3, "hy"));
    });

    expect(screen.getByText(/5 active this week/)).toBeInTheDocument();
    expect(screen.queryByText(/3 active this week/)).toBeNull();
  });
});
