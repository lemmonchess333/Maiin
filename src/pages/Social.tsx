import { useSocialFeed } from "../hooks/useSocialFeed";
import { useHiddenActivities } from "@/hooks/useHiddenActivities";
import { useDiscoverFeed } from "../hooks/useDiscoverFeed";
import { useCrews } from "../hooks/useCrews";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { useSuggestedPeople } from "../hooks/useSuggestedPeople";
import { useSuggestedCrews } from "../hooks/useSuggestedCrews";
import { useFeedSubTabFreshness } from "@/hooks/useFeedSubTabFreshness";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { searchUsers, getBoundedFollowingCount } from "../lib/socialApi";
import ActivityCard from "../components/social/ActivityCard";
import LeaderboardCard from "../components/social/LeaderboardCard";
import TrajectoryCard from "../components/social/TrajectoryCard";
import BlockAwareAvatar from "../components/social/BlockAwareAvatar";
import { ActivityCardSkeleton } from "../components/LoadingSkeleton";
import FollowButton from "../components/social/FollowButton";
import FollowsYouBadge from "../components/social/FollowsYouBadge";
/* Soc5 item 10: ChallengeList + FullLeaderboard lazy-loaded so the
   Social entry chunk stays lean. ChallengeList only loads when the
   user opens the Crews tab; FullLeaderboard only when the overlay
   is requested from a leaderboard card. lazyRetry gives the same
   stale-chunk recovery the page-level lazy loads use. */
import { lazyRetry } from "../lib/lazyRetry";
const ChallengeList = lazyRetry(() =>
  import("../features/challenges/ChallengeList").then((m) => ({
    default: m.ChallengeList,
  }))
);
const FullLeaderboard = lazyRetry(
  () => import("../components/social/FullLeaderboard")
);
import {
  Share,
  Users,
  Globe,
  Dumbbell,
  Footprints,
  Zap,
  Target,
  Flame,
  Salad,
  PersonStanding,
  Medal,
  Sunrise,
  X,
  Search,
  Bell,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import IconButton from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationsSheet from "@/components/social/NotificationsSheet";
import { toast } from "@/lib/toast";
import { THEME } from "../lib/theme";
import { EmptyState as HexEmptyState } from "../components/ui/EmptyState";
import { motion, AnimatePresence } from "framer-motion";
import { BottomSheet } from "@/components/ui/BottomSheet";
import Coachmark from "@/components/ui/Coachmark";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";

/* "discover" used to mean two different things: a top-level tab AND
   a feed sub-tab. The top-level tab is now `find` (search + invite +
   suggestions) and the feed sub-tab is `explore` (public activity).
   Naming collision audited and removed. */
type SocialTab = "feed" | "crews" | "find";
type FeedSubTab = "following" | "explore";

// Crew icons live in src/lib/crewIcons so the Crew page can render
// the same glyph the list row shows.
import { CREW_ICON_MAP as ICON_MAP } from "../lib/crewIcons";

export default function Social() {
  const { user, profile } = useAuth();
  /* useBlockedUsers now returns { blocked, addBlocked, removeBlocked }
     so ActivityCard can mutate the shared set after a block write
     completes. We only care about the Set here for filtering — the
     mutators are consumed by ActivityCard which calls useBlockedUsers
     itself. The module-level cache keeps the two instances in sync. */
  const { blocked: blockedUsers } = useBlockedUsers();
  // S4c: user-hidden activity IDs filter the feed alongside blocked
  // users. Local-only (localStorage) per device; spec defers cross-
  // device sync until demand emerges.
  const { hidden: hiddenActivityIds } = useHiddenActivities();

  // Soc5: top-level tab persisted via URL search param. Lets external
  // links (notifications, share cards, the bottom-nav re-tap pattern)
  // deep-link directly to a tab and means browser back/forward
  // navigates between tabs naturally. URL writes are {replace:true}
  // so each tab tap doesn't accumulate browser history entries.
  // Default 'feed' is the URL-clean state (`?tab=` is stripped when
  // on feed). The Soc5c smart-default below may rewrite the URL to
  // 'find' for genuine new users (zero follows + zero crew).
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabFromUrl = searchParams.get("tab");
  const tab: SocialTab =
    tabFromUrl === "crews" || tabFromUrl === "find" ? tabFromUrl : "feed";

  /* Soc5 item 12: deep-link `/social?tab=crews&crewId=abc123` jumps
     straight to the per-crew page. Non-members see Crew.tsx's
     existing Join CTA — same path as tapping a crew row in the
     list, just one fewer hop for users following an invite link.
     replace:true so the transient Social URL doesn't show up in
     browser history (back-button returns to whatever launched the
     link, not to the redirect surface). */
  const crewIdFromUrl = searchParams.get("crewId");
  useEffect(() => {
    if (!crewIdFromUrl) return;
    navigate(`/crew/${crewIdFromUrl}`, { replace: true });
  }, [crewIdFromUrl, navigate]);
  const setTab = useCallback(
    (next: SocialTab) => {
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          if (next === "feed") updated.delete("tab");
          else updated.set("tab", next);
          return updated;
        },
        { replace: true }
      );
      trackSocialEvent("social_tab_selected", { tab: next });
    },
    [setSearchParams]
  );

  /**
   * Smart default: new / zero-follow users land on Discover; users
   * with any follows land on Following. One cheap limit(2) read
   * decides both "do I have any follows" (smart default tab) AND
   * "do I have ≥2 follows" (leaderboard vs trajectory card).
   * While we wait, we default to 'explore' so a brand-new user
   * never sees a flash of the empty Following state before
   * resolution. `followingCount` is bounded at 2 — we only care
   * about the threshold, not the exact number.
   */
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>("explore");
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user || followingCount !== null) return;
    let cancelled = false;
    getBoundedFollowingCount(user.uid, 2)
      .then((n) => {
        if (cancelled) return;
        setFollowingCount(n);
        setFeedSubTab(n > 0 ? "following" : "explore");
      })
      .catch(() => {
        // On error, treat as zero — safe empty state + trajectory card.
        if (!cancelled) setFollowingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user, followingCount]);

  // Soc5c smart default — only fires when there's NO URL `?tab=` AND
  // the user is genuinely brand-new (zero follows + zero crew). Once
  // applied, the guard ref ensures the smart default never overrides
  // subsequent user navigation, even if the user un-follows everyone
  // / leaves their crew during the session.
  const smartDefaultAppliedRef = useRef(false);
  const profileCrewId = profile?.crewId;
  useEffect(() => {
    if (smartDefaultAppliedRef.current) return;
    if (tabFromUrl) {
      // URL already specifies a tab → honour it; never override.
      smartDefaultAppliedRef.current = true;
      return;
    }
    if (followingCount === null) return; // await async resolution
    smartDefaultAppliedRef.current = true;
    if (followingCount === 0 && !profileCrewId) {
      setTab("find");
    }
  }, [tabFromUrl, followingCount, profileCrewId, setTab]);

  // Soc5c: "new user" signal drives the first-launch coachmark on
  // the Find tab. Same definition as the smart default (zero follows
  // + zero crew). While followingCount is still resolving we treat
  // the user as established — that way an existing user with a slow
  // network never sees a flash of the new-user coachmark.
  const isNewUser = followingCount === 0 && !profileCrewId;

  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  // In-app social notification tray (kudos / comment / follow). Closes the
  // engagement loop — the server already writes these; this surfaces them.
  const [showNotifications, setShowNotifications] = useState(false);
  const notifications = useNotifications();

  // Crew banner dismiss state. localStorage access wrapped in
  // try/catch — Safari private mode + strict-cookie iframes throw
  // SecurityError synchronously, which would otherwise crash the
  // whole Social page on mount via the useState initialiser.
  const [crewBannerDismissed, setCrewBannerDismissed] = useState(() => {
    try {
      return !!localStorage.getItem("tropos_crew_banner_dismissed");
    } catch {
      return false;
    }
  });
  const dismissCrewBanner = () => {
    setCrewBannerDismissed(true);
    try {
      localStorage.setItem("tropos_crew_banner_dismissed", "1");
    } catch {
      // Best-effort persistence — in private mode the dismissal
      // simply doesn't survive a reload.
    }
  };

  // Feed hooks — discover only fetches when active (#7)
  /* Following feed is enabled only when the user is on the Feed tab
     AND the Following sub-tab. Previously it fetched on every Social
     mount even when the user landed straight on Discover and never
     opened Following — wasted reads on the cold start. */
  const followingFeed = useSocialFeed(
    false,
    blockedUsers,
    tab === "feed" && feedSubTab === "following",
    hiddenActivityIds
  );
  const exploreFeed = useDiscoverFeed(feedSubTab === "explore", blockedUsers);
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

  // Suggested People — fetches lazily only when the Discover tab is shown.
  const {
    people: suggestedPeople,
    loading: suggestedLoading,
    refresh: refreshSuggestions,
    remove: removeSuggestion,
  } = useSuggestedPeople(tab === "find", blockedUsers);

  /* S4e-MVP — restricted-user gate on the Find tab. Hook subscribes
     to the user's own `globalRestrictedUids/{uid}` doc; doc existence
     = restricted. Search input + FollowButton + invite-share are
     gated below when isRestricted. Loading state is treated as not-
     restricted so we don't flash the gate on slow networks for the
     vast majority of users who aren't restricted. */
  const { isRestricted } = useRestrictedStatus(user?.uid);

  /* S4e-P13: fire social_restricted_gate_shown once per Find-tab
     mount where the gate actually renders. Guard with a ref so
     remount (tab change → back) gets a fresh event but a re-render
     inside the same tab visit does not. */
  const restrictedGateShownRef = useRef(false);
  useEffect(() => {
    if (tab !== "find") {
      restrictedGateShownRef.current = false;
      return;
    }
    if (isRestricted && !restrictedGateShownRef.current) {
      restrictedGateShownRef.current = true;
      trackSocialEvent("social_restricted_gate_shown");
    }
  }, [tab, isRestricted]);

  // Crews
  const {
    crews,
    error: crewsError,
    currentCrew,
    joinCrew,
    leaveCrew,
    createCrew,
    refresh: refreshCrews,
  } = useCrews();
  // Soc5d Phase 2: Suggested Crews — friend-of-friend (≥2 follows in
  // the same crew). Lazy-active on the Crews tab to skip the read
  // cost when the user is browsing Feed or Find.
  const {
    crews: suggestedCrews,
    refresh: refreshSuggestedCrews,
    dismiss: dismissSuggestedCrew,
  } = useSuggestedCrews(tab === "crews", crews);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");
  const [creatingCrew, setCreatingCrew] = useState(false);

  // Leave crew modal (#19)
  const [leavingCrewId, setLeavingCrewId] = useState<string | null>(null);
  /* Crew list sort. Default is 'popular' (memberCount desc) which is
     also the order Firestore returns rows in, so the initial render
     matches the user's first impression. 'new' surfaces recently-
     created crews so they don't get permanently buried under
     established ones. 'alpha' is the predictable browse mode. */
  const [crewSort, setCrewSort] = useState<"popular" | "new" | "alpha">(
    "popular"
  );
  /* Per-crew busy state — tracks the crew the user is currently
     joining so the row button can disable + show "Joining…". Without
     this, double-taps would double-fire joinCrew. */
  const [joiningCrewId, setJoiningCrewId] = useState<string | null>(null);
  /* Busy flag for the leave-confirm sheet so a slow Firestore write
     can't be triggered twice (Cancel/Leave double tap would otherwise
     race). */
  const [leavingInFlight, setLeavingInFlight] = useState(false);

  // Find tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { uid: string; displayName?: string; photoURL?: string; crewId?: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  /* Distinct error state lets the empty-results UI distinguish "no
     match for this query" (legitimate empty state) from "the network
     ate the request" (retryable). Previously failures collapsed into
     setSearchResults([]) which surfaced the same "No users found"
     copy as a real empty result, which lied to the user. */
  const [searchError, setSearchError] = useState<string | null>(null);
  // Crew leave/create confirmation + form now use the BottomSheet primitive,
  // which provides the focus trap (plus Escape, scroll-lock, drag-dismiss).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  /* Sequencing guard: a slow request followed by a faster one could
     otherwise have its stale results overwrite the fresh ones. Each
     handleSearch invocation increments this counter; the resolution
     handler only writes results when the counter is still equal to
     the value captured at start. */
  const searchSeqRef = useRef(0);

  const MIN_SEARCH_LEN = 2;

  const handleSearch = useCallback(
    async (q?: string) => {
      const query = (q ?? searchQuery).trim();
      /* Min-length gate: 1-char queries hit the index hard and rarely
       produce useful results. Anything shorter just clears stale UI. */
      if (query.length < MIN_SEARCH_LEN) {
        setSearchResults([]);
        setSearchError(null);
        setSearching(false);
        return;
      }
      const seq = ++searchSeqRef.current;
      setSearching(true);
      setSearchError(null);
      try {
        const results = await searchUsers(query);
        if (seq !== searchSeqRef.current) return; // stale, newer search in flight
        const filtered = results
          .filter((u) => u.uid !== user?.uid)
          // Don't surface blocked users in search hits — same shared cache
          // the feed filters use, so a block from one surface flows here.
          .filter((u) => !blockedUsers.has(u.uid));
        setSearchResults(filtered);
      } catch {
        if (seq !== searchSeqRef.current) return;
        setSearchResults([]);
        setSearchError("Couldn't search right now. Try again.");
      }
      if (seq === searchSeqRef.current) setSearching(false);
    },
    [searchQuery, user?.uid, blockedUsers]
  );

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length >= MIN_SEARCH_LEN) {
      searchDebounceRef.current = setTimeout(() => handleSearch(value), 300);
    } else {
      /* Empty input → clear results immediately. Previously the input
         clearing left stale results on screen because the debounce
         block only fired for non-empty values, so the previous query's
         results stayed up indefinitely. */
      setSearchResults([]);
      setSearchError(null);
    }
  };

  /* Clean up any pending debounced search on unmount so a tab change
     mid-typing doesn't fire setState on an unmounted component. */
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Pull-to-refresh with iOS conflict fix (#9).
  // Soc5 cross-cutting pin: pull-to-refresh re-fetches the active
  // tab's data — feed view re-pulls the active feed, Crews tab
  // re-pulls the crew list (and Suggested Crews in Phase 2). Hook
  // owns gesture state + state-machine; this page owns the per-tab
  // refresh action via the onRefresh callback.
  // Extracted into src/hooks/usePullToRefresh.ts so History + Food
  // share the same gesture implementation rather than triplicating
  // ~50 lines of identical touch-handling code.
  const performRefresh = useCallback(async () => {
    if (tab === "feed") {
      await activeFeed.refresh();
    } else if (tab === "crews") {
      // Soc5 cross-cutting pin: single pull-to-refresh re-fetches
      // BOTH the crew list AND friend-of-friend suggestions so
      // the user gets a consistent fresh state.
      await Promise.all([refreshCrews(), refreshSuggestedCrews()]);
    }
    // Find tab: search results are user-driven; no refresh action.
  }, [tab, activeFeed, refreshCrews, refreshSuggestedCrews]);

  const {
    isRefreshing: pullRefreshing,
    triggerRefresh,
    bindProps: pullBindProps,
  } = usePullToRefresh({ onRefresh: performRefresh });

  /* Soc5 cross-cutting pin (3): listen for the bottom-nav retap event
     dispatched by Layout.tsx when the user taps the already-active
     Social tab. Reuses the hook's triggerRefresh so behaviour stays
     consistent across the two entry points (gesture + retap). The
     actual scroll-to-top happens in Layout.tsx before the dispatch. */
  useEffect(() => {
    const onRetap = () => {
      void triggerRefresh();
    };
    window.addEventListener("tropos:social-tab-retap", onRetap);
    return () => window.removeEventListener("tropos:social-tab-retap", onRetap);
  }, [triggerRefresh]);

  // Infinite scroll sentinel — stable ref for loadMore (#21)
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedLoadMoreRef = useRef(activeFeed.loadMore);
  feedLoadMoreRef.current = activeFeed.loadMore;
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

  const handleShareInvite = async () => {
    const text =
      "I'm tracking my lifts and runs on Tropos. Join me and let's compete!";
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Tropos",
          text,
          url: window.location.origin,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(text + " " + window.location.origin);
      toast.success("Invite link copied");
    }
  };

  const itemVariant = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <motion.div
      {...pullBindProps}
      className="space-y-4"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      <motion.header variants={itemVariant} className="pt-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">Social</h1>
          <div className="relative">
            <IconButton
              aria-label={
                notifications.unreadCount > 0
                  ? `Notifications, ${notifications.unreadCount} unread`
                  : "Notifications"
              }
              icon={<Bell className="size-5" />}
              variant="ghost"
              onClick={() => {
                setShowNotifications(true);
                notifications.markAllSeen();
              }}
            />
            {notifications.unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-caption font-bold font-mono tabular-nums text-white pointer-events-none bg-running">
                {notifications.unreadCount > 9
                  ? "9+"
                  : notifications.unreadCount}
              </span>
            )}
          </div>
        </div>
      </motion.header>

      <NotificationsSheet
        open={showNotifications}
        onOpenChange={setShowNotifications}
        items={notifications.items}
        loading={notifications.loading}
      />

      {/* Crew banner if no crew — dismissible */}
      <AnimatePresence>
        {!profile?.crewId && tab === "feed" && !crewBannerDismissed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-purple-200 dark:border-purple-900/40"
              style={{ background: `${THEME.brand}14` }}
            >
              <button
                type="button"
                onClick={() => setTab("crews")}
                className="flex items-center gap-3 flex-1 text-left min-h-[44px]"
              >
                <Users className="size-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-small font-medium text-foreground">
                    Join a crew to connect with others
                  </p>
                  <p className="text-small text-muted-foreground">
                    Browse crews
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={dismissCrewBanner}
                className="size-11 -m-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <FullLeaderboard onBack={() => setShowFullLeaderboard(false)} />
        </Suspense>
      )}

      {/* Tab bar — primary navigation on the canonical iOS "track"
          SegmentedControl (44pt floor + full radiogroup a11y handled by
          the primitive). Was a hand-rolled button row; migrated in the
          Social-uniformity pass so every switcher across the app shares
          one control. */}
      {!showFullLeaderboard && (
        <>
          <SegmentedControl
            ariaLabel="Social section"
            value={tab}
            onChange={setTab}
            options={[
              { value: "feed", label: "Feed" },
              { value: "crews", label: "Crews" },
              { value: "find", label: "People" },
            ]}
          />

          {/* ========== FEED TAB ========== */}
          {tab === "feed" && (
            <section aria-label="Activity feed">
              <div className="!mt-3">
                {/* Feed sub-tabs: Following | Explore. Same canonical
                    SegmentedControl as the section tabs above — secondary
                    track. The Soc5b new-content dot rides inside each
                    option's label node (a relative wrapper) with an
                    sr-only "new content" hint replacing the old per-button
                    aria-label. Suppressed on the active sub-tab by the
                    freshness hook. */}
                <SegmentedControl
                  ariaLabel="Feed source"
                  value={feedSubTab}
                  onChange={(st) => {
                    setFeedSubTab(st);
                    trackSocialEvent("social_feed_subtab_changed", {
                      subTab: st,
                    });
                  }}
                  options={(["following", "explore"] as FeedSubTab[]).map(
                    (st) => {
                      const hasNew =
                        st === "following" ? followingHasNew : exploreHasNew;
                      const text = st === "following" ? "Following" : "Explore";
                      return {
                        value: st,
                        label: (
                          <span className="relative inline-flex items-center">
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
                        ),
                      };
                    }
                  )}
                />

                {feedSubTab === "following" && (
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
                          onViewFull={() => setShowFullLeaderboard(true)}
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
                    {followingCount !== null && followingCount < 2 && (
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border/40">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="size-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${THEME.brand}14` }}
                          >
                            <Users size={16} style={{ color: THEME.brand }} />
                          </div>
                          <p className="text-small text-muted-foreground leading-snug">
                            Follow people or join a crew to compete this week
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTab("find")}
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
                    <Spinner
                      size="sm"
                      variant="primary"
                      label="Refreshing feed"
                    />
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

                <div className="space-y-3">
                  {activeFeed.items.map((item) => (
                    /* feedSource lets ActivityCard render the "From your
                 crew" trust chip on Explore only — Following posts
                 are by definition from people the user already
                 chose, so the chip would be redundant noise there. */
                    <ActivityCard
                      key={item.id}
                      feedItem={item}
                      feedSource={feedSubTab}
                    />
                  ))}
                </div>

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
                {activeFeed.loading && activeFeed.items.length === 0 && (
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
                    <Spinner
                      size="sm"
                      variant="muted"
                      label="Loading more posts"
                    />
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
                        <HexEmptyState
                          icon={Globe}
                          headline="Tropos is quiet right now"
                          sub="Check back later"
                          accent={THEME.brand}
                        />
                      ) : (
                        /* Inline prompt — sits as a supporting element under
                   TrajectoryCard. Was previously a full centered empty
                   state with a primary-purple "Find people to follow"
                   button which competed visually with the trajectory
                   card above it (two heroes stacked). Compressed to
                   one row with a text-link CTA so the trajectory card
                   stays the hero of the surface. Same compact pattern
                   as ChallengeList's empty state on the Crews tab. */
                        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="size-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: `${THEME.brand}14` }}
                            >
                              <Users size={16} style={{ color: THEME.brand }} />
                            </div>
                            {/* Soc5 locked Following empty-state copy. The
                        "or join crews" addition is the key delta vs
                        the prior copy — surfaces both growth paths
                        (1:1 follow OR group membership) rather than
                        only following. */}
                            <p className="text-small text-muted-foreground leading-snug">
                              Your feed is empty · Follow people or join crews
                              to see their activities
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setTab("find")}
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

          {/* ========== CREWS TAB ==========
          Crews + challenges share this tab. Long-term (PR 3) challenges
          live inside individual crew pages and "Crews" becomes a list
          of crew homes — for now they sit side-by-side so neither
          feature loses an entry point. Progress photos used to be a
          peer tab here; they moved to the user's own profile because
          they're a private/personal artifact, not social content. */}
          {tab === "crews" && (
            <section aria-label="Crews and challenges" className="space-y-6">
              {/* Challenges — placed first because they're the active /
              competitive surface. Empty-state CTA jumps to Discover so
              users have a clear path to find people to challenge.
              Suspense wraps the lazy chunk (Soc5 item 10); the
              fallback is a single skeleton row so the surface
              doesn't jump on first Crews-tab open. */}
              <Suspense
                fallback={
                  <div
                    className="h-16 rounded-xl bg-muted/40 animate-pulse"
                    aria-hidden="true"
                  />
                }
              >
                <ChallengeList onFindFriends={() => setTab("find")} />
              </Suspense>

              {/* Soc5d: prominent Create-Crew CTA, shown ONLY when the
              user isn't currently in any crew. Per the locked spec,
              users with a crew see a smaller muted CTA below the
              crew list instead. The visual prominence here mirrors
              the gradient pill used elsewhere for primary growth
              actions (eg. Pro upgrade). */}
              {!profileCrewId && (
                <div className="space-y-3">
                  {/* Soc5 item 8c: empty-state copy framing the section.
                  The prominent CTA below provides the primary
                  action; this explainer names the state so a brand-
                  new user understands WHY they're staring at a
                  button rather than a list. Mirrors the inline pill
                  pattern used for the Following empty state. */}
                  <div className="text-center px-4">
                    <p className="text-sm font-semibold text-foreground">
                      You're not in any crews yet
                    </p>
                    <p className="text-small text-muted-foreground mt-1">
                      Create one or join via invite link
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateGroup(true);
                      trackSocialEvent("social_create_crew_tapped");
                    }}
                    className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm active:scale-[0.98] transition-transform shadow-sm"
                    style={{ background: THEME.brandStrong }}
                  >
                    Create a Crew
                  </button>
                </div>
              )}

              {/* Soc5d Phase 2: Suggested Crews section — friend-of-friend
              picks where ≥2 of the user's follows are members. Section
              hides entirely when no qualifying suggestions exist
              (zero-state on follows, all dismissed, no overlaps), so
              users without a social network don't see a sad empty
              section. Each card has a dismiss X that persists to
              localStorage. */}
              {suggestedCrews.length > 0 && (
                <div className="space-y-3">
                  <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggested for you
                  </p>
                  <div className="space-y-2">
                    {suggestedCrews.slice(0, 3).map((crew) => {
                      const IconComp = ICON_MAP[crew.icon];
                      const isJoiningThis = joiningCrewId === crew.id;
                      return (
                        <div
                          key={crew.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40"
                        >
                          <div
                            className="size-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: `${THEME.brand}14` }}
                          >
                            {IconComp && (
                              <IconComp
                                size={18}
                                className="text-primary shrink-0"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {crew.name}
                            </p>
                            <p className="text-micro text-muted-foreground truncate">
                              {crew.matchedFollows} of your follows
                              {crew.matchedFollows === 1 ? " is" : " are"} here
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              setJoiningCrewId(crew.id);
                              try {
                                await joinCrew(crew.id);
                                toast.success(`Joined ${crew.name}`);
                              } catch {
                                toast.error(
                                  "Couldn't join the crew. Try again."
                                );
                              } finally {
                                setJoiningCrewId(null);
                              }
                            }}
                            disabled={isJoiningThis}
                            className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60 active:scale-[0.96] transition-transform"
                            style={{ background: THEME.brandStrong }}
                          >
                            {isJoiningThis ? "Joining…" : "Join"}
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissSuggestedCrew(crew.id)}
                            aria-label={`Dismiss suggestion: ${crew.name}`}
                            className="size-7 rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-90 transition-all"
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Crews list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                    Crews
                  </p>
                  {/* Sort — same canonical SegmentedControl, compact
                  `wrap` layout so the three short options sit beside the
                  section eyebrow without stretching. Three options keep
                  the bar narrow enough not to wrap on a 320px viewport. */}
                  <SegmentedControl
                    ariaLabel="Sort crews"
                    layout="wrap"
                    className="shrink-0"
                    value={crewSort}
                    onChange={setCrewSort}
                    options={[
                      { value: "popular", label: "Popular" },
                      { value: "new", label: "New" },
                      { value: "alpha", label: "A–Z" },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  {(() => {
                    /* Client-side re-sort over the full fetched array.
                   The Firestore query already returns every crew (no
                   limit), so sorting here is just an array reorder —
                   no extra reads. The slice cap stays at 5 across all
                   sort modes to keep the surface curated; users who
                   want the long tail can use the sort to peek at
                   different slices without an "expand" affordance. */
                    const sorted = [...crews];
                    if (crewSort === "new") {
                      sorted.sort((a, b) => {
                        const at = a.createdAt as
                          | { toMillis?: () => number }
                          | Date
                          | null;
                        const bt = b.createdAt as
                          | { toMillis?: () => number }
                          | Date
                          | null;
                        const am =
                          at instanceof Date
                            ? at.getTime()
                            : (at?.toMillis?.() ?? 0);
                        const bm =
                          bt instanceof Date
                            ? bt.getTime()
                            : (bt?.toMillis?.() ?? 0);
                        return bm - am;
                      });
                    } else if (crewSort === "alpha") {
                      sorted.sort((a, b) => a.name.localeCompare(b.name));
                    }
                    /* 'popular' falls through — Firestore already ordered
                   by memberCount desc, so the initial array is the
                   correct order. */
                    return sorted.slice(0, 5);
                  })().map((crew) => {
                    const isMember = currentCrew?.id === crew.id;
                    const IconComp = ICON_MAP[crew.icon];
                    /* Subtext priority:
                   1. crew.description (set on creation) — gives the
                      crew an actual purpose line.
                   2. "Be the first to join" when no members — softer
                      than "0 members" which reads as a dead room.
                   3. Member count otherwise. */
                    const subtext = crew.description?.trim()
                      ? crew.description
                      : crew.memberCount === 0
                        ? "Be the first to join"
                        : `${crew.memberCount} member${crew.memberCount === 1 ? "" : "s"}`;
                    return (
                      /* Crew row — body links to the per-crew page; the
                     Join/Leave button is a sibling so its click
                     doesn't bubble into the navigation. */
                      <div
                        key={crew.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-card"
                      >
                        <Link
                          to={`/crew/${crew.id}`}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          {IconComp ? (
                            <IconComp
                              size={24}
                              className="text-muted-foreground shrink-0"
                            />
                          ) : (
                            <span className="text-2xl shrink-0">
                              {crew.icon}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {crew.name}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {subtext}
                            </p>
                          </div>
                        </Link>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isMember) {
                              /* Tapping a member crew opens the leave-confirm sheet
                             rather than firing leaveCrew directly. The button
                             label stays positive ("Joined") because membership
                             is the success state — destructive copy belongs
                             behind the confirm flow. */
                              setLeavingCrewId(crew.id);
                              return;
                            }
                            if (joiningCrewId) return;
                            setJoiningCrewId(crew.id);
                            try {
                              await joinCrew(crew.id);
                            } finally {
                              setJoiningCrewId(null);
                            }
                          }}
                          disabled={!isMember && joiningCrewId === crew.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 disabled:opacity-60 ${
                            isMember
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary-strong text-white"
                          }`}
                        >
                          {isMember
                            ? "Joined"
                            : joiningCrewId === crew.id
                              ? "Joining…"
                              : "Join"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Soc5d: muted bottom CTA shown only when the user
                already has a crew (the prominent top CTA covers the
                no-crew case). Bottom placement keeps the entry low-
                friction without competing visually with the user's
                existing crew row above. */}
                {profileCrewId && (
                  /* Soc5d pin (2): dim further when user already belongs to
                 ≥5 crews. Tropos's positioning is small private groups —
                 the CTA stays available but its visual weight de-
                 emphasises crew collecting. Half-width + reduced
                 padding + opacity-60 stacks "smaller AND less prominent"
                 per the locked copy. */
                  <div
                    className={crews.length >= 5 ? "flex justify-center" : ""}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateGroup(true);
                        trackSocialEvent("social_create_crew_tapped");
                      }}
                      className={
                        crews.length >= 5
                          ? "py-2 px-4 rounded-xl bg-card border border-border/50 text-xs font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
                          : "w-full py-3 rounded-xl bg-card border border-border/50 shadow-sm text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      }
                    >
                      + Create a Crew
                    </button>
                  </div>
                )}
              </div>

              {/* Leave Crew Confirmation Modal */}
              <BottomSheet
                open={!!leavingCrewId}
                onOpenChange={(o) => !o && setLeavingCrewId(null)}
                title="Leave crew?"
                hideHeader
                className="bg-[var(--glass-bg)] border border-[var(--glass-border)]"
              >
                <div className="p-5 space-y-4">
                  <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                  <p className="text-base font-semibold text-foreground">
                    Leave crew?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You can rejoin this crew later.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLeavingCrewId(null)}
                      disabled={leavingInFlight}
                      className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium text-sm disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (leavingInFlight) return;
                        setLeavingInFlight(true);
                        try {
                          await leaveCrew();
                          setLeavingCrewId(null);
                          toast.success("Left crew");
                        } catch {
                          toast.error("Couldn't leave. Try again.");
                        } finally {
                          setLeavingInFlight(false);
                        }
                      }}
                      disabled={leavingInFlight}
                      className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm disabled:opacity-60"
                    >
                      {leavingInFlight ? "Leaving…" : "Leave"}
                    </button>
                  </div>
                </div>
              </BottomSheet>

              {/* Create Crew Modal */}
              <BottomSheet
                open={showCreateGroup}
                onOpenChange={(o) => !o && setShowCreateGroup(false)}
                title="Create a Crew"
                hideHeader
                className="bg-[var(--glass-bg)] border border-[var(--glass-border)]"
              >
                <div className="p-5 space-y-4">
                  <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                  <h3 className="text-base font-semibold text-foreground">
                    Create a Crew
                  </h3>
                  <input
                    type="text"
                    aria-label="Crew name"
                    placeholder="Crew name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground"
                  />
                  <input
                    type="text"
                    aria-label="Crew description"
                    placeholder="Description"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { name: "dumbbell", Icon: Dumbbell },
                      { name: "footprints", Icon: Footprints },
                      { name: "zap", Icon: Zap },
                      { name: "target", Icon: Target },
                      { name: "flame", Icon: Flame },
                      { name: "salad", Icon: Salad },
                      { name: "person", Icon: PersonStanding },
                      { name: "medal", Icon: Medal },
                      { name: "sunrise", Icon: Sunrise },
                    ].map(({ name, Icon }) => (
                      <button
                        type="button"
                        key={name}
                        onClick={() => setNewGroupIcon(name)}
                        className={`p-2.5 rounded-lg ${newGroupIcon === name ? "bg-primary/20 ring-2 ring-primary" : "bg-muted"}`}
                      >
                        <Icon
                          size={24}
                          className={
                            newGroupIcon === name
                              ? "text-primary"
                              : "text-muted-foreground"
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newGroupName.trim() || creatingCrew) return;
                      setCreatingCrew(true);
                      try {
                        await createCrew(
                          newGroupName,
                          newGroupDesc,
                          newGroupIcon || "dumbbell"
                        );
                        setShowCreateGroup(false);
                        setNewGroupName("");
                        setNewGroupDesc("");
                        setNewGroupIcon("");
                        toast.success("Crew created");
                      } catch {
                        toast.error("Failed to create crew. Please try again.");
                      } finally {
                        setCreatingCrew(false);
                      }
                    }}
                    disabled={!newGroupName.trim() || creatingCrew}
                    className="w-full py-3 rounded-xl bg-primary-strong text-white font-medium text-sm disabled:opacity-50"
                  >
                    {creatingCrew ? "Creating..." : "Create Crew"}
                  </button>
                </div>
              </BottomSheet>
            </section>
          )}

          {/* ========== FIND TAB ==========
          Holds the people-discovery affordances that aren't crews:
          invite link, search, suggested people. Renamed from
          "Discover" to remove the naming collision with the Feed
          sub-tab also called Discover (now Explore). */}
          {tab === "find" && (
            <section aria-label="People">
              <div className="space-y-6">
                {/* S4e-MVP — restricted-user gate banner. Renders ABOVE
                    all Find-tab content when useRestrictedStatus reports
                    the current user is restricted. Search input +
                    FollowButtons + invite-share below are disabled. Copy
                    matches Soc5 #15 locked spec verbatim ("Your account
                    is restricted · Contact support"). role="status" so
                    screen readers announce on tab entry. */}
                {isRestricted && (
                  <div
                    role="status"
                    aria-label="Your account is restricted. Contact support."
                    className="p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                  >
                    <p className="text-xs text-destructive">
                      Your account is restricted · Contact support
                    </p>
                  </div>
                )}
                {/* Section order rebuilt per audit: search-first because
              that's the highest-intent task on this surface. Suggested
              people next (most relevant social action). Popular crews
              third — always shown so the page never dead-ends when
              suggestions are empty (the previous IA left a mostly-
              blank page on cold-start users). Invite is the last
              section: still accessible, but no longer the dominant
              visual element. */}

                {/* Search.
              Single field with an embedded search icon prefix and an
              inline clear/spinner affordance on the right. The
              previously-separate "Go" submit button was redundant —
              the input auto-searches after 300ms of typing and Enter
              still fires immediately — so it's been folded into the
              field instead of competing for visual weight beside it. */}
                <div className="space-y-3">
                  <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                    Find someone
                  </p>
                  <div className="relative">
                    <Search
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      placeholder="Search athletes"
                      value={searchQuery}
                      onChange={(e) => handleSearchInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (searchDebounceRef.current)
                            clearTimeout(searchDebounceRef.current);
                          handleSearch();
                        }
                      }}
                      aria-label={
                        isRestricted
                          ? "Search is unavailable — your account is restricted"
                          : "Search athletes"
                      }
                      disabled={isRestricted}
                      className="w-full h-12 pl-10 pr-11 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {searching ? (
                      <div
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      >
                        {/* aria-hidden parent suppresses Spinner's role=status —
                      the input itself announces searching state. */}
                        <Spinner size="sm" variant="muted" />
                      </div>
                    ) : searchQuery.length > 0 ? (
                      /* Inline clear affordance — quicker than holding
                   backspace on mobile and clears results in one tap
                   via the empty-input branch of handleSearchInputChange. */
                      <button
                        type="button"
                        onClick={() => handleSearchInputChange("")}
                        aria-label="Clear search"
                        className="absolute right-1 top-1 size-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      {searchResults.map((u) => (
                        /* Tap-through to profile: avatar + name link to the
                     user's profile so search becomes the start of a
                     real social action, not just "see name → follow".
                     FollowButton stays a sibling so its click doesn't
                     bubble through the Link. The "Follows you" badge
                     surfaces a real social signal — the candidate
                     already engaged with the current user — that
                     materially improves follow-back conversion. */
                        <div
                          key={u.uid}
                          className="flex items-center gap-3 p-3 rounded-xl bg-card"
                        >
                          <Link
                            to={`/user/${u.uid}`}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <BlockAwareAvatar
                              uid={u.uid}
                              photoURL={u.photoURL}
                              displayName={u.displayName || "Athlete"}
                              size="md"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {u.displayName || "Athlete"}
                                </p>
                                <FollowsYouBadge uid={u.uid} />
                              </div>
                              {u.crewId && (
                                <p className="text-sm text-muted-foreground">
                                  Crew member
                                </p>
                              )}
                            </div>
                          </Link>
                          <FollowButton
                            targetUid={u.uid}
                            disabled={isRestricted}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {searchQuery.trim() &&
                    !searching &&
                    searchResults.length === 0 &&
                    !searchError && (
                      <div
                        className="py-4 text-center space-y-1"
                        aria-live="polite"
                      >
                        <p className="text-small text-foreground">
                          No matches for &ldquo;{searchQuery.trim()}&rdquo;
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Try a full name.
                        </p>
                      </div>
                    )}
                  {searchError && (
                    <div
                      className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                      aria-live="polite"
                    >
                      <p className="text-xs text-destructive">{searchError}</p>
                      <button
                        type="button"
                        onClick={() => handleSearch()}
                        className="text-xs font-medium text-destructive underline ml-2 shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* Contact Sync section was removed: it rendered a "Sync
              Contacts" button on native platforms that opened a modal
              saying "available in the Tropos iOS app — download it,"
              which is circular when the user is already IN the iOS
              app. No real Capacitor contacts plugin flow existed
              behind it. Per the audit, hide until properly
              implemented; surfaces (and the modal + state) re-add
              cleanly when there's a real flow to attach. */}

                {/* Suggested People */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                      Suggested people
                    </p>
                    {suggestedPeople.length > 0 && !suggestedLoading && (
                      <button
                        type="button"
                        onClick={refreshSuggestions}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Refresh suggestions"
                      >
                        Refresh
                      </button>
                    )}
                  </div>
                  {suggestedLoading && suggestedPeople.length === 0 ? (
                    <div className="p-4 rounded-xl bg-card border border-border/50 flex items-center justify-center">
                      <Spinner
                        size="sm"
                        variant="muted"
                        label="Loading suggested people"
                      />
                    </div>
                  ) : suggestedPeople.length === 0 ? (
                    /* Empty state with a real next step rather than a
                 dead-end caption. Falls through to the always-shown
                 Popular crews section below, but adds an explicit
                 jump to Crews so users on this surface understand
                 where the suggestion engine pulls from.

                 Issue #846: when the crews load itself failed
                 (PERMISSION_DENIED, network drop) the user sees the
                 same empty state as "no crews to join" — which
                 reads as "feature is empty by design". Distinguish
                 the two so the unavailable case gets honest copy +
                 a Retry affordance instead of nudging users toward
                 a Browse path that will fail again. */
                    crewsError === "unavailable" ? (
                      <div className="p-4 rounded-xl bg-card border border-border/50 text-center space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Crews are unavailable right now. Try again, or contact
                          support if it keeps happening.
                        </p>
                        <button
                          type="button"
                          onClick={() => refreshCrews()}
                          className="text-sm font-medium text-primary hover:text-primary/80"
                        >
                          Try again
                        </button>
                      </div>
                    ) : (
                      /* Wave3 F — designed hexagon empty state, complementing
                         (not replacing) the "Invite a training partner" card
                         lower on this tab. Action routes into the follow flow
                         (browse crews) for users not yet in a crew. */
                      <div className="rounded-xl bg-card border border-border/50">
                        <HexEmptyState
                          icon={Users}
                          accent={THEME.brand}
                          headline="No suggestions yet"
                          sub={
                            profile?.crewId && currentCrew
                              ? "Suggestions show up as people in your crew get active."
                              : "Join a crew or follow people to start seeing suggestions."
                          }
                          action={
                            !profile?.crewId
                              ? {
                                  label: "Browse crews",
                                  onClick: () => setTab("crews"),
                                }
                              : undefined
                          }
                        />
                      </div>
                    )
                  ) : (
                    <div className="space-y-2">
                      {suggestedPeople.map((p) => (
                        <div
                          key={p.uid}
                          className="flex items-center gap-3 p-3 rounded-xl bg-card"
                        >
                          <BlockAwareAvatar
                            uid={p.uid}
                            photoURL={p.photoURL}
                            displayName={p.displayName}
                            size="md"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {p.displayName}
                              </p>
                              <FollowsYouBadge uid={p.uid} />
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {p.reason === "in_your_crew"
                                ? "In your crew"
                                : "Recent post"}
                            </p>
                          </div>
                          <FollowButton
                            targetUid={p.uid}
                            disabled={isRestricted}
                            onFollowChange={(isFollowing) => {
                              // Moved from "Suggested" to the user's Following feed —
                              // remove from the suggestion list for immediate feedback.
                              if (isFollowing) removeSuggestion(p.uid);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Popular crews — fallback discovery when suggestions are
              empty AND a permanent surface for users to find groups
              they could join. Sorted by memberCount desc, excluding
              crews the user is already a member of. Limit 3 so the
              section stays compact. Hidden entirely if every crew
              is one the user already belongs to. */}
                {(() => {
                  const otherCrews = crews
                    .filter((c) => c.id !== currentCrew?.id)
                    .slice(0, 3);
                  if (otherCrews.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                        Popular crews
                      </p>
                      <div className="space-y-2">
                        {otherCrews.map((crew) => {
                          const IconComp = ICON_MAP[crew.icon];
                          return (
                            <Link
                              key={crew.id}
                              to={`/crew/${crew.id}`}
                              className="flex items-center gap-3 p-3 rounded-xl bg-card"
                            >
                              {IconComp ? (
                                <IconComp
                                  size={24}
                                  className="text-muted-foreground shrink-0"
                                />
                              ) : (
                                <span className="text-2xl shrink-0">
                                  {crew.icon}
                                </span>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {crew.name}
                                </p>
                                <p className="text-sm text-muted-foreground truncate">
                                  {crew.description?.trim() ||
                                    `${crew.memberCount} member${crew.memberCount === 1 ? "" : "s"}`}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Bring a friend — moved to bottom. Still the primary growth
              path but no longer the dominant element on the page; the
              previous arrangement put it above search which is wrong
              for high-intent users trying to find someone specific. */}
                <div className="space-y-3">
                  <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                    Bring a friend
                  </p>
                  <div
                    className="p-3 rounded-2xl border"
                    style={{
                      background: `linear-gradient(135deg, ${THEME.brand}18, ${THEME.brand}08)`,
                      borderColor: `${THEME.brand}33`,
                    }}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div
                        className="size-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${THEME.brand}25` }}
                      >
                        <Share
                          className="size-4"
                          style={{ color: THEME.brand }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          Invite a training partner
                        </p>
                        <p className="text-small text-muted-foreground leading-relaxed mt-0.5">
                          Share your link and compare lifts, runs and challenge
                          progress.
                        </p>
                      </div>
                    </div>
                    {isNewUser ? (
                      <Coachmark
                        storageKey="social-find-invite"
                        placement="top"
                        content="Share your profile link to get started"
                        onDismiss={() =>
                          trackSocialEvent("social_coachmark_dismissed", {
                            coachmarkKey: "social-find-invite",
                          })
                        }
                      >
                        <button
                          type="button"
                          onClick={handleShareInvite}
                          disabled={isRestricted}
                          aria-label={
                            isRestricted
                              ? "Inviting is unavailable — your account is restricted"
                              : undefined
                          }
                          className="w-full min-h-[44px] py-2.5 rounded-xl text-white font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: THEME.brandStrong }}
                        >
                          Share invite link
                        </button>
                      </Coachmark>
                    ) : (
                      <button
                        type="button"
                        onClick={handleShareInvite}
                        disabled={isRestricted}
                        aria-label={
                          isRestricted
                            ? "Inviting is unavailable — your account is restricted"
                            : undefined
                        }
                        className="w-full min-h-[44px] py-2.5 rounded-xl text-white font-medium text-sm active:scale-[0.97] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: THEME.brandStrong }}
                      >
                        Share invite link
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </motion.div>
  );
}
