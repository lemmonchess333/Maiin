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
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => H.viewer }));
vi.mock("@/lib/socialApi", () => ({
  getFollowerCount: async (uid: string) => H.followers[uid] ?? 0,
  getFollowingCount: async () => 0,
  batchGetKudos: async () => ({}),
  blockUser: vi.fn(),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/social/FollowButton", () => ({
  default: ({
    onFollowChange,
  }: {
    onFollowChange?: (following: boolean) => void;
  }) => (
    <button type="button" onClick={() => onFollowChange?.(true)}>
      Follow
    </button>
  ),
}));
vi.mock("@/features/partnerStreak/PartnerStreakCard", () => ({
  default: () => null,
}));
vi.mock("@/features/spaces/TrainingForChip", () => ({ default: () => null }));
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
import { group } from "@/test/localeGrouping";

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
    expect(screen.getByText(group(6420))).toBeInTheDocument();
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

  it("asks for both kinds at once, which the owner may, and never private", () => {
    expect(profilePostVisibilities(true)).toEqual([["public", "followers"]]);
  });
});
