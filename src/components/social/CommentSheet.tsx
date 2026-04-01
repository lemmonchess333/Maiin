import { useState, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { getComments, addComment, deleteComment } from '../../lib/socialApi';
import { getTimeAgo } from '../../lib/timeAgo';
import { haptic } from '../../lib/haptic';
import type { DocumentSnapshot } from 'firebase/firestore';

interface Comment {
  id: string;
  authorId?: string;
  authorName?: string;
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

export default function CommentSheet({ activityId, activityAuthorId, open, onOpenChange, commentCount = 0, quickChips }: CommentSheetProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    getComments(activityId).then(result => {
      setComments(result.comments as Comment[]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    });
  }, [activityId, open]);

  // Focus input when sheet opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const handleLoadMore = async () => {
    if (!lastDocRef.current) return;
    const result = await getComments(activityId, 20, lastDocRef.current);
    setComments(prev => [...prev, ...(result.comments as Comment[])]);
    lastDocRef.current = result.lastDoc;
    setHasMore(result.hasMore);
  };

  const handleSend = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    haptic('light');
    await addComment(activityId, user.uid, profile?.displayName || 'User', text.trim(), activityAuthorId);
    setText('');
    const result = await getComments(activityId);
    setComments(result.comments as Comment[]);
    lastDocRef.current = result.lastDoc;
    setHasMore(result.hasMore);
    setSending(false);
  };

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId);
    try {
      await deleteComment(activityId, commentId);
      haptic('light');
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      // Silently fail — comment may already be deleted
    }
    setDeletingId(null);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[70vh] flex flex-col bg-background safe-area-pb">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="px-4 pb-3 border-b border-border/30">
            <Drawer.Title className="text-base font-semibold text-foreground">
              Comments{commentCount > 0 ? ` (${commentCount})` : ''}
            </Drawer.Title>
          </div>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {comments.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No comments yet. Be the first!</p>
            )}

            <AnimatePresence>
              {comments.map((c) => {
                const timeAgo = c.createdAt?.toDate ? getTimeAgo(c.createdAt.toDate()) : '';
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
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      {(c.authorName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        <span className="font-semibold text-foreground">{c.authorName}</span>{' '}
                        <span className="text-muted-foreground">{c.text}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{timeAgo}</p>
                    </div>
                    {isOwn && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all shrink-0"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {hasMore && (
              <button onClick={handleLoadMore}
                className="text-xs text-primary font-medium hover:underline w-full text-center py-1">
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
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Add a comment..."
                disabled={sending}
                className="flex-1 text-sm px-3 py-2.5 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
