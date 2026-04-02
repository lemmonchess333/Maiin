import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { getBlockedUsers } from '../lib/socialApi';
import { captureError } from '../lib/errorReporting';

export function useBlockedUsers(): Set<string> {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    getBlockedUsers(user.uid)
      .then(ids => setBlocked(new Set(ids)))
      .catch((e) => { captureError(e instanceof Error ? e : new Error(String(e)), 'network', { hook: 'useBlockedUsers' }); });
  }, [user]);

  return blocked;
}
