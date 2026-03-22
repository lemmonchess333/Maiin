import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/auth';
import { getComments, addComment } from '../../lib/socialApi';
import { getTimeAgo } from '../../lib/timeAgo';
import type { DocumentSnapshot } from 'firebase/firestore';

interface Comment {
  id: string;
  authorName?: string;
  text?: string;
  createdAt?: { toDate?: () => Date };
}

export default function CommentSection({ activityId, activityAuthorId, prefillText, onPrefillConsumed }: { activityId: string; activityAuthorId?: string; prefillText?: string; onPrefillConsumed?: () => void }) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);

  useEffect(() => {
    getComments(activityId).then(result => {
      setComments(result.comments as Comment[]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    });
  }, [activityId]);

  const [prevPrefill, setPrevPrefill] = useState(prefillText);
  if (prefillText && prefillText !== prevPrefill) {
    setPrevPrefill(prefillText);
    setText(prefillText);
    onPrefillConsumed?.();
  }

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
    await addComment(activityId, user.uid, profile?.displayName || 'User', text.trim(), activityAuthorId);
    setText('');
    const result = await getComments(activityId);
    setComments(result.comments as Comment[]);
    lastDocRef.current = result.lastDoc;
    setHasMore(result.hasMore);
    setSending(false);
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
      {comments.map((c) => {
        const timeAgo = c.createdAt?.toDate ? getTimeAgo(c.createdAt.toDate()) : '';
        return (
          <div key={c.id} className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold shrink-0">
              {(c.authorName || '?').charAt(0)}
            </div>
            <div>
              <p className="text-xs">
                <span className="font-semibold">{c.authorName}</span>{' '}
                <span className="text-muted-foreground">{c.text}</span>
                {timeAgo && <span className="text-[11px] text-muted-foreground ml-1">{timeAgo}</span>}
              </p>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button onClick={handleLoadMore}
          className="text-xs text-primary font-medium hover:underline">
          Load more comments
        </button>
      )}

      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)}
          data-comment-input={activityId}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Add a comment..." disabled={sending}
          className="flex-1 text-xs px-3 py-2 rounded-lg bg-muted border border-border" />
        <button onClick={handleSend} disabled={sending || !text.trim()}
          className="text-xs px-3 py-2 rounded-lg bg-purple-500 text-white font-medium disabled:opacity-40">
          Send
        </button>
      </div>
    </div>
  );
}
