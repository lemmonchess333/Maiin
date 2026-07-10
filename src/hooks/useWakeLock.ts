import { useEffect, useRef, useCallback } from "react";
import { isNativePlatform } from "@/lib/platform";

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Guards the async acquisition gap. request() is called from several places
  // that can fire on the SAME visibilitychange (useWakeLock's own handler +
  // Run.tsx's onVisible). Without this, two callers both pass the
  // !wakeLockRef.current check while the lock is null, both await a fresh
  // sentinel, and the second overwrites the first — orphaning a screen wake
  // lock (never released until page close) plus its stray release listener.
  const acquiringRef = useRef(false);

  const request = useCallback(async () => {
    // Native-gated (RUN-01): on the native shell, background run tracking is
    // owned by the background-geolocation foreground service — pinning the
    // screen awake would only burn battery for no tracking benefit (the doc's
    // "keep useWakeLock only on the web path"). Web keeps the lock so the
    // foreground-only web watcher isn't killed by the screen sleeping.
    if (isNativePlatform()) return false;
    if (!("wakeLock" in navigator)) return false;
    if (wakeLockRef.current || acquiringRef.current) return false;
    acquiringRef.current = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
      return true;
    } catch {
      return false;
    } finally {
      acquiringRef.current = false;
    }
  }, []);

  const release = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current)
        await request();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      // Release the lock on unmount so the screen doesn't stay
      // awake after the consumer (e.g. Run page) tears down. Without
      // this the OS only reclaims the lock when the tab closes —
      // a route error / nav-away mid-run silently drains battery.
      const lock = wakeLockRef.current;
      if (lock) {
        wakeLockRef.current = null;
        lock.release().catch(() => {});
      }
    };
  }, [request]);

  return { request, release, isSupported: "wakeLock" in navigator };
}
