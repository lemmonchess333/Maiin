import { EXERCISE_WARNING } from "@/lib/exerciseWarning";
import { cn } from "@/lib/utils";

/**
 * The exercise warning as small print (`EXERCISE_WARNING` says where it
 * goes and why). `className` places it; the type is the muted small print
 * the screens around it already use.
 */
export default function ExerciseWarning({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {EXERCISE_WARNING}
    </p>
  );
}
