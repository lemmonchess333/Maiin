import { Drawer } from "vaul";

interface SetNextWorkoutSheetProps {
  open: boolean;
  sessionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SetNextWorkoutSheet({
  open,
  sessionName,
  onConfirm,
  onCancel,
}: SetNextWorkoutSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[102]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[103] rounded-t-2xl bg-background border-t border-border safe-area-pb flex flex-col">
          <div className="px-5 pb-6 pt-3">
            {/* Drag handle */}
            <div className="w-9 h-1 rounded-full bg-border mx-auto" />

            <div className="mt-5 space-y-2">
              <p className="text-base font-semibold text-foreground">
                Make {sessionName} your next workout?
              </p>
              <p className="text-sm text-muted-foreground">
                You can change this at any time.
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <button
                onClick={onConfirm}
                className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.97] transition-transform"
                style={{ backgroundColor: "rgba(124, 107, 240, 0.1)", color: "#7C6BF0" }}
              >
                Confirm
              </button>
              <button
                onClick={onCancel}
                className="w-full py-3 rounded-xl text-sm font-medium text-muted-foreground active:scale-[0.97] transition-transform"
              >
                Cancel
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
