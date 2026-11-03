import { Link } from "react-router-dom";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import MedalArt from "./MedalArt";
import {
  MEDAL_TIER_LABEL,
  medalEditionDates,
  medalEndsLine,
  medalFace,
  medalGoalLine,
  medalStillRunning,
  medalTitle,
  medalValueParts,
  type Medal,
} from "./medals";

/**
 * One medal, large (Soc15): the medal, the challenge it is from, the
 * edition's dates, the tier and the figure, in the reader's units. Opened
 * from a trophy case or a finished challenge's card. A medal whose
 * edition is still running says so, since its tier can still rise.
 *
 * `trophyCaseHref` adds a way to the owner's trophy case, for a sheet
 * opened from somewhere other than the profile.
 */
export default function MedalSheet({
  medal,
  onClose,
  trophyCaseHref,
}: {
  medal: Medal | null;
  onClose: () => void;
  trophyCaseHref?: string;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  return (
    <BottomSheet
      open={medal !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={medal ? medalTitle(medal) : "Medal"}
    >
      {medal && (
        <MedalSheetBody
          medal={medal}
          liftUnit={liftUnit}
          distanceUnit={distanceUnit}
          trophyCaseHref={trophyCaseHref}
        />
      )}
    </BottomSheet>
  );
}

function MedalSheetBody({
  medal,
  liftUnit,
  distanceUnit,
  trophyCaseHref,
}: {
  medal: Medal;
  liftUnit: ReturnType<typeof useLiftUnit>;
  distanceUnit: ReturnType<typeof useDistanceUnit>;
  trophyCaseHref?: string;
}) {
  const value = medalValueParts(medal, liftUnit, distanceUnit);
  const goal = medalGoalLine(medal, liftUnit, distanceUnit);
  return (
    <div className="px-4 pt-4 pb-6 space-y-4 overflow-y-auto">
      <div className="flex justify-center">
        <MedalArt {...medalFace(medal, liftUnit, distanceUnit)} size={152} />
      </div>
      <div className="text-center space-y-1 min-w-0">
        <p className="text-small text-muted-foreground break-words">
          {medalEditionDates(medal)}
        </p>
        <p className="text-small font-semibold text-foreground">
          {MEDAL_TIER_LABEL[medal.tier]}
        </p>
        <p className="text-h2 font-extrabold font-figure tabular-nums leading-tight text-foreground break-words">
          {value.figure}
          {value.unit && (
            <span className="font-sans text-base font-semibold text-muted-foreground">
              {" "}
              {value.unit}
            </span>
          )}
        </p>
        {goal && (
          <p className="text-small text-muted-foreground text-pretty">{goal}</p>
        )}
        {medalStillRunning(medal) && (
          <p className="text-small text-muted-foreground text-pretty">
            Still running. {medalEndsLine(medal)}
          </p>
        )}
      </div>
      {trophyCaseHref && (
        <Link
          to={trophyCaseHref}
          className={buttonClasses({ variant: "secondary", fullWidth: true })}
        >
          See all your medals
        </Link>
      )}
    </div>
  );
}
