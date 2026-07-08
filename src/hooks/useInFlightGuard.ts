import { useCallback, useMemo, useRef } from "react";

/**
 * Synchronous in-flight latch for write handlers.
 *
 * State-based guards (`if (saving) return; setSaving(true)`) leave a
 * same-frame window: two events dispatched before React commits the state
 * update both read the stale value and both fire. On touch devices an iOS
 * "ghost click" (the synthesized mouse click after a touch) or a janky frame
 * can produce exactly that — double-writing an auto-id Firestore doc with no
 * server-side dedup (duplicate meal / run).
 *
 * `begin()` sets a ref SYNCHRONOUSLY and returns false if a call is already in
 * flight, so the second same-frame call is rejected before any await. Pair it
 * with `end()` in a finally. Keep any existing state guard too — that's what
 * drives the disabled UI; this only closes the sub-commit race.
 *
 *   const guard = useInFlightGuard();
 *   const save = async () => {
 *     if (!guard.begin()) return;
 *     try { await write(); } finally { guard.end(); }
 *   };
 */
export function useInFlightGuard() {
  const inFlight = useRef(false);
  const begin = useCallback(() => {
    if (inFlight.current) return false;
    inFlight.current = true;
    return true;
  }, []);
  const end = useCallback(() => {
    inFlight.current = false;
  }, []);
  return useMemo(() => ({ begin, end }), [begin, end]);
}
