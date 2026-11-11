import { Button } from "@/components/ui/Button";
import { SECONDARY_ON_CARD_EDGE } from "@/components/ui/buttonClasses";
import RestrictedNotice from "@/components/social/RestrictedNotice";
import { lockedLine } from "./league";
import TierBadge from "./TierBadge";

/**
 * What weekly leagues are, what joining shows and to whom, and Join (Soc15
 * call 3). On the Social card for someone who has not joined, and on the
 * league page. A league shows a first name, a photo and a week's points to
 * about twenty people who may be strangers, so the line says so before the
 * button, in plain words.
 *
 * Join is a quiet button: the page's filled one is the weekly challenge's
 * (ChallengeList). A restricted account sees why it cannot join instead.
 */
export default function LeagueJoin({
  joined,
  needed,
  open,
  restricted,
  busy,
  onJoin,
  headingLevel = "h3",
}: {
  /** How many have joined and trained lately; null while unknown. */
  joined: number | null;
  needed: number;
  open: boolean;
  restricted: boolean;
  busy: boolean;
  onJoin: () => void;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className="space-y-3">
      {/* The badges and their gap in px, so larger text keeps the room
          for the words beside them. */}
      <div className="flex flex-wrap items-start gap-[12px]">
        <div
          aria-hidden="true"
          className="flex shrink-0 items-end -space-x-[10px] pt-[2px]"
        >
          <TierBadge tier="bronze" size={28} />
          <TierBadge tier="gold" size={34} className="relative" />
          <TierBadge tier="diamond" size={28} />
        </div>
        {/* 12em or a line of its own: beside the badges at large text on
            a narrow phone, the words had a word a line. */}
        <div className="min-w-[min(12em,100%)] flex-1">
          <Heading className="text-base font-bold leading-snug text-foreground">
            Weekly leagues
          </Heading>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground text-pretty">
            Groups of about 20, scored on the sessions you do against your own
            plan, so a three-day week can win. The top move up a tier each
            Monday.
          </p>
        </div>
      </div>
      <p className="text-xs leading-snug text-muted-foreground text-pretty">
        Your first name, photo and weekly points show to the people in your
        group. Nobody else sees them, and you can leave at any time.
      </p>
      {joined !== null && !open && (
        <p className="text-xs font-medium text-foreground">
          {lockedLine(joined, needed)}
        </p>
      )}
      {restricted ? (
        <RestrictedNotice />
      ) : (
        <Button
          variant="secondary"
          fullWidth
          loading={busy}
          onClick={onJoin}
          className={SECONDARY_ON_CARD_EDGE}
        >
          Join the league
        </Button>
      )}
    </div>
  );
}
