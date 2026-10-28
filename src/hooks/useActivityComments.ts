import { useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth";
import {
  getComments,
  addComment,
  deleteComment,
  toggleCommentReaction,
  isPermissionDenied,
  type CommentReaction,
} from "@/lib/socialApi";
import { OBJECTIONABLE_COMMENT_MESSAGE } from "@/lib/objectionableMessages";
import { loadWordFilter } from "@/lib/wordFilter";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { describeRejection } from "@/lib/callableErrors";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import type { CommentPanel } from "@/components/social/CommentPanels";

export interface ActivityComment {
  id: string;
  authorId?: string;
  authorName?: string;
  authorPhotoURL?: string;
  text?: string;
  createdAt?: { toDate?: () => Date };
  /** One-tap reactions — uid arrays per key (server-written). */
  reactions?: Partial<Record<CommentReaction, string[]>>;
}

/**
 * One post's comments: reading them a page at a time, adding one, deleting
 * your own, reacting, and the comment being acted on (CommentPanels). The
 * feed's sheet (CommentSheet) and the post's own page (ActivityPost) both
 * run on it, through the same callables, so the two never disagree about
 * what a comment may say or who may see it.
 *
 * `active` starts the read: the sheet's open state, or true on the page.
 * `onUnavailable` is told when the post can no longer be read, after the
 * comments are cleared, so the surface can go.
 */
export function useActivityComments({
  activityId,
  activityAuthorId,
  active,
  onCountChange,
  onUnavailable,
}: {
  activityId: string;
  activityAuthorId?: string;
  active: boolean;
  onCountChange?: (delta: number) => void;
  onUnavailable: () => void;
}) {
  const { user, profile } = useAuth();
  const gate = useEmailVerificationGate(user);
  const { blocked } = useBlockedUsers();
  // A restricted account can read the thread but not add to it (S4e).
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /* One comment being acted on (options, report, block, delete) shows in
     place of the list; null is the list. */
  const [panel, setPanel] = useState<CommentPanel | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  /* Which read the list answers. Until the current one settles an empty
     list means "not loaded yet", not "no comments": the sheet said "No
     comments yet" under "Comments (3)" while it loaded, and kept saying
     it when the read failed. */
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${activityId}#${attempt}`;
  const [settled, setSettled] = useState<{ key: string; failed: boolean }>();
  const loading = settled?.key !== loadKey;
  const failed = !loading && settled.failed;

  // The word filter loads with the comments, so Send rarely waits for it.
  useEffect(() => {
    if (active) void loadWordFilter().catch(() => {});
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getComments(activityId)
      .then((result) => {
        if (cancelled) return;
        setComments(result.comments as ActivityComment[]);
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
        setSettled({ key: loadKey, failed: false });
      })
      .catch((err) => {
        if (cancelled) return;
        // Packet 13 — the activity became inaccessible after the comments
        // opened. Clear them and say so neutrally rather than leave
        // now-private text on screen.
        if (isPermissionDenied(err)) {
          setComments([]);
          setHasMore(false);
          onUnavailable();
          toast.error("This activity is unavailable.");
        } else {
          logger.error("[comments] load failed", err);
        }
        setSettled({ key: loadKey, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [activityId, active, onUnavailable, loadKey]);

  const loadMore = async () => {
    if (!lastDocRef.current) return;
    try {
      const result = await getComments(activityId, 20, lastDocRef.current);
      setComments((prev) => [
        ...prev,
        ...(result.comments as ActivityComment[]),
      ]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (err) {
      if (isPermissionDenied(err)) {
        setComments([]);
        setHasMore(false);
        onUnavailable();
        toast.error("This activity is unavailable.");
      } else {
        logger.error("[comments] load more failed", err);
      }
    }
  };

  const send = async () => {
    // Comments are public content: the callable refuses an unverified
    // email. Held here too so Enter cannot bypass the disabled button.
    if (!user || !text.trim() || gate.needsVerification || isRestricted) return;
    // Client-side profanity check — UX-only; the server is the
    // trust boundary (addCommentCallable refuses the same text with
    // the same sentence, and the onCommentCreated trigger deletes
    // anything that got past it). Catching it here saves a round-trip.
    setSending(true);
    const filter = await loadWordFilter().catch(() => null);
    if (!filter || filter.containsProfanity(text)) {
      setSending(false);
      toast.error(
        filter
          ? OBJECTIONABLE_COMMENT_MESSAGE
          : "Couldn't post comment. Try again."
      );
      haptic("error");
      return;
    }
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
      onCountChange?.(1);
      const result = await getComments(activityId);
      setComments(result.comments as ActivityComment[]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (err) {
      logger.error("[comments] send failed", err);
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

  const remove = async (commentId: string) => {
    setDeletingId(commentId);
    try {
      await deleteComment(activityId, commentId);
      onCountChange?.(-1);
      haptic("light");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      // The callable's failed-precondition sentence is the diagnosis; a
      // swallowed error leaves the row in place with no explanation.
      logger.error("[comments] delete failed", err);
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
    prev: ActivityComment[],
    commentId: string,
    reaction: CommentReaction,
    uid: string
  ): ActivityComment[] =>
    prev.map((c) => {
      if (c.id !== commentId) return c;
      const current = c.reactions?.[reaction] ?? [];
      const next = current.includes(uid)
        ? current.filter((u) => u !== uid)
        : [...current, uid];
      return { ...c, reactions: { ...c.reactions, [reaction]: next } };
    });

  const react = async (commentId: string, reaction: CommentReaction) => {
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
      // The haptic alone says nothing on the web.
      else toast.error("Couldn't update your reaction. Try again.");
    }
  };

  /* Comments by someone you blocked, or who blocked you, drop out of the
     list, as their posts drop out of the feed (S4a: a block takes effect
     on the next render). Your own are never in the blocked set. */
  const visible = comments.filter(
    (c) => !c.authorId || !blocked.has(c.authorId)
  );

  return {
    viewerUid: user?.uid ?? null,
    comments: visible,
    status:
      visible.length > 0
        ? null
        : loading
          ? ("loading" as const)
          : failed
            ? ("failed" as const)
            : ("empty" as const),
    retry: () => setAttempt((n) => n + 1),
    hasMore,
    loadMore,
    panel,
    setPanel,
    deletingId,
    remove,
    react,
    composer: {
      text,
      onTextChange: setText,
      onSend: send,
      sending,
      needsVerification: gate.needsVerification,
      onRecheck: gate.recheck,
      isRestricted,
    },
  };
}

export type ActivityComments = ReturnType<typeof useActivityComments>;
