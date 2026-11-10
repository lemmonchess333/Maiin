import {
  Suspense,
  useEffect,
  useId,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { cardClasses } from "@/components/ui/cardClasses";
import RestrictedNotice from "@/components/social/RestrictedNotice";
import { toast } from "@/lib/toast";
import { lazyRetry } from "@/lib/lazyRetry";
import { useAuth } from "@/lib/auth";
import {
  getTimeRemaining,
  useChallenges,
  type Challenge,
} from "./useChallenges";
import { featuredChallengesFirst } from "./challengeOrder";
import {
  cardsShowingTimeLeft,
  joinedMessage,
  timeLeftAnchor,
} from "./challengeEditions";
import ChallengeRow from "./ChallengeRow";
import JoinedChallengeRow from "./JoinedChallengeRow";
import WeeklyChallengeCard from "./WeeklyChallengeCard";
import { ChallengeFinaleCard } from "./ChallengeFinaleCard";
import CollectivePulse from "./CollectivePulse";

/* The full card is drawn only in the sheet a row opens, so it loads on
   that first tap rather than with the page. */
const ChallengeCard = lazyRetry(() =>
  import("./ChallengeCard").then((m) => ({ default: m.ChallengeCard }))
);

const LIST_CARD = cardClasses({
  size: "compact",
  padded: false,
  className: "@container overflow-hidden divide-y divide-border/40",
});

/**
 * The Together page (Soc16), around the challenges it reads once
 * (`useChallenges`):
 *
 *   hero       `hero`, the person's race while they train for one (the
 *              race's photo, name and weeks to go); without one the
 *              weekly challenge's photo card leads
 *   This week  the weekly challenge (`WeeklyChallengeCard`), the
 *              challenges the person joined, each with the medal it is
 *              working toward and its progress, any that ended this week,
 *              then `league`, the weekly league
 *   Circles    `circles`, the person's Circles, or the start-or-join card
 *              without one
 *   Discover   `spaces` (races and Spaces, the page's pictures), then the
 *              community goal once it has moved and the challenges not
 *              joined, each with its medal
 *
 * A row opens its challenge in a sheet, where its board, Join and Leave
 * are. The page keeps one filled button, neutral: the weekly challenge's
 * action, or, while there is no Circle (`weeklyLeads` false), the
 * start-or-join card's Start a circle.
 */
export function ChallengeList({
  onFindFriends,
  refreshRef,
  hero,
  circles,
  spaces,
  league,
  weeklyLeads = true,
}: {
  onFindFriends?: () => void;
  /** CommunityView's pull-to-refresh awaits this section's progress
   *  refetch (challenge docs are already a live subscription). */
  refreshRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** The top of the page: the person's race (Soc16). Renders nothing
   *  without one, and the weekly challenge's card leads. */
  hero?: ReactNode;
  /** The Circles section, under This week. */
  circles?: ReactNode;
  /** The head of Discover: the races and Spaces directory. */
  spaces?: ReactNode;
  /** The foot of This week: the weekly league (Soc15 call 3). */
  league?: ReactNode;
  /** False while the page has a Start a circle card, which is then the
   *  page's one filled button and the weekly action steps down. */
  weeklyLeads?: boolean;
}) {
  const { user } = useAuth();
  const {
    challenges,
    myChallenges,
    availableChallenges,
    myEndedChallenges,
    myProgress,
    leaderboards,
    loading,
    joinChallenge,
    leaveChallenge,
    refreshProgress,
    restricted,
  } = useChallenges();
  const [openId, setOpenId] = useState<string | null>(null);
  const weekId = useId();
  const circlesId = useId();
  const discoverId = useId();

  /* Publish the progress refetch for the shell's pull-to-refresh
     (effect-time sync, latest-ref pattern). */
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = refreshProgress;
  }, [refreshRef, refreshProgress]);

  /* Joining confirms which edition the person is in and when the next
     one opens: each edition is joined on its own. */
  async function join(challenge: Challenge) {
    if (await joinChallenge(challenge.id))
      toast.success(joinedMessage(challenge));
  }

  const weeklyCh = challenges.find(
    (c) => c.type === "weekly" && c.metric === "workout_count"
  );
  /* The community goal is drawn by CollectivePulse at the head of
     Discover's list, so it leaves both lists. */
  const collectiveCh = challenges.find((c) => (c.collectiveTarget ?? 0) > 0);
  const listed = (c: Challenge) =>
    c.id !== weeklyCh?.id && c.id !== collectiveCh?.id;
  const joined = featuredChallengesFirst(myChallenges.filter(listed));
  const discover = featuredChallengesFirst(availableChallenges.filter(listed));
  // Time left is said once for the month in each list, and again only by
  // a challenge that ends on another day.
  const joinedTimeLeft = cardsShowingTimeLeft(joined);
  /* Discover says the month's time left once, on its heading; a row says
     its own only when it ends on another day. */
  const discoverAnchor = timeLeftAnchor(discover);
  const discoverTimeLeft = cardsShowingTimeLeft(discover);
  if (discoverAnchor) discoverTimeLeft.delete(discoverAnchor.id);
  const discoverMonthLeft = discoverAnchor
    ? getTimeRemaining(discoverAnchor.endDate)
    : "";
  const opened = openId
    ? (challenges.find((c) => c.id === openId) ?? null)
    : null;

  const skeleton = (height: string) => (
    <div
      className={`${height} rounded-2xl bg-muted motion-safe:animate-pulse`}
      aria-hidden="true"
    />
  );

  return (
    <div className="space-y-8">
      {hero}

      <section aria-labelledby={weekId} className="space-y-3">
        <SectionHeading id={weekId}>This week</SectionHeading>
        {/* A restricted account can follow its challenges and leave them,
            but not join one (S4e). Said once, above the first Join. */}
        {restricted && availableChallenges.length > 0 && <RestrictedNotice />}
        {loading ? (
          skeleton("h-32")
        ) : (
          <WeeklyChallengeCard
            weekly={weeklyCh}
            joined={!!(weeklyCh && myProgress[weeklyCh.id])}
            progress={weeklyCh ? myProgress[weeklyCh.id] : undefined}
            hasChallenges={challenges.length > 0}
            leads={weeklyLeads}
            onJoin={join}
            onLeave={async (ch) => {
              await leaveChallenge(ch.id);
            }}
            onFindFriends={onFindFriends}
          />
        )}
        {!loading && joined.length > 0 && (
          <ul aria-label="Your challenges" className={LIST_CARD}>
            {joined.map((ch) => (
              <JoinedChallengeRow
                key={ch.id}
                challenge={ch}
                progress={myProgress[ch.id]}
                onOpen={() => setOpenId(ch.id)}
                showTimeLeft={joinedTimeLeft.has(ch.id)}
              />
            ))}
          </ul>
        )}
        {/* Challenges the person took part in that ended within the last
            7 days. Closure for the effort; dismiss-once per id. */}
        {!loading &&
          myEndedChallenges.map((ch) => (
            <ChallengeFinaleCard
              key={ch.id}
              challenge={ch}
              myProgress={myProgress[ch.id]}
              leaderboard={leaderboards[ch.id]}
              selfUid={user?.uid}
            />
          ))}
        {league}
      </section>

      {circles && (
        <section aria-labelledby={circlesId} className="space-y-3">
          <SectionHeading id={circlesId}>Circles</SectionHeading>
          {circles}
        </section>
      )}

      <section aria-labelledby={discoverId} className="space-y-5">
        <SectionHeading id={discoverId}>Discover</SectionHeading>
        {spaces}
        {loading
          ? skeleton("h-16")
          : (discover.length > 0 || collectiveCh) && (
              <div className="space-y-2">
                {discover.length > 0 && (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <SectionHeading as="h3" size="compact">
                      Challenges
                    </SectionHeading>
                    {discoverMonthLeft && (
                      <p className="text-xs text-muted-foreground">
                        {discoverMonthLeft}
                      </p>
                    )}
                  </div>
                )}
                {/* The community goal: drawn once someone has added to it. */}
                {collectiveCh && <CollectivePulse challenge={collectiveCh} />}
                {discover.length > 0 && (
                  <ul aria-label="Challenges to join" className={LIST_CARD}>
                    {discover.map((ch) => (
                      <ChallengeRow
                        key={ch.id}
                        challenge={ch}
                        onOpen={() => setOpenId(ch.id)}
                        showTimeLeft={discoverTimeLeft.has(ch.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
      </section>

      {/* The challenge a row opened: its picture, goal, board, and Join or
          Leave. */}
      <BottomSheet
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        title={opened?.name ?? ""}
      >
        {opened && (
          <div className="px-4 pb-2">
            <Suspense
              fallback={
                <div className="flex justify-center py-6">
                  <Spinner label="Loading challenge" />
                </div>
              }
            >
              <ChallengeCard
                challenge={opened}
                myProgress={myProgress[opened.id]}
                leaderboard={leaderboards[opened.id]}
                joined={!!myProgress[opened.id]}
                onJoin={() => join(opened)}
                onLeave={async () => {
                  await leaveChallenge(opened.id);
                }}
              />
            </Suspense>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
