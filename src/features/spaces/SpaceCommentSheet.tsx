import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { IconButton } from "@/components/ui/IconButton";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import {
  addSpacePostComment,
  deleteSpacePostComment,
  getSpacePostComments,
  type SpacePostComment,
} from "@/lib/socialApi";
import { getTimeAgo } from "@/lib/timeAgo";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";

/**
 * SOC-P2g — comments on a Space post. The activity CommentSheet's
 * visual grammar (author row, timeago, own-delete) rebuilt against the
 * space callables rather than parameterising that sheet across two
 * backends with different capabilities (space comments ship without
 * reactions in v1 — an honest smaller surface, not a downgrade).
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
  const [comments, setComments] = useState<SpacePostComment[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
    if (!user || !trimmed || sending) return;
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
      toast.error("Couldn't post the comment. Try again.");
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
      toast.error("Couldn't delete the comment. Try again.");
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Comments">
      <div className="space-y-3 pb-2">
        {comments === null && (
          <div className="flex items-center justify-center py-6">
            <Spinner size="sm" variant="muted" label="Loading comments" />
          </div>
        )}

        {comments !== null && comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comments yet — start the thread.
          </p>
        )}

        {comments?.map((c) => (
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
                  {c.createdAt?.toDate ? getTimeAgo(c.createdAt.toDate()) : ""}
                </span>
              </div>
              <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap">
                {c.text}
              </p>
            </div>
            {user?.uid === c.authorId && (
              <IconButton
                aria-label="Delete comment"
                onClick={() => remove(c.id)}
                icon={<Trash2 className="size-4" />}
                className="text-muted-foreground"
              />
            )}
          </div>
        ))}

        {user && (
          <div className="flex items-end gap-2 pt-2 border-t border-border/40">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              rows={1}
              maxLength={1000}
              className="flex-1 resize-none rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            />
            <IconButton
              aria-label="Post comment"
              onClick={send}
              disabled={sending || !text.trim()}
              icon={<Send className="size-4" />}
              className="bg-primary-strong text-primary-foreground"
            />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
