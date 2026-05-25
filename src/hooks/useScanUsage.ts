import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { DAILY_AI_LIMITS } from "@/lib/subscription";

/**
 * F1b — per-action daily AI scan usage hook.
 *
 * Reads `scanUsage/{uid}` which the server writes to via
 * `functions/lib/aiScanQuota.js`. The doc shape is
 *   {
 *     text_ai:  { day: "YYYY-MM-DD", count: number },
 *     image_ai: { day: "YYYY-MM-DD", count: number },
 *     timezone: "Europe/London" | null,
 *   }
 *
 * Default action is `image_ai` to preserve the original
 * single-counter call sites (Food page Scan Meal button). New
 * callers that want the text-AI counter pass `"text_ai"` explicitly.
 *
 * `isUnlimited` is true when the user is Pro OR trialing. Free users
 * see a per-action cap; the `limit === 0` case (free + image_ai)
 * is how callers detect Pro-only features without having to
 * duplicate the tier check.
 */
export type AiAction = "text_ai" | "image_ai";

export interface ScanUsage {
  used: number;
  limit: number;
  remaining: number;
  loading: boolean;
  /** First moment of the next day in the user's local timezone —
   *  when the counter resets. */
  resetDate: Date;
  /** True when user has Pro-equivalent access (paid or trialing). */
  isUnlimited: boolean;
  /** Which counter this hook instance is tracking. */
  action: AiAction;
}

/**
 * Local-midnight reset boundary. Approximation — uses the device's
 * timezone via the standard Date API; the server-side counter
 * resolves the actual day key from the user's profile `timezone`
 * field when set (Pacific/Auckland users in our test fixtures get
 * the same answer either way as long as their device is in their
 * home zone). Display-only; the server is authoritative on the
 * counter rollover.
 */
function getNextLocalMidnight(now = new Date()): Date {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}

function getTodayKey(now = new Date()): string {
  // Match the server's en-CA YYYY-MM-DD format produced by
  // resolveDayKey. Using ISO + slice keeps the client side simple;
  // edge cases at the local-midnight boundary are bounded by the
  // server's authoritative count anyway.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useScanUsage(action: AiAction = "image_ai"): ScanUsage {
  const { user } = useAuth();
  const { isPro, isInTrial } = useSubscription();
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const isUnlimited = isPro || isInTrial;
  const tier = isUnlimited ? "pro" : "free";
  const limit = DAILY_AI_LIMITS[tier][action];

  useEffect(() => {
    if (!user) {
      // Defer state writes to the next microtask so this effect
      // doesn't trigger a synchronous re-render. react-hooks
      // lint enforces this; the effect runs only when `user`
      // changes (logout / signup) so the extra tick is invisible.
      const handle = setTimeout(() => {
        setUsed(0);
        setLoading(false);
      }, 0);
      return () => clearTimeout(handle);
    }

    const todayKey = getTodayKey();
    const ref = doc(db, "scanUsage", user.uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const actionState = data[action];
          if (
            actionState &&
            typeof actionState === "object" &&
            actionState.day === todayKey &&
            typeof actionState.count === "number"
          ) {
            setUsed(actionState.count);
          } else {
            // Stale day or legacy {count, month} shape — treat as
            // fresh window. Server handles the same way on its next
            // write so client + server stay in sync.
            setUsed(0);
          }
        } else {
          setUsed(0);
        }
        setLoading(false);
      },
      () => {
        // Firestore error — fail gracefully. Don't surface count
        // to UI; the action itself will be blocked by the server
        // if the quota is exhausted.
        setLoading(false);
      }
    );

    return unsub;
  }, [user, action]);

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    loading,
    resetDate: getNextLocalMidnight(),
    isUnlimited,
    action,
  };
}
