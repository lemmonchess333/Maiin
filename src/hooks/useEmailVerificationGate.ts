/**
 * Per-surface state for the verified-email gate on public writes.
 *
 * `needsVerification` mirrors `needsEmailVerification(user)`; `recheck` is
 * the "I have verified" action. It reloads the Auth user — the SDK does not
 * notice a verification made in another tab or on another device — and then
 * forces an ID-token refresh, because the Firestore SDK reuses a cached
 * token until it expires: without the refresh the rules would keep seeing
 * `email_verified: false` for up to an hour after the link was tapped.
 * `reload()` mutates the User in place and fires no auth-state event, so
 * the confirmed snapshot is what re-renders the surface that asked.
 *
 * A failed reload or token refresh rejects the check. Never announce success
 * or enable a public write while the server may still see an unverified token.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { needsEmailVerification } from "@/lib/emailVerificationGate";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";

/* The account this session has seen needing verification, shared by every
   gate: whichever one then confirms the address reports `email_verified`,
   once. The App-level check on returning from Mail, Home's "I've verified"
   and Settings' all count. Someone who confirms while the app is closed
   opens it already verified, which looks the same as an account that never
   needed it, so the count is a floor. */
let awaitingVerification: string | null = null;

export function useEmailVerificationGate(
  user: User | null | undefined,
  checkOnResume = false
) {
  const currentUser = useRef(user);
  const [check, setCheck] = useState<{ user: User; verified: boolean } | null>(
    null
  );
  useEffect(() => {
    currentUser.current = user;
    return () => {
      currentUser.current = null;
    };
  }, [user]);
  // reload() mutates User in place, including when the subsequent token
  // refresh fails. Keep that mutation from prematurely opening the gate.
  const emailVerified =
    !!user?.emailVerified && (check?.user !== user || check.verified);
  const needsVerification = needsEmailVerification(
    user ? { providerData: user.providerData, emailVerified } : user
  );

  const recheck = useCallback(async (): Promise<boolean> => {
    if (!user || currentUser.current !== user) return false;
    setCheck({ user, verified: false });
    await user.reload();
    if (user.emailVerified) {
      await user.getIdToken(true);
    }
    if (currentUser.current !== user) {
      throw new Error(
        "Account changed. Check verification for your current account."
      );
    }
    setCheck({ user, verified: user.emailVerified });
    if (user.emailVerified && awaitingVerification === user.uid) {
      awaitingVerification = null;
      trackLifecycle("email_verified", { method: "email" });
    }
    return user.emailVerified;
  }, [user]);

  const uid = user?.uid;
  useEffect(() => {
    if (needsVerification && uid) awaitingVerification = uid;
  }, [needsVerification, uid]);

  useEffect(() => {
    if (!checkOnResume || !needsVerification) return;
    let active = true;
    let checking = false;
    const check = () => {
      if (!active || checking || document.visibilityState === "hidden") return;
      checking = true;
      void recheck()
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    let removeNative: (() => void) | undefined;
    void import("@capacitor/core")
      .then(async ({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (isActive) check();
          }
        );
        if (!active) void listener.remove();
        else
          removeNative = () => {
            void listener.remove();
          };
      })
      .catch(() => {});
    check();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      removeNative?.();
    };
  }, [checkOnResume, needsVerification, recheck]);

  return { needsVerification, emailVerified, recheck };
}
