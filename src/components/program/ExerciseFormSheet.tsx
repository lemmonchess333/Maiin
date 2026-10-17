import { Suspense } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { lazyRetry } from "@/lib/lazyRetry";

// The form guide is heavy (react-body-highlighter), so it loads when the
// sheet first opens (D-LIFT-14).
const ExerciseFormContent = lazyRetry(
  () => import("@/components/ExerciseFormContent")
);

/**
 * An exercise's form guide in a sheet: the drawings, the muscles and the
 * steps, over whatever page asked for it. The workout opens it from its
 * "How to" button; Train opens it from a row's drawing.
 */
export default function ExerciseFormSheet({
  exerciseName,
  open,
  onOpenChange,
}: {
  exerciseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={exerciseName}>
      <div className="px-4 pb-6">
        <Suspense
          fallback={
            <div className="py-10 flex justify-center">
              <Spinner />
            </div>
          }
        >
          <ExerciseFormContent exerciseName={exerciseName} active={open} />
        </Suspense>
      </div>
    </BottomSheet>
  );
}
