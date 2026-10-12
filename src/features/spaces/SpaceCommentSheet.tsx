import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, Send, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { describeRejection } from "@/lib/callableErrors";
import { Spinner } from "@/components/ui/Spinner";
import { IconButton } from "@/components/ui/IconButton";
import Avatar from "@/components/Avatar";
import CommentPanels, {
  type CommentPanel,
} from "@/components/social/CommentPanels";
import { useAuth } from "@/lib/auth";
import {
  addSpacePostComment,
  deleteSpacePostComment,
  getSpacePostComments,
  type SpacePostComment,
} from "@/lib/socialApi";
import {
  containsProfanity,
  OBJECTIONABLE_COMMENT_MESSAGE,
} from "@/lib/profanityFilter";
import { spacePostCommentReportTargetId } from "@/lib/reportTargetIds";
import { getTimeAgo } from "@/lib/timeAgo";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import VerifyEmailNotice from "@/components/social/VerifyEmailNotice";
import RestrictedNotice from "@/components/social/RestrictedNotice";

/**
 * SOC-P2g — comments on a Space post. The activity CommentSheet's
 * visual grammar (author row, timeago, own-delete) rebuilt against the
 * space callables rather than parameterising that sheet across two
 * backends with different capabilities (space comments ship without
 * reactions in v1 — an honest smaller surface, not a downgrade).
 *
 * Moderation is the same as on the activity sheet (App Review 1.2):
 * someone else's comment can be reported (target `space_post_comment`)
 * and its author blocked, and a blocked author's comments drop out of the
 * list. Those happen in the sheet, in place of the list (CommentPanels).
 * Objectionable text is refused before it is sent, with the sentence the
 * callable refuses it with.
 *
 * Reads are tap-gated by construction: the sheet only mounts its fetch
 * when opened. Adds/deletes report a count delta up so the card's
 * commentCount stays truthful without refetching the post.
 */
export default function SpaceCommentSheet({
  spaceId,
  postId,
  open,
  onOpenChange,
  onCountChange,
}: {
  spaceId: string;
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** +1 per posted comment, -1 per deleted — the card's optimistic delta. */
  onCountChange: (delta: number) => void;
}) {
  const { user, profile } = useAuth();
  const gate = useEmailVerificationGate(user);
  const { blocked } = useBlockedUsers();
  // A restricted account can read the comments but not add one (S4e).
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const [comments, setComments] = useState<SpacePostComment[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  /* One comment being acted on (options, report, block, delete) shows in
     place of the list; null is the list. A closed sheet reopens on the
     list. */
  const [panel, setPanel] = useState<CommentPanel | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPanel(null);
  }
  const loadedForRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setComments(await getSpacePostComments(spaceId, postId));
    } catch (err) {
      logger.error("[SpaceComments] load failed", err);
      setComments([]);
      toast.error("Couldn't load comments.");
    }
  }, [spaceId, postId]);

  useEffect(() => {
    if (!open) return;
    const key = `${spaceId}/${postId}`;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    setComments(null);
    void load();
  }, [open, spaceId, postId, load]);

  const send = async () => {
    const trimmed = text.trim();
    // Comments are public content: the callable refuses an unverified
    // email. Held here as well as on the button.
    if (!user || !trimmed || sending || gate.needsVerification || isRestricted)
      return;
    // The word filter, caught before the round-trip. The callable is the
    // boundary and refuses the same text with the same sentence.
    if (containsProfanity(trimmed)) {
      toast.error(OBJECTIONABLE_COMMENT_MESSAGE);
      haptic("error");
      return;
    }
    setSending(true);
    haptic("light");
    try {
      const commentId = await addSpacePostComment(
        spaceId,
        postId,
        trimmed,
        profile?.displayName || undefined,
        profile?.photoURL || undefined
      );
      setComments((prev) => [
        ...(prev ?? []),
        {
          id: commentId,
          authorId: user.uid,
          authorName: profile?.displayName || "You",
          ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
          text: trimmed,
          createdAt: { toDate: () => new Date() },
        },
      ]);
      setText("");
      onCountChange(1);
    } catch (err) {
      logger.error("[SpaceComments] send failed", err);
      if (isRestrictedRefusal(err)) {
        showRestrictedToast();
      } else {
        const reason = describeRejection(err);
        toast.error(
          reason
            ? `Couldn't post the comment. ${reason}`
            : "Couldn't post the comment. Try again."
        );
      }
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteSpacePostComment(spaceId, postId, commentId);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
      onCountChange(-1);
      haptic("light");
    } catch (err) {
      logger.error("[SpaceComments] delete failed", err);
      const reason = describeRejection(err);
      toast.error(
        reason
          ? `Couldn't delete the comment. ${reason}`
          : "Couldn't delete the comment. Try again."
      );
    }
  };

  /* A blocked author's comments drop out, as their posts drop out of the
     space (Space.tsx). Your own are never in the blocked set. */
  const visibleComments =
    comments?.filter((c) => !c.authorId || !blocked.has(c.authorId)) ?? null;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Comments">
      {panel ? (
        <div className="overflow-y-auto min-h-0 px-4 py-3">
          <CommentPanels
            panel={panel}
            onChange={setPanel}
            reportTarget={(comment) => ({
              targetType: "space_post_comment",
              targetId: spacePostCommentReportTargetId(
                spaceId,
                postId,
                comment.id
              ),
            })}
            onDelete={(comment) => void remove(comment.id)}
          />
        </div>
      ) : (
        <div className="px-4 space-y-3 pb-2">
          {visibleComments === null && (
            <div className="flex items-center justify-center py-6">
              <Spinner size="sm" variant="muted" label="Loading comments" />
            </div>
          )}

          {visibleComments !== null && visibleComments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No comments yet — start the thread.
            </p>
          )}

          {visibleComments?.map((c) => {
            const isOwn = user?.uid === c.authorId;
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar
                  photoURL={c.authorPhotoURL}
                  displayName={c.authorName || "Athlete"}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.authorName || "Athlete"}
                    </p>
                    <span className="text-caption text-muted-foreground shrink-0">
                      {c.createdAt?.toDate
                        ? getTimeAgo(c.createdAt.toDate())
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap">
                    {c.text}
                  </p>
                </div>
                {isOwn ? (
                  <IconButton
                    aria-label="Delete comment"
                    onClick={() => setPanel({ kind: "delete", comment: c })}
                    icon={<Trash2 className="size-4" />}
                    className="text-muted-foreground"
                  />
                ) : c.authorId ? (
                  // Someone else's comment: Report and Block user.
                  <IconButton
                    aria-label={
                      c.authorName
                        ? `More options for ${c.authorName}'s comment`
                        : "More options for this comment"
                    }
                    onClick={() => setPanel({ kind: "options", comment: c })}
                    icon={<MoreHorizontal className="size-4" />}
                    className="text-muted-foreground"
                  />
                ) : null}
              </div>
            );
          })}

          {user &&
            (isRestricted ? (
              <RestrictedNotice />
            ) : (
              gate.needsVerification && (
                <VerifyEmailNotice action="comment" onRecheck={gate.recheck} />
              )
            ))}

          {user && (
            <div className="flex items-end gap-2 pt-2 border-t border-border/40">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a comment…"
                rows={1}
                maxLength={1000}
                disabled={sending || gate.needsVerification || isRestricted}
                className="flex-1 resize-none rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
              <IconButton
                aria-label="Post comment"
                onClick={send}
                disabled={
                  sending ||
                  !text.trim() ||
                  gate.needsVerification ||
                  isRestricted
                }
                icon={<Send className="size-4" />}
                className="bg-primary-strong text-primary-foreground"
              />
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
