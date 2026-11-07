import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SessionHero from "@/components/home/SessionHero";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";

/**
 * Home's hero on a rest day (DS4; `SessionHero` draws it).
 *
 * Without it, a rest day showed no lead card at all and users could not
 * tell scheduled rest from a broken programme. It names the day ("Rest
 * day"), offers the one suggestion that fits a rest day, and, when a
 * session is coming, names it with a way to look at it. There is no
 * Start: rest days have nothing to begin, and a hero with a dead button
 * would say otherwise.
 */
export default function RestDayCard({
  tomorrow = null,
  navigate,
}: {
  /** Tomorrow's session, when there is one: its name and where it opens. */
  tomorrow?: { label: string; target: string; dateKey?: string } | null;
  navigate?: (path: string) => void;
}) {
  const upcomingDay = tomorrow?.dateKey
    ? formatShortWeekdayDayMonth(parseLocalDate(tomorrow.dateKey))
    : null;
  return (
    <SessionHero
      sport="rest"
      title="Rest day"
      description="A walk or some mobility helps."
      emblem={
        <div className="flex size-[120px] items-center justify-center rounded-full bg-lifting/10">
          <Leaf
            className="size-[52px] text-lifting-strong"
            aria-hidden="true"
          />
        </div>
      }
      line={
        tomorrow
          ? {
              title: tomorrow.label,
              detail: upcomingDay ? `Next session, ${upcomingDay}` : "Tomorrow",
              mark: "lift",
            }
          : null
      }
      action={
        tomorrow && navigate ? (
          <Button
            variant="secondary"
            className="pointer-events-auto w-full"
            onClick={function () {
              haptic();
              trackHomeEvent("home_card_tapped", {
                card: upcomingDay ? "rest_upcoming" : "rest_tomorrow",
                action: "details",
              });
              navigate(tomorrow.target);
            }}
          >
            {upcomingDay ? "See next session" : "See tomorrow"}
          </Button>
        ) : null
      }
    />
  );
}
