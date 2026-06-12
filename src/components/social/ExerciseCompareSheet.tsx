import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { useAuth } from "@/lib/auth";
import { useUserPRMap } from "@/hooks/useUserPRMap";
import {
  getRepBucket,
  repBucketLabel,
  type ExercisePR,
} from "@/lib/prTracking";
import { THEME } from "@/lib/theme";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Exercise name as posted on the activity card. */
  exerciseName: string;
  /** Author's set details from the activity payload. */
  authorSummary: string;
  authorSetCount: number;
  authorTargetReps: number;
  authorTargetWeightKg: number;
}

/* Color a delta the same way TrajectoryCard does — green for
   improvement, coral for regression, muted for matched. */
function deltaColor(delta: number) {
  if (delta > 0) return THEME.success;
  if (delta < 0) return THEME.running;
  return THEME.text.muted;
}

function formatDate(iso: string): string {
  // YYYY-MM-DD → "Mar 28". No need for date-fns for this single case;
  // date strings come from workout docs which we always write as
  // local YYYY-MM-DD.
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Compare-this-lift sheet (PR 4.5).
 *
 * Opens when a user taps an exercise row inside a workout activity
 * card. Surfaces their best lift in the same rep range alongside the
 * author's set so they can answer "how do I stack up?" without
 * leaving the feed.
 *
 * Comparison is rep-bucketed via prTracking.getRepBucket so a 4×6
 * Bench Press at 100kg compares against the user's best in the 8rm
 * bucket (covers reps 4-8) — close enough to be meaningfully
 * comparable, doesn't insist on exact reps which would frequently
 * miss matches.
 */
export default function ExerciseCompareSheet({
  open,
  onClose,
  exerciseName,
  authorSummary,
  authorSetCount,
  authorTargetReps,
  authorTargetWeightKg,
}: Props) {
  const { user } = useAuth();
  const { prMap, loading, error } = useUserPRMap(open ? user?.uid : null);

  const bucket = getRepBucket(authorTargetReps);
  const yourPR: ExercisePR | null = prMap?.[exerciseName]?.[bucket] ?? null;
  const delta = yourPR ? yourPR.weight - authorTargetWeightKg : 0;
  const deltaSign = delta > 0 ? "+" : "";

  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    // Sprint 3 follow-up sweep: vaul boilerplate replaced with shared
    // BottomSheet primitive. Inline Loader2 also migrated to the
    // Spinner primitive while in here.
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={exerciseName}
      description={`Comparing best at ${repBucketLabel(bucket).toLowerCase()}`}
    >
      <div className="px-5 pb-5 pt-3 space-y-4">
        {/* Their set */}
        <div className="rounded-xl bg-muted/50 px-3.5 py-3">
          <SectionLabel>Their set</SectionLabel>
          <p className="text-sm font-mono tabular-nums text-foreground mt-1">
            {authorSummary ||
              `${authorSetCount}×${authorTargetReps}×${authorTargetWeightKg}kg`}
          </p>
        </div>

        {/* Your best */}
        {loading && (
          <div className="rounded-xl bg-muted/50 px-3.5 py-3 flex items-center gap-2">
            <Spinner size="xs" variant="muted" label="Looking up your best" />
            <span className="text-xs text-muted-foreground">
              Looking up your best…
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-muted/50 px-3.5 py-3">
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t load your history. Try again later.
            </p>
          </div>
        )}

        {!loading && !error && !yourPR && (
          <div className="rounded-xl bg-muted/50 px-3.5 py-3">
            <SectionLabel>Your best</SectionLabel>
            <p className="text-sm text-muted-foreground mt-1">
              No record yet — log this exercise to start tracking.
            </p>
          </div>
        )}

        {!loading && !error && yourPR && (
          <>
            <div className="rounded-xl bg-muted/50 px-3.5 py-3">
              <SectionLabel>Your best</SectionLabel>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-sm font-mono tabular-nums text-foreground">
                  {yourPR.reps}×{yourPR.weight}kg
                </p>
                <p className="text-xs text-muted-foreground/70 font-mono tabular-nums">
                  {formatDate(yourPR.date)}
                </p>
              </div>
            </div>

            {/* Delta chip — purely informative; no failure-state
                    framing because being below someone else's lift
                    isn't a regression. */}
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
              style={{
                background: `${deltaColor(delta)}14`,
                color: deltaColor(delta),
              }}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <p className="text-xs font-semibold font-mono tabular-nums">
                {delta === 0
                  ? "Matched"
                  : `${deltaSign}${delta.toFixed(1)}kg vs them`}
              </p>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-muted text-foreground text-sm font-medium active:scale-[0.98]"
        >
          Close
        </button>
      </div>
    </BottomSheet>
  );
}
