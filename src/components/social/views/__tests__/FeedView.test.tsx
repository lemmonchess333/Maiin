/**
 * FeedView (SOCIAL-HOME-01 Stage D) — the compact feed-source menu
 * replacing the stacked SegmentedControl, and the Explore empty state
 * routing to a meaningful action instead of dead-ending. Since the
 * 2026-10-01 Social pass: posts come first, the points card sits under
 * the third post, and someone following nobody sees Explore's posts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MutableRefObject } from "react";
import FeedView from "../FeedView";

const emptyFeed = {
  items: [] as unknown[],
  loading: false,
  error: null as string | null,
  hasMore: false,
  refresh: vi.fn(async () => {}),
  loadMore: vi.fn(),
};
/** The posts both feeds hand back; a test sets it before rendering. */
let feedItems: unknown[] = [];
const post = (id: string) => ({
  id,
  activityId: id,
  authorId: "maya",
  authorName: "Maya",
  type: "run",
  summary: "",
  createdAt: null,
});

vi.mock("@/hooks/useSocialFeed", () => ({
  useSocialFeed: () => ({ ...emptyFeed, items: feedItems }),
}));
vi.mock("@/hooks/useDiscoverFeed", () => ({
  useDiscoverFeed: () => ({ ...emptyFeed, items: feedItems }),
}));
vi.mock("@/hooks/useFeedSubTabFreshness", () => ({
  useFeedSubTabFreshness: () => ({
    followingHasNew: false,
    exploreHasNew: true,
  }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
  useUid: () => ({ user: { uid: "me" } }).user?.uid ?? null,
}));
/* SOC-P3a — communities source: directory + feed hooks are mocked so
   the sub-tab's composition can be pinned without Firestore. */
const mockCommunitiesFeed = vi.fn();
vi.mock("@/features/spaces/useSpacesDirectory", () => ({
  useSpacesDirectory: () => ({
    entries: [
      { def: { id: "runners" }, joined: true, memberCount: 3 },
      { def: { id: "lifters" }, joined: false, memberCount: 2 },
    ],
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/spaces/useCommunitiesFeed", () => ({
  useCommunitiesFeed: () => mockCommunitiesFeed(),
}));
vi.mock("@/features/spaces/SpacePostCard", () => ({
  default: ({ postId }: { postId: string }) => (
    <div data-testid="space-post">{postId}</div>
  ),
}));
vi.mock("@/components/social/ActivityCard", () => ({
  default: ({
    feedItem,
    followAuthor,
  }: {
    feedItem: { id: string };
    followAuthor?: boolean;
  }) => (
    <article
      aria-label={`Post ${feedItem.id}`}
      data-follow={String(!!followAuthor)}
    />
  ),
}));
const social = vi.hoisted(() => ({
  restricted: false,
  people: [] as { uid: string; displayName: string; reason: string }[],
  suggestionsActive: [] as boolean[],
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: social.restricted }),
}));
vi.mock("@/hooks/useSuggestedPeople", () => ({
  useSuggestedPeople: (active: boolean) => {
    social.suggestionsActive.push(active);
    return {
      people: active ? social.people : [],
      loading: false,
      refresh: vi.fn(),
      remove: vi.fn(),
    };
  },
}));
vi.mock("@/components/social/PeopleToFollowRow", () => ({
  default: ({ people }: { people: unknown[] }) =>
    people.length ? <div data-testid="people-row" /> : null,
}));
vi.mock("@/components/social/LeaderboardCard", () => ({
  default: () => <div data-testid="points">leaderboard</div>,
}));
vi.mock("@/components/social/TrajectoryCard", () => ({
  default: ({ loading }: { loading: boolean }) => (
    <div data-testid="points" data-loading={String(loading)}>
      trajectory
    </div>
  ),
}));
vi.mock("@/lib/socialAnalytics", () => ({ track: vi.fn() }));
/* SOC-P1c — FeedView owns the trajectory fetch; the mock resolves per-test
   so the Your-week slot's zero-week collapse can be pinned. */
const mockGetPersonalTrajectory = vi.fn();
vi.mock("@/lib/personalTrajectory", () => ({
  getPersonalTrajectory: (...a: unknown[]) => mockGetPersonalTrajectory(...a),
}));

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  feedItems = [];
  social.restricted = false;
  social.people = [];
  social.suggestionsActive = [];
  mockGetPersonalTrajectory.mockResolvedValue(trajectory(500));
  mockCommunitiesFeed.mockReturnValue({
    items: [],
    loading: false,
    refresh: vi.fn(async () => {}),
    remove: vi.fn(),
  });
});

/** Minimal PersonalTrajectory fixture — score drives the zero-week branch. */
function trajectory(thisWeekScore: number, lastWeekScore = 230) {
  return {
    thisWeek: { km: 0, kg: 0, score: thisWeekScore },
    lastWeek: { km: 2.3, kg: 0, score: lastWeekScore },
    lastWeekToDate: { km: 0, kg: 0, score: 0 },
    deltaPct: null,
  };
}

type FeedViewProps = Partial<React.ComponentProps<typeof FeedView>>;

function setup(overrides: FeedViewProps = {}) {
  const selectFeedSubTab = vi.fn();
  const openTogether = vi.fn();
  const refreshRef = {
    current: null,
  } as MutableRefObject<(() => Promise<void>) | null>;
  const element = (more: FeedViewProps = {}) => (
    <MemoryRouter>
      <FeedView
        active
        feedSubTab="explore"
        selectFeedSubTab={selectFeedSubTab}
        followingCount={3}
        followingFeedUnlocked
        blockedUsers={new Set()}
        blockedReady={true}
        hiddenActivityIds={new Set()}
        openPeople={vi.fn()}
        openTogether={openTogether}
        pullRefreshing={false}
        refreshRef={refreshRef}
        onOverlayChange={vi.fn()}
        {...overrides}
        {...more}
      />
    </MemoryRouter>
  );
  const view = render(element());
  /** Re-render with the same props plus `more`. */
  const rerender = (more: FeedViewProps) => view.rerender(element(more));
  return { selectFeedSubTab, openTogether, rerender };
}

describe("FeedView — compact source menu", () => {
  it("names the current source on one chip and opens the two-option menu", () => {
    setup();
    const chip = screen.getByRole("button", { name: /feed source: explore/i });
    fireEvent.click(chip);
    expect(
      screen.getByRole("radio", { name: /following/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /explore/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("picking the other source drives the URL-writing callback", () => {
    const { selectFeedSubTab } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: /feed source: explore/i })
    );
    fireEvent.click(screen.getByRole("radio", { name: /following/i }));
    expect(selectFeedSubTab).toHaveBeenCalledWith("following");
  });

  it.each([null, 3])(
    "records an explicit choice of the current source with follow count %s",
    (followingCount) => {
      const { selectFeedSubTab } = setup({ followingCount });
      fireEvent.click(
        screen.getByRole("button", { name: /feed source: explore/i })
      );
      fireEvent.click(screen.getByRole("radio", { name: /explore/i }));
      expect(selectFeedSubTab).toHaveBeenCalledWith("explore");
    }
  );
});

describe("FeedView — explore empty state routes somewhere useful", () => {
  it("offers Open Together instead of a dead end", () => {
    const { openTogether } = setup();
    expect(screen.getByText("Tropos is quiet right now")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open together/i }));
    expect(openTogether).toHaveBeenCalled();
  });
});

/** The feed's children in document order: posts by id, the points
 *  card as "points". */
function feedOrder(): string[] {
  return Array.from(
    document.querySelectorAll(
      "article[aria-label], [data-testid='points'], [data-testid='people-row']"
    )
  ).map((el) =>
    el.tagName === "ARTICLE"
      ? (el.getAttribute("aria-label") ?? "").replace("Post ", "")
      : el.getAttribute("data-testid") === "points"
        ? "points"
        : "people"
  );
}

describe("FeedView — posts first (2026-10-01)", () => {
  /* The points card only arms on Following with a thin graph (<2
     follows) — exactly where TrajectoryCard used to self-fetch. */
  const thinGraph = {
    feedSubTab: "following" as const,
    followingCount: 1,
    followingFeedUnlocked: false,
  };

  it("nothing sits above the posts: no recap, no Spaces row, no points card", async () => {
    feedItems = ["a", "b", "c", "d"].map(post);
    setup(thinGraph);
    expect(await screen.findByTestId("points")).toBeInTheDocument();
    expect(feedOrder()).toEqual(["a", "b", "c", "points", "d"]);
    expect(screen.queryByText(/build recap/i)).toBeNull();
    expect(screen.queryByText(/spaces for you/i)).toBeNull();
  });

  it("on a shorter list the points card follows the last post", async () => {
    feedItems = ["a", "b"].map(post);
    setup(thinGraph);
    expect(await screen.findByTestId("points")).toBeInTheDocument();
    expect(feedOrder()).toEqual(["a", "b", "points"]);
  });

  it("an empty week shows no points card at all", async () => {
    mockGetPersonalTrajectory.mockResolvedValue(trajectory(0));
    feedItems = ["a", "b", "c", "d"].map(post);
    setup(thinGraph);
    // Anchor on the read having landed, then on the absence.
    await vi.waitFor(() =>
      expect(mockGetPersonalTrajectory).toHaveBeenCalledTimes(1)
    );
    await screen.findByRole("article", { name: "Post d" });
    await new Promise((r) => setTimeout(r, 0));
    expect(feedOrder()).toEqual(["a", "b", "c", "d"]);
  });

  it("with two follows or more the friends' leaderboard takes the slot, and the trajectory is never read", () => {
    feedItems = ["a", "b", "c", "d"].map(post);
    setup({ feedSubTab: "following", followingCount: 3 });
    expect(screen.getByTestId("points")).toHaveTextContent("leaderboard");
    expect(feedOrder()).toEqual(["a", "b", "c", "points", "d"]);
    expect(mockGetPersonalTrajectory).not.toHaveBeenCalled();
  });

  it("with nothing posted yet, the row and the points card follow the empty state", async () => {
    social.people = [
      { uid: "priya", displayName: "Priya", reason: "recent_post" },
    ];
    setup(thinGraph);
    const empty = screen.getByText("Nothing from people you follow yet");
    expect(await screen.findByTestId("points")).toBeInTheDocument();
    expect(feedOrder()).toEqual(["people", "points"]);
    expect(
      empty.compareDocumentPosition(screen.getByTestId("people-row")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("with three follows and nothing posted, the leaderboard stays", () => {
    setup({ feedSubTab: "following", followingCount: 3 });
    expect(
      screen.getByText("Nothing from people you follow yet")
    ).toBeInTheDocument();
    expect(feedOrder()).toEqual(["points"]);
    expect(screen.getByTestId("points")).toHaveTextContent("leaderboard");
  });

  it("Explore has no points card", () => {
    feedItems = ["a", "b", "c", "d"].map(post);
    setup({ feedSubTab: "explore", followingCount: 1 });
    expect(feedOrder()).toEqual(["a", "b", "c", "d"]);
  });

  it("a returning slot reads as loading until its new read lands — never as the last read", async () => {
    /* The slot re-reads every time it turns back on. Until that read
       lands, the previous answer must not decide the slot. */
    mockGetPersonalTrajectory
      .mockResolvedValueOnce(trajectory(500))
      .mockReturnValueOnce(new Promise(() => {}));
    feedItems = ["a"].map(post);
    const { rerender } = setup(thinGraph);
    // POSITIVE anchor: the first read settled.
    await vi.waitFor(() =>
      expect(screen.getByTestId("points")).toHaveAttribute(
        "data-loading",
        "false"
      )
    );

    rerender({ active: false });
    rerender({ active: true });

    expect(mockGetPersonalTrajectory).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("points")).toHaveAttribute(
      "data-loading",
      "true"
    );
  });
});

describe("FeedView — how many people you follow", () => {
  it("while under three, one line says how many, with Find people", () => {
    const openPeople = vi.fn();
    setup({
      feedSubTab: "following",
      followingCount: 1,
      followingFeedUnlocked: false,
      openPeople,
    });
    expect(screen.getByText(/^You follow/).closest("p")).toHaveTextContent(
      "You follow 1 person · Find people"
    );
    fireEvent.click(screen.getByRole("button", { name: "Find people" }));
    expect(openPeople).toHaveBeenCalled();
  });

  it("says people for more than one", () => {
    setup({
      feedSubTab: "explore",
      followingCount: 2,
      followingFeedUnlocked: false,
    });
    expect(screen.getByText(/^You follow/).closest("p")).toHaveTextContent(
      "You follow 2 people"
    );
  });

  it("goes once you follow three", () => {
    setup({ feedSubTab: "following", followingCount: 3 });
    expect(screen.queryByText(/^You follow/)).toBeNull();
  });
});

describe("FeedView — following nobody (the retired solo-first stack)", () => {
  it("Explore shows the posts, under one line on how Following fills", () => {
    feedItems = ["a", "b"].map(post);
    setup({
      feedSubTab: "explore",
      followingCount: 0,
      followingFeedUnlocked: false,
    });
    expect(
      screen.getByText(/sessions people shared publicly/i)
    ).toBeInTheDocument();
    expect(feedOrder()).toEqual(["a", "b"]);
    expect(screen.queryByText(/start a partner streak/i)).toBeNull();
  });

  it("Following says nobody is followed yet, and where to find people", () => {
    const openPeople = vi.fn();
    setup({
      feedSubTab: "following",
      followingCount: 0,
      followingFeedUnlocked: false,
      openPeople,
    });
    expect(screen.getByText("You don't follow anyone yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find people" }));
    expect(openPeople).toHaveBeenCalled();
  });

  it("Following with people followed but nothing from them says so", () => {
    setup({
      feedSubTab: "following",
      followingCount: 1,
      followingFeedUnlocked: false,
    });
    expect(
      screen.getByText("Nothing from people you follow yet")
    ).toBeInTheDocument();
  });
});

describe("FeedView — My communities source (SOC-P3a)", () => {
  it("the source sheet offers all three sources", () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: /feed source: explore/i })
    );
    expect(
      screen.getByRole("radio", { name: /my communities/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /following/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /explore/i })).toBeInTheDocument();
  });

  it("picking My communities drives the URL-writing callback", () => {
    const { selectFeedSubTab } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: /feed source: explore/i })
    );
    fireEvent.click(screen.getByRole("radio", { name: /my communities/i }));
    expect(selectFeedSubTab).toHaveBeenCalledWith("communities");
  });

  it.each([0, 3])(
    "renders joined-space posts with %i follows",
    (followingCount) => {
      mockCommunitiesFeed.mockReturnValue({
        items: [
          {
            spaceId: "runners",
            postId: "post-1",
            post: {
              authorId: "member-1",
              authorName: "Priya S.",
              body: "First 10K done this morning.",
              likeCount: 0,
              commentCount: 0,
              createdAt: { toDate: () => new Date() },
            },
          },
        ],
        loading: false,
        refresh: vi.fn(async () => {}),
        remove: vi.fn(),
      });
      setup({ feedSubTab: "communities", followingCount });
      expect(screen.getByTestId("space-post")).toHaveTextContent("post-1");
      expect(screen.getByRole("link", { name: /runners/i })).toHaveAttribute(
        "href",
        "/space/runners"
      );
    }
  );

  it("empty stream shows the honest join prompt, never a blank column", () => {
    setup({ feedSubTab: "communities" });
    expect(
      screen.getByText(/your spaces are quiet right now/i)
    ).toBeInTheDocument();
  });
});

describe("FeedView — following from the feed (2026-10-01)", () => {
  const someone = { uid: "priya", displayName: "Priya", reason: "recent_post" };

  it("offers Follow on Explore's posts, not on Following's", () => {
    feedItems = ["a"].map(post);
    const { rerender } = setup({ feedSubTab: "explore", followingCount: 3 });
    expect(screen.getByRole("article", { name: "Post a" })).toHaveAttribute(
      "data-follow",
      "true"
    );
    rerender({ feedSubTab: "following" });
    expect(screen.getByRole("article", { name: "Post a" })).toHaveAttribute(
      "data-follow",
      "false"
    );
  });

  it("puts People to follow after the second post while the graph is thin", () => {
    social.people = [someone];
    feedItems = ["a", "b", "c"].map(post);
    setup({
      feedSubTab: "explore",
      followingCount: 1,
      followingFeedUnlocked: false,
    });
    expect(feedOrder()).toEqual(["a", "b", "people", "c"]);
  });

  it("asks for no suggestions once three people are followed", () => {
    social.people = [someone];
    feedItems = ["a", "b", "c"].map(post);
    setup({ feedSubTab: "explore", followingCount: 3 });
    expect(feedOrder()).toEqual(["a", "b", "c"]);
    expect(social.suggestionsActive.every((a) => a === false)).toBe(true);
  });

  it("a restricted account gets neither Follow links nor the row", () => {
    social.restricted = true;
    social.people = [someone];
    feedItems = ["a", "b", "c"].map(post);
    setup({
      feedSubTab: "explore",
      followingCount: 1,
      followingFeedUnlocked: false,
    });
    expect(feedOrder()).toEqual(["a", "b", "c"]);
    expect(screen.getByRole("article", { name: "Post a" })).toHaveAttribute(
      "data-follow",
      "false"
    );
  });
});
