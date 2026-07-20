import { useSuggestedPeople } from "@/hooks/useSuggestedPeople";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { searchUsers } from "@/lib/socialApi";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import FollowButton from "@/components/social/FollowButton";
import FollowsYouBadge from "@/components/social/FollowsYouBadge";
import { Share, Users, X, Search } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/lib/toast";
import { THEME } from "@/lib/theme";
import { EmptyState as HexEmptyState } from "@/components/ui/EmptyState";
import Coachmark from "@/components/ui/Coachmark";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";

export interface PeopleViewProps {
  /** True when the People (find) tab is the active top-level tab.
   *  Gates the useSuggestedPeople fetch, the restricted-gate
   *  telemetry effect, and the section render. The view itself stays
   *  mounted across tab switches (SOCIAL-HOME-01 Stage A) so search
   *  state survives exactly as it did pre-extraction. */
  active: boolean;
  /** True while FeedView's FullLeaderboard overlay is open — the shell
   *  hides the tab bar and every tab section, exactly as the old
   *  inline `!showFullLeaderboard && <>` gate did. */
  chromeHidden: boolean;
  blockedUsers: Set<string>;
  /** SOCIAL-PRIVACY-01: true once the block list has loaded. The
   *  suggested-people fetch waits on this so a blocked user can't
   *  surface as a suggestion before the exclude set is known. */
  blockedReady: boolean;
  isNewUser: boolean;
  /** Close the overlay and land on Together. */
  openTogether: () => void;
}

export default function PeopleView({
  active,
  chromeHidden,
  blockedUsers,
  blockedReady,
  isNewUser,
  openTogether,
}: PeopleViewProps) {
  const { user } = useAuth();

  // Suggested People — fetches lazily only when the Discover tab is shown.
  // SOCIAL-PRIVACY-01: also wait for the block list so a blocked user
  // can't appear as a suggestion in the load window.
  const {
    people: suggestedPeople,
    loading: suggestedLoading,
    refresh: refreshSuggestions,
    remove: removeSuggestion,
  } = useSuggestedPeople(active && blockedReady, blockedUsers);

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
    if (!active) {
      restrictedGateShownRef.current = false;
      return;
    }
    if (isRestricted && !restrictedGateShownRef.current) {
      restrictedGateShownRef.current = true;
      trackSocialEvent("social_restricted_gate_shown");
    }
  }, [active, isRestricted]);

  // Find tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { uid: string; displayName?: string; photoURL?: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  /* Distinct error state lets the empty-results UI distinguish "no
     match for this query" (legitimate empty state) from "the network
     ate the request" (retryable). Previously failures collapsed into
     setSearchResults([]) which surfaced the same "No users found"
     copy as a real empty result, which lied to the user. */
  const [searchError, setSearchError] = useState<string | null>(null);
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

  if (!active || chromeHidden) return null;

  return (
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
      people next (most relevant social action). Invite
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
                    </div>
                  </Link>
                  <FollowButton targetUid={u.uid} disabled={isRestricted} />
                </div>
              ))}
            </div>
          )}
          {searchQuery.trim() &&
            !searching &&
            searchResults.length === 0 &&
            !searchError && (
              <div className="py-4 text-center space-y-1" aria-live="polite">
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
            /* Wave3 F — designed hexagon empty state, complementing
               (not replacing) the "Invite a training partner" card
               lower on this tab. Action routes to Together, where
               Circles and Spaces are the joinable groups (crews
               retired 2026-07-20). */
            <div className="rounded-xl bg-card border border-border/50">
              <HexEmptyState
                icon={Users}
                accent={THEME.brand}
                headline="No suggestions yet"
                sub="Follow people or join a space to start seeing suggestions."
                action={{
                  label: "Browse spaces",
                  onClick: openTogether,
                }}
              />
            </div>
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
                    <p className="text-sm text-muted-foreground">Recent post</p>
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
                <Share className="size-4" style={{ color: THEME.brand }} />
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
  );
}
