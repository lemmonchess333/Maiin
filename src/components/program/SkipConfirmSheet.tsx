import { BottomSheet } from "@/components/ui/BottomSheet";

interface SkipConfirmSheetProps {
  open: boolean;
  sessionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Sprint 3 follow-up sweep: vaul boilerplate replaced with shared
// BottomSheet primitive. The original used z-[102]/[103] because
// this sheet can open from inside other Program-page sheets
// (workout editor); overlayClassName + className override preserve
// that lifted z layer.
//
// hideHeader because the sheet renders its own title styling
// (text-base font-semibold rather than the primitive's standard
// text-base font-semibold + border-divider). hideHeader still
// emits an sr-only Drawer.Title so screen readers get the
// accessible name.
export default function SkipConfirmSheet({
  open,
  sessionName,
  onConfirm,
  onCancel,
}: SkipConfirmSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title={`Skip ${sessionName}?`}
      hideHeader
      overlayClassName="z-[102]"
      className="z-[103] border-t border-border"
    >
      <div className="px-5 pb-6 pt-3">
        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />

        <div className="mt-5 space-y-2">
          <p className="text-base font-semibold text-foreground">
            Skip {sessionName}?
          </p>
          <p className="text-sm text-muted-foreground">
            It won&apos;t count toward this week. The session resets next week — past weeks stay viewable from the week navigator.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-red-500/10 text-red-500 active:scale-[0.97] transition-transform"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 rounded-xl text-sm font-medium text-muted-foreground active:scale-[0.97] transition-transform"
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
