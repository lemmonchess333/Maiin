import { ChevronRight } from "lucide-react";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { challengeGoal } from "./challengeFormat";
import { challengeSport } from "./challengeSport";
import { getTimeRemaining, type Challenge } from "./useChallenges";
import SportIconTile from "./SportIconTile";
import MedalArt from "./MedalArt";
import { rowMedalFace } from "./rowMedal";

/**
 * One challenge in Discover's list, as a row in a grouped card: the medal
 * its first tier wins, the name and the goal. The whole row opens the challenge
 * (`onOpen`), where its board and Join are, as the running apps' challenge
 * lists do: a Join on every row made a wall of buttons, and the medal and
 * the goal's own words already say the sport.
 *
 * Says how long is left only when asked to (`showTimeLeft`): the monthly
 * challenges all end on the same day, so the list says it once, above.
 */
export default function ChallengeRow({
  challenge,
  onOpen,
  showTimeLeft = false,
}: {
  challenge: Challenge;
  onOpen: () => void;
  showTimeLeft?: boolean;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const goal =
    challengeGoal(challenge, liftUnit, distanceUnit) ?? challenge.description;
  const timeLeft = showTimeLeft ? getTimeRemaining(challenge.endDate) : "";
  const medal = rowMedalFace(challenge, null, liftUnit, distanceUnit);

  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex w-full items-center gap-[12px] px-3 py-2 text-left active:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        {/* The medal its first tier wins (Soc16), or the sport's tile for
            a challenge that awards none. Either gives its room to the
            words once the row is under 14em (larger text on a narrow
            phone). */}
        {medal ? (
          <MedalArt
            {...medal}
            size={36}
            className="shrink-0 @max-[14em]:hidden"
          />
        ) : (
          <SportIconTile
            sport={challengeSport(challenge.metric)}
            className="@max-[14em]:hidden"
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            data-challenge-name=""
            className="block text-sm font-semibold text-foreground leading-snug break-words"
          >
            {challenge.name}
          </span>
          <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
            <InlineNumerals>{goal}</InlineNumerals>
          </span>
          {timeLeft && (
            <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
              <InlineNumerals>{timeLeft}</InlineNumerals>
            </span>
          )}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}
