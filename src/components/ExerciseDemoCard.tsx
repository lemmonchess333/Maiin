import { memo } from "react";
import { Drawer } from "vaul";
import ExerciseFormContent from "./ExerciseFormContent";

interface Props {
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}

// Bottom-drawer form-cue lookup for mid-workout use. Wraps
// ExerciseFormContent in a vaul Drawer so users can glance at muscle
// diagrams + instructions without leaving their active workout.
// Program / ExerciseHistory surfaces use ExerciseFormContent directly
// (inline tab) rather than this drawer.
function ExerciseDemoCard({ exerciseName, open, onClose }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[102]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[103] rounded-t-2xl bg-background border-t border-border max-h-[85vh] flex flex-col">
          <div className="overflow-y-auto flex-1 px-5 pb-6 pt-3">
            {/* Drag handle */}
            <div className="w-9 h-1 rounded-full bg-border mx-auto mb-5" />
            <h3 className="text-2xl font-bold text-foreground mb-2">{exerciseName}</h3>
            <ExerciseFormContent exerciseName={exerciseName} active={open} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default memo(ExerciseDemoCard);
