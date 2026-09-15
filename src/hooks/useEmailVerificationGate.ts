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
    return user.emailVerified;
  }, [user]);

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
