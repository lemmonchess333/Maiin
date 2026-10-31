/** Feed source navigation, joined-Space engagement, and empty states. */
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
/** The Following feed's raw error, as the hook reports it. */
let followingError: string | null = null;
const post = (id: string) => ({
  id,
  activityId: id,
  authorId: "maya",
  authorName: "Maya",
  type: "run",
  summary: "",
  createdAt: null,
});
const joinedSpacePost = (authorId = "member-1") => ({
  spaceId: "runners",
  postId: "post-1",
  post: {
    authorId,
    authorName: "Priya S.",
    body: "First 10K done this morning.",
    likeCount: 0,
    commentCount: 0,
    createdAt: { toDate: () => new Date() },
  },
});

vi.mock("@/hooks/useSocialFeed", () => ({
  useSocialFeed: () => ({
    ...emptyFeed,
    items: feedItems,
    error: followingError,
  }),
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
const mockToggleSpaceLike = vi.fn(async () => {});
/** Runners joined, Lifters not; a test may change it before rendering. */
const JOINED_RUNNERS = [
  { def: { id: "runners" }, joined: true, memberCount: 3 },
  { def: { id: "lifters" }, joined: false, memberCount: 2 },
];
const directory = vi.hoisted(() => ({ entries: [] as unknown[] }));
vi.mock("@/features/spaces/useSpacesDirectory", () => ({
  useSpacesDirectory: () => ({
    entries: directory.entries,
    refresh: vi.fn(),
    ready: true,
  }),
}));
vi.mock("@/features/spaces/useCommunitiesFeed", () => ({
  MAX_SPACES_IN_FEED: 6,
  useCommunitiesFeed: () => mockCommunitiesFeed(),
}));
vi.mock("@/features/spaces/useSpacePostLikes", () => ({
  useSpacePostLikes: () => ({
    liked: new Set<string>(),
    deltas: {},
    toggle: mockToggleSpaceLike,
  }),
}));
vi.mock("@/features/spaces/SpacePostCard", () => ({
  default: ({
    postId,
    onToggleLike,
    onOpenComments,
    commentDelta,
  }: {
    postId: string;
    onToggleLike?: () => void;
    onOpenComments?: () => void;
    commentDelta: number;
  }) => (
    <div data-testid="space-post" data-comment-delta={commentDelta}>
      {postId}
      {onToggleLike && <button onClick={onToggleLike}>Give props</button>}
      {onOpenComments && <button onClick={onOpenComments}>Comments</button>}
    </div>
  ),
}));
vi.mock("@/features/spaces/SpaceCommentSheet", () => ({
  default: ({
    commentCount,
    onCountChange,
  }: {
    commentCount: number;
    onCountChange: (delta: number) => void;
  }) => (
    <div role="dialog" aria-label="Space comments" data-count={commentCount}>
      <button onClick={() => onCountChange(1)}>Add comment</button>
    </div>
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
  directory.entries = JOINED_RUNNERS;
  social.restricted = false;
  social.people = [];
  social.suggestionsActive = [];
  mockGetPersonalTrajectory.mockResolvedValue(trajectory(2));
  mockCommunitiesFeed.mockReturnValue({
    items: [],
    loading: false,
    refresh: vi.fn(async () => {}),
    remove: vi.fn(),
  });
});

/** Minimal PersonalTrajectory fixture — sessions drive the zero-week branch. */
function trajectory(thisWeekSessions: number, lastWeekSessions = 1) {
  return {
    thisWeek: { sessions: thisWeekSessions, km: 0, kg: 0 },
    lastWeek: { sessions: lastWeekSessions, km: 2.3, kg: 0 },
    lastWeekToDate: { sessions: 0, km: 0, kg: 0 },
    delta: thisWeekSessions,
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
  return { selectFeedSubTab, openTogether, rerender, refreshRef };
}

describe("FeedView — a failed Following feed", () => {
  afterEach(() => {
    followingError = null;
  });

  it("says the feed couldn't load, not the SDK's error text", () => {
    followingError = "Missing or insufficient permissions.";
    setup({ feedSubTab: "following" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your feed"
    );
    expect(screen.queryByText(/insufficient permissions/)).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("FeedView — visible source control", () => {
  it("shows all three sources in one accessible control", () => {
    setup();
    expect(
      screen.getByRole("radiogroup", { name: "Feed source" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Following" })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Spaces" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /explore/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("picking the other source drives the URL-writing callback", () => {
    const { selectFeedSubTab } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /following/i }));
    expect(selectFeedSubTab).toHaveBeenCalledWith("following");
  });

  it("supports arrow-key source navigation", () => {
    const { selectFeedSubTab } = setup();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Explore" }), {
      key: "ArrowLeft",
    });
    expect(selectFeedSubTab).toHaveBeenCalledWith("communities");
  });

  it.each([null, 3])(
    "records an explicit choice of the current source with follow count %s",
    (followingCount) => {
      const { selectFeedSubTab } = setup({ followingCount });
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

describe("FeedView — who you follow could not be read", () => {
  it("Following says so and reads it again, instead of showing nothing", () => {
    const retryFollowingCount = vi.fn();
    setup({
      feedSubTab: "following",
      followingCount: null,
      followingCountFailed: true,
      retryFollowingCount,
      followingFeedUnlocked: false,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t load who you follow."
    );
    expect(screen.queryByText("You don't follow anyone yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryFollowingCount).toHaveBeenCalledTimes(1);
  });
});

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
      .mockResolvedValueOnce(trajectory(2))
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

describe("FeedView — the Spaces source (SOC-P3a)", () => {
  it("keeps Spaces visible alongside Following and Explore", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Spaces" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Following" })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Explore" })).toBeInTheDocument();
  });

  it("names the joined-Spaces source Spaces, as the rest of the app does", () => {
    setup({ feedSubTab: "communities" });
    const option = screen.getByRole("radio", { name: "Spaces" });
    expect(option).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/my communities/i)).toBeNull();
  });

  it("picking Spaces drives the URL-writing callback", () => {
    const { selectFeedSubTab } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Spaces" }));
    expect(selectFeedSubTab).toHaveBeenCalledWith("communities");
  });

  it.each([0, 3])(
    "renders joined-space posts with %i follows",
    (followingCount) => {
      mockCommunitiesFeed.mockReturnValue({
        items: [joinedSpacePost()],
        loading: false,
        refresh: vi.fn(async () => {}),
        remove: vi.fn(),
      });
      setup({ feedSubTab: "communities", followingCount });
      expect(screen.getByTestId("space-post")).toHaveTextContent("post-1");
      expect(screen.getByRole("link", { name: "Runners" })).toHaveAttribute(
        "href",
        "/space/runners"
      );
      expect(
        screen.getByRole("link", { name: "Open post in Runners" })
      ).toHaveAttribute("href", "/space/runners/post/post-1");
    }
  );

  it("lets a reader give props and comment without leaving Feed", () => {
    mockCommunitiesFeed.mockReturnValue({
      items: [joinedSpacePost()],
      loading: false,
      refresh: vi.fn(async () => {}),
      remove: vi.fn(),
    });
    setup({ feedSubTab: "communities" });
    fireEvent.click(screen.getByRole("button", { name: "Give props" }));
    expect(mockToggleSpaceLike).toHaveBeenCalledWith("post-1");

    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    const sheet = screen.getByRole("dialog", { name: "Space comments" });
    expect(sheet).toHaveAttribute("data-count", "0");
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(sheet).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("space-post")).toHaveAttribute(
      "data-comment-delta",
      "1"
    );
  });

  it("holds Space posts until blocks load, then hides blocked authors", () => {
    mockCommunitiesFeed.mockReturnValue({
      items: [joinedSpacePost()],
      loading: false,
      refresh: vi.fn(async () => {}),
      remove: vi.fn(),
    });
    const { rerender } = setup({
      feedSubTab: "communities",
      blockedReady: false,
    });
    expect(screen.queryByTestId("space-post")).toBeNull();
    expect(screen.queryByText("Your spaces are quiet right now")).toBeNull();
    rerender({
      feedSubTab: "communities",
      blockedReady: true,
      blockedUsers: new Set(["member-1"]),
    });
    expect(screen.queryByTestId("space-post")).toBeNull();
  });

  it("never renders a cached post from a Space this account has not joined", () => {
    mockCommunitiesFeed.mockReturnValue({
      items: [joinedSpacePost()],
      loading: false,
      refresh: vi.fn(async () => {}),
      remove: vi.fn(),
    });
    directory.entries = [{ def: { id: "runners" }, joined: false }];
    setup({ feedSubTab: "communities" });
    expect(screen.queryByTestId("space-post")).toBeNull();
    expect(
      screen.getByText("Join a space to fill this feed")
    ).toBeInTheDocument();
  });

  it("empty stream shows the honest join prompt, never a blank column", () => {
    setup({ feedSubTab: "communities" });
    expect(
      screen.getByText(/your spaces are quiet right now/i)
    ).toBeInTheDocument();
  });

  it("with no space joined, the empty stream asks you to join one", () => {
    directory.entries = [
      { def: { id: "runners" }, joined: false, memberCount: 3 },
    ];
    const { openTogether } = setup({ feedSubTab: "communities" });
    expect(
      screen.getByText("Join a space to fill this feed")
    ).toBeInTheDocument();
    expect(screen.queryByText(/your spaces are quiet right now/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Browse spaces" }));
    expect(openTogether).toHaveBeenCalled();
  });

  it("discloses the bounded stream when someone joined more than six Spaces", () => {
    directory.entries = Array.from({ length: 7 }, (_, i) => ({
      def: { id: `space-${i}` },
      joined: true,
    }));
    const { openTogether } = setup({ feedSubTab: "communities" });
    const browseAll = screen.getByRole("button", { name: "Browse all" });
    expect(browseAll.parentElement).toHaveTextContent(
      /Showing posts from 6 of your 7 Spaces/
    );
    fireEvent.click(browseAll);
    expect(openTogether).toHaveBeenCalled();
  });

  it("pull-to-refresh refreshes My communities while it is the source shown", () => {
    const communitiesRefresh = vi.fn(async () => {});
    mockCommunitiesFeed.mockReturnValue({
      items: [],
      loading: false,
      refresh: communitiesRefresh,
      remove: vi.fn(),
    });
    const { refreshRef, rerender } = setup({ feedSubTab: "communities" });
    expect(refreshRef.current).toBe(communitiesRefresh);
    rerender({ feedSubTab: "explore" });
    expect(refreshRef.current).toBe(emptyFeed.refresh);
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
