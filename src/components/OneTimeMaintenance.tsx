import { useEffect, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Silent one-time data migrations that run after a user signs in.
 *
 * Migration registry:
 *
 *   muscleGroupsBackfill.v1 — re-tags old workout activities posted
 *     before commit 46127d5, when every template-derived workout
 *     inherited "horizontal_push" from the normalizer's hardcoded
 *     default. Fires once per user (gated by localStorage), produces
 *     no UI, fails silently — if the call breaks, the next session
 *     retries automatically because the flag is only set on success.
 *
 * Mounted once in App.tsx alongside ShareComposerSheet.
 *
 * No UI surface intentional: users shouldn't have to learn about
 * internal data drift. New code that needs a similar one-time
 * migration should add a new flag here rather than introducing a
 * Settings button.
 */
export default function OneTimeMaintenance() {
  const { user } = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user || firedRef.current) return;

    let cancelled = false;
    const FLAG_KEY = "tropos.muscleGroupsBackfilled.v1";

    const run = async () => {
      try {
        if (localStorage.getItem(FLAG_KEY)) return;
      } catch {
        /* localStorage unavailable (private mode, embedded webview):
           skip the migration entirely rather than re-running every
           session — the visible cost of unfixed old tags is lower
           than spamming the CF on every cold start. */
        return;
      }

      // Mark in-flight to suppress any re-entry from a fast effect
      // re-run before the async resolves. The localStorage flag is
      // the durable record across sessions; this ref is only for the
      // current mount.
      firedRef.current = true;

      try {
        const fns = getFunctions();
        const fn = httpsCallable<unknown, { ok: boolean; scanned: number; updated: number; skipped: number }>(
          fns,
          "backfillMyActivityCategories",
        );
        const r = await fn({});
        if (cancelled) return;
        if (r.data?.ok) {
          try {
            localStorage.setItem(FLAG_KEY, "1");
          } catch {
            /* localStorage write failed — the migration ran but we
               can't persist the flag, so it'll re-run next session.
               Idempotent on the server side, so re-runs are safe
               just slightly wasteful. */
          }
        }
      } catch (err) {
        // Failure path: don't set the flag, so next session retries.
        // Most likely cause is the user being offline — no point
        // burning a slot on a transient failure.
        logger.warn("[OneTimeMaintenance] muscleGroupsBackfill skipped", err);
      }
    };

    void run();

    /* displayNameLower self-backfill.
       Adds the normalised lowercase mirror to the caller's public
       profile if missing. searchUsers queries displayNameLower as
       its primary path; without this, users whose profile predates
       the field are unfindable via case-insensitive search. Cheap:
       one read + at most one merge-write per user, gated by a
       localStorage flag. */
    const LOWER_FLAG = "tropos.displayNameLower.backfilled.v1";
    void (async () => {
      try {
        if (localStorage.getItem(LOWER_FLAG)) return;
      } catch {
        return;
      }
      try {
        const ref = doc(db, "users", user.uid, "public", "profile");
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (!snap.exists()) {
          // No public profile to migrate; mark done so we don't keep
          // hitting the read on every session.
          try { localStorage.setItem(LOWER_FLAG, "1"); } catch { /* ignore */ }
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const dn = typeof data.displayName === "string" ? data.displayName : "";
        const existingLower = data.displayNameLower;
        const targetLower = dn ? dn.toLowerCase() : "";
        if (existingLower !== targetLower) {
          await setDoc(ref, { displayNameLower: targetLower || null }, { merge: true });
        }
        try { localStorage.setItem(LOWER_FLAG, "1"); } catch { /* ignore */ }
      } catch (err) {
        logger.warn("[OneTimeMaintenance] displayNameLower backfill skipped", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
