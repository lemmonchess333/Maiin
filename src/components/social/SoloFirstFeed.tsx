import { useMemo, useState } from "react";
import { Users, Dumbbell, Footprints } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useChallenges } from "@/features/challenges/useChallenges";
import { ChallengeCard } from "@/features/challenges/ChallengeCard";
import PartnerStreakHero from "@/features/partnerStreak/PartnerStreakHero";
import SpacesDirectory from "@/features/spaces/SpacesDirectory";
import { EmptyState as HexEmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useWorkouts, workoutTonnageKg } from "@/hooks/useWorkouts";
import { useRecentRuns } from "@/hooks/useRecentRuns";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { ShareCardSheet } from "@/components/share/ShareCardSheet";
import { THEME } from "@/lib/theme";
import { parseLocalDate } from "@/lib/dateHelpers";

interface SoloFirstFeedProps {
  /** Open the People search overlay (find a partner / people). */
  onFindPeople: () => void;
  /** Jump to the Together tab (circles/spaces surfaces). */
  onOpenTogether: () => void;
}

/**
 * Solo-first Social feed (SOCIAL S4) — the curated stack a user with no
 * partners sees INSTEAD of an empty feed. Composition is
 * locked by Soc8: PartnerStreak invite hero → "This month on Tropos"
 * global hybrid challenge → share-your-training → aspirational gym row.
 * Every piece is an existing primitive; this only composes them.
 *
 * Gating lives in the parent (`Social.tsx`) on the cheap cold-start
 * signal — a user with 0 follows necessarily has 0 partners (a bond
 * needs mutual follow), so the curated stack is the correct,
 * always-designed cold state rather than a gated fallback.
 */
export default function SoloFirstFeed({
  onFindPeople,
  onOpenTogether,
}: SoloFirstFeedProps) {
  const { profile } = useAuth();
  const {
    challenges,
    myProgress,
    leaderboards,
    joinChallenge,
    leaveChallenge,
  } = useChallenges();
  const { workouts } = useWorkouts();
  const { runs } = useRecentRuns();
  const [shareOpen, setShareOpen] = useState(false);

  // The featured global monthly hybrid challenge (Soc8), identified by id
  // prefix. Absent only in the ~5-min window before the daily rollover
  // first materialises it — the slot just collapses, never renders empty.
  const globalChallenge = useMemo(
    () => challenges.find((c) => c.id.startsWith("global-monthly-")),
    [challenges]
  );

  const latest = workouts[0];
  const latestRun = runs.find(isVolumeEligible);
  const shareData = useMemo(() => {
    const liftDate = latest
      ? (latest.createdAt?.toDate?.() ?? parseLocalDate(latest.date))
      : null;
    const dateOptions = {
      day: "numeric",
      month: "short",
      year: "numeric",
    } as const;
    const handle = profile?.displayName || "Athlete";
    if (latestRun && (!liftDate || latestRun.completedAt > liftDate)) {
      return {
        template: "run" as const,
        handle,
        date: latestRun.completedAt.toLocaleDateString("en-GB", dateOptions),
        distanceKm: latestRun.distance / 1000,
        durationSec: latestRun.duration,
        paceSecPerKm: latestRun.avgPace,
        elevationM: latestRun.elevationGain,
      };
    }
    if (!latest) return null;
    return {
      template: "lift" as const,
      handle,
      date: parseLocalDate(latest.date).toLocaleDateString(
        "en-GB",
        dateOptions
      ),
      totalVolumeKg: Math.round(workoutTonnageKg(latest)),
      exerciseCount: latest.exercises?.length ?? 0,
    };
  }, [latest, latestRun, profile?.displayName]);
  const isRunShare = shareData?.template === "run";

  return (
    <div className="mt-4 space-y-3">
      <PartnerStreakHero onFindPartner={onFindPeople} />

      {globalChallenge && (
        <ChallengeCard
          challenge={globalChallenge}
          myProgress={myProgress[globalChallenge.id]}
          leaderboard={leaderboards[globalChallenge.id]}
          joined={!!myProgress[globalChallenge.id]}
          onJoin={() => joinChallenge(globalChallenge.id)}
          onLeave={() => leaveChallenge(globalChallenge.id)}
        />
      )}

      {/* Spc1 amendment to the Soc8 stack: official Spaces are the one
          community surface a solo user can join on day one — the
          highest-value cold-start action, so it sits right after the
          challenge slot. Joined spaces drop out of the row. */}
      <SpacesDirectory compact excludeJoined title="Spaces for you" />

      {/* Share your training */}
      <div className="rounded-2xl bg-card card-shadow p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex size-12 items-center justify-center rounded-xl bg-primary/10 shrink-0"
            style={
              isRunShare
                ? {
                    backgroundColor: `${THEME.running}1A`,
                    color: THEME.running,
                  }
                : undefined
            }
          >
            {isRunShare ? (
              <Footprints className="size-6" />
            ) : (
              <Dumbbell className="size-6 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold">Share your training</h3>
            <p className="text-small text-muted-foreground mt-0.5">
              {shareData
                ? "Turn your latest session into a card to share."
                : "Log a workout or run, then share it as a card."}
            </p>
            {shareData && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShareOpen(true)}
                className="mt-3 min-h-[44px]"
              >
                Create a share card
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Aspirational gym row — the gym-community promise (crews
          retired 2026-07-20; gyms arrive later as location-kind
          Spaces, which have been schema-ready since Spc1). Until
          then this routes to Together where Spaces live. */}
      <HexEmptyState
        icon={Users}
        headline="Your gym's space is coming"
        sub="Join a community space and train with people like you"
        accent={THEME.brand}
        action={{
          label: "Browse spaces",
          onClick: onOpenTogether,
        }}
      />

      {shareData && (
        <ShareCardSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          data={shareData}
        />
      )}
    </div>
  );
}
