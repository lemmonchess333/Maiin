import { useEffect, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
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
 *   liftVolumeRecredit.v1 — replays lift history through the volume
 *     metrics that credited zero while `totalVolume` was missing from
 *     the workout doc. Unlike the other two this is PAGED, so it also
 *     persists a resume cursor; see the block below.
 *
 * Mounted once in App.tsx alongside ShareComposerSheet.
 *
 * No UI surface intentional: users shouldn't have to learn about
 * internal data drift. New code that needs a similar one-time
 * migration should add a new flag here rather than introducing a
 * Settings button.
 */
export default function OneTimeMaintenance() {
  const uid = useUid();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!uid || firedRef.current) return;

    let cancelled = false;
    /* Keyed by uid. Both of these gate a per-ACCOUNT migration — one
       re-tags the caller's OWN activities, the other backfills the caller's
       OWN public profile — but localStorage is per-DEVICE, so an unscoped
       flag meant the FIRST account to sign in on a phone consumed the
       migration for every account after it. The header below has always
       said "fires once per user"; without the uid it fired once per
       DEVICE, and the second user's data stayed un-migrated permanently
       (the flag is only ever set, never cleared). */
    const FLAG_KEY = `${uid}:tropos.muscleGroupsBackfilled.v1`;

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
        const fn = httpsCallable<
          unknown,
          { ok: boolean; scanned: number; updated: number; skipped: number }
        >(fns, "backfillMyActivityCategories");
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

    /* liftVolumeRecredit.v1 — re-credits the lift volume that was never
       counted.

       `totalVolume` was computed client-side and written only onto the
       social activity post, never onto `users/{uid}/workouts/{id}`, so
       every server consumer read zero: the `total_volume` challenge
       metric, the hybrid score's kg term, and lifetime lift volume. The
       writers and consumers are fixed, but existing totals stay wrong
       until something replays the history — and that replay is a live-data
       action nobody was going to run by hand.

       Safe to replay because both guards failed OPEN rather than recording
       a false success (the callable's own header sets this out), so the
       markers it writes are the FIRST for these metrics; a second pass
       finds them and no-ops.

       PAGED, and the cursor is persisted. The callable scans one bounded
       page per invocation to stay inside its timeout, and a page-full
       response carries the id to resume from. The cursor is written to
       localStorage after every page so a session that ends mid-drain
       resumes where it stopped rather than restarting — without that, a
       history longer than MAX_PAGES could never finish, only re-do its
       first pages forever. */
    const RECREDIT_FLAG = `${uid}:tropos.liftVolumeRecredited.v1`;
    const RECREDIT_CURSOR = `${uid}:tropos.liftVolumeRecredit.cursor.v1`;
    /* A bound, not a budget: the loop normally ends on `truncated: false`.
       This only stops a runaway if the callable ever stopped advancing —
       which is exactly how the pre-#2048 version behaved, since it ignored
       the cursor and returned `truncated: true` forever. */
    const MAX_PAGES = 20;
    const runRecredit = async () => {
      try {
        if (localStorage.getItem(RECREDIT_FLAG)) return;
      } catch {
        return;
      }
      try {
        const fns = getFunctions();
        const fn = httpsCallable<
          { startAfter?: string },
          {
            ok: boolean;
            scanned: number;
            withVolume: number;
            lifetimeKg: number;
            truncated: boolean;
            cursor: string | null;
          }
        >(fns, "recreditMyLiftVolume");

        let cursor: string | null = null;
        try {
          cursor = localStorage.getItem(RECREDIT_CURSOR);
        } catch {
          /* no stored cursor — start from the first page */
        }

        for (let page = 0; page < MAX_PAGES; page++) {
          const r = await fn(cursor ? { startAfter: cursor } : {});
          if (cancelled) return;
          if (!r.data?.ok) return;
          cursor = r.data.cursor;
          if (!r.data.truncated) {
            try {
              localStorage.setItem(RECREDIT_FLAG, "1");
              localStorage.removeItem(RECREDIT_CURSOR);
            } catch {
              /* Flag unwritable: the replay ran, we just can't record it.
                 Next session re-runs and the markers make it a no-op. */
            }
            return;
          }
          try {
            if (cursor) localStorage.setItem(RECREDIT_CURSOR, cursor);
          } catch {
            /* Cursor unwritable: this drain still completes in-memory; only
               a mid-drain interruption would restart from the beginning. */
          }
        }
        logger.warn(
          "[OneTimeMaintenance] liftVolumeRecredit hit the page bound; resuming next session"
        );
      } catch (err) {
        // No flag set, so the next session retries. Offline is the usual
        // cause and the persisted cursor means a retry resumes.
        logger.warn("[OneTimeMaintenance] liftVolumeRecredit skipped", err);
      }
    };

    /* displayNameLower self-backfill.
       Adds the normalised lowercase mirror to the caller's public
       profile if missing. searchUsers queries displayNameLower as
       its primary path; without this, users whose profile predates
       the field are unfindable via case-insensitive search. Cheap:
       one read + at most one merge-write per user, gated by a
       localStorage flag. */
    const LOWER_FLAG = `${uid}:tropos.displayNameLower.backfilled.v1`;
    const runLowerBackfill = async () => {
      try {
        if (localStorage.getItem(LOWER_FLAG)) return;
      } catch {
        return;
      }
      try {
        const ref = doc(db, "users", uid, "public", "profile");
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (!snap.exists()) {
          // No public profile to migrate; mark done so we don't keep
          // hitting the read on every session.
          try {
            localStorage.setItem(LOWER_FLAG, "1");
          } catch {
            /* ignore */
          }
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const dn = typeof data.displayName === "string" ? data.displayName : "";
        const existingLower = data.displayNameLower;
        const targetLower = dn ? dn.toLowerCase() : "";
        if (existingLower !== targetLower) {
          await setDocGuarded(
            ref,
            { displayNameLower: targetLower || null },
            { merge: true }
          );
        }
        try {
          localStorage.setItem(LOWER_FLAG, "1");
        } catch {
          /* ignore */
        }
      } catch (err) {
        logger.warn(
          "[OneTimeMaintenance] displayNameLower backfill skipped",
          err
        );
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
      void runRecredit();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uid]);

  return null;
}
