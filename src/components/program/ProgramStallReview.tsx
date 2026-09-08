import { useState } from "react";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useUidForStorageKey } from "@/lib/auth";
import { readString } from "@/lib/localStore";
import {
  detectStall,
  stallCooldownKey,
} from "@/features/program/stallDetection";
import type { ProgramExercise } from "@/features/program/programTypes";
import { Button } from "@/components/ui/Button";
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
  return (
    <div>
      <Button variant="ghost" fullWidth onClick={() => setOpen(true)}>
        Review recent lifting progress
      </Button>
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
