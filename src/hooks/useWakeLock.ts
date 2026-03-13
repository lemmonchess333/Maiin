import { useEffect, useRef, useCallback } from 'react';

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator)) return false;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current!.addEventListener('release', () => { wakeLockRef.current = null; });
      return true;
    } catch { return false; }
  }, []);

  const release = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) await request();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [request]);

  return { request, release, isSupported: 'wakeLock' in navigator };
}
