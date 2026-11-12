import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import type { MutableRefObject } from "react";
import CirclesSection, {
  type CirclesSectionState,
} from "@/components/social/CirclesSection";
import SpacesDirectory from "@/features/spaces/SpacesDirectory";
import RaceHero from "@/features/spaces/RaceHero";
/* ChallengeList is lazy-loaded so the Social entry chunk stays lean: it
   only loads when the user opens the Together tab. lazyRetry gives the
   same stale-chunk recovery the page-level lazy loads use. */
import { lazyRetry } from "@/lib/lazyRetry";
const ChallengeList = lazyRetry(() =>
  import("@/features/challenges/ChallengeList").then((m) => ({
    default: m.ChallengeList,
  }))
);
/* The weekly league's card (Soc15 call 3), its own chunk for the same
   reason: it loads with Together, not with Social. */
const LeagueCard = lazyRetry(() => import("@/features/league/LeagueCard"));

/**
 * Together tab (Soc16):
 *
 *   hero       the person's race while they train for one (`RaceHero`):
 *              its photo, name, weeks to go and, from three, the people on
 *              Tropos training for it. Without one, the weekly challenge's
 *              photo card leads
 *   This week  the weekly challenge, whose action is the page's one
 *              filled button (or, with no Circle yet, Start a circle is),
 *              the challenges the person joined with their medals and
 *              progress, then the weekly league
 *   Circles    the person's Circles as compact rows, each with its next
 *              step, a live Circle first and ended ones folded away; with
 *              none, the start-or-join card
 *   Discover   races and Spaces, then the community goal and the other
 *              challenges with their medals
 *
 * ChallengeList reads the challenges once and lays the sections out
 * around the parts that read their own data: the race hero, the Circles
 * section and the races and Spaces directory.
 */
export interface CommunityViewProps {
  /** True when the Together tab is the active top-level tab. The view
   *  itself stays mounted across tab switches (SOCIAL-HOME-01 Stage A)
   *  so its state survives exactly as it did pre-extraction. */
  active: boolean;
  uid: string | undefined;
  /** The shell's pull-to-refresh action for this tab (same ref
   *  pattern as FeedView). */
  refreshRef: MutableRefObject<(() => Promise<void>) | null>;
}

export default function CommunityView({
  active,
  uid,
  refreshRef,
}: CommunityViewProps) {
  /* Pull-to-refresh awaits the sections' real handles (circles reload
     with its generation guard; challenge progress refetch, which cascades
     the leaderboards). Challenge DOCS and space membership are live
     subscriptions already, so there is nothing to refetch there. */
  const circlesRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const challengesRefreshRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    refreshRef.current = async () => {
      await Promise.all([
        circlesRefreshRef.current?.(),
        challengesRefreshRef.current?.(),
      ]);
    };
  }, [refreshRef]);

  /* CirclesSection reports whether the user has a Circle. With none, its
     start-or-join card's Start a circle is the page's filled button, and
     the weekly challenge's action steps down to the quiet one. While the
     Circles load the weekly keeps the filled button, so an account with
     a Circle sees no colour change. setState is identity-stable for the
     child's effect dep. */
  const [circlesState, setCirclesState] =
    useState<CirclesSectionState>("loading");
  const onCirclesState = useCallback(
    (s: CirclesSectionState) => setCirclesState(s),
    []
  );

  if (!active) return null;

  const circles = uid ? (
    <CirclesSection
      uid={uid}
      onStateChange={onCirclesState}
      refreshRef={circlesRefreshRef}
    />
  ) : null;

  /* Suspense wraps the lazy chunk; the fallback is a skeleton the shape
     of the three sections' first cards, so the page does not jump on
     first tab open. */
  return (
    <section aria-label="Community">
      <Suspense
        fallback={
          <div className="space-y-8" aria-hidden="true">
            <div className="h-32 rounded-2xl bg-muted/40 motion-safe:animate-pulse" />
            <div className="h-40 rounded-2xl bg-muted/40 motion-safe:animate-pulse" />
            <div className="h-16 rounded-xl bg-muted/40 motion-safe:animate-pulse" />
          </div>
        }
      >
        <ChallengeList
          hero={uid ? <RaceHero /> : null}
          refreshRef={challengesRefreshRef}
          circles={circles}
          spaces={<SpacesDirectory />}
          league={
            uid ? (
              <Suspense
                fallback={
                  <div
                    className="h-36 rounded-2xl bg-muted/40 motion-safe:animate-pulse"
                    aria-hidden="true"
                  />
                }
              >
                <LeagueCard uid={uid} />
              </Suspense>
            ) : null
          }
          weeklyLeads={circlesState !== "none"}
        />
      </Suspense>
    </section>
  );
}
