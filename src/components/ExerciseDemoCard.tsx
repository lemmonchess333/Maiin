import { memo } from "react";
import ExerciseFormContent from "./ExerciseFormContent";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}

// Bottom-drawer form-cue lookup for mid-workout use. Wraps
// ExerciseFormContent in a BottomSheet so users can glance at muscle
// diagrams + instructions without leaving their active workout.
// Program / ExerciseHistory surfaces use ExerciseFormContent directly
// (inline tab) rather than this drawer.
//
// Sprint 3 follow-up sweep: migrated from direct vaul to the shared
// BottomSheet primitive. Bespoke z-[102]/[103] preserved via the
// primitive's overlayClassName + className overrides — this drawer
// sits above other mid-workout UI (e.g. the active exercise card)
// so the default z-40/z-50 is not enough.
//
// Heading is rendered inside children rather than via title prop
// because this drawer uses a larger text-2xl heading; the standard
// BottomSheet title strip is text-base. hideHeader skips the visible
// header but still emits a Drawer.Title (sr-only) for aria-labelledby.
function ExerciseDemoCard({ exerciseName, open, onClose }: Props) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={exerciseName}
      hideHeader
      overlayClassName="z-[102]"
      className="z-[103] border-t border-border"
    >
      <div className="overflow-y-auto flex-1 px-5 pb-6 pt-3">
        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full bg-border mx-auto mb-5" />
        <h3 className="text-2xl font-bold text-foreground mb-2">{exerciseName}</h3>
        <ExerciseFormContent exerciseName={exerciseName} active={open} />
      </div>
    </BottomSheet>
  );
}

export default memo(ExerciseDemoCard);
