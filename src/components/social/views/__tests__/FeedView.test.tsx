/**
 * FeedView (SOCIAL-HOME-01 Stage D) — the compact feed-source menu
 * replacing the stacked SegmentedControl, and the Explore empty state
 * routing to a meaningful action instead of dead-ending.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

function setup(overrides: Partial<React.ComponentProps<typeof FeedView>> = {}) {
  const selectFeedSubTab = vi.fn();
  const openTogether = vi.fn();
  const refreshRef = {
    current: null,
  } as MutableRefObject<(() => Promise<void>) | null>;
  render(
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
