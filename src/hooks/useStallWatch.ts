import { useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * Watches a set of named loading flags and reports the ones still true
 * after `timeoutMs`.
 *
 * Written because "analytics doesn't load" could not be reproduced. The
 * Analytics tab loads correctly against a seeded account, and the failure
 * paths that DO exist now announce themselves — a rejected read surfaces
 * a retry card. What remains unaccounted for is the other shape: a
 * Firestore listener that neither fires nor errors, which leaves a
 * `loading` flag true forever.
 *
 * Nothing in the app can currently observe that. `onSnapshot` calls
 * neither callback, so no error is logged, `navigator.onLine` stays true
 * (the SDK stream is dead, not the network — the same asymmetry
 * CLAUDE.md records as "Listen recovers, Write never re-establishes"),
 * and the user sees skeletons with no way to tell a slow read from a
 * dead one. A second report would be as undiagnosable as the first.
 *
 * So this is deliberately an OBSERVABILITY tool, not a recovery one. It
 * does not cancel, retry, or fake a result — inventing a timeout failure
 * for a read that is merely slow on a bad connection would turn a wait
 * into a wrong answer. It reports which named sources are outstanding,
 * once, and lets the surface decide what to say.
 *
 * @param sources map of source name to its current loading flag
 * @param timeoutMs how long a source may load before it counts as stalled
 * @returns the names still loading past the threshold, stable-sorted
 */
export function useStallWatch(
  sources: Record<string, boolean>,
  timeoutMs = 15_000
): string[] {
  const pending = Object.keys(sources)
    .filter((k) => sources[k])
    .sort();
  /**
   * Content hash of the PENDING set.
   *
   * The effect depends on this rather than on `sources`, because callers
   * build that object inline every render. Depending on its identity
   * restarts the timer on each render, so on a surface that re-renders
   * faster than the threshold the watchdog would never fire at all — a
   * diagnostic that goes silent exactly when something is wrong. Pinned
   * by a 50-render test.
   */
  const key = pending.join(",");

  /**
   * The key that tripped, rather than the list itself.
   *
   * Storing the LIST needs a `setStalled([])` reset in the effect body —
   * a synchronous setState in an effect, which cascades renders and is
   * what `react-hooks/set-state-in-effect` flags. Holding the tripped
   * key and deriving the result below makes the reset free: when a
   * source finishes, `key` changes, it no longer matches, and the hook
   * reports nothing without any state write at all.
   */
  const [trippedKey, setTrippedKey] = useState<string | null>(null);
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    if (key === "") return;
    const timer = setTimeout(() => {
      setTrippedKey(key);
      // Logged once per distinct stalled set, so a surface that keeps
      // re-rendering doesn't spam and a genuinely new stall still lands.
      if (reportedRef.current !== key) {
        reportedRef.current = key;
        logger.error("[useStallWatch] sources still loading after timeout", {
          sources: key.split(","),
          timeoutMs,
        });
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [key, timeoutMs]);

  return trippedKey === key && key !== "" ? pending : [];
}
