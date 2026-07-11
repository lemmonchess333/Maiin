import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import { useAuth } from "@/lib/auth";
import { useWorkouts, workoutTonnageKg } from "@/hooks/useWorkouts";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useStreaks } from "@/features/streaks/useStreaks";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { THEME } from "@/lib/theme";

/**
 * Weekly recap — the WHOOP-style "your week" share entry on the Social feed
 * (SOCIAL features pass, 2026-07). Computes THIS week's totals client-side
 * from data hooks that already live on this page's providers (no new
 * listeners): workouts (count + tonnage), runs (Sunday-anchored weekly km
 * via useRunningStats), and the current streak. One tap opens the share
 * sheet on the new `recap` card template.
 *
 * Renders nothing until the week has at least one session — a zero-week
 * recap is an empty brag. Solo-first users don't see this (SoloFirstFeed
 * has its own share entry); Social.tsx gates accordingly.
 */
export default function WeeklyRecapCard() {
  const { profile } = useAuth();
  const { workouts } = useWorkouts();
  const { weeklyData, runs } = useRunningStats(14);
  const { currentStreak } = useStreaks();
  const [shareOpen, setShareOpen] = useState(false);

  const weekKey = localWeekKey(new Date());

  const { sessions, runKm, volumeKg, liftDays, runDays } = useMemo(() => {
    const weekStart = parseLocalDate(weekKey);
    const weekWorkouts = workouts.filter((w) => {
      try {
        return localWeekKey(parseLocalDate(w.date)) === weekKey;
      } catch {
        return false;
      }
    });
    const runWeek = weeklyData.find((w) => w.week === weekKey);
    // Derived from sets — saveWorkout computes tonnage for the burn formula
    // but never persists it, so summing a stored field would read 0 forever.
    const volume = weekWorkouts.reduce((s, w) => s + workoutTonnageKg(w), 0);
    /* Day rail (Social uplift v2): which of the week's 7 days carry a
       lift / an eligible run. Same hooks the totals already use — no
       new listeners. Runs go through isVolumeEligible so an invalid /
       saved-anyway run can't light a day the km stat excludes. */
    const lifts = new Set<number>();
    for (const w of weekWorkouts) {
      try {
        const d = differenceInCalendarDays(parseLocalDate(w.date), weekStart);
        if (d >= 0 && d <= 6) lifts.add(d);
      } catch {
        /* unparseable date — already excluded from the count above */
      }
    }
    const runsSet = new Set<number>();
    for (const r of runs) {
      if (!isVolumeEligible(r)) continue;
      if (localWeekKey(r.completedAt) !== weekKey) continue;
      const d = differenceInCalendarDays(r.completedAt, weekStart);
      if (d >= 0 && d <= 6) runsSet.add(d);
    }
    return {
      sessions: weekWorkouts.length + (runWeek?.runCount ?? 0),
      runKm: runWeek?.totalDistance ?? 0,
      volumeKg: volume,
      liftDays: lifts,
      runDays: runsSet,
    };
  }, [workouts, weeklyData, runs, weekKey]);

  if (sessions === 0) return null;

  const weekStart = parseLocalDate(weekKey);
  const weekLabel = `Week of ${format(weekStart, "d MMM")}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const railLabel = days
    .map((d, i) => {
      const lift = liftDays.has(i);
      const run = runDays.has(i);
      if (!lift && !run) return null;
      const what = lift && run ? "lift and run" : lift ? "lift" : "run";
      return `${format(d, "EEE")}: ${what}`;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mt-4 p-4 rounded-2xl bg-card card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Your week</SectionLabel>
        <span className="text-caption text-muted-foreground">{weekLabel}</span>
      </div>

      {/* Day rail (Social uplift v2) — the week as seven sport-coded
          dots (coral = run, purple = lift, split = both), echoing the
          HybridWeekRail's colour grammar in one glanceable row. The
          hard 50/50 split on a double day is data encoding, not a
          decorative gradient. */}
      <div
        className="grid grid-cols-7 gap-1"
        role="img"
        aria-label={`Training days this week — ${railLabel}`}
      >
        {days.map((d, i) => {
          const lift = liftDays.has(i);
          const run = runDays.has(i);
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-caption text-muted-foreground" aria-hidden>
                {format(d, "EEEEE")}
              </span>
              <span
                aria-hidden
                className={`size-3 rounded-full ${
                  !lift && !run ? "border border-border" : ""
                }`}
                style={
                  lift && run
                    ? {
                        background: `linear-gradient(90deg, ${THEME.running} 50%, ${THEME.lifting} 50%)`,
                      }
                    : run
                      ? { background: THEME.running }
                      : lift
                        ? { background: THEME.lifting }
                        : undefined
                }
              />
            </div>
          );
        })}
      </div>

      {/* Stat cells — same numeral grammar as the feed's activity
          cards (xl bold mono + SectionLabel) so the recap reads as
          part of the same family instead of an inline text row. */}
      <div className="flex gap-5">
        <div>
          <p className="text-xl font-bold font-mono tabular-nums leading-none text-foreground">
            {sessions}
          </p>
          <SectionLabel className="mt-0.5">
            {sessions === 1 ? "session" : "sessions"}
          </SectionLabel>
        </div>
        {runKm > 0 && (
          <div>
            <p
              className="text-xl font-bold font-mono tabular-nums leading-none"
              style={{ color: THEME.running }}
            >
              {runKm.toFixed(1)}
            </p>
            <SectionLabel className="mt-0.5">km</SectionLabel>
          </div>
        )}
        {volumeKg > 0 && (
          <div>
            <p
              className="text-xl font-bold font-mono tabular-nums leading-none"
              style={{ color: THEME.lifting }}
            >
              {volumeKg >= 1000
                ? `${(volumeKg / 1000).toFixed(1)}t`
                : Math.round(volumeKg).toLocaleString()}
            </p>
            <SectionLabel className="mt-0.5">
              {volumeKg >= 1000 ? "volume" : "kg volume"}
            </SectionLabel>
          </div>
        )}
      </div>
      <Button
        variant="primary"
        fullWidth
        leftIcon={<Share2 className="size-4" />}
        onClick={() => setShareOpen(true)}
      >
        Share your week
      </Button>

      <ShareCardSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        data={{
          template: "recap",
          handle: profile?.displayName || "Athlete",
          date: weekLabel,
          sessionsCount: sessions,
          distanceKm: runKm,
          totalVolumeKg: volumeKg,
          streakDays: currentStreak,
        }}
      />
    </div>
  );
}
