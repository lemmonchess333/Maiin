import { useMemo, useState } from "react";
import { Users, Dumbbell } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useChallenges } from "@/features/challenges/useChallenges";
import { ChallengeCard } from "@/features/challenges/ChallengeCard";
import PartnerStreakHero from "@/features/partnerStreak/PartnerStreakHero";
import { EmptyState as HexEmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useWorkouts } from "@/hooks/useWorkouts";
import { ShareCardSheet } from "@/components/share/ShareCardSheet";
import { THEME } from "@/lib/theme";

type SocialTab = "feed" | "crews" | "find";

interface SoloFirstFeedProps {
  /** Navigate to another Social top-level tab (find / crews). */
  onNavigateTab: (tab: SocialTab) => void;
}

/**
 * Solo-first Social feed (SOCIAL S4) — the curated stack a user with no
 * partners and no crew sees INSTEAD of an empty feed. Composition is
 * locked by Soc8: PartnerStreak invite hero → "This month on Tropos"
 * global hybrid challenge → share-your-training → aspirational crew row.
 * Every piece is an existing primitive; this only composes them.
 *
 * Gating lives in the parent (`Social.tsx`) on the cheap cold-start
 * signal — a user with 0 follows necessarily has 0 partners (a bond
 * needs mutual follow), so the curated stack is the correct,
 * always-designed cold state rather than a gated fallback.
 */
export default function SoloFirstFeed({ onNavigateTab }: SoloFirstFeedProps) {
  const { profile } = useAuth();
  const {
    challenges,
    myProgress,
    leaderboards,
    joinChallenge,
    leaveChallenge,
  } = useChallenges();
  const { workouts } = useWorkouts();
  const [shareOpen, setShareOpen] = useState(false);

  // The featured global monthly hybrid challenge (Soc8), identified by id
  // prefix. Absent only in the ~5-min window before the daily rollover
  // first materialises it — the slot just collapses, never renders empty.
  const globalChallenge = useMemo(
    () => challenges.find((c) => c.id.startsWith("global-monthly-")),
    [challenges]
  );

  // Preload the share card from the latest logged workout (volume summed
  // from sets). Null when the user hasn't logged anything yet — the share
  // card then shows the honest cold-start prompt instead of a dead button.
  const latest = workouts[0];
  const shareData = useMemo(() => {
    if (!latest) return null;
    const totalVolumeKg = latest.exercises.reduce(
      (sum, ex) =>
        sum + ex.sets.reduce((s, set) => s + set.reps * set.weightKg, 0),
      0
    );
    return {
      template: "lift" as const,
      handle: profile?.displayName || "Athlete",
      date: new Date(latest.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      totalVolumeKg: Math.round(totalVolumeKg),
      exerciseCount: latest.exercises.length,
    };
  }, [latest, profile]);

  return (
    <div className="mt-4 space-y-3">
      <PartnerStreakHero onFindPartner={() => onNavigateTab("find")} />

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

      {/* Share your training */}
      <div className="rounded-2xl bg-card border border-border/50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <Dumbbell className="size-6 text-primary" />
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
                className="mt-3"
              >
                Create a share card
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Aspirational crew row — the dormant crew surface (Soc8 keep-
          dormant-don't-delete). Activates into real crew surfaces at
          ≥3 members (PR4 wiring). */}
      <HexEmptyState
        icon={Users}
        headline="Crews unlock when your gym's here"
        sub="Create a crew and invite friends to train together"
        accent={THEME.brand}
        action={{
          label: "Create a crew",
          onClick: () => onNavigateTab("crews"),
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
