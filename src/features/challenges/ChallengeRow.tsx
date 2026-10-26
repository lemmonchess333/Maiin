import { useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { challengeEditorialImage } from "@/lib/editorialImages";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { challengeGoal } from "./challengeFormat";
import { challengeSport, SPORT_ACCENT } from "./challengeSport";
import { getTimeRemaining, type Challenge } from "./useChallenges";

/**
 * One not-joined challenge in the "See more" list, as a row in a grouped
 * card: a small picture, the name, the goal, and a small Join in the
 * challenge's sport (coral for running, the primary purple otherwise, as
 * the full card's Join). The big picture card is kept for the featured
 * challenge alone, so the list reads as a list rather than five lobbies.
 *
 * Says how long is left only when asked to (`showTimeLeft`): the monthly
 * challenges all end on the same day, which the featured card says.
 */
export default function ChallengeRow({
  challenge,
  onJoin,
  showTimeLeft = false,
}: {
  challenge: Challenge;
  onJoin: () => void | Promise<void>;
  showTimeLeft?: boolean;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const [joining, setJoining] = useState(false);
  const sport = challengeSport(challenge.metric);
  const accent = SPORT_ACCENT[sport];
  const photo = challengeEditorialImage(challenge);
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
    <li className="flex items-start gap-[12px] p-3">
      {/* The picture gives its room to the words once the row is under
          14em (larger text on a narrow phone). px, so it does not grow
          with the text. */}
      <div
        aria-hidden
        className="relative size-[48px] shrink-0 rounded-xl overflow-hidden flex @max-[14em]:hidden items-center justify-center"
        style={photo ? undefined : { background: `${accent}1F` }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Trophy className="size-5" style={{ color: accent }} />
        )}
      </div>
      {/* The Join drops under the words, at the right, once they would be
          narrower than 8em beside it. */}
      <div className="min-w-0 flex-1 flex flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]">
        <div className="min-w-[min(8em,100%)] flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug break-words">
            {challenge.name}
          </p>
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
          size="sm"
          variant={sport === "running" ? "sport" : "primary"}
          className="shrink-0"
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
