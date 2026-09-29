import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useWorkouts } from "@/hooks/useWorkouts";
import { haptic } from "@/lib/haptic";
import { useUidForStorageKey } from "@/lib/auth";
import { readString } from "@/lib/localStore";
import {
  detectStall,
  stallCooldownKey,
} from "@/features/program/stallDetection";
import type { ProgramExercise } from "@/features/program/programTypes";
import StallModal from "@/components/workout/StallModal";

/** Only mounted on Program when no session is open. Never opens itself. */
export default function ProgramStallReview({
  exercises,
}: {
  exercises: ProgramExercise[];
}) {
  const { workouts } = useWorkouts();
  const uid = useUidForStorageKey();
  const [now] = useState(Date.now);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const candidate = exercises.flatMap((exercise) => {
    const lastShown = Number(
      readString(stallCooldownKey(uid, exercise.name)) || 0
    );
    if (now - lastShown < 3 * 7 * 86400000) return [];
    const stall = detectStall(exercise, workouts.slice(0, 20));
    return stall ? [stall] : [];
  })[0];
  if (!candidate || dismissed) return null;
  /* A row like "Go easier today" above it, saying which lift has held
     and where. It was a centred ghost button reading only "Review recent
     lifting progress", which looked like a line of text rather than
     something to tap, and named no lift (2026-09-29). */
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          haptic("light");
          setOpen(true);
        }}
        className="w-full min-h-[44px] p-3 rounded-xl bg-muted text-left flex items-center gap-3 active:scale-[0.97] transition-transform"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {candidate.isBodyweight ? (
              <>{candidate.name} has held the same reps for 3 sessions</>
            ) : (
              <>
                {candidate.name} has held at{" "}
                <span className="font-mono tabular-nums">
                  {candidate.weight}
                </span>{" "}
                kg for 3 sessions
              </>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            Review recent lifting progress
          </span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
      {open && (
        <StallModal
          exercise={candidate}
          onClose={() => {
            setOpen(false);
            setDismissed(true);
          }}
        />
      )}
    </div>
  );
}
