import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { getComments, addComment, deleteComment } from "../../lib/socialApi";
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
}

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
    getComments(activityId).then((result) => {
      setComments(result.comments as Comment[]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    });
  }, [activityId, open]);

  // Focus input when sheet opens
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, [open]);

  const handleLoadMore = async () => {
    if (!lastDocRef.current) return;
    const result = await getComments(activityId, 20, lastDocRef.current);
    setComments((prev) => [...prev, ...(result.comments as Comment[])]);
    lastDocRef.current = result.lastDoc;
    setHasMore(result.hasMore);
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
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-semibold text-foreground">
                      {c.authorName}
                    </span>{" "}
                    <span className="text-muted-foreground">{c.text}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {timeAgo}
                  </p>
                </div>
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="opacity-0 group-hover:opacity-100 size-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive transition-all shrink-0"
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
