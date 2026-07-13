import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useAuth } from "../../lib/auth";
import {
  getComments,
  addComment,
  deleteComment,
  toggleCommentReaction,
  isPermissionDenied,
  type CommentReaction,
} from "../../lib/socialApi";
import { containsProfanity } from "../../lib/profanityFilter";
import { getTimeAgo } from "../../lib/timeAgo";
import { haptic } from "../../lib/haptic";
import type { DocumentSnapshot } from "firebase/firestore";
import BlockAwareAvatar from "./BlockAwareAvatar";
import { toast } from "@/lib/toast";
import { logger } from "../../lib/logger";
import { BottomSheet } from "@/components/ui/BottomSheet";

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getComments(activityId)
      .then((result) => {
        if (cancelled) return;
        setComments(result.comments as Comment[]);
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
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
      });
    return () => {
      cancelled = true;
    };
  }, [activityId, open, onOpenChange]);

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
    if (!user || !text.trim()) return;
    // Client-side profanity check — UX-only; the server is the
    // trust boundary (onCommentCreated trigger auto-deletes
    // profane comments). Surfacing the rejection here saves the
    // user a round-trip + an opaque "comment vanished" surprise.
    if (containsProfanity(text)) {
      toast.error("Please remove objectionable language before posting.");
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
      toast.error("Couldn't post comment. Try again.");
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
    } catch {
      // Silently fail — comment may already be deleted
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
    haptic("light");
    setComments((prev) => applyReaction(prev, commentId, reaction, user.uid));
    try {
      await toggleCommentReaction(activityId, commentId, reaction);
    } catch {
      // Revert the optimistic flip (toggle is symmetric).
      setComments((prev) => applyReaction(prev, commentId, reaction, user.uid));
      haptic("error");
    }
  };

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
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {comments.length === 0 && (
          <div className="text-center py-8 space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              No comments yet
            </p>
            <p className="text-xs text-muted-foreground">
              Be the first to leave a comment
            </p>
          </div>
        )}

        <AnimatePresence>
          {comments.map((c) => {
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
                                ? "bg-primary/10 text-primary"
                                : uids.length > 0
                                  ? "bg-muted/70 text-foreground/80"
                                  : "bg-muted/40 text-muted-foreground/60"
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
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="size-11 inline-flex items-center justify-center text-muted-foreground/60 hover:text-destructive active:text-destructive transition-colors shrink-0"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {hasMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            className="text-xs text-primary font-medium hover:underline w-full text-center min-h-[44px] inline-flex items-center justify-center"
          >
            Load more comments
          </button>
        )}
      </div>

      {/* Quick chips + input */}
      <div className="border-t border-border/30 px-4 pt-3 pb-4 space-y-2">
        {quickChips && quickChips.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {quickChips.map((chip) => (
              <button
                type="button"
                key={chip}
                onClick={() => setText(chip)}
                className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-95 bg-primary/10 text-primary"
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
            disabled={sending}
            className="flex-1 text-sm px-3 py-2.5 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground"
          />
          <Button onClick={handleSend} disabled={sending || !text.trim()}>
            Send
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
