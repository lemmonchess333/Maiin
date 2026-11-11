import { useCallback, useEffect, useRef, useState } from "react";
import { commentReportTargetId } from "@/lib/reportTargetIds";
import { useActivityComments } from "@/hooks/useActivityComments";
import CommentPanels from "./CommentPanels";
import CommentSheetFrame from "./CommentSheetFrame";
import ActivityCommentRows from "./ActivityCommentRows";

interface CommentSheetProps {
  activityId: string;
  activityAuthorId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commentCount?: number;
  quickChips?: string[];
  /** Told +1 when a comment lands and -1 when one is deleted, so the
   *  card that opened the sheet can move its count. */
  onCountChange?: (delta: number) => void;
}

/**
 * A post's comments in a sheet, opened from its card in the feed. The
 * post's own page shows the same thread on the page instead
 * (ActivityPostComments); both run on useActivityComments.
 */
export default function CommentSheet({
  activityId,
  activityAuthorId,
  open,
  onOpenChange,
  commentCount = 0,
  quickChips,
  onCountChange,
}: CommentSheetProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const thread = useActivityComments({
    activityId,
    activityAuthorId,
    active: open,
    onCountChange,
    onUnavailable: close,
  });
  const { setPanel } = thread;
  // A closed sheet reopens on the list.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPanel(null);
  }
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when sheet opens
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <CommentSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      commentCount={commentCount}
      panel={
        thread.panel && (
          <CommentPanels
            panel={thread.panel}
            onChange={setPanel}
            reportTarget={(comment) => ({
              targetType: "comment",
              targetId: commentReportTargetId(activityId, comment.id),
            })}
            onDelete={(comment) => void thread.remove(comment.id)}
          />
        )
      }
      status={thread.status}
      onRetry={thread.retry}
      composer={{ ...thread.composer, quickChips, inputRef }}
    >
      <ActivityCommentRows thread={thread} />
    </CommentSheetFrame>
  );
}
