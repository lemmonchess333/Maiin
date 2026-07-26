/**
 * FeedView (SOCIAL-HOME-01 Stage D) — the compact feed-source menu
 * replacing the stacked SegmentedControl, and the Explore empty state
 * routing to a meaningful action instead of dead-ending.
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

vi.mock("@/hooks/useSocialFeed", () => ({
  useSocialFeed: () => emptyFeed,
}));
vi.mock("@/hooks/useDiscoverFeed", () => ({
  useDiscoverFeed: () => emptyFeed,
}));
vi.mock("@/hooks/useFeedSubTabFreshness", () => ({
  useFeedSubTabFreshness: () => ({
    followingHasNew: false,
    exploreHasNew: true,
  }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
}));
vi.mock("@/features/spaces/SpacesDirectory", () => ({
  default: () => null,
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
vi.mock("@/components/social/ActivityCard", () => ({ default: () => null }));
vi.mock("@/components/social/LeaderboardCard", () => ({
  default: () => null,
}));
vi.mock("@/components/social/TrajectoryCard", () => ({ default: () => null }));
vi.mock("@/components/social/SoloFirstFeed", () => ({ default: () => null }));
vi.mock("@/components/social/WeeklyRecapCard", () => ({
  default: () => null,
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

function setup(overrides: Partial<React.ComponentProps<typeof FeedView>> = {}) {
  const selectFeedSubTab = vi.fn();
  const openTogether = vi.fn();
  const refreshRef = {
    current: null,
  } as MutableRefObject<(() => Promise<void>) | null>;
  render(
    <MemoryRouter>
      <FeedView
        active
        feedSubTab="explore"
        selectFeedSubTab={selectFeedSubTab}
        followingCount={3}
        followingFeedUnlocked
        showSoloFeed={false}
        blockedUsers={new Set()}
        blockedReady={true}
        hiddenActivityIds={new Set()}
        openPeople={vi.fn()}
        openTogether={openTogether}
        pullRefreshing={false}
        refreshRef={refreshRef}
        onOverlayChange={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { selectFeedSubTab, openTogether };
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

  it("re-picking the current source closes without a redundant URL write", () => {
    const { selectFeedSubTab } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: /feed source: explore/i })
    );
    fireEvent.click(screen.getByRole("radio", { name: /explore/i }));
    expect(selectFeedSubTab).not.toHaveBeenCalled();
  });
});

describe("FeedView — explore empty state routes somewhere useful", () => {
  it("offers Open Together instead of a dead end", () => {
    const { openTogether } = setup();
    expect(screen.getByText("Tropos is quiet right now")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open together/i }));
    expect(openTogether).toHaveBeenCalled();
  });
});

describe("FeedView — honest Your-week slot (SOC-P1c)", () => {
  /* The zero-week collapse only arms on the following sub-tab with a
     thin graph (<2 follows) — exactly where TrajectoryCard used to
     self-fetch the same data. */
  const thinGraph = {
    feedSubTab: "following" as const,
    followingCount: 1,
    followingFeedUnlocked: false,
  };

  it("zero-session week: WeekOpenerCard replaces the recap slot", async () => {
    mockGetPersonalTrajectory.mockResolvedValue(trajectory(0));
    setup(thinGraph);
    expect(
      await screen.findByText(/pts to beat from last week/i)
    ).toBeInTheDocument();
    // The dead "Build recap" button never renders on an open week.
    expect(screen.queryByText(/build recap/i)).toBeNull();
  });

  it("zero-week with no baseline gets first-session copy", async () => {
    mockGetPersonalTrajectory.mockResolvedValue(trajectory(0, 0));
    setup(thinGraph);
    expect(
      await screen.findByText(/first session starts your trajectory/i)
    ).toBeInTheDocument();
  });

  it("a week WITH sessions keeps the recap slot (no opener)", async () => {
    mockGetPersonalTrajectory.mockResolvedValue(trajectory(500));
    setup(thinGraph);
    // WeeklyRecapCard is mocked to null; the pin is the opener's absence.
    await screen.findByRole("button", { name: /feed source: following/i });
    expect(screen.queryByText(/week's open/i)).toBeNull();
  });

  it("leaderboard-tier users (>=2 follows) never fetch trajectory", () => {
    setup({ feedSubTab: "following", followingCount: 3 });
    expect(mockGetPersonalTrajectory).not.toHaveBeenCalled();
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

  it("renders joined-space posts with a space eyebrow link", () => {
    mockCommunitiesFeed.mockReturnValue({
      items: [
        {
          spaceId: "runners",
          postId: "coach-2026-07-20",
          post: {
            authorId: "tropos-coach",
            authorName: "Tropos Coach",
            body: "prompt",
            likeCount: 0,
            commentCount: 0,
            official: true,
            createdAt: { toDate: () => new Date() },
          },
        },
      ],
      loading: false,
      refresh: vi.fn(async () => {}),
      remove: vi.fn(),
    });
    setup({ feedSubTab: "communities" });
    expect(screen.getByTestId("space-post")).toHaveTextContent(
      "coach-2026-07-20"
    );
    expect(screen.getByRole("link", { name: /runners/i })).toHaveAttribute(
      "href",
      "/space/runners"
    );
  });

  it("empty stream shows the honest join prompt, never a blank column", () => {
    setup({ feedSubTab: "communities" });
    expect(
      screen.getByText(/your spaces are quiet right now/i)
    ).toBeInTheDocument();
  });
});
