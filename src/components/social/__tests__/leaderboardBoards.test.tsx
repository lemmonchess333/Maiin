/**
 * The friends board on both surfaces (Polish2 call 5), against the
 * Firestore fake: one read of the week's tallies, each board ranked from
 * it, and the signed-in person's own "Show my week" row until they choose.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ChallengeType } from "@/lib/leaderboard";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

const h = vi.hoisted(() => ({
  /* One object per test, as AuthProvider holds it: the board's read keys
     on the uid, and a fresh object per render must not restart it. */
  auth: {
    user: { uid: "me", displayName: "Me" },
    profile: { displayName: "Me" } as Record<string, unknown>,
    refreshProfile: vi.fn(async () => {}),
  },
  share: vi.fn(async (_share: boolean) => {}),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => h.auth,
  useUid: () => h.auth.user.uid,
}));
vi.mock("@/lib/boardSharing", () => ({
  setBoardSharing: (share: boolean) => h.share(share),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import { Timestamp } from "firebase/firestore";
import LeaderboardCard from "../LeaderboardCard";
import FullLeaderboard from "../FullLeaderboard";
import { CHALLENGE_LABELS } from "@/lib/leaderboard";
import {
  failNextFirestore,
  readLog,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const DAY = 86400000;
const tally = (fields: Record<string, number>) => ({
  weekEndsAt: Timestamp.fromMillis(Date.now() + 3 * DAY),
  sessions: 0,
  lifts: 0,
  runs: 0,
  distanceM: 0,
  volumeKg: 0,
  ...fields,
});

/* Maya runs, Sam lifts heavy, you lift twice; Jo shares an empty week. */
const BOARD = {
  "following/me/users/maya": { followedAt: 1 },
  "following/me/users/sam": { followedAt: 1 },
  "following/me/users/jo": { followedAt: 1 },
  "users/maya/public/profile": { displayName: "Maya" },
  "users/sam/public/profile": { displayName: "Sam" },
  "users/jo/public/profile": { displayName: "Jo" },
  "users/me/public/profile": { displayName: "Me" },
  "friendsBoard/maya": tally({ sessions: 3, runs: 3, distanceM: 15400 }),
  "friendsBoard/sam": tally({ sessions: 1, lifts: 1, volumeKg: 4000 }),
  "friendsBoard/me": tally({ sessions: 2, lifts: 2, volumeKg: 1800 }),
  "friendsBoard/jo": tally({}),
};

const rowNames = () =>
  screen.queryAllByText(/^(Maya|Sam|You|Jo)$/).map((el) => el.textContent);

beforeEach(() => {
  resetFirestore();
  h.auth = {
    user: { uid: "me", displayName: "Me" },
    profile: { displayName: "Me", showWeekOnBoard: true },
    refreshProfile: vi.fn(async () => {}),
  };
  h.share.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("LeaderboardCard", () => {
  it("ranks this week's sessions, leaving out anyone with none", async () => {
    seedFirestore(BOARD);
    render(<LeaderboardCard />);

    expect(await screen.findByText("Maya")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: CHALLENGE_LABELS.weekly_sessions.title,
      })
    ).toBeInTheDocument();
    expect(rowNames()).toEqual(["Maya", "You", "Sam"]);
    expect(screen.getByText("session")).toBeInTheDocument();
  });

  it("a board nobody shares yet says what fills it", async () => {
    seedFirestore({ "following/me/users/maya": { followedAt: 1 } });
    render(<LeaderboardCard />);

    expect(
      await screen.findByText("Nothing to compare yet")
    ).toBeInTheDocument();
  });

  it("a board that could not be read says so, and Try again reads it again", async () => {
    seedFirestore(BOARD);
    failNextFirestore("getDocs", {
      path: "following/me/users",
      code: "unavailable",
    });
    render(<LeaderboardCard />);

    expect(
      await screen.findByText("Couldn’t load the board.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing to compare yet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Maya")).toBeInTheDocument();
  });
});

describe("Show my week", () => {
  it("asks until the person chooses, and sharing reads the board again", async () => {
    h.auth.profile = { displayName: "Me" };
    seedFirestore(BOARD);
    render(<LeaderboardCard />);
    await screen.findByText("Maya");
    const readsBefore = readLog().filter((r) =>
      r.path.startsWith("following/")
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show my week" }));
    });

    expect(h.share).toHaveBeenCalledWith(true);
    expect(h.auth.refreshProfile).toHaveBeenCalledOnce();
    expect(
      readLog().filter((r) => r.path.startsWith("following/")).length
    ).toBe(readsBefore + 1);
  });

  it.each([true, false])(
    "is not asked once they have chosen (%s)",
    async (choice) => {
      h.auth.profile = { displayName: "Me", showWeekOnBoard: choice };
      seedFirestore(BOARD);
      render(<LeaderboardCard />);
      await screen.findByText("Maya");

      expect(screen.queryByRole("button", { name: "Show my week" })).toBeNull();
    }
  );
});

describe("FullLeaderboard", () => {
  const openTab = (type: ChallengeType) =>
    fireEvent.click(
      screen.getByRole("button", { name: CHALLENGE_LABELS[type].title })
    );

  it("has a Sessions, a Distance and a Volume board, and no points", () => {
    seedFirestore(BOARD);
    render(<FullLeaderboard onBack={() => {}} />);

    expect(
      ["weekly_sessions", "weekly_distance", "weekly_volume"].map((type) =>
        screen.getByRole("button", {
          name: CHALLENGE_LABELS[type as ChallengeType].title,
        })
      )
    ).toHaveLength(3);
    expect(screen.queryByText(/pts/)).toBeNull();
  });

  it("each tab ranks the same read: switching reads nothing new", async () => {
    seedFirestore(BOARD);
    render(<FullLeaderboard onBack={() => {}} />);
    // Below Soc8's cohort gate, the board says how many are active.
    expect(await screen.findByText(/3 active this week/)).toBeInTheDocument();
    const reads = readLog().length;

    openTab("weekly_distance");
    expect(screen.getByText(/1 active this week/)).toBeInTheDocument();
    openTab("weekly_volume");
    expect(screen.getByText(/2 active this week/)).toBeInTheDocument();

    expect(readLog().length).toBe(reads);
  });

  it("a board that could not be read says so rather than looking empty", async () => {
    seedFirestore(BOARD);
    failNextFirestore("getDocs", {
      path: "following/me/users",
      code: "unavailable",
    });
    render(<FullLeaderboard onBack={() => {}} />);

    expect(
      await screen.findByText("Couldn’t load the board.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No activity this week")).toBeNull();
  });
});
