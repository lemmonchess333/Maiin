import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Sprint 3: ConfirmDialog is now a thin layout-only wrapper around
 * the shared <Dialog> primitive. Dialog handles focus trap, escape,
 * backdrop click, body scroll lock, animations, and aria wiring —
 * ConfirmDialog just composes the two-button footer with the
 * destructive variant gate. Caller API is unchanged.
 *
 * role="alertdialog" is preserved because a confirmation REQUIRES
 * user response before continuing (matches the WAI-ARIA spec for
 * confirmations vs. neutral information dialogs).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
    >
      <div className="flex gap-2 pt-1">
        <Button onClick={onCancel} variant="secondary" className="flex-1">
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant={destructive ? "destructive" : "primary"}
          className="flex-1"
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
