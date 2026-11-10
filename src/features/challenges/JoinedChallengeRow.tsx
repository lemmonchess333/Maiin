import InlineNumerals from "@/components/ui/InlineNumerals";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { cn } from "@/lib/utils";
import { challengeSport, SPORT_BAR_FILL } from "./challengeSport";
import { joinedProgress } from "./joinedProgress";
import SportIconTile from "./SportIconTile";
import MedalArt from "./MedalArt";
import { rowMedalFace } from "./rowMedal";
import {
  getTimeRemaining,
  type Challenge,
  type ChallengeParticipant,
} from "./useChallenges";

/**
 * A challenge the person has joined, as a row in Together's This week:
 * the medal they are working toward, the name, how far they are towards
 * that tier, and a bar in the sport's colour. The whole row opens the
 * challenge, where its board and Leave are.
 *
 * Reads the progress the challenges hook already holds; it adds no read.
 */
export default function JoinedChallengeRow({
  challenge,
  progress,
  onOpen,
  showTimeLeft = false,
}: {
  challenge: Challenge;
  progress: ChallengeParticipant;
  onOpen: () => void;
  showTimeLeft?: boolean;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const sport = challengeSport(challenge.metric);
  const { line, fraction } = joinedProgress(
    challenge,
    progress.currentValue || 0,
    liftUnit,
    distanceUnit
  );
  const timeLeft = showTimeLeft ? getTimeRemaining(challenge.endDate) : "";
  const medal = rowMedalFace(challenge, progress, liftUnit, distanceUnit);

  return (
    <li className="relative flex items-center gap-[12px] p-3">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={challenge.name}
        onClick={onOpen}
        className="absolute inset-0 active:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      />
      {/* The medal the person is working toward (Soc16): the next tier
          above the one they hold, gold once gold is theirs. */}
      {medal ? (
        <MedalArt {...medal} size={36} className="shrink-0" />
      ) : (
        <SportIconTile sport={sport} />
      )}
      <div className="min-w-0 flex-1 space-y-1.5 pointer-events-none">
        <div>
          <p className="text-sm font-semibold text-foreground leading-snug break-words">
            {challenge.name}
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            <InlineNumerals>
              {timeLeft ? `${line} · ${timeLeft}` : line}
            </InlineNumerals>
          </p>
        </div>
        <div
          className="h-1.5 rounded-full track-cut overflow-hidden"
          role="progressbar"
          aria-label={challenge.name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={line}
        >
          <div
            className={cn("h-full rounded-full", SPORT_BAR_FILL[sport])}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      </div>
    </li>
  );
}
