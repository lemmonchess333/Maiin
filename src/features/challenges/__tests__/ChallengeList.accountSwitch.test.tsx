/**
 * The weekly card's standings belong to the account they were built for.
 *
 * The list is stamped with the uid it was read for, and the section
 * derives both the loading skeleton and the list from that stamp. Before,
 * the rankings effect raised the loading flag one commit late and never
 * cleared the list, so another account's accountability card was built
 * from the previous account's follow graph ("2 people you follow trained
 * this week") until its own read landed. The rows themselves were hidden
 * behind the skeleton; the card above them was not.
 *
 * The app remounts the whole signed-in tree per uid (AuthSessionBoundary);
 * this pins the section's own guarantee, held without that help.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { LeaderboardEntry } from "@/lib/leaderboard";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({
  user: { uid: "acct-a" } as { uid: string },
  boards: {} as Record<string, () => Promise<LeaderboardEntry[]>>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: { displayName: "Me" } }),
  useUid: () => h.user.uid,
}));
vi.mock("@/lib/leaderboard", () => ({
  buildLeaderboard: (uid: string) => h.boards[uid](),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { ChallengeList } from "../ChallengeList";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

const list = () => (
  <MemoryRouter>
    <ChallengeList />
  </MemoryRouter>
);

beforeEach(() => {
  resetFirestore();
  h.user = { uid: "acct-a" };
  seedFirestore({
    "users/friend-of-a/public/profile": { displayName: "Friend Of A" },
  });
  h.boards = {
    "acct-a": async () => [
      { uid: "friend-of-a", name: "", value: 3, rank: 1 },
      { uid: "acct-a", name: "", value: 1, rank: 2 },
    ],
    // The next account's read never lands: anything social on its card
    // could only have come from the previous account.
    "acct-b": () => new Promise(() => {}),
  };
});
afterEach(() => cleanup());

describe("ChallengeList — weekly standings across an account switch", () => {
  it("another account never reads the previous account's standings", async () => {
    const view = render(list());
    // POSITIVE anchor: account A's own standing drives its card, and its
    // follow graph is on screen.
    expect(await screen.findByText("You're on the board")).toBeInTheDocument();
    expect(screen.getByText("Friend Of A")).toBeInTheDocument();

    h.user = { uid: "acct-b" };
    view.rerender(list());

    // B's standings haven't landed: its card is the cold-start one.
    expect(screen.getByText("Train twice this week")).toBeInTheDocument();
    expect(screen.queryByText(/you follow trained this week/)).toBeNull();
    expect(screen.queryByText("Friend Of A")).toBeNull();
  });
});
