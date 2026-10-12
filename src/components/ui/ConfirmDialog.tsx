import { Button } from "./Button";
import { Dialog } from "./Dialog";
import type { Ref } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Lift the dialog above a bottom sheet (z-50) it is confirming for. */
  overSheet?: boolean;
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
  overSheet = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      overlayClassName={overSheet ? "z-[60]" : undefined}
      className={overSheet ? "z-[60]" : undefined}
    >
      <ConfirmDialogActions
        onCancel={onCancel}
        onConfirm={onConfirm}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        destructive={destructive}
      />
    </Dialog>
  );
}

/** Shared confirmation controls for flows that keep one dialog mounted. */
export function ConfirmDialogActions({
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  destructive = false,
  cancelRef,
}: Pick<
  ConfirmDialogProps,
  "onCancel" | "onConfirm" | "cancelLabel" | "confirmLabel" | "destructive"
> & {
  cancelRef?: Ref<HTMLButtonElement>;
}) {
  /* The two share a row while each label fits on one line, and stack
     full width when they do not, as an iOS alert does. A flex item's
     floor is its longest word, so "Review completed work" broke over
     three lines in half a 393 px dialog; `min-w-fit` makes the floor
     the label's one-line width, or the dialog's when even that is
     wider, and `flex-wrap` gives the second button its own row. */
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        ref={cancelRef}
        onClick={onCancel}
        variant="secondary"
        className="min-w-fit flex-1"
      >
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        variant={destructive ? "destructive" : "primary"}
        className="min-w-fit flex-1"
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
