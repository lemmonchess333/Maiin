import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/Button";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { cardClasses } from "@/components/ui/cardClasses";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

/**
 * Home's lead card on a rest day (DS3).
 *
 * Without it, a rest day showed no lead card at all and users could not
 * tell scheduled rest from a broken programme. It says the day is rest,
 * offers the one suggestion that fits a rest day, and, when tomorrow has
 * a session, names it with a way to look at it. There is no Start: rest
 * days have nothing to begin, and a card with a dead button would say
 * otherwise.
 */
export default function RestDayCard({
  tomorrow = null,
  navigate,
}: {
  /** Tomorrow's session, when there is one: its name and where it opens. */
  tomorrow?: { label: string; target: string } | null;
  navigate?: (path: string) => void;
}) {
  return (
    <div
      className={cardClasses({
        className: "space-y-3",
      })}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-lifting-strong">
            Today · Rest day
          </p>
          <p className="mt-1 text-h2 font-extrabold leading-tight tracking-tight text-foreground">
            Recover today
          </p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            A walk or some mobility helps.
            {tomorrow && (
              <>
                {" "}
                Tomorrow: <InlineNumerals>{tomorrow.label}</InlineNumerals>.
              </>
            )}
          </p>
        </div>
        <div className="size-12 shrink-0 rounded-2xl flex items-center justify-center bg-lifting/10">
          <Leaf className="size-6 text-lifting-strong" aria-hidden="true" />
        </div>
      </div>
      {tomorrow && navigate && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={function () {
            haptic();
            trackHomeEvent("home_card_tapped", { card: "rest_tomorrow" });
            navigate(tomorrow.target);
          }}
        >
          See tomorrow
        </Button>
      )}
    </div>
  );
}
