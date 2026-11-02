import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SECONDARY_ON_CARD_EDGE } from "@/components/ui/buttonClasses";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { challengeGoal } from "./challengeFormat";
import { challengeSport } from "./challengeSport";
import { getTimeRemaining, type Challenge } from "./useChallenges";
import ChallengeSportTag from "./ChallengeSportTag";
import SportIconTile from "./SportIconTile";

/**
 * One challenge in Discover's quiet list, as a row in a grouped card: the
 * sport as an icon and a tag, the name, the goal, and a small Join. The
 * whole row opens the challenge (`onOpen`); Join sits above that layer.
 * The Join is neutral whatever the sport: the Together page keeps one
 * filled button, and five coloured Joins read as five competing calls.
 *
 * Says how long is left only when asked to (`showTimeLeft`): the monthly
 * challenges all end on the same day, so the list says it once.
 */
export default function ChallengeRow({
  challenge,
  onJoin,
  onOpen,
  showTimeLeft = false,
}: {
  challenge: Challenge;
  onJoin: () => void | Promise<void>;
  onOpen?: () => void;
  showTimeLeft?: boolean;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const [joining, setJoining] = useState(false);
  const goal =
    challengeGoal(challenge, liftUnit, distanceUnit) ?? challenge.description;
  const timeLeft = showTimeLeft ? getTimeRemaining(challenge.endDate) : "";

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    try {
      await onJoin();
    } finally {
      setJoining(false);
    }
  };

  return (
    <li className="relative flex items-start gap-[12px] p-3">
      {onOpen && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={challenge.name}
          onClick={onOpen}
          className="absolute inset-0 active:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        />
      )}
      {/* The tile gives its room to the words once the row is under 14em
          (larger text on a narrow phone). */}
      <SportIconTile
        sport={challengeSport(challenge.metric)}
        className="@max-[14em]:hidden"
      />
      {/* The Join drops under the words, at the right, once they would be
          narrower than 8em beside it. */}
      <div className="min-w-0 flex-1 flex flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]">
        <div className="min-w-[min(8em,100%)] flex-1 pointer-events-none">
          <p className="text-sm font-semibold text-foreground leading-snug break-words">
            {challenge.name}
          </p>
          <ChallengeSportTag metric={challenge.metric} className="mt-1" />
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            <InlineNumerals>{goal}</InlineNumerals>
          </p>
          {timeLeft && (
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
              <InlineNumerals>{timeLeft}</InlineNumerals>
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          className={`relative shrink-0 ${SECONDARY_ON_CARD_EDGE}`}
          loading={joining}
          onClick={handleJoin}
          aria-label={`Join ${challenge.name}`}
        >
          Join
        </Button>
      </div>
    </li>
  );
}
