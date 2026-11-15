import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import { useAuth, useUid } from "@/lib/auth";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useEnoughPeople } from "@/hooks/useEnoughPeople";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { roomShown } from "@/lib/enoughPeople";
import { LEAGUE_LIGHT } from "@/features/league/leaguePalettes";
import { cn } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import { Button } from "@/components/ui/Button";
import { cardClasses } from "@/components/ui/cardClasses";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/LoadingSkeleton";
import LeagueJoin from "@/features/league/LeagueJoin";
import TierBadge from "@/features/league/TierBadge";
import {
  countdownLine,
  leagueCardState,
  lockedLine,
  sessionsLine,
  type RankedStanding,
} from "@/features/league/league";
import {
  demotionCount,
  GROUP_MIN,
  promotionCount,
  tierName,
} from "@/features/league/leagueRules";
import { useLeague } from "@/features/league/useLeague";
import { useLeagueJoin } from "@/features/league/useLeagueJoin";

/**
 * The weekly league (Soc15 call 3): this week's group in full, your row
 * picked out, a line under the places that move up and one above the
 * places that move down, the time left in your week, and Leave the league.
 *
 * Someone either of you has blocked is left out of what you see, as on
 * every social surface (`useBlockedUsers`); the places still count
 * everyone, so the numbers can skip one.
 *
 * Until Tropos has enough people to fill a league (App1 Q6), someone who
 * has not joined is not offered one here either: an old link brings them
 * back to Together.
 */
export default function League() {
  const uid = useUid();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const league = useLeague(uid);
  const { blocked } = useBlockedUsers();
  const { isRestricted } = useRestrictedStatus(uid ?? undefined);
  const sharing = useLeagueJoin(league.reload);
  const enough = useEnoughPeople();
  const optedIn = profile?.leagueOptIn === true;
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The countdown moves on the minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!optedIn && enough === false)
    return <Navigate to="/social?tab=together" replace />;

  const leave = (
    <Button
      variant="destructive-tinted"
      fullWidth
      loading={sharing.busy === "leave"}
      onClick={() => setConfirmLeave(true)}
    >
      Leave the league
    </Button>
  );

  let body: ReactNode;
  if (!uid || league.loading || !roomShown(optedIn, enough)) {
    body = (
      <ul aria-label="Loading the league" className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl bg-card p-3"
          >
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-32 rounded" />
          </li>
        ))}
      </ul>
    );
  } else if (league.failed) {
    body = (
      <ErrorState
        title="Couldn’t load your league"
        description="Check your connection and try again."
        retry={{ onClick: league.reload }}
      />
    );
  } else {
    const state = leagueCardState({
      uid,
      optedIn,
      status: league.status,
      member: league.member,
      standings: league.standings,
    });
    if (state.kind === "notJoined") {
      body = (
        <div className={cardClasses()}>
          <LeagueJoin
            joined={state.joined}
            needed={state.needed}
            open={state.open}
            restricted={isRestricted}
            busy={sharing.busy === "join"}
            onJoin={() => void sharing.join()}
            headingLevel="h2"
          />
        </div>
      );
    } else if (state.kind === "locked" || state.kind === "waiting") {
      const locked = state.kind === "locked";
      body = (
        <>
          <div className={cardClasses({ className: "space-y-2" })}>
            <div className="flex items-center gap-[12px]">
              <TierBadge
                tier={locked ? "bronze" : state.tier}
                size={48}
                className="shrink-0"
              />
              <h2 className="min-w-0 flex-1 text-h3 font-bold leading-tight">
                {locked ? "You’re in" : `${tierName(state.tier)} league`}
              </h2>
            </div>
            <p className="text-sm text-foreground text-pretty">
              {locked
                ? lockedLine(state.joined, state.needed)
                : "Your group starts on Monday."}
            </p>
            <p className="text-xs text-muted-foreground text-pretty">
              Groups of about 20 are made each Monday from people who trained in
              the last 14 days. You score on the sessions you do against your
              own plan.
            </p>
          </div>
          {leave}
        </>
      );
    } else {
      body = (
        <>
          <Standings
            uid={uid}
            ranked={state.ranked}
            tier={state.tier}
            countdown={countdownLine(state.weekKey, now)}
            blocked={blocked}
            selfPhoto={profile?.photoURL ?? undefined}
            selfInitial={profile?.displayName?.charAt(0)}
          />
          {leave}
        </>
      );
    }
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={() => navigate(-1)}
        variant="ghost"
        size="sm"
        leftIcon={<ChevronLeft className="size-4" />}
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        Back
      </Button>
      <h1 className="text-h1 font-extrabold tracking-tight">League</h1>
      {body}
      <ConfirmDialog
        open={confirmLeave}
        title="Leave the league?"
        description={
          /* At small numbers Social offers no league to join (App1 Q6),
             so the way back is not promised. */
          enough
            ? "Your row comes out of this week’s group now, and you won’t be placed in the next one. You can join again from Social, starting in Bronze."
            : `Your row comes out of this week’s group now, and you won’t be placed in the next one. Social offers the league again once ${GROUP_MIN} people are training on Tropos.`
        }
        confirmLabel="Leave"
        destructive
        onConfirm={() => {
          setConfirmLeave(false);
          void sharing.leave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}

function Standings({
  uid,
  ranked,
  tier,
  countdown,
  blocked,
  selfPhoto,
  selfInitial,
}: {
  uid: string;
  ranked: RankedStanding[];
  tier: RankedStanding["tier"];
  countdown: string;
  blocked: ReadonlySet<string>;
  selfPhoto?: string;
  selfInitial?: string;
}) {
  const n = ranked.length;
  // A group can hold more than one tier: the lines show where any member
  // can still move.
  const up = ranked.some((s) => s.tier !== "diamond") ? promotionCount(n) : 0;
  const down = ranked.some((s) => s.tier !== "bronze") ? demotionCount(n) : 0;
  const shown = ranked.filter((s) => s.uid === uid || !blocked.has(s.uid));
  const firstBelowUp = shown.findIndex((s) => s.rank > up);
  const firstDown = shown.findIndex((s) => s.rank > n - down);
  const metal = LEAGUE_LIGHT[tier];

  return (
    <>
      <div
        className={cn(
          cardClasses({ padded: false }),
          "relative overflow-hidden"
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${metal}4D, transparent 62%)`,
          }}
        />
        <div className="relative flex flex-col items-center gap-2 p-4 text-center">
          <TierBadge tier={tier} size={72} />
          <h2 className="text-h2 font-extrabold leading-tight">
            {tierName(tier)} league
          </h2>
          <p className="text-sm font-medium text-foreground" role="timer">
            {countdown}
          </p>
          <p className="text-xs text-muted-foreground text-pretty">
            Points are the share of your plan done this week. 100 is every
            planned session; more than the plan adds nothing.
          </p>
        </div>
      </div>

      <ol
        aria-label={`${tierName(tier)} league standings`}
        className="space-y-2"
      >
        {shown.map((s, i) => (
          <Fragment key={s.uid}>
            {up > 0 && i === firstBelowUp && i > 0 && (
              <ZoneLine kind="up" count={up} />
            )}
            {down > 0 && i === firstDown && (
              <ZoneLine kind="down" count={down} />
            )}
            <StandingRow
              standing={s}
              self={s.uid === uid}
              selfPhoto={selfPhoto}
              selfInitial={selfInitial}
            />
          </Fragment>
        ))}
        {up > 0 && firstBelowUp === -1 && shown.length > 0 && (
          <ZoneLine kind="up" count={up} />
        )}
      </ol>
      {down > 0 && (
        <p className="text-xs text-muted-foreground text-pretty">
          A week with no sessions moves you down a tier, wherever you finish.
        </p>
      )}
    </>
  );
}

/** The line under the places that move up, or above those that move down. */
function ZoneLine({ kind, count }: { kind: "up" | "down"; count: number }) {
  const Icon = kind === "up" ? ArrowUp : ArrowDown;
  const label =
    kind === "up"
      ? `Top ${count} move up a tier`
      : `Bottom ${count} move down a tier`;
  return (
    <li
      role="separator"
      aria-label={label}
      className={cn(
        "flex items-center gap-2 py-1 text-xs font-semibold",
        kind === "up" ? "text-success-strong" : "text-muted-foreground"
      )}
    >
      {/* The rules give way before the words do: at large text on a
          narrow phone the label wraps rather than running off. */}
      <span
        className="h-px min-w-[12px] flex-1 bg-current opacity-40"
        aria-hidden="true"
      />
      <span className="flex min-w-0 items-center gap-1 text-center">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 text-pretty">{label}</span>
      </span>
      <span
        className="h-px min-w-[12px] flex-1 bg-current opacity-40"
        aria-hidden="true"
      />
    </li>
  );
}

function StandingRow({
  standing,
  self,
  selfPhoto,
  selfInitial,
}: {
  standing: RankedStanding;
  self: boolean;
  selfPhoto?: string;
  selfInitial?: string;
}) {
  const name = self ? "You" : (standing.name ?? "Member");
  return (
    <li
      aria-current={self ? "true" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-[10px] gap-y-1 rounded-xl p-2.5",
        self ? "border border-primary/25 bg-primary/10" : "bg-card"
      )}
    >
      <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center text-sm font-bold font-mono tabular-nums text-foreground">
        {standing.rank}
      </span>
      {self ? (
        <Avatar
          photoURL={selfPhoto ?? standing.photo}
          displayName="You"
          fallbackInitial={selfInitial}
          size="md"
        />
      ) : (
        <BlockAwareAvatar
          uid={standing.uid}
          photoURL={standing.photo}
          displayName={name}
          size="md"
        />
      )}
      <div className="min-w-[min(6em,100%)] flex-1">
        <p
          dir="auto"
          className="truncate text-sm font-semibold text-foreground"
        >
          {name}
        </p>
        <p className="text-xs font-mono tabular-nums text-muted-foreground">
          {sessionsLine(standing.done, standing.planned)}
        </p>
      </div>
      <TierBadge tier={standing.tier} size={20} className="shrink-0" />
      <span className="ml-auto shrink-0 whitespace-nowrap text-right">
        <span className="text-body font-bold font-mono tabular-nums text-foreground">
          {standing.points}
        </span>{" "}
        <span className="text-micro text-muted-foreground">pts</span>
      </span>
    </li>
  );
}
