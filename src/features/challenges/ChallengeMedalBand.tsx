import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { challengeSport, SPORT_ACCENT } from "./challengeSport";
import MedalArt from "./MedalArt";
import { rowMedalFace } from "./rowMedal";
import type { Challenge, ChallengeParticipant } from "./useChallenges";

/**
 * A challenge's header (Soc16): the medal it is working toward, at poster
 * size, in a soft light of its sport, beside the time left and its name.
 *
 * No photograph. A challenge's picture is its own medal, as Strava's, Nike
 * Run Club's and Garmin's are: a stock photo of someone else was the same
 * for every person and said nothing of the goal, where the medal carries
 * the goal's figure and the tier it wins. On dark the colour is a glow
 * behind the medal, not a filled band (DESIGN_GUIDE §14m, rule 14).
 *
 * Returns null for a challenge that awards no medal (the community goal)
 * or sets no tiers, so the caller draws its own header for those.
 */
export default function ChallengeMedalBand({
  challenge,
  progress,
  timeLeft,
  medalSize = 72,
  children,
}: {
  challenge: Challenge;
  /** The person's place in it, when they have joined: the medal is then
   *  the next tier above the one they hold. */
  progress?: ChallengeParticipant | null;
  /** "4 days left", or empty for none. */
  timeLeft?: string;
  /** The medal's width in px; its height is a third more. */
  medalSize?: number;
  /** Drawn over the band's corner (the sheet's tier badge). */
  children?: ReactNode;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const face = rowMedalFace(challenge, progress, liftUnit, distanceUnit);
  if (!face) return null;
  const accent = SPORT_ACCENT[challengeSport(challenge.metric)];
  return (
    <div
      className="relative overflow-hidden border-b border-border/50"
      data-challenge-medal-band=""
      style={{
        background: `radial-gradient(circle at ${medalSize / 2 + 16}px 50%, ${accent}38, transparent 65%)`,
      }}
    >
      {/* The words keep 9em beside the medal, else they drop under it:
          at large text on a narrow phone a column beside it held a word
          a line. */}
      <div
        className={`relative flex flex-wrap items-center gap-x-[16px] gap-y-2 p-[16px] ${children ? "pr-[44px]" : ""}`}
      >
        <MedalArt {...face} size={medalSize} className="shrink-0" />
        <div className="min-w-[min(9em,100%)] flex-1">
          {timeLeft && (
            <SectionLabel className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {timeLeft}
            </SectionLabel>
          )}
          {/* Two lines before it gives way: at 320 px and 135% text one
              line cut "July Distance Club" to "July Distan…". */}
          <p className="text-lg font-bold leading-tight line-clamp-2 break-words mt-0.5 text-foreground">
            {challenge.name}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
