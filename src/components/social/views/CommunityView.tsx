import { useEffect, Suspense } from "react";
import type { MutableRefObject } from "react";
import CirclesSection from "@/components/social/CirclesSection";
import SpacesDirectory from "@/features/spaces/SpacesDirectory";
/* Soc5 item 10: ChallengeList lazy-loaded so the Social entry chunk
   stays lean — it only loads when the user opens the Together tab.
   lazyRetry gives the same stale-chunk recovery the page-level lazy
   loads use. (FullLeaderboard gets the same treatment in FeedView.) */
import { lazyRetry } from "@/lib/lazyRetry";
const ChallengeList = lazyRetry(() =>
  import("@/features/challenges/ChallengeList").then((m) => ({
    default: m.ChallengeList,
  }))
);

/**
 * Together tab (SOCIAL-HOME-01): Circles lead — the user's active
 * Circle (or the cold-start goal selector) is the front door — then
 * the Spaces marquee (interest + Races & Events), then Challenges.
 *
 * Crews retired 2026-07-20 (docs/proposals/crews-retirement.md): the
 * legacy crew list/create/suggested sections that used to close this
 * tab duplicated the Spaces taxonomy ("Lifters" existed as both), and
 * their three jobs each have a better owner now — identity → Spaces,
 * competition → Challenges, self-made groups → Circles.
 */
export interface CommunityViewProps {
  /** True when the Together tab is the active top-level tab. The view
   *  itself stays mounted across tab switches (SOCIAL-HOME-01 Stage A)
   *  so its state survives exactly as it did pre-extraction. */
  active: boolean;
  /** True while FeedView's FullLeaderboard overlay is open — the shell
   *  hides the tab bar and every tab section, exactly as the old
   *  inline `!showFullLeaderboard && <>` gate did. */
  chromeHidden: boolean;
  uid: string | undefined;
  /** Open the People search overlay (challenge empty-state CTA). */
  openPeople: () => void;
  /** The shell's pull-to-refresh action for this tab (same ref
   *  pattern as FeedView). Spaces/Circles own their own reads, so
   *  today this is a no-op placeholder that keeps the gesture wired. */
  refreshRef: MutableRefObject<(() => Promise<void>) | null>;
}

export default function CommunityView({
  active,
  chromeHidden,
  uid,
  openPeople,
  refreshRef,
}: CommunityViewProps) {
  /* Publish the refresh into the shell's ref (effect-time sync, same
     latest-ref pattern as FeedView). Circles/Spaces/Challenges manage
     their own data lifecycles; the pull gesture simply resolves. */
  useEffect(() => {
    refreshRef.current = async () => {};
  }, [refreshRef]);

  if (!active || chromeHidden) return null;

  return (
    <section aria-label="Community" className="space-y-6">
      {uid && <CirclesSection uid={uid} />}

      <SpacesDirectory />

      {/* Challenges — the active / competitive surface. Empty-
      state CTA jumps to Discover so users have a clear path to
      find people to challenge. Suspense wraps the lazy chunk
      (Soc5 item 10); the fallback is a single skeleton row so
      the surface doesn't jump on first tab open. */}
      <Suspense
        fallback={
          <div
            className="h-16 rounded-xl bg-muted/40 animate-pulse"
            aria-hidden="true"
          />
        }
      >
        <ChallengeList onFindFriends={openPeople} />
      </Suspense>
    </section>
  );
}
