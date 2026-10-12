/**
 * What a comment sheet shows in place of its list while one comment is
 * being acted on: the options for someone else's comment (Report, Block
 * user), the report form, the block confirmation, or the delete
 * confirmation for your own.
 *
 * They replace the list inside the sheet rather than opening over it. A
 * dialog layered over the sheet does not work: the sheet (vaul, modal)
 * turns pointer events off outside itself, so the first tap on the dialog
 * lands as a tap outside the sheet and closes it, and assistive tech
 * cannot reach the dialog while the sheet hides everything else. The
 * delete confirmation used to be such a dialog and needed two taps.
 *
 * Shared by CommentSheet (activity comments) and SpaceCommentSheet (Space
 * post comments), which differ only in how a comment is reported and
 * deleted.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Ban, Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialogActions } from "@/components/ui/ConfirmDialog";
import ReportForm from "./ReportForm";
import { blockUser, type ReportTargetType } from "@/lib/socialApi";
import { useUid } from "@/lib/auth";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";

export interface PanelComment {
  id: string;
  authorId?: string | null;
  authorName?: string | null;
  text?: string | null;
}

export type CommentPanel =
  | { kind: "options"; comment: PanelComment }
  | { kind: "report"; comment: PanelComment }
  | { kind: "block"; comment: PanelComment }
  | { kind: "delete"; comment: PanelComment };

interface Props {
  panel: CommentPanel;
  /** Move to another panel, or back to the list (null). */
  onChange: (next: CommentPanel | null) => void;
  /** How this sheet files a report on one of its comments. */
  reportTarget: (comment: PanelComment) => {
    targetType: ReportTargetType;
    targetId: string;
  };
  /** Delete your own comment through this sheet's callable. */
  onDelete: (comment: PanelComment) => void;
}

export default function CommentPanels({
  panel,
  onChange,
  reportTarget,
  onDelete,
}: Props) {
  const uid = useUid();
  const { addBlocked } = useBlockedUsers();
  const headingId = useId();
  const containerRef = useRef<HTMLElement>(null);
  const [blocking, setBlocking] = useState(false);
  const { comment } = panel;
  const name = comment.authorName?.trim() || "this user";

  // Focus follows the panel to its heading, so a screen reader says where
  // it is and the next Tab starts inside it.
  useEffect(() => {
    containerRef.current?.querySelector<HTMLElement>("h3")?.focus();
  }, [panel.kind, comment.id]);

  async function block() {
    const target = comment.authorId;
    if (!uid || !target || blocking) return;
    setBlocking(true);
    haptic("heavy");
    try {
      await blockUser(uid, target);
      // The sheet drops their comments on this render.
      addBlocked(target);
      toast.success(`Blocked ${name}`);
      onChange(null);
    } catch {
      toast.error(`Couldn't block ${name}. Try again.`);
    } finally {
      setBlocking(false);
    }
  }

  // No padding of its own: the sheet's body wrapper pads it, as every
  // BottomSheet caller does (bottomSheetGutter.test.ts).
  return (
    <section ref={containerRef} aria-labelledby={headingId}>
      {panel.kind === "options" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3
              id={headingId}
              tabIndex={-1}
              className="text-base font-semibold text-foreground"
            >
              Comment from {name}
            </h3>
            {comment.text && (
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {comment.text}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Flag className="size-4" aria-hidden="true" />}
              onClick={() => onChange({ kind: "report", comment })}
            >
              Report comment
            </Button>
            <Button
              variant="destructive-tinted"
              fullWidth
              leftIcon={<Ban className="size-4" aria-hidden="true" />}
              onClick={() => onChange({ kind: "block", comment })}
            >
              Block user
            </Button>
            <Button variant="ghost" fullWidth onClick={() => onChange(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {panel.kind === "report" && (
        <ReportForm
          {...reportTarget(comment)}
          targetAuthorUid={comment.authorId ?? undefined}
          onClose={() => onChange(null)}
          headingId={headingId}
        />
      )}

      {panel.kind === "block" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3
              id={headingId}
              tabIndex={-1}
              className="text-base font-semibold text-foreground"
            >
              Block {name}?
            </h3>
            <p className="text-sm text-muted-foreground">
              They won&apos;t be able to see your activities and you won&apos;t
              see theirs.
            </p>
          </div>
          <ConfirmDialogActions
            onCancel={() => onChange(null)}
            onConfirm={() => void block()}
            confirmLabel="Block"
            destructive
          />
        </div>
      )}

      {panel.kind === "delete" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3
              id={headingId}
              tabIndex={-1}
              className="text-base font-semibold text-foreground"
            >
              Delete comment?
            </h3>
            <p className="text-sm text-muted-foreground">
              This can&apos;t be undone.
            </p>
          </div>
          <ConfirmDialogActions
            onCancel={() => onChange(null)}
            onConfirm={() => {
              onChange(null);
              onDelete(comment);
            }}
            confirmLabel="Delete"
            destructive
          />
        </div>
      )}
    </section>
  );
}
