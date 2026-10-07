import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useAuth } from "../../lib/auth";
import {
  getComments,
  addComment,
  deleteComment,
  toggleCommentReaction,
  isPermissionDenied,
  type CommentReaction,
} from "../../lib/socialApi";
import {
  containsProfanity,
  OBJECTIONABLE_COMMENT_MESSAGE,
} from "../../lib/profanityFilter";
import { commentReportTargetId } from "@/lib/reportTargetIds";
import { getTimeAgo } from "../../lib/timeAgo";
import { haptic } from "../../lib/haptic";
import type { DocumentSnapshot } from "firebase/firestore";
import BlockAwareAvatar from "./BlockAwareAvatar";
import CommentPanels, { type CommentPanel } from "./CommentPanels";
import { toast } from "@/lib/toast";
import { logger } from "../../lib/logger";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { describeRejection } from "@/lib/callableErrors";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import VerifyEmailNotice from "./VerifyEmailNotice";
import RestrictedNotice from "./RestrictedNotice";

interface Comment {
  id: string;
  authorId?: string;
  authorName?: string;
  authorPhotoURL?: string;
  text?: string;
  createdAt?: { toDate?: () => Date };
  /** One-tap reactions — uid arrays per key (server-written). */
  reactions?: Partial<Record<CommentReaction, string[]>>;
}

const REACTION_EMOJI: Record<CommentReaction, string> = {
  muscle: "💪",
  fire: "🔥",
};
const REACTION_KEYS = Object.keys(REACTION_EMOJI) as CommentReaction[];

interface CommentSheetProps {
  activityId: string;
  activityAuthorId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commentCount?: number;
  quickChips?: string[];
}

export default function CommentSheet({
  activityId,
  activityAuthorId,
  open,
  onOpenChange,
  commentCount = 0,
  quickChips,
}: CommentSheetProps) {
  const { user, profile } = useAuth();
  const gate = useEmailVerificationGate(user);
  const { blocked } = useBlockedUsers();
  // A restricted account can read the thread but not add to it (S4e).
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /* One comment being acted on (options, report, block, delete) shows in
     place of the list; null is the list. A closed sheet reopens on the
     list. */
  const [panel, setPanel] = useState<CommentPanel | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPanel(null);
  }
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  /* Which read the list answers. Until the current one settles an empty
     list means "not loaded yet", not "no comments": the sheet said "No
     comments yet" under "Comments (3)" while it loaded, and kept saying
     it when the read failed. */
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${activityId}#${attempt}`;
  const [settled, setSettled] = useState<{ key: string; failed: boolean }>();
  const loading = settled?.key !== loadKey;
  const failed = !loading && settled.failed;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getComments(activityId)
      .then((result) => {
        if (cancelled) return;
        setComments(result.comments as Comment[]);
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
        setSettled({ key: loadKey, failed: false });
      })
      .catch((err) => {
        if (cancelled) return;
        // Packet 13 — the activity became inaccessible after the sheet opened.
        // Clear the stale comments, close the sheet, and show a neutral notice
        // rather than leave now-private text on screen.
        if (isPermissionDenied(err)) {
          setComments([]);
          setHasMore(false);
          onOpenChange(false);
          toast.error("This activity is unavailable.");
        } else {
          logger.error("[CommentSheet] load failed", err);
        }
        setSettled({ key: loadKey, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [activityId, open, onOpenChange, loadKey]);

  // Focus input when sheet opens
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, [open]);

  const handleLoadMore = async () => {
    if (!lastDocRef.current) return;
    try {
      const result = await getComments(activityId, 20, lastDocRef.current);
      setComments((prev) => [...prev, ...(result.comments as Comment[])]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (err) {
      if (isPermissionDenied(err)) {
        setComments([]);
        setHasMore(false);
        onOpenChange(false);
        toast.error("This activity is unavailable.");
      } else {
        logger.error("[CommentSheet] load more failed", err);
      }
    }
  };

  const handleSend = async () => {
    // Comments are public content: the callable refuses an unverified
    // email. Held here too so Enter cannot bypass the disabled button.
    if (!user || !text.trim() || gate.needsVerification || isRestricted) return;
    // Client-side profanity check — UX-only; the server is the
    // trust boundary (addCommentCallable refuses the same text with
    // the same sentence, and the onCommentCreated trigger deletes
    // anything that got past it). Catching it here saves a round-trip.
    if (containsProfanity(text)) {
      toast.error(OBJECTIONABLE_COMMENT_MESSAGE);
      haptic("error");
      return;
    }
    setSending(true);
    haptic("light");
    try {
      await addComment(
        activityId,
        user.uid,
        profile?.displayName || "User",
        text.trim(),
        activityAuthorId,
        profile?.photoURL || undefined
      );
      setText("");
      const result = await getComments(activityId);
      setComments(result.comments as Comment[]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (err) {
      logger.error("[CommentSheet] send failed", err);
      if (isRestrictedRefusal(err)) {
        showRestrictedToast();
      } else {
        const reason = describeRejection(err);
        toast.error(
          reason
            ? `Couldn't post comment. ${reason}`
            : "Couldn't post comment. Try again."
        );
      }
      haptic("error");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId);
    try {
      await deleteComment(activityId, commentId);
      haptic("light");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      // The callable's failed-precondition sentence is the diagnosis; a
      // swallowed error leaves the row in place with no explanation.
      logger.error("[CommentSheet] delete failed", err);
      const reason = describeRejection(err);
      toast.error(
        reason
          ? `Couldn't delete comment. ${reason}`
          : "Couldn't delete comment. Try again."
      );
      haptic("error");
    }
    setDeletingId(null);
  };

  // Optimistic reaction toggle — flip locally, reconcile via the callable,
  // revert on failure (same optimistic pattern as the feed's kudos flame).
  const applyReaction = (
    prev: Comment[],
    commentId: string,
    reaction: CommentReaction,
    uid: string
  ): Comment[] =>
    prev.map((c) => {
      if (c.id !== commentId) return c;
      const current = c.reactions?.[reaction] ?? [];
      const next = current.includes(uid)
        ? current.filter((u) => u !== uid)
        : [...current, uid];
      return { ...c, reactions: { ...c.reactions, [reaction]: next } };
    });

  const handleReact = async (commentId: string, reaction: CommentReaction) => {
    if (!user) return;
    // A restricted account can take a reaction back, not add one (S4e).
    const adding = !(
      comments.find((c) => c.id === commentId)?.reactions?.[reaction] ?? []
    ).includes(user.uid);
    if (adding && isRestricted) {
      haptic("error");
      showRestrictedToast();
      return;
    }
    haptic("light");
    setComments((prev) => applyReaction(prev, commentId, reaction, user.uid));
    try {
      await toggleCommentReaction(activityId, commentId, reaction);
    } catch (err) {
      // Revert the optimistic flip (toggle is symmetric).
      setComments((prev) => applyReaction(prev, commentId, reaction, user.uid));
      haptic("error");
      if (isRestrictedRefusal(err)) showRestrictedToast();
    }
  };

  /* Comments by someone you have blocked drop out of the list, as their
     posts drop out of the feed (S4a: a block takes effect on the next
     render). Your own are never in the blocked set. */
  const visibleComments = comments.filter(
    (c) => !c.authorId || !blocked.has(c.authorId)
  );

  return (
    // Sprint 3: vaul boilerplate (Root + Portal + Overlay + Content
    // + drag handle + Title strip) replaced with the shared
    // <BottomSheet> primitive. Behaviour is identical — vaul still
    // handles focus trap, escape, backdrop dismiss, body scroll
    // lock; the primitive just removes ~10 lines of duplicate
    // markup and pins the standard 70vh cap via maxHeight.
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Comments${commentCount > 0 ? ` (${commentCount})` : ""}`}
      maxHeight="max-h-[70vh]"
    >
      {panel ? (
        // Report, Block user and Delete happen in the sheet, in place of
        // the list (CommentPanels says why a dialog cannot go over it).
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <CommentPanels
            panel={panel}
            onChange={setPanel}
            reportTarget={(comment) => ({
              targetType: "comment",
              targetId: commentReportTargetId(activityId, comment.id),
            })}
            onDelete={(comment) => void handleDelete(comment.id)}
          />
        </div>
      ) : (
        <>
          {/* Comment list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {visibleComments.length === 0 &&
              (loading ? (
                <div className="flex justify-center py-8">
                  <Spinner size="sm" variant="muted" label="Loading comments" />
                </div>
              ) : failed ? (
                <div className="text-center py-8 space-y-2" role="alert">
                  <p className="text-sm font-medium text-foreground">
                    Couldn't load comments
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Check your connection and try again.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setAttempt((n) => n + 1)}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    No comments yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Be the first to leave a comment
                  </p>
                </div>
              ))}

            <AnimatePresence>
              {visibleComments.map((c) => {
                const timeAgo = c.createdAt?.toDate
                  ? getTimeAgo(c.createdAt.toDate())
                  : "";
                const isOwn = user?.uid === c.authorId;

                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex gap-2 group"
                  >
                    <BlockAwareAvatar
                      uid={c.authorId}
                      photoURL={c.authorPhotoURL}
                      displayName={c.authorName}
                      size="sm"
                    />
                    {/* Phase-6 hierarchy fix (visual audit W9): the message is
                    the primary content — it reads at text-sm in foreground,
                    with author (semibold) and timestamp (caption) as the
                    supporting metadata. Previously author, body AND meta
                    were all text-xs with the body in muted grey. */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="text-xs font-semibold text-foreground">
                          {c.authorName}
                        </span>{" "}
                        <span className="text-foreground/90">{c.text}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-caption text-muted-foreground">
                          {timeAgo}
                        </p>
                        {/* One-tap reactions. p-2.5/-m-1.5 inflates each chip's
                        hit area toward the 44px floor without bloating the
                        row visually (the sibling flame's -m trick). */}
                        {REACTION_KEYS.map((k) => {
                          const uids = c.reactions?.[k] ?? [];
                          const mine = !!user && uids.includes(user.uid);
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => handleReact(c.id, k)}
                              aria-pressed={mine}
                              aria-label={`${mine ? "Remove" : "Add"} ${
                                k === "muscle" ? "strong" : "fire"
                              } reaction`}
                              className="p-2.5 -m-1.5"
                            >
                              <span
                                className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs transition-colors ${
                                  mine
                                    ? "bg-primary/10 text-lifting-strong"
                                    : uids.length > 0
                                      ? "bg-muted/70 text-foreground/80"
                                      : "bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                {REACTION_EMOJI[k]}
                                {uids.length > 0 && (
                                  <span className="font-mono tabular-nums font-medium">
                                    {uids.length}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* Always visible (W10): the old opacity-0 group-hover reveal
                    made delete unreachable on touch — this is a mobile bottom
                    sheet; there is no hover. */}
                    {isOwn ? (
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: "delete", comment: c })}
                        disabled={deletingId === c.id}
                        className="size-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive-strong active:text-destructive-strong transition-colors shrink-0"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : c.authorId ? (
                      // Someone else's comment: Report and Block user (App
                      // Review 1.2), one tap away like the feed card's menu.
                      <IconButton
                        aria-label={
                          c.authorName
                            ? `More options for ${c.authorName}'s comment`
                            : "More options for this comment"
                        }
                        onClick={() =>
                          setPanel({ kind: "options", comment: c })
                        }
                        icon={<MoreHorizontal className="size-4" />}
                        className="text-muted-foreground"
                      />
                    ) : null}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                className="text-xs text-lifting-strong font-medium hover:underline w-full text-center min-h-[44px] inline-flex items-center justify-center"
              >
                Load more comments
              </button>
            )}
          </div>

          {/* Quick chips + input */}
          <div className="border-t border-border/30 px-4 pt-3 pb-4 space-y-2">
            {isRestricted ? (
              <RestrictedNotice />
            ) : (
              gate.needsVerification && (
                <VerifyEmailNotice action="comment" onRecheck={gate.recheck} />
              )
            )}
            {quickChips && quickChips.length > 0 && !isRestricted && (
              <div
                data-no-page-swipe
                className="flex gap-1.5 overflow-x-auto pb-1"
              >
                {quickChips.map((chip) => (
                  <button
                    type="button"
                    key={chip}
                    onClick={() => setText(chip)}
                    className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-95 bg-primary/10 text-lifting-strong"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Add a comment..."
                aria-label="Add a comment"
                disabled={sending || gate.needsVerification || isRestricted}
                className="flex-1 text-sm px-3 py-2.5 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground"
              />
              <Button
                onClick={handleSend}
                disabled={
                  sending ||
                  !text.trim() ||
                  gate.needsVerification ||
                  isRestricted
                }
              >
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
