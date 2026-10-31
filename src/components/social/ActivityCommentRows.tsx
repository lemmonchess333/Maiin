import { IconButton } from "@/components/ui/IconButton";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { CommentReaction } from "@/lib/socialApi";
import { getTimeAgo } from "@/lib/timeAgo";
import BlockAwareAvatar from "./BlockAwareAvatar";
import type { ActivityComments } from "@/hooks/useActivityComments";

const REACTION_EMOJI: Record<CommentReaction, string> = {
  muscle: "💪",
  fire: "🔥",
};
const REACTION_KEYS = Object.keys(REACTION_EMOJI) as CommentReaction[];

/**
 * A post's comments, one row each: the author, the text, when, the two
 * reactions, and Delete on your own or the options for someone else's.
 * Drawn the same in the feed's comment sheet and on the post's own page.
 */
export default function ActivityCommentRows({
  thread,
}: {
  thread: ActivityComments;
}) {
  const { comments, viewerUid, deletingId, setPanel, react } = thread;
  return (
    <>
      <AnimatePresence>
        {comments.map((c) => {
          const timeAgo = c.createdAt?.toDate
            ? getTimeAgo(c.createdAt.toDate())
            : "";
          const isOwn = viewerUid === c.authorId;

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
              supporting metadata. */}
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug break-words">
                  <span className="text-xs font-semibold text-foreground">
                    {c.authorName}
                  </span>{" "}
                  <span className="text-foreground/90">{c.text}</span>
                </p>
                {/* The time and the reactions wrap under each other when
                    the column is too narrow for both (large text on a
                    small phone) rather than running past the edge. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                  <p className="text-caption text-muted-foreground">
                    {timeAgo}
                  </p>
                  {/* One-tap reactions. p-2.5/-m-1.5 inflates each chip's
                  hit area toward the 44px floor without bloating the
                  row visually (the sibling flame's -m trick). */}
                  {REACTION_KEYS.map((k) => {
                    const uids = c.reactions?.[k] ?? [];
                    const mine = !!viewerUid && uids.includes(viewerUid);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => react(c.id, k)}
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
              {/* Always visible (W10): there is no hover on a phone. 44 px
              at every text size, so the comment keeps the width the text
              gains. */}
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => setPanel({ kind: "delete", comment: c })}
                  disabled={deletingId === c.id}
                  className="size-[44px] inline-flex items-center justify-center text-muted-foreground hover:text-destructive-strong active:text-destructive-strong transition-colors shrink-0"
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
                  onClick={() => setPanel({ kind: "options", comment: c })}
                  icon={<MoreHorizontal className="size-4" />}
                  className="size-[44px] text-muted-foreground"
                />
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {thread.hasMore && (
        <button
          type="button"
          onClick={() => void thread.loadMore()}
          className="text-xs text-lifting-strong font-medium hover:underline w-full text-center min-h-[44px] inline-flex items-center justify-center"
        >
          Load more comments
        </button>
      )}
    </>
  );
}
