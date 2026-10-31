import { useEffect, useRef } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import { commentReportTargetId } from "@/lib/reportTargetIds";
import { useActivityComments } from "@/hooks/useActivityComments";
import CommentPanels from "./CommentPanels";
import ActivityCommentRows from "./ActivityCommentRows";
import { CommentComposer, CommentListStatus } from "./CommentSheetFrame";

/**
 * A post's comments on its own page (`/activity/:id`), under the post, as
 * Strava's discussion and Hevy's workout page show them: the thread on the
 * page, and the field to add one pinned above the tab bar. The feed keeps
 * its sheet (CommentSheet); the two run on the same hook and callables.
 *
 * `focus` puts the field in focus once, for a comment notice's
 * `?comments=1` and the post's comment button.
 */
export default function ActivityPostComments({
  activityId,
  activityAuthorId,
  commentCount,
  quickChips,
  onCountChange,
  onUnavailable,
  focusKey,
}: {
  activityId: string;
  activityAuthorId?: string;
  commentCount: number;
  quickChips?: string[];
  onCountChange: (delta: number) => void;
  onUnavailable: () => void;
  /** Bumped to put the field in focus; 0 leaves it alone. */
  focusKey: number;
}) {
  const thread = useActivityComments({
    activityId,
    activityAuthorId,
    active: true,
    onCountChange,
    onUnavailable,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusKey === 0) return;
    inputRef.current?.focus();
  }, [focusKey]);

  return (
    <section aria-labelledby="post-comments-heading" className="space-y-3">
      <SectionHeading id="post-comments-heading">
        {`Comments${commentCount > 0 ? ` (${commentCount.toLocaleString("en-GB")})` : ""}`}
      </SectionHeading>
      {thread.panel ? (
        // Report, Block user and Delete in place of the list, as in the
        // sheet.
        <div className="rounded-xl bg-card p-3">
          <CommentPanels
            panel={thread.panel}
            onChange={thread.setPanel}
            reportTarget={(comment) => ({
              targetType: "comment",
              targetId: commentReportTargetId(activityId, comment.id),
            })}
            onDelete={(comment) => void thread.remove(comment.id)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <CommentListStatus status={thread.status} onRetry={thread.retry} />
          <ActivityCommentRows thread={thread} />
        </div>
      )}
      {/* Pinned above the tab bar while the page scrolls under it, out to
          the page's edges: the margin undoes Layout's gutter, which is in
          px, so in px too. In rem it grew with the text and ran the field
          and Send past the screen. */}
      <div
        className="sticky z-20 -mx-[16px] bg-background/95 backdrop-blur"
        style={{ bottom: "calc(var(--tab-bar-height) + var(--safe-bottom))" }}
      >
        <CommentComposer
          {...thread.composer}
          quickChips={quickChips}
          inputRef={inputRef}
        />
      </div>
    </section>
  );
}
