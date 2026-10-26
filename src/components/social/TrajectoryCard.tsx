import SectionLabel from "@/components/ui/SectionLabel";
import { Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { type PersonalTrajectory } from "@/lib/personalTrajectory";
import { THEME } from "@/lib/theme";
import Tooltip from "@/components/ui/Tooltip";
import { Spinner } from "@/components/ui/Spinner";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { storedKmLabel } from "@/lib/runLabels";
import { distanceUnitLabel } from "@/lib/distanceUnits";
import { liftUnitLabel, liftVolumeIn } from "@/lib/liftLoad";
import { withSign } from "@/utils/formatters";

/**
 * Solo-user alternative to LeaderboardCard. Surfaces this week's
 * sessions vs last week's, the measure the friends board ranks
 * (Polish2 call 5), so the "leaderboard slot" on the Following tab stays
 * useful for users who don't yet have enough friends for a meaningful
 * leaderboard, and reads the same once they do.
 *
 * SOC-P1c: presentational — FeedView owns the getPersonalTrajectory
 * fetch (same one-shot read, just lifted), so an empty week renders no
 * card at all rather than a grid of zeros. It sits under the third
 * post, not above the feed.
 *
 * Keeps the same outer shape (p-4 rounded-2xl card with a header
 * row featuring Zap + title + "This week" pill) as LeaderboardCard
 * so swapping between the two doesn't cause a layout shift.
 */
export default function TrajectoryCard({
  data,
  loading,
}: {
  data: PersonalTrajectory | null;
  loading: boolean;
}) {
  const thisWeek = data?.thisWeek;
  const lastWeek = data?.lastWeek;
  const delta = data?.delta ?? 0;
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const sessionsUnit = (n: number) => (n === 1 ? "session" : "sessions");

  // Colour the delta: green = ahead, coral = behind, muted grey = level.
  const deltaColor =
    delta > 0
      ? THEME.success
      : delta < 0
        ? THEME.running
        : "hsl(var(--muted-foreground))";

  const deltaBg =
    delta === 0
      ? "hsl(var(--muted-foreground) / 0.08)"
      : (delta > 0 ? THEME.success : THEME.running) + "14";

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  return (
    <div className="p-4 rounded-2xl bg-card card-shadow">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="size-5" style={{ color: THEME.brand }} />
        <div className="flex-1">
          <h3 className="text-base font-bold">Your trajectory</h3>
        </div>
        <span className="text-xs text-muted-foreground">This week</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" variant="muted" label="Loading trajectory" />
        </div>
      )}

      {!loading && thisWeek && lastWeek && (
        <>
          {/* Hero row — this week's sessions + delta chip.
              Suppress the delta chip entirely when this week has no
              sessions — showing "-2" before the user has logged anything
              for the new week reads as a failure-state in red. The
              "Start your week" zero-state nudge below is the calmer
              prompt to action. */}
          <div className="flex items-baseline gap-3 mb-3">
            <span
              className="text-3xl font-figure tabular-nums font-extrabold"
              style={{ color: THEME.brand }}
            >
              {thisWeek.sessions}
            </span>
            <span className="text-sm text-muted-foreground font-medium">
              {sessionsUnit(thisWeek.sessions)}
            </span>
            {thisWeek.sessions > 0 && (
              /* The delta compares against last week's running total at
                 the same elapsed point in the week (fair like-for-like)
                 rather than its full-week total. Tap surfaces a Tooltip
                 spelling out the comparison so curious users can
                 resolve why the delta doesn't match the visible
                 "Last week N sessions" baseline row below it (which is
                 intentionally the full prior week, kept as an
                 aspirational target). The chip is a real <button type="button"> so
                 the Tooltip can wire aria-describedby and keyboard
                 focus correctly — Tooltip provides the accessible
                 name so the prior aria-label has been dropped. */
              <Tooltip
                content="Compared with last week at this same point in the week. The whole of last week is shown below."
                placement="bottom"
              >
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    /* Pair, not `${deltaColor}14` — the null/zero branches
                       are var() strings and hex-alpha concat onto them is
                       invalid CSS. */
                    backgroundColor: deltaBg,
                    color: deltaColor,
                  }}
                >
                  <DeltaIcon size={12} />
                  {delta === 0
                    ? "Same"
                    : withSign(delta, String(Math.abs(delta)))}
                </button>
              </Tooltip>
            )}
          </div>

          {/* Last week baseline — kept even at zero so the user has
              a target to beat. */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>Last week</span>
            <span className="font-mono tabular-nums">
              {lastWeek.sessions} {sessionsUnit(lastWeek.sessions)}
            </span>
          </div>

          {/* Breakdown — km + kg split */}
          <div className="flex items-center gap-4 pt-3 border-t border-border/30">
            <div className="flex-1">
              <SectionLabel>Running</SectionLabel>
              {/* Stored in km, shown in the reader's unit, as the lift
                  column beside it is. */}
              <p className="text-sm font-mono tabular-nums font-bold mt-0.5">
                {storedKmLabel(thisWeek.km, distanceUnit, false, 1)}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  {distanceUnitLabel(distanceUnit)}
                </span>
              </p>
            </div>
            <div className="flex-1">
              <SectionLabel>Lifting</SectionLabel>
              <p className="text-sm font-mono tabular-nums font-bold mt-0.5">
                {Math.round(
                  liftVolumeIn(thisWeek.kg, liftUnit)
                ).toLocaleString()}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  {liftUnitLabel(liftUnit)}
                </span>
              </p>
            </div>
          </div>

          {/* Zero-state nudge — no lift, no run this week yet */}
          {thisWeek.sessions === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              {lastWeek.sessions > 0
                ? "Start your week — beat last week"
                : "Start your week with your first workout or run"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
