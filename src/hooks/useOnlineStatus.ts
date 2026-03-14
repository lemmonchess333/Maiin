import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setWasOffline(false), 4000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
      if (timeoutId) clearTimeout(timeoutId);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { isOnline, wasOffline };
}