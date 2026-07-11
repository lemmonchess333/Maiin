/**
 * Blueprint library (ROUTINE-EXCHANGE-01) — the curated routine
 * shelf on the Lift tab, next to Saved Routines.
 *
 * Read-only blueprints with INTENT (purpose / equipment / rep
 * prescription). "Save to my routines" creates a PRIVATE SavedRoutine
 * copy with personal weights blank — it never overwrites the
 * programme; the copy is runnable as an extra session via the
 * existing saved-routines flow. Curated-only in v1 (GsPb1 lock —
 * no creator marketplace, no public browse ranking).
 *
 * Rendered COLLAPSED (owner declutter call, 2026-07-11): the lift tab
 * was carrying ten always-open blueprint cards (~900px of scroll mass
 * below the fold). The shelf is now ONE quiet entry row; the browsing
 * happens in a two-step sheet (list → detail, Back returns to the
 * list) mirroring the AdjustWeekSheet step pattern.
 */

import { useState } from "react";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  CURATED_BLUEPRINTS,
  PURPOSE_LABELS,
  blueprintToRoutineInput,
  type RoutineBlueprint,
} from "@/lib/routineBlueprints";
import { saveRoutine } from "@/lib/savedRoutines";

export default function BlueprintLibrarySection() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<RoutineBlueprint | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const save = async (b: RoutineBlueprint) => {
    if (!user) return;
    setSaving(true);
    try {
      await saveRoutine(user.uid, blueprintToRoutineInput(b));
      setSavedIds((prev) => new Set(prev).add(b.id));
      toast.success(`${b.title} saved to your routines.`);
      setDetail(null);
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setOpen(false);
    setDetail(null);
  };

  return (
    <>
      {/* Entry row — the shelf's only standing footprint on the tab. */}
      <button
        type="button"
        onClick={() => {
          haptic("light");
          setOpen(true);
        }}
        className="w-full min-h-[44px] p-3 rounded-xl bg-card flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
      >
        <div className="flex size-9 items-center justify-center rounded-xl bg-lifting/10 shrink-0">
          <BookOpen className="size-4 text-lifting" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Routine library
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {CURATED_BLUEPRINTS.length}
            </span>{" "}
            curated routines — save a private copy any time
          </p>
        </div>
        <ChevronRight
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
      </button>

      <BottomSheet
        open={open}
        onOpenChange={(v) => {
          if (!v) close();
        }}
        title={detail ? detail.title : "Routine library"}
        description={
          detail
            ? `${PURPOSE_LABELS[detail.purpose]} · ${detail.equipment}`
            : "Curated, read-only blueprints. Saving makes a private copy — your programme doesn't change."
        }
      >
        {!detail && (
          <div className="space-y-2 pb-2">
            {CURATED_BLUEPRINTS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  haptic("light");
                  setDetail(b);
                }}
                className="w-full min-h-[44px] p-3 rounded-xl bg-muted flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {b.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {PURPOSE_LABELS[b.purpose]} · {b.equipment} ·{" "}
                    <span className="font-mono tabular-nums">
                      {b.exercises.length}
                    </span>{" "}
                    exercises
                  </p>
                </div>
                <ChevronRight
                  className="size-4 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}

        {detail && (
          <div className="space-y-3 pb-2">
            <div className="flex items-center">
              <IconButton
                aria-label="Back to library"
                icon={<ArrowLeft className="size-4" aria-hidden="true" />}
                onClick={() => setDetail(null)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {detail.description}
            </p>
            <div className="space-y-1.5">
              {detail.exercises.map((ex) => (
                <div
                  key={ex.exerciseId}
                  className="flex items-center justify-between"
                >
                  <p className="text-sm text-foreground">{ex.name}</p>
                  <p className="text-sm font-mono tabular-nums text-muted-foreground">
                    {ex.sets}×{ex.reps}
                    {ex.cue ? (
                      <span className="font-sans"> · {ex.cue}</span>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Saves as a private copy — your own history sets the weights. Your
              programme doesn&apos;t change.
            </p>
            <Button
              className="w-full"
              loading={saving}
              disabled={savedIds.has(detail.id)}
              onClick={() => void save(detail)}
            >
              {savedIds.has(detail.id) ? "Saved" : "Save to my routines"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
