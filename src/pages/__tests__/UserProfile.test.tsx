/**
 * /user/:uid — a person's profile.
 *
 * Firestore runs on the one fake (ADR-0009). The fake applies no rules, so
 * the part that rules decide (a non-follower may not ask for followers-only
 * posts) is pinned twice elsewhere: the refusal in firestore.rules.test.ts
 * ("profile:" cases) and the page's query plan by `profilePostVisibilities`
 * below. Session cards are stubbed to print what the page handed them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { FeedItem } from "@/hooks/useSocialFeed";

const H = vi.hoisted(() => ({
  viewer: "viewer" as string | null,
  followers: {} as Record<string, number>,
  countsFail: false,
  blocked: [] as string[],
  // Who has blocked the viewer, delivered live; `deliver` sends another.
  blockedBy: [] as string[],
  deliver: (_ids: string[]) => {},
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => H.viewer }));
vi.mock("@/lib/socialApi", () => ({
  getFollowerCount: async (uid: string) => {
    if (H.countsFail) throw new Error("unavailable");
    return H.followers[uid] ?? 0;
  },
  getFollowingCount: async () => 0,
  batchGetKudos: async () => ({}),
  blockUser: vi.fn(),
  unblockUser: vi.fn(async () => {}),
  getBlockedUsers: async () => H.blocked,
  subscribeBlockedBy: (_uid: string, onChange: (ids: string[]) => void) => {
    H.deliver = onChange;
    onChange(H.blockedBy);
    return () => {};
  },
  hasFollowRequestFrom: async () => false,
  acceptFollowRequest: vi.fn(),
  declineFollowRequest: vi.fn(),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/social/FollowButton", () => ({
  default: ({
    onFollowChange,
  }: {
    onFollowChange?: (now: string, before: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onFollowChange?.("following", "not-following")}
    >
      Follow
    </button>
  ),
}));
vi.mock("@/features/partnerStreak/PartnerStreakCard", () => ({
  default: () => null,
}));
// The chip's own display gate (a race space, its day not passed) is
// pinned in TrainingForChip.test.tsx; here it says which race it was given.
vi.mock("@/features/spaces/TrainingForChip", () => ({
  default: ({ spaceId }: { spaceId: string }) => (
    <span data-testid="training-for">{spaceId}</span>
  ),
}));
vi.mock("@/components/social/ActivityCard", () => ({
  default: ({ feedItem }: { feedItem: FeedItem }) => (
    <article aria-label={`Post ${feedItem.id}`}>
      {`pace=${String(feedItem.activity?.avgPace ?? "")} prs=${String(
        feedItem.activity?.prCount ?? ""
      )}`}
    </article>
  ),
}));

import UserProfile from "../UserProfile";
import { profilePostVisibilities } from "@/hooks/useUserProfileData";
import {
  deferReads,
  failNextFirestore,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { startOfLocalWeek } from "@/lib/dateHelpers";
import { groupText } from "@/test/localeGrouping";

/** A minute into this week, and a day before it: derived from the clock
 *  so the unit-future and timezone runs see the same split. */
const THIS_WEEK = () => startOfLocalWeek(new Date()).getTime() + 60_000;
const LAST_WEEK = () => startOfLocalWeek(new Date()).getTime() - 86_400_000;

function post(
  id: string,
  authorId: string,
  fields: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  return {
    [`activities/${id}`]: {
      authorId,
      authorName: authorId,
      type: "run",
      visibility: "public",
      createdAt: THIS_WEEK(),
      ...fields,
    },
  };
}

/** The "N followers · N following" line, read whole: its numbers sit in
 *  their own spans, so no single text node holds the sentence. */
function countsLine() {
  return screen.findByText(
    (_, el) =>
      el?.tagName === "P" &&
      /^\d+ followers? · \d+ following$/.test(el.textContent ?? "")
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/user/:uid" element={<UserProfile />} />
      </Routes>
      <Link to="/user/bob">Open Bob</Link>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  H.viewer = "viewer";
  H.followers = {};
  H.countsFail = false;
  H.blocked = [];
  H.blockedBy = [];
});
afterEach(() => {
  resumeReads();
  releaseAllReads();
  cleanup();
});

describe("someone else's profile", () => {
  it("names them from their public profile, with counts in words that fit", async () => {
    H.followers = { alice: 1 };
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    renderAt("/user/alice");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Alice" })
    ).toBeInTheDocument();
    expect(await countsLine()).toHaveTextContent("1 follower · 0 following");
  });

  it("counts this week's shared sessions under labels that say what they are", async () => {
    seedFirestore({
      "users/alice/public/profile": { displayName: "Alice", currentStreak: 4 },
      ...post("r1", "alice", { distance: 5000 }),
      ...post("w1", "alice", { type: "workout", totalVolume: 6420 }),
      ...post("old", "alice", { distance: 10000, createdAt: LAST_WEEK() }),
    });
    renderAt("/user/alice");
    // Anchor on the figures landing before reading them.
    expect(await screen.findByText("sessions")).toBeInTheDocument();
    expect(screen.getByText("Shared this week")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("km run")).toBeInTheDocument();
    expect(screen.getByText(groupText(6420))).toBeInTheDocument();
    expect(screen.getByText("kg lifted")).toBeInTheDocument();
    expect(screen.getByText(/-day streak/)).toHaveTextContent("4-day streak");
    // Last week's run is listed but not counted.
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("says so when nothing was shared this week, rather than a row of zeros", async () => {
    seedFirestore({
      "users/alice/public/profile": { displayName: "Alice" },
      ...post("old", "alice", { createdAt: LAST_WEEK() }),
    });
    renderAt("/user/alice");
    expect(await screen.findByText("Nothing yet.")).toBeInTheDocument();
    expect(screen.queryByText("sessions")).toBeNull();
    expect(screen.queryByText("km run")).toBeNull();
  });

  it("lists sessions as the feed's cards, carrying the post's own fields", async () => {
    // The old page hand-built "8.2 km · 318" (pace in raw seconds) and read
    // a field no post has, so every lift said "0 PRs".
    seedFirestore({
      "users/alice/public/profile": { displayName: "Alice" },
      ...post("r1", "alice", { distance: 8240, avgPace: 318 }),
      ...post("w1", "alice", { type: "workout", prCount: 2 }),
    });
    renderAt("/user/alice");
    expect(
      await screen.findByRole("article", { name: "Post r1" })
    ).toHaveTextContent("pace=318");
    expect(screen.getByRole("article", { name: "Post w1" })).toHaveTextContent(
      "prs=2"
    );
  });

  it("shows their newest badges as badges, four at most", async () => {
    seedFirestore({
      "users/alice/public/profile": {
        displayName: "Alice",
        badgeSummary: {
          earnedMap: {
            first_step: "2026-01-01",
            first_5k: "2026-02-01",
            "10k_club": "2026-03-01",
            first_pr: "2026-04-01",
            week_warrior: "2026-05-01",
          },
        },
      },
    });
    renderAt("/user/alice");
    const list = await screen.findByRole("list", { name: "Recent badges" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Week Warrior", "First PR", "10K Club", "First 5K"]);
    // The old page printed each badge's icon NAME ("trophy", "flame").
    expect(screen.queryByText(/^(trophy|target|flame|footprints)$/)).toBeNull();
  });

  it("following them moves the count at once", async () => {
    H.followers = { alice: 1 };
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    renderAt("/user/alice");
    expect(await countsLine()).toHaveTextContent("1 follower · 0 following");
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(await countsLine()).toHaveTextContent("2 followers · 0 following");
  });

  it("shows the race they chose to show on their profile, and none otherwise", async () => {
    // RaceIdentityToggle writes trainingForSpaceId onto the public profile.
    seedFirestore({
      "users/alice/public/profile": {
        displayName: "Alice",
        trainingForSpaceId: "london-marathon",
      },
      "users/bob/public/profile": {
        displayName: "Bob",
        trainingForSpaceId: null,
      },
    });
    renderAt("/user/alice");
    expect(await screen.findByTestId("training-for")).toHaveTextContent(
      "london-marathon"
    );
    fireEvent.click(screen.getByRole("link", { name: "Open Bob" }));
    await screen.findByRole("heading", { level: 1, name: "Bob" });
    expect(screen.queryByTestId("training-for")).toBeNull();
  });

  it("asks for followers-only posts in a query of their own", () => {
    // One query for both kinds is refused whole for a non-follower (the
    // "profile:" rules tests): it left every profile opened from Explore
    // saying it had nothing shared.
    expect(
      profilePostVisibilities(false).every((v) => typeof v === "string")
    ).toBe(true);
    expect(profilePostVisibilities(false)).toEqual(["public", "followers"]);
  });
});

describe("a profile that isn't there", () => {
  it("says it isn't available instead of spinning forever", async () => {
    renderAt("/user/ghost");
    expect(
      await screen.findByText("This profile isn't available")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Loading profile" })
    ).toBeNull();
  });

  it("a failed read offers a retry, not a verdict", async () => {
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    failNextFirestore("getDoc", {
      path: "users/alice/public/profile",
      code: "unavailable",
    });
    renderAt("/user/alice");
    expect(
      await screen.findByText("Couldn't load this profile")
    ).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Alice" })
    ).toBeInTheDocument();
  });
});

describe("a read that failed is not an empty profile", () => {
  it("says the counts couldn't load, rather than 0 followers", async () => {
    H.countsFail = true;
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    renderAt("/user/alice");
    expect(
      await screen.findByText("Couldn't load follower counts.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/followers?$/)).toBeNull();
  });

  it("says the sessions couldn't load, rather than none shared, and tries again", async () => {
    seedFirestore({
      "users/alice/public/profile": { displayName: "Alice" },
      ...post("r1", "alice", { distance: 5000 }),
    });
    failNextFirestore("getDocs", { path: "activities" });
    renderAt("/user/alice");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load sessions"
    );
    expect(unfiredFailures()).toEqual([]);
    expect(
      screen.getByText("Couldn't load this week's sessions.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No shared sessions yet")).toBeNull();
    expect(screen.queryByText("Nothing yet.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("article", { name: "Post r1" })
    ).toBeInTheDocument();
  });

  it("says your badges couldn't load on your own profile", async () => {
    H.viewer = "alice";
    seedFirestore({
      "users/alice": { displayName: "Alice" },
      "users/alice/public/profile": { displayName: "Alice" },
    });
    failNextFirestore("getDoc", { path: "users/alice/streaks/data" });
    renderAt("/user/alice");
    expect(
      await screen.findByText("Couldn't load badges.")
    ).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
  });
});

describe("someone you blocked", () => {
  it("offers Unblock, not a Follow the rules would refuse", async () => {
    // A viewer of its own: the block list is cached per signed-in uid.
    H.viewer = "blocker";
    H.blocked = ["alice"];
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    renderAt("/user/alice");
    const unblock = await screen.findByRole("button", { name: "Unblock" });
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    fireEvent.click(unblock);
    expect(
      await screen.findByRole("button", { name: "Follow" })
    ).toBeInTheDocument();
  });

  it("shows whom you blocked and nothing they shared, until you unblock", async () => {
    H.viewer = "blocker-hides";
    H.blocked = ["alice"];
    seedFirestore({
      "users/alice/public/profile": {
        displayName: "Alice",
        trainingForSpaceId: "london-marathon",
        badgeSummary: { earnedMap: { first_5k: "2026-02-01" } },
      },
      ...post("a1", "alice", {}),
    });
    renderAt("/user/alice");
    // POSITIVE anchor: their name and the way back.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Alice" })
    ).toBeInTheDocument();
    expect(screen.getByText("You blocked Alice")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("list", { name: "Recent badges" })).toBeNull();
    expect(screen.queryByTestId("training-for")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(
      await screen.findByRole("article", { name: "Post a1" })
    ).toBeInTheDocument();
    expect(screen.queryByText("You blocked Alice")).toBeNull();
  });
});

/* Polish3 call 1: blocking hides each person from the other. The page of
   someone who blocked you says what a deleted account's says, and shows
   nothing of theirs. */
describe("someone who blocked you", () => {
  const BLOCKERS_PROFILE = {
    "users/alice/public/profile": {
      displayName: "Alice",
      photoURL: "https://lh3.googleusercontent.com/alice.jpg",
      trainingForSpaceId: "london-marathon",
      badgeSummary: { earnedMap: { first_5k: "2026-02-01" } },
    },
    ...post("a1", "alice", {}),
  };

  const expectNothingOfTheirs = () => {
    expect(screen.queryByText("Alice")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("list", { name: "Recent badges" })).toBeNull();
    expect(screen.queryByTestId("training-for")).toBeNull();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unblock" })).toBeNull();
  };

  it("reads as not available, in a deleted account's words", async () => {
    H.viewer = "blocked-viewer";
    H.blockedBy = ["alice"];
    seedFirestore(BLOCKERS_PROFILE);
    renderAt("/user/alice");
    expect(
      await screen.findByText("This profile isn't available")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The account may have been deleted, or the link is out of date."
      )
    ).toBeInTheDocument();
    expectNothingOfTheirs();
  });

  it("reads as not available when you blocked each other", async () => {
    H.viewer = "mutual-viewer";
    H.blocked = ["alice"];
    H.blockedBy = ["alice"];
    seedFirestore(BLOCKERS_PROFILE);
    renderAt("/user/alice");
    expect(
      await screen.findByText("This profile isn't available")
    ).toBeInTheDocument();
    expectNothingOfTheirs();
  });

  it("goes the moment their block arrives, with the page open", async () => {
    H.viewer = "blocked-later";
    seedFirestore(BLOCKERS_PROFILE);
    renderAt("/user/alice");
    expect(
      await screen.findByRole("article", { name: "Post a1" })
    ).toBeInTheDocument();

    act(() => H.deliver(["alice"]));
    expect(
      await screen.findByText("This profile isn't available")
    ).toBeInTheDocument();
    expectNothingOfTheirs();
  });

  it("reads as not available when the rules refuse it, not as a connection to retry", async () => {
    // The server's copy of the block can trail it by a moment; the rules
    // refuse the profile at once.
    H.viewer = "refused-viewer";
    seedFirestore(BLOCKERS_PROFILE);
    failNextFirestore("getDoc", {
      path: "users/alice/public/profile",
      code: "permission-denied",
    });
    renderAt("/user/alice");
    expect(
      await screen.findByText("This profile isn't available")
    ).toBeInTheDocument();
    expect(unfiredFailures()).toEqual([]);
    expect(screen.queryByText("Couldn't load this profile")).toBeNull();
    expect(screen.queryByText("Alice")).toBeNull();
  });
});

describe("moving from one profile to the next", () => {
  it("never shows the last person while the next one loads", async () => {
    H.followers = { alice: 3 };
    seedFirestore({
      "users/alice/public/profile": { displayName: "Alice" },
      "users/bob/public/profile": { displayName: "Bob" },
      ...post("a1", "alice", {}),
    });
    renderAt("/user/alice");
    // POSITIVE anchor: the first profile is fully on screen.
    expect(await countsLine()).toHaveTextContent("3 followers");
    expect(
      await screen.findByRole("article", { name: "Post a1" })
    ).toBeInTheDocument();

    deferReads();
    fireEvent.click(screen.getByRole("link", { name: "Open Bob" }));
    expect(screen.queryByRole("heading", { name: "Alice" })).toBeNull();
    expect(screen.queryByText(/3 followers/)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();

    resumeReads();
    releaseAllReads();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Bob" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Nothing yet.")).toBeInTheDocument()
    );
  });
});

describe("your own profile", () => {
  it("shows what other people see, so no private sessions", async () => {
    H.viewer = "alice";
    seedFirestore({
      "users/alice": { displayName: "Alice A" },
      "users/alice/public/profile": { displayName: "Alice" },
      ...post("pub", "alice", {}),
      ...post("fol", "alice", { visibility: "followers" }),
      ...post("priv", "alice", { visibility: "private" }),
    });
    renderAt("/user/alice");
    // Your own document names you; the public copy can trail it.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Alice A" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This is how your profile looks to other people.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit profile" })).toHaveAttribute(
      "href",
      "/settings/profile"
    );
    await screen.findByRole("article", { name: "Post pub" });
    expect(
      screen.getByRole("article", { name: "Post fol" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Post priv" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  /* Mob2 call 7: your own counts open your lists; anyone else's are
     plain text. */
  it("links your own counts to your followers and following lists", async () => {
    H.viewer = "alice";
    H.followers = { alice: 2 };
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    renderAt("/user/alice");
    expect(await countsLine()).toHaveTextContent("2 followers · 0 following");
    expect(screen.getByRole("link", { name: "2 followers" })).toHaveAttribute(
      "href",
      "/followers"
    );
    expect(screen.getByRole("link", { name: "0 following" })).toHaveAttribute(
      "href",
      "/following"
    );
  });

  it("keeps someone else's counts as plain text", async () => {
    H.followers = { bob: 2 };
    seedFirestore({ "users/bob/public/profile": { displayName: "Bob" } });
    renderAt("/user/bob");
    expect(await countsLine()).toHaveTextContent("2 followers · 0 following");
    expect(screen.queryByRole("link", { name: /followers?$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /following$/ })).toBeNull();
  });

  it("asks for both kinds at once, which the owner may, and never private", () => {
    expect(profilePostVisibilities(true)).toEqual([["public", "followers"]]);
  });
});
