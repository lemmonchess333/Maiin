/**
 * Keeps the RevenueCat App User ID in lockstep with the Firebase auth state —
 * IAP slice 2 (#1098). Log in (uid) on sign-in, log out on sign-out, so a
 * purchase made on one device's account is the same entitlement everywhere.
 *
 * No-op until the RC foundation exists (see src/lib/revenuecat.ts). Mounted
 * once via <RevenueCatIdentity/> high in the tree.
 */
import { useEffect, useRef } from "react";
import { useUid } from "@/lib/auth";
import { rcLogIn, rcLogOut } from "@/lib/revenuecat";

/** After a failed log-in: tried again 15 s, then 1 and 5 minutes later. It
 *  was tried once per account change, so one failure left RevenueCat on an
 *  anonymous id for the session, and a purchase made then did not reach
 *  the account. */
const RETRY_DELAYS_MS = [15_000, 60_000, 300_000];

export function useRevenueCatIdentity(): void {
  const uid = useUid();
  // onAuthStateChanged fires several times per sign-in (CLAUDE.md); only act on
  // an ACTUAL uid change so we don't re-logIn on every settle tick.
  const lastUidRef = useRef<string | null | undefined>(undefined);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    },
    []
  );

  useEffect(() => {
    if (uid === lastUidRef.current) return;
    lastUidRef.current = uid;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    if (!uid) {
      void rcLogOut();
      return;
    }
    let attempt = 0;
    const logIn = async () => {
      retryRef.current = null;
      // A later account change wins over a retry for this one.
      if (lastUidRef.current !== uid) return;
      if ((await rcLogIn(uid)) || lastUidRef.current !== uid) return;
      const delay = RETRY_DELAYS_MS[attempt++];
      if (delay !== undefined)
        retryRef.current = setTimeout(() => void logIn(), delay);
    };
    void logIn();
  }, [uid]);
}

/** Render-null mount point for the single session-wide RC identity sync. */
export function RevenueCatIdentity(): null {
  useRevenueCatIdentity();
  return null;
}
