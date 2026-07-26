import { useSocialFeed } from "@/hooks/useSocialFeed";
import { useDiscoverFeed } from "@/hooks/useDiscoverFeed";
import { useFeedSubTabFreshness } from "@/hooks/useFeedSubTabFreshness";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState, Suspense } from "react";
import type { MutableRefObject } from "react";
import SpacesDirectory from "@/features/spaces/SpacesDirectory";
import ActivityCard from "@/components/social/ActivityCard";
import LeaderboardCard from "@/components/social/LeaderboardCard";
import TrajectoryCard from "@/components/social/TrajectoryCard";
import { ActivityCardSkeleton } from "@/components/LoadingSkeleton";
/* Soc5 item 10: FullLeaderboard lazy-loaded so the Social entry chunk
   stays lean. FullLeaderboard only loads when the overlay is
   requested from a leaderboard card. lazyRetry gives the same
   stale-chunk recovery the page-level lazy loads use. (ChallengeList
   gets the same treatment in CommunityView.) */
import { lazyRetry } from "@/lib/lazyRetry";
const FullLeaderboard = lazyRetry(
  () => import("@/components/social/FullLeaderboard")
);
import { Users, Globe, ChevronDown } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SoloFirstFeed from "@/components/social/SoloFirstFeed";
import WeeklyRecapCard from "@/components/social/WeeklyRecapCard";
import { SOCIAL_GATES, shouldRenderFollowingList } from "@/lib/socialGates";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { EmptyState as HexEmptyState } from "@/components/ui/EmptyState";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";
import type { FeedSubTab } from "./socialTabs";

export interface FeedViewProps {
  /** True when the Feed tab is the active top-level tab. Gates the
   *  following feed's enabled flag and the section render. The view
   *  itself stays mounted across tab switches (SOCIAL-HOME-01 Stage A)
   *  so feed state survives exactly as it did pre-extraction, when
   *  every hook lived in Social.tsx. */
  active: boolean;
  feedSubTab: FeedSubTab;
  /** URL-writing callback — stays in the shell since it owns searchParams. */
  selectFeedSubTab: (next: FeedSubTab) => void;
  followingCount: number | null;
  followingFeedUnlocked: boolean;
  showSoloFeed: boolean;
  blockedUsers: Set<string>;
  /** SOCIAL-PRIVACY-01: true once the block list has loaded. Feed reads
   *  are deferred until this is true so blocked content can't flash. */
  blockedReady: boolean;
  hiddenActivityIds: Set<string>;
  /** Open the People search overlay (was the find tab). */
  openPeople: () => void;
  /** Jump to the Together tab. */
  openTogether: () => void;
  pullRefreshing: boolean;
  /** The shell's pull-to-refresh needs the ACTIVE feed's refresh; the
   *  view publishes it into this ref so refresh keeps working without
   *  lifting the feed hooks out of the view. */
  refreshRef: MutableRefObject<(() => Promise<void>) | null>;
  /** The tab bar (and the rest of the shell chrome gate) is hidden
   *  while the FullLeaderboard overlay shows. The overlay state lives
   *  here; this callback mirrors it up to the shell. Called from the
   *  same event handlers that flip the local state so both updates
   *  land in one batched render — no intermediate frame. */
  onOverlayChange: (open: boolean) => void;
}

export default function FeedView({
  active,
  feedSubTab,
  selectFeedSubTab,
  followingCount,
  followingFeedUnlocked,
  showSoloFeed,
  blockedUsers,
  blockedReady,
  hiddenActivityIds,
  openPeople,
  openTogether,
  pullRefreshing,
  refreshRef,
  onOverlayChange,
}: FeedViewProps) {
  // uid scopes the per-sub-tab freshness pointers (SOCIAL-ATTENTION-01)
  // so a shared browser doesn't leak account A's "seen" dots to B.
  const { user } = useAuth();
  const freshnessUid = user?.uid ?? null;

  // Feed hooks — discover only fetches when active (#7)
  /* Following feed is enabled only when the user is on the Feed tab
     AND the Following sub-tab. Previously it fetched on every Social
     mount even when the user landed straight on Discover and never
     opened Following — wasted reads on the cold start.
     SOCIAL-PRIVACY-01: also gate on `blockedReady` so neither feed
     loads until the block list is known — otherwise a blocked user's
     activity flashes on first paint before the client-side filter has
     a set to filter against. */
  const followingFeed = useSocialFeed(
    false,
    blockedUsers,
    active && feedSubTab === "following" && blockedReady,
    hiddenActivityIds
  );
  const exploreFeed = useDiscoverFeed(
    feedSubTab === "explore" && blockedReady,
    blockedUsers
  );
  const activeFeed = feedSubTab === "following" ? followingFeed : exploreFeed;

  /* Soc5b pin (3): subtle new-content dot on inactive Feed sub-tab.
     Compares each sub-tab's newest visible item createdAt against the
     timestamp last seen by the user (persisted in localStorage per
     sub-tab). Dot never renders on the active sub-tab — content is
     visible directly there. */
  const { followingHasNew, exploreHasNew } = useFeedSubTabFreshness({
    activeSubTab: feedSubTab,
    followingNewestCreatedAt: followingFeed.items[0]?.createdAt,
    exploreNewestCreatedAt: exploreFeed.items[0]?.createdAt,
    uid: freshnessUid,
  });

  // Soc5: capture initial-render duration. renderStartRef takes its
  // timestamp from the post-mount effect (rather than lazy useState
  // which would trip the react-hooks/purity rule for performance.now()
  // in render). Fires once when activeFeed.loading transitions to
  // false — the moment the user sees real feed content instead of
  // skeleton state. Guarded so the event fires at most once per
  // session, regardless of sub-tab churn.
  const renderStartRef = useRef<number>(0);
  const renderReportedRef = useRef(false);
  useEffect(() => {
    renderStartRef.current = performance.now();
  }, []);
  useEffect(() => {
    if (activeFeed.loading || renderReportedRef.current) return;
    if (renderStartRef.current === 0) return;
    const ms = performance.now() - renderStartRef.current;
    trackSocialEvent("social_initial_render_ms", {
      durationMs: Math.round(ms),
    });
    renderReportedRef.current = true;
  }, [activeFeed.loading]);

  /* Publish the active feed's refresh into the shell's ref on every
     change so pull-to-refresh always hits the feed the user is
     looking at. Effect-time sync (not render-phase) for the same
     purity reason as the sentinel latest-ref below. */
  useEffect(() => {
    refreshRef.current = activeFeed.refresh;
  }, [refreshRef, activeFeed.refresh]);

  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  // SOCIAL-HOME-01: the feed-source picker is a compact menu now.
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  /* Overlay open/close flip the local state AND mirror it to the
     shell (chrome hide) inside the same event handler, so React
     batches both updates into a single render. */
  const openFullLeaderboard = () => {
    setShowFullLeaderboard(true);
    onOverlayChange(true);
  };
  const closeFullLeaderboard = () => {
    setShowFullLeaderboard(false);
    onOverlayChange(false);
  };

  // SOC-P1b — the following ACTIVITY feed renders from the FIRST follow.
  // The old ≥3-follow hard gate hid real activity from a user's first
  // two follows: they followed someone, that person trained, and the
  // feed still read "Follow 3+ to unlock" — a locked door in front of
  // content that already existed. Below 3 follows the list is sparse,
  // so the trajectory slot above keeps the surface weighted and the
  // progress row (below) frames the graph-building step honestly.
  // 0 follows still routes to SoloFirstFeed (Soc8 lock, unchanged).
  const showActivityList =
    !showSoloFeed &&
    (feedSubTab === "explore" ||
      (feedSubTab === "following" &&
        shouldRenderFollowingList(followingCount ?? 0)));

  // Infinite scroll sentinel — stable ref for loadMore (#21)
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedLoadMoreRef = useRef(activeFeed.loadMore);
  /* Latest-ref sync moved out of the render body (audit batch 4): a
     render-phase ref write is impure under React 19 StrictMode /
     concurrent rendering (a discarded render would still mutate it).
     The IntersectionObserver callback only reads .current async, after
     effects have run, so effect-time sync is equivalent. */
  useEffect(() => {
    feedLoadMoreRef.current = activeFeed.loadMore;
  }, [activeFeed.loadMore]);
  const { hasMore: feedHasMore, loading: feedLoading } = activeFeed;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          feedLoadMoreRef.current();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [feedHasMore, feedLoading]);

  return (
    <>
      {/* Full Leaderboard overlay — Suspense wraps the lazy chunk
          load (Soc5 item 10). Fallback is a small inline spinner;
          the overlay is full-screen so a centred spinner reads. */}
      {showFullLeaderboard && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
              <Spinner />
            </div>
          }
        >
          <FullLeaderboard onBack={closeFullLeaderboard} />
        </Suspense>
      )}

      {active && !showFullLeaderboard && (
        <section aria-label="Activity feed">
          <div className="!mt-3">
            {/* Feed source — a compact menu (SOCIAL-HOME-01), not a
                second stacked segmented track: one small chip names
                the current source and opens a two-option sheet. The
                Soc5b freshness dot rides on the chip when the OTHER
                source has new content, and on each sheet option. */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSourceMenuOpen(true)}
                className="relative inline-flex items-center gap-1 min-h-[44px] px-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
                aria-label={`Feed source: ${feedSubTab === "following" ? "Following" : "Explore"}`}
              >
                {feedSubTab === "following" ? "Following" : "Explore"}
                <ChevronDown className="size-4" aria-hidden="true" />
                {(feedSubTab === "following"
                  ? exploreHasNew
                  : followingHasNew) && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute top-2.5 right-0 size-1.5 rounded-full bg-primary"
                    />
                    <span className="sr-only"> new content elsewhere</span>
                  </>
                )}
              </button>
            </div>

            <BottomSheet
              open={sourceMenuOpen}
              onOpenChange={setSourceMenuOpen}
              title="Feed source"
            >
              <div
                className="px-5 pb-6 pt-2 space-y-2"
                role="radiogroup"
                aria-label="Feed source"
              >
                {(["following", "explore"] as FeedSubTab[]).map((st) => {
                  const hasNew =
                    st === "following" ? followingHasNew : exploreHasNew;
                  const text = st === "following" ? "Following" : "Explore";
                  const sub =
                    st === "following"
                      ? "Activities from people you follow"
                      : "Public activity across Tropos";
                  return (
                    <button
                      key={st}
                      type="button"
                      role="radio"
                      aria-checked={feedSubTab === st}
                      onClick={() => {
                        setSourceMenuOpen(false);
                        if (feedSubTab === st) return;
                        selectFeedSubTab(st);
                        trackSocialEvent("social_feed_subtab_changed", {
                          subTab: st,
                        });
                      }}
                      className={cn(
                        "w-full min-h-[44px] p-3 rounded-xl text-left transition-colors active:scale-[0.97]",
                        feedSubTab === st
                          ? "bg-primary/10 border border-primary/40"
                          : "bg-muted border border-transparent"
                      )}
                    >
                      <span className="relative inline-flex items-center text-sm font-semibold text-foreground">
                        {text}
                        {hasNew && (
                          <>
                            <span
                              aria-hidden="true"
                              className="absolute -top-0.5 -right-2 size-1.5 rounded-full bg-primary"
                            />
                            <span className="sr-only"> new content</span>
                          </>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </BottomSheet>

            {showSoloFeed && (
              <SoloFirstFeed
                onFindPeople={openPeople}
                onOpenTogether={openTogether}
              />
            )}

            {/* Weekly recap share entry — established users only
                (SoloFirstFeed carries its own share card for the
                cold-start stack). Renders nothing on a zero week. */}
            {!showSoloFeed && <WeeklyRecapCard />}

            {/* Spc1g — Suggested Spaces reach people who never
                open the Community tab. Compact cards, joined
                spaces filtered out; collapses entirely once the
                user has joined everything. */}
            {!showSoloFeed && (
              <div className="mt-4">
                <SpacesDirectory compact excludeJoined title="Spaces for you" />
              </div>
            )}

            {feedSubTab === "following" && !showSoloFeed && (
              <div className="mt-4 space-y-3">
                {/*
                If the user has <2 follows, a real leaderboard would just
                show them (and maybe one other person) — reads as "app is
                empty". Replace the slot with a trajectory card that
                reframes the space around personal progression: week-over-
                week hybrid score. Keeps the slot useful until the user
                builds a social graph. `followingCount === null` = still
                loading → render nothing so we don't flash the wrong card.
              */}
                {followingCount !== null &&
                  (followingCount >= 2 ? (
                    <LeaderboardCard
                      challenge="weekly_hybrid"
                      onViewFull={openFullLeaderboard}
                    />
                  ) : (
                    <TrajectoryCard />
                  ))}
                {/* Trajectory pairing: when the slot is the solo
                  trajectory card (thin social graph), follow it with
                  a low-key social next-step so the surface points
                  somewhere instead of dead-ending on personal stats.
                  One row, text-link CTA — same compact pattern as
                  the empty-feed prompt below. */}
                {followingCount !== null && !followingFeedUnlocked && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="size-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${THEME.brand}14` }}
                      >
                        <Users size={16} style={{ color: THEME.brand }} />
                      </div>
                      <p className="text-small text-muted-foreground leading-snug">
                        {/* SOC-P1b: progress framing, not a locked door —
                            the feed already renders below the threshold;
                            this row just names the graph-building step. */}
                        Following{" "}
                        <span className="font-mono tabular-nums">
                          {followingCount ?? 0} of{" "}
                          {SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS}
                        </span>{" "}
                        — your feed fills as you follow more
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openPeople}
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
                    >
                      Find people
                    </button>
                  </div>
                )}
              </div>
            )}

            {pullRefreshing && (
              <div className="flex items-center justify-center py-2">
                <Spinner size="sm" variant="primary" label="Refreshing feed" />
              </div>
            )}

            {/* The full-width refresh button that used to live here was
              an unlabelled lone icon between the trajectory card and
              the first activity row — looked like orphan chrome. The
              feed already has pull-to-refresh wired via the touch
              handlers on this container, so the button was redundant
              affordance for the same action. Removed in PR-bug-fix. */}

            {feedSubTab === "following" && followingFeed.error && (
              <div
                className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                aria-live="polite"
              >
                <p className="text-xs text-destructive">
                  {followingFeed.error}
                </p>
                <button
                  type="button"
                  onClick={followingFeed.refresh}
                  className="text-xs font-medium text-destructive underline ml-2 shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Sprint 5: Discover feed errors now surface a retry banner
              instead of falling through to the "Be the first to share"
              empty state. Pre-Sprint-5 a network failure read as "the
              community has nothing to show you" — a lie that damaged
              trust on every offline open. The banner only shows when
              we have no items AND there's an error; if cached items
              exist they keep rendering and the user can pull to
              refresh. */}
            {feedSubTab === "explore" &&
              exploreFeed.error &&
              exploreFeed.items.length === 0 &&
              !exploreFeed.loading && (
                <div
                  className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                  aria-live="polite"
                >
                  <p className="text-xs text-destructive">
                    Couldn't load the community feed. Check your connection.
                  </p>
                  <button
                    type="button"
                    onClick={exploreFeed.refresh}
                    className="text-xs font-medium text-destructive underline ml-2 shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}

            {showActivityList && (
              <div className="space-y-3">
                {activeFeed.items.map((item) => (
                  <ActivityCard key={item.id} feedItem={item} />
                ))}
              </div>
            )}

            {/*
            Two different loading states:
              - Initial load (no items yet) — render 3 staggered
                skeleton cards so the feed surface has visual weight
                while waiting for the first batch. Feels dramatically
                snappier than flashing blank then popping in content.
              - Pagination load (items already present) — keep the
                small centred spinner; full skeletons below real
                cards would be visually noisy.
          */}
            {activeFeed.loading &&
              activeFeed.items.length === 0 &&
              showActivityList && (
                <div
                  className="space-y-3"
                  aria-live="polite"
                  aria-label="Loading feed"
                >
                  <ActivityCardSkeleton stagger={0} />
                  <ActivityCardSkeleton stagger={1} />
                  <ActivityCardSkeleton stagger={2} />
                </div>
              )}
            {activeFeed.loading && activeFeed.items.length > 0 && (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" variant="muted" label="Loading more posts" />
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {activeFeed.hasMore &&
              !activeFeed.loading &&
              activeFeed.items.length > 0 && (
                <div ref={sentinelRef} className="h-1" aria-hidden="true" />
              )}

            {/* Empty state — show when no results AND no error to retry.
              The error case renders its own retry banner above
              (Sprint 5) so the empty state would be a duplicate
              "nothing to see here" + "actually, there was an error"
              double message. */}
            {!activeFeed.loading &&
              activeFeed.items.length === 0 &&
              showActivityList &&
              // SOC-P1b: below the follow threshold the progress row above
              // already frames the empty list AND carries the Find-people
              // CTA — rendering the empty state too would stack two
              // near-identical rows. It returns once the graph is built.
              !(feedSubTab === "following" && !followingFeedUnlocked) &&
              !(feedSubTab === "explore" && exploreFeed.error) && (
                <div className="mt-6" aria-live="polite">
                  {feedSubTab === "explore" ? (
                    /* Soc5 locked Explore empty-state copy. Explore is a
                   consume-others'-content surface — Tropos's
                   positioning is calm/honest about a small network
                   rather than pushing the user to create content
                   themselves (which is what the Following empty
                   state implicitly does via "find people"). No
                   action CTA per the lock. */
                    /* SOCIAL-HOME-01: the dead end routes somewhere
                       useful — Together holds the user's Circles and
                       the cold-start selector, which don't depend on
                       anyone else posting. Supersedes the Soc5
                       no-CTA lock. */
                    <HexEmptyState
                      icon={Globe}
                      headline="Tropos is quiet right now"
                      sub="Your Circles don't need a crowd"
                      accent={THEME.brand}
                      action={{
                        label: "Open Together",
                        onClick: openTogether,
                      }}
                    />
                  ) : (
                    /* Inline prompt — sits as a supporting element under
                   TrajectoryCard. Was previously a full centered empty
                   state with a primary-purple "Find people to follow"
                   button which competed visually with the trajectory
                   card above it (two heroes stacked). Compressed to
                   one row with a text-link CTA so the trajectory card
                   stays the hero of the surface. Same compact pattern
                   as ChallengeList's empty state on Together. */
                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="size-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${THEME.brand}14` }}
                        >
                          <Users size={16} style={{ color: THEME.brand }} />
                        </div>
                        {/* Following empty-state copy — surfaces both
                        growth paths (1:1 follow OR space membership)
                        rather than only following. (Was "join crews"
                        until the crews retirement, 2026-07-20.) */}
                        <p className="text-small text-muted-foreground leading-snug">
                          Your feed is empty · Follow people or join a space to
                          see their activities
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openPeople}
                        className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
                      >
                        Find people
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>
        </section>
      )}
    </>
  );
}
