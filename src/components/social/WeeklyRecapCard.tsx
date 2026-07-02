import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useStreaks } from "@/features/streaks/useStreaks";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
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
  const { weeklyData } = useRunningStats(14);
  const { currentStreak } = useStreaks();
  const [shareOpen, setShareOpen] = useState(false);

  const weekKey = localWeekKey(new Date());

  const { sessions, runKm, volumeKg } = useMemo(() => {
    const weekWorkouts = workouts.filter((w) => {
      try {
        return localWeekKey(parseLocalDate(w.date)) === weekKey;
      } catch {
        return false;
      }
    });
    const runWeek = weeklyData.find((w) => w.week === weekKey);
    const volume = weekWorkouts.reduce((s, w) => s + (w.tonnageKg || 0), 0);
    return {
      sessions: weekWorkouts.length + (runWeek?.runCount ?? 0),
      runKm: runWeek?.totalDistance ?? 0,
      volumeKg: volume,
    };
  }, [workouts, weeklyData, weekKey]);

  if (sessions === 0) return null;

  const weekLabel = `Week of ${format(parseLocalDate(weekKey), "d MMM")}`;

  return (
    <div className="mt-4 p-4 rounded-2xl bg-card card-shadow space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Your week</SectionLabel>
        <span className="text-caption text-muted-foreground">{weekLabel}</span>
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-2xl font-extrabold font-mono tabular-nums text-foreground leading-none">
          {sessions}
          <span className="text-sm font-semibold text-muted-foreground ml-1">
            {sessions === 1 ? "session" : "sessions"}
          </span>
        </span>
        {runKm > 0 && (
          <span
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: THEME.running }}
          >
            {runKm.toFixed(1)}km
          </span>
        )}
        {volumeKg > 0 && (
          <span
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: THEME.lifting }}
          >
            {volumeKg >= 1000
              ? `${(volumeKg / 1000).toFixed(1)}t`
              : `${Math.round(volumeKg)}kg`}
          </span>
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
