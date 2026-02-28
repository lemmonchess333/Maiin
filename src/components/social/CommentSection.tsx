import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { getComments, addComment } from '../../lib/socialApi';

export default function CommentSection({ activityId }: { activityId: string }) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getComments(activityId).then(setComments);
  }, [activityId]);

  const handleSend = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    await addComment(activityId, user.uid, profile?.displayName || 'User', text.trim());
    setText('');
    const updated = await getComments(activityId);
    setComments(updated);
    setSending(false);
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
      {comments.map((c: any) => (
        <div key={c.id} className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
            {(c.authorName || '?').charAt(0)}
          </div>
          <div>
            <p className="text-xs">
              <span className="font-semibold">{c.authorName}</span>{' '}
              <span className="text-muted-foreground">{c.text}</span>
            </p>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)}
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
