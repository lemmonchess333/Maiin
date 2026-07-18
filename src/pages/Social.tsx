import { useHiddenActivities } from "@/hooks/useHiddenActivities";
import { useCrews } from "../hooks/useCrews";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getBoundedFollowingCount } from "../lib/socialApi";
/* SOCIAL-HOME-01 Stage A: the three tab sections are extracted into
   view components (mechanical decomposition, zero behaviour change).
   Each view stays MOUNTED at all times — exactly like the hooks all
   lived in this file pre-extraction — and gates its own section JSX
   on `active` / the overlay state, so feed items, search text and
   sheet state survive tab switches precisely as before. */
import FeedView from "../components/social/views/FeedView";
import CommunityView from "../components/social/views/CommunityView";
import PeopleView from "../components/social/views/PeopleView";
import { X, Search, Bell } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationsSheet from "@/components/social/NotificationsSheet";
import { SOCIAL_GATES, shouldShowFollowingFeed } from "@/lib/socialGates";
import { motion } from "framer-motion";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";

/* SOCIAL-HOME-01: the page leads with shared goals. Two top-level
   tabs — Together (Circles + Spaces + Challenges + legacy Crews) and
   Feed. People is no longer a tab: it's a lazily-opened full-screen
   search surface reached from the header (or the legacy ?tab=find
   deep link). The feed sub-tab stays `explore` (public activity).
   The tab types live in views/socialTabs.ts so the views can import
   them without a page↔view module cycle. */
import type {
  SocialTab,
  FeedSubTab,
} from "../components/social/views/socialTabs";
export type { SocialTab, FeedSubTab };

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
  /* Legacy param compatibility (explicit contract): ?tab=crews (the
     old Community tab — Spaces/Challenges/Circles now live on
     Together) and ?tab=find (the old People tab — now the search
     overlay, opened by the effect below) both keep resolving. Any
     other/missing value lands on Together, the URL-clean default
     (`?tab=` stripped). ?tab=feed remains the explicit Feed link. */
  const tabFromUrl = searchParams.get("tab");
  const tab: SocialTab = tabFromUrl === "feed" ? "feed" : "together";

  /* People overlay — a full-screen search surface, not a tab. State-
     driven like NotificationsSheet; the legacy ?tab=find deep link
     opens it once on arrival and normalises the URL to Together so
     back/refresh behave predictably. */
  const [peopleOpen, setPeopleOpen] = useState(false);
  const legacyFindHandledRef = useRef(false);
  useEffect(() => {
    if (tabFromUrl !== "find" || legacyFindHandledRef.current) return;
    legacyFindHandledRef.current = true;
    setPeopleOpen(true);
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        updated.delete("tab");
        return updated;
      },
      { replace: true }
    );
  }, [tabFromUrl, setSearchParams]);
  const openPeople = useCallback(() => {
    setPeopleOpen(true);
    trackSocialEvent("social_tab_selected", { tab: "find" });
  }, []);

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
          if (next === "together") updated.delete("tab");
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
   * resolution. `followingCount` is bounded at 3 — we only care about
   * the thresholds (0 = solo, ≥3 = following-feed unlocked per S4), not
   * the exact number.
   */
  // Feed sub-tab (Following | Explore) is mirrored into the URL (?feed=) so
  // opening a profile and pressing back RESTORES the chosen sub-tab instead of
  // the smart-default effect below re-deriving it on remount. A fresh open
  // (no ?feed) still gets the smart default.
  const feedFromUrl = searchParams.get("feed");
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>(
    feedFromUrl === "following" || feedFromUrl === "explore"
      ? feedFromUrl
      : "explore"
  );
  const selectFeedSubTab = useCallback(
    (next: FeedSubTab) => {
      setFeedSubTab(next);
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          updated.set("feed", next);
          return updated;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user || followingCount !== null) return;
    let cancelled = false;
    getBoundedFollowingCount(user.uid, SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS)
      .then((n) => {
        if (cancelled) return;
        setFollowingCount(n);
        // Only auto-pick the sub-tab on a fresh open; a URL-restored ?feed
        // (back-navigation) must win over the follows-count default.
        if (feedFromUrl !== "following" && feedFromUrl !== "explore") {
          setFeedSubTab(n > 0 ? "following" : "explore");
        }
      })
      .catch(() => {
        // On error, treat as zero — safe empty state + trajectory card.
        if (!cancelled) setFollowingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user, followingCount, feedFromUrl]);

  /* The old Soc5c smart default (send brand-new users to the People
     tab) is gone: Together is the default surface and owns the
     cold-start state directly (the goal selector), so new users land
     somewhere useful without a redirect. */
  const profileCrewId = profile?.crewId;

  // Soc5c: "new user" signal drives the first-launch coachmark on
  // the Find tab. Same definition as the smart default (zero follows
  // + zero crew). While followingCount is still resolving we treat
  // the user as established — that way an existing user with a slow
  // network never sees a flash of the new-user coachmark.
  const isNewUser = followingCount === 0 && !profileCrewId;

  // SOCIAL S4 — the solo-first curated stack leads the Feed tab for a
  // cold-start user (0 follows ⇒ 0 partners, since a bond needs mutual
  // follow). Sub-tab-agnostic on purpose: a new user's sub-tab defaults to
  // Explore (n>0?following:explore), so gating on "following" would never
  // fire. The stack renders above whatever the active sub-tab shows; the
  // empty-feed states below are suppressed so nothing reads as broken.
  // PR4 will refine the gate to the full `isSoloUser` density check.
  const showSoloFeed = isNewUser;

  // SOCIAL S4 — the following ACTIVITY feed (the list of activities from
  // people you follow) only renders at ≥3 follows; below that it's a
  // sparse list that reads as broken, so we show the leaderboard/
  // trajectory slot instead (never an empty feed). Explore is unaffected.
  const followingFeedUnlocked = shouldShowFollowingFeed(followingCount ?? 0);

  /* FullLeaderboard overlay state lives in FeedView (which owns the
     lazy chunk + leaderboard slot); the shell only mirrors "overlay
     open" so it can suppress the tab bar + tab sections the way the
     old inline `!showFullLeaderboard && <>` gate did. FeedView calls
     onOverlayChange from the same event handlers that flip its local
     state, so both updates land in one batched render — no
     intermediate frame where overlay and tab bar coexist. */
  const [chromeHidden, setChromeHidden] = useState(false);
  // In-app social notification tray (kudos / comment / follow). Closes the
  // engagement loop — the server already writes these; this surfaces them.
  const [showNotifications, setShowNotifications] = useState(false);
  const notifications = useNotifications();

  // Crews — stays in the shell (not CommunityView) because the People
  // tab consumes the same instance (crews / currentCrew / crewsError /
  // refreshCrews) and the hook has no shared cache: a second instance
  // would double-fetch and desync optimistic membership updates.
  const {
    crews,
    error: crewsError,
    currentCrew,
    joinCrew,
    leaveCrew,
    createCrew,
    refresh: refreshCrews,
  } = useCrews();

  // Pull-to-refresh with iOS conflict fix (#9).
  // Soc5 cross-cutting pin: pull-to-refresh re-fetches the active
  // tab's data — feed view re-pulls the active feed, Crews tab
  // re-pulls the crew list (and Suggested Crews in Phase 2). Hook
  // owns gesture state + state-machine; this page owns the per-tab
  // refresh action via the onRefresh callback.
  // Extracted into src/hooks/usePullToRefresh.ts so History + Food
  // share the same gesture implementation rather than triplicating
  // ~50 lines of identical touch-handling code.
  /* Stage A: the feed + crews refresh actions live inside FeedView /
     CommunityView (which own those hooks now). Each view publishes
     its refresh fn into a ref the shell holds, so pull-to-refresh
     keeps working without lifting the feed hooks. */
  const feedRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const communityRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const performRefresh = useCallback(async () => {
    if (tab === "feed") {
      await feedRefreshRef.current?.();
    } else {
      await communityRefreshRef.current?.();
    }
    // People overlay: search results are user-driven; no refresh action.
  }, [tab]);

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
          {/* Right cluster (Home header idiom): find people + the
              notification tray. People moved out of the tab bar
              (SOCIAL-HOME-01) — search is a header action now. */}
          <div className="flex items-center gap-1">
            <IconButton
              aria-label="Find people"
              icon={<Search className="size-5" />}
              variant="ghost"
              onClick={openPeople}
            />
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
        </div>
      </motion.header>

      <NotificationsSheet
        open={showNotifications}
        onOpenChange={setShowNotifications}
        items={notifications.items}
        loading={notifications.loading}
      />

      {/* Tab bar — primary navigation on the canonical iOS "track"
          SegmentedControl (44pt floor + full radiogroup a11y handled by
          the primitive). Was a hand-rolled button row; migrated in the
          Social-uniformity pass so every switcher across the app shares
          one control. Hidden while the FullLeaderboard overlay shows
          (chromeHidden mirrors FeedView's overlay state). */}
      {!chromeHidden && (
        <SegmentedControl
          ariaLabel="Social section"
          value={tab}
          onChange={setTab}
          options={[
            /* Together leads (SOCIAL-HOME-01): the user's active
               Circle + shared-goal surfaces. Feed is the second
               track. Legacy ?tab=crews resolves to Together above;
               ?tab=find opens the People overlay. */
            { value: "together", label: "Together" },
            { value: "feed", label: "Feed" },
          ]}
        />
      )}

      {/* ========== FEED TAB ========== */}
      <FeedView
        active={tab === "feed"}
        openPeople={openPeople}
        openTogether={() => setTab("together")}
        feedSubTab={feedSubTab}
        selectFeedSubTab={selectFeedSubTab}
        followingCount={followingCount}
        followingFeedUnlocked={followingFeedUnlocked}
        showSoloFeed={showSoloFeed}
        blockedUsers={blockedUsers}
        hiddenActivityIds={hiddenActivityIds}
        pullRefreshing={pullRefreshing}
        refreshRef={feedRefreshRef}
        onOverlayChange={setChromeHidden}
      />

      {/* ========== TOGETHER TAB ==========
          The shared-goal surface: Circles lead, then Spaces /
          Challenges / legacy Crews. (Formerly the Community tab —
          the legacy ?tab=crews deep link resolves here.) */}
      <CommunityView
        active={tab === "together"}
        openPeople={openPeople}
        chromeHidden={chromeHidden}
        uid={user?.uid}
        profileCrewId={profileCrewId}
        refreshRef={communityRefreshRef}
        crews={crews}
        currentCrew={currentCrew}
        joinCrew={joinCrew}
        leaveCrew={leaveCrew}
        createCrew={createCrew}
        refreshCrews={refreshCrews}
      />

      {/* ========== PEOPLE OVERLAY ==========
          The old People tab as a lazily-opened full-screen search
          surface (header Search icon, or the legacy ?tab=find deep
          link). The view stays mounted (search state survives
          close/reopen, same as the old tab switches); the overlay
          chrome only exists while open. */}
      {peopleOpen && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 pt-3 pb-8 space-y-4">
            <div className="flex items-center gap-2">
              <IconButton
                aria-label="Close people search"
                icon={<X className="size-5" />}
                variant="ghost"
                onClick={() => setPeopleOpen(false)}
              />
              <h2 className="text-base font-bold text-foreground">People</h2>
            </div>
            <PeopleView
              active={peopleOpen}
              chromeHidden={false}
              blockedUsers={blockedUsers}
              isNewUser={isNewUser}
              openTogether={() => {
                setPeopleOpen(false);
                setTab("together");
              }}
              crews={crews}
              currentCrew={currentCrew}
              crewsError={crewsError}
              refreshCrews={refreshCrews}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
