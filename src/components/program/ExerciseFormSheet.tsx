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
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={exerciseName}
      // Over the workout screen (z-50) as its other sheets are, so the
      // backdrop dims it and a tap on it closes the sheet.
      overlayClassName="z-[60]"
      className="z-[60]"
    >
      {/* The muscles, steps and common mistakes run past the sheet's
          height: they scroll inside it. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
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
