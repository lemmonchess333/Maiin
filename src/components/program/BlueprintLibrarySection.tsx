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
 */

import { useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import {
  CURATED_BLUEPRINTS,
  PURPOSE_LABELS,
  blueprintToRoutineInput,
  type RoutineBlueprint,
} from "@/lib/routineBlueprints";
import { saveRoutine } from "@/lib/savedRoutines";

export default function BlueprintLibrarySection() {
  const { user } = useAuth();
  const [open, setOpen] = useState<RoutineBlueprint | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const save = async (b: RoutineBlueprint) => {
    if (!user) return;
    setSaving(true);
    try {
      await saveRoutine(user.uid, blueprintToRoutineInput(b));
      setSavedIds((prev) => new Set(prev).add(b.id));
      toast.success(`${b.title} saved to your routines.`);
      setOpen(null);
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <SectionLabel as="h2">Routine library</SectionLabel>
      <div className="space-y-2">
        {CURATED_BLUEPRINTS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              haptic("light");
              setOpen(b);
            }}
            className="w-full min-h-[44px] p-3 rounded-xl bg-card flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-lifting/10 shrink-0">
              <BookOpen className="size-4 text-lifting" aria-hidden="true" />
            </div>
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

      <BottomSheet
        open={open !== null}
        onOpenChange={(v) => {
          if (!v) setOpen(null);
        }}
        title={open?.title ?? ""}
        description={
          open
            ? `${PURPOSE_LABELS[open.purpose]} · ${open.equipment}`
            : undefined
        }
      >
        {open && (
          <div className="space-y-3 pb-2">
            <p className="text-sm text-muted-foreground">{open.description}</p>
            <div className="space-y-1.5">
              {open.exercises.map((ex) => (
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
              disabled={savedIds.has(open.id)}
              onClick={() => void save(open)}
            >
              {savedIds.has(open.id) ? "Saved" : "Save to my routines"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
