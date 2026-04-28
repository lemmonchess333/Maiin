import { Drawer } from "vaul";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useUserPRMap } from "@/hooks/useUserPRMap";
import { getRepBucket, repBucketLabel, type ExercisePR } from "@/lib/prTracking";
import { THEME } from "@/lib/theme";

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
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card border-t border-border outline-none">
          <div className="mx-auto w-10 h-1 rounded-full bg-border my-3" aria-hidden="true" />
          <div className="px-5 pb-5 space-y-4">
            <div>
              <Drawer.Title className="text-lg font-bold text-foreground">
                {exerciseName}
              </Drawer.Title>
              <Drawer.Description className="text-xs text-muted-foreground mt-0.5">
                Comparing best at {repBucketLabel(bucket).toLowerCase()}
              </Drawer.Description>
            </div>

            {/* Their set */}
            <div className="rounded-xl bg-muted/50 px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Their set
              </p>
              <p className="text-sm font-mono tabular-nums text-foreground mt-1">
                {authorSummary || `${authorSetCount}×${authorTargetReps}×${authorTargetWeightKg}kg`}
              </p>
            </div>

            {/* Your best */}
            {loading && (
              <div className="rounded-xl bg-muted/50 px-3.5 py-3 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Looking up your best…</span>
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
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Your best
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  No record yet — log this exercise to start tracking.
                </p>
              </div>
            )}

            {!loading && !error && yourPR && (
              <>
                <div className="rounded-xl bg-muted/50 px-3.5 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Your best
                  </p>
                  <div className="flex items-baseline justify-between mt-1">
                    <p className="text-sm font-mono tabular-nums text-foreground">
                      {yourPR.reps}×{yourPR.weight}kg
                    </p>
                    <p className="text-xs text-muted-foreground/70 tabular-nums">
                      {formatDate(yourPR.date)}
                    </p>
                  </div>
                </div>

                {/* Delta chip — purely informative; no failure-state
                    framing because being below someone else's lift
                    isn't a regression. */}
                <div
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
                  style={{ background: `${deltaColor(delta)}14`, color: deltaColor(delta) }}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <p className="text-xs font-semibold tabular-nums">
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
