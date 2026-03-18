import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

const LAST_SEEN_KEY = 'tropos-social-last-seen';

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const since = lastSeen ? Timestamp.fromDate(new Date(lastSeen)) : Timestamp.fromDate(new Date(Date.now() - 86400000));

    const q = query(
      collection(db, 'activities'),
      where('createdAt', '>', since),
      where('visibility', 'in', ['public', 'followers'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const newItems = snap.docs.filter(d => d.data().authorId !== user.uid);
      setCount(newItems.length);
    }, () => setCount(0));

    return unsub;
  }, [user?.uid]);

  const markSeen = () => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setCount(0);
  };

  return { count, markSeen };
}
