/**
 * Load one saved session document, distinguishing the three ways it can
 * fail to appear.
 *
 * Both detail pages collapsed states that need different words and
 * different actions:
 *
 *   RunDetail had no `.catch()` at all and used `!run` AS its loading
 *   state, so a deleted run, a permission error and a dropped connection
 *   were all "Loading run", forever.
 *
 *   WorkoutDetail caught the error and dropped it — the comment said
 *   "leave `workout` null — the not-found state below covers it" — so a
 *   failed read told the user their workout "may have been deleted, or
 *   the link belongs to another account". Both halves of that sentence
 *   are false when the network dropped, and the second one accuses the
 *   user of following someone else's link.
 *
 * The distinction is not cosmetic: MISSING is terminal and the only
 * useful action is to leave, while FAILED is transient and the useful
 * action is to try again. A retry button on a genuinely deleted session
 * is a button that can never work.
 *
 * `uid` null means auth has not resolved yet, which is LOADING rather
 * than missing — the route guards keep signed-out users away from these
 * pages, so a null uid here is a window, not a verdict. A null `id` is a
 * malformed URL and IS missing.
 */
import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";

export type SessionDocStatus = "loading" | "ready" | "missing" | "failed";

export interface SessionDoc<T> {
  status: SessionDocStatus;
  data: T | null;
  /** Re-runs the read. A no-op unless the status is `failed`. */
  retry: () => void;
  /** Replace the loaded document in place (optimistic local edits). */
  setData: (next: T) => void;
}

export function useSessionDoc<T extends { id: string }>(
  uid: string | null | undefined,
  collection: "runs" | "workouts",
  id: string | null | undefined
): SessionDoc<T> {
  /* Bumping this re-runs the read. A boolean "retrying" flag could not do
     that twice in a row: after one failed retry it would already be true,
     the effect would not re-run, and the second tap would look like a dead
     button — on exactly the flaky connection where a user taps twice. */
  const [attempt, setAttempt] = useState(0);
  const [override, setOverride] = useState<T | null>(null);

  /* The identity of the read currently in flight. A settled result carries
     the key it came from, so a result belonging to a PREVIOUS uid / id /
     attempt is ignored rather than shown against the new one. */
  const key = uid && id ? `${uid}/${collection}/${id}#${attempt}` : null;
  const [settled, setSettled] = useState<{
    key: string;
    status: "ready" | "missing" | "failed";
    data: T | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !uid || !id) return;
    let cancelled = false;
    getDoc(doc(db, "users", uid, collection, id))
      .then((snap) => {
        if (cancelled) return;
        setSettled(
          snap.exists()
            ? {
                key,
                status: "ready",
                data: { ...snap.data(), id: snap.id } as T,
              }
            : { key, status: "missing", data: null }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // Logged rather than swallowed: a read failing for every user of a
        // collection is an incident, and the old code left no trace of it.
        logger.error(`useSessionDoc: ${collection}/${id} read failed`, err);
        setSettled({ key, status: "failed", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, uid, collection, id]);

  /* Derived, not stored. The two synchronous verdicts — a malformed URL is
     missing, an unresolved uid is still loading — are facts about the
     current props, so computing them here avoids both a setState in the
     effect body and the frame of stale status that comes with one. */
  const status: SessionDocStatus = !id
    ? "missing"
    : !uid || !settled || settled.key !== key
      ? "loading"
      : settled.status;

  const data =
    override ??
    (settled && settled.key === key && settled.status === "ready"
      ? settled.data
      : null);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, data, retry, setData: setOverride };
}
