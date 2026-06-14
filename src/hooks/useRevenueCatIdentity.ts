/**
 * Keeps the RevenueCat App User ID in lockstep with the Firebase auth state —
 * IAP slice 2 (#1098). Log in (uid) on sign-in, log out on sign-out, so a
 * purchase made on one device's account is the same entitlement everywhere.
 *
 * No-op until the RC foundation exists (see src/lib/revenuecat.ts). Mounted
 * once via <RevenueCatIdentity/> high in the tree.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { rcLogIn, rcLogOut } from "@/lib/revenuecat";

export function useRevenueCatIdentity(): void {
  const { user } = useAuth();
  // onAuthStateChanged fires several times per sign-in (CLAUDE.md); only act on
  // an ACTUAL uid change so we don't re-logIn on every settle tick.
  const lastUidRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (uid === lastUidRef.current) return;
    lastUidRef.current = uid;
    if (uid) void rcLogIn(uid);
    else void rcLogOut();
  }, [user]);
}

/** Render-null mount point for the single session-wide RC identity sync. */
export function RevenueCatIdentity(): null {
  useRevenueCatIdentity();
  return null;
}
