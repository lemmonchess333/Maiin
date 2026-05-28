import { useEffect, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
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

    /* displayNameLower self-backfill.
       Adds the normalised lowercase mirror to the caller's public
       profile if missing. searchUsers queries displayNameLower as
       its primary path; without this, users whose profile predates
       the field are unfindable via case-insensitive search. Cheap:
       one read + at most one merge-write per user, gated by a
       localStorage flag. */
    const LOWER_FLAG = "tropos.displayNameLower.backfilled.v1";
    const runLowerBackfill = async () => {
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
          await setDocGuarded(ref, { displayNameLower: targetLower || null }, { merge: true });
        }
        try { localStorage.setItem(LOWER_FLAG, "1"); } catch { /* ignore */ }
      } catch (err) {
        logger.warn("[OneTimeMaintenance] displayNameLower backfill skipped", err);
      }
    };

    // Debounce the migrations behind a short timer rather than firing on
    // the first `user` emission. onAuthStateChanged can emit several user
    // objects in the first seconds after sign-in (session restore, token
    // refresh, profile hydration); each one re-runs this effect. Without
    // the timer, the gap between the effect-top firedRef check and the
    // first await inside run() leaves a window where two near-simultaneous
    // emissions could both dispatch. Coalescing on a timer means only the
    // settled auth state runs the backfill — every earlier emission's
    // timer is cleared by cleanup before it fires. It also keeps this
    // background migration off the critical cold-start path, where the
    // home screen's own reads are contending for the network.
    //
    // firedRef is set inside the timer (not the effect body) so it marks
    // "dispatched", not merely "scheduled": a cleared timer leaves the ref
    // false so the next settled emission can still run. Once it fires, the
    // effect-top guard suppresses all further runs for this mount, and the
    // localStorage flags remain the durable cross-session record.
    const DEBOUNCE_MS = 800;
    const timer = setTimeout(() => {
      if (cancelled || firedRef.current) return;
      firedRef.current = true;
      void run();
      void runLowerBackfill();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  return null;
}
