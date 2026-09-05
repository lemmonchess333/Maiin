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
 * the tick is what re-renders the surface that asked.
 *
 * Offline, the reload fails and the current state stands; the token refresh
 * is attempted only once the account reads verified.
 */
import { useCallback, useState } from "react";
import type { User } from "firebase/auth";
import { needsEmailVerification } from "@/lib/emailVerificationGate";

export function useEmailVerificationGate(user: User | null | undefined) {
  const [, setTick] = useState(0);
  const needsVerification = needsEmailVerification(user);

  const recheck = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      await user.reload();
    } catch {
      /* offline — fall through to the state the SDK already has */
    }
    if (user.emailVerified) {
      try {
        await user.getIdToken(true);
      } catch {
        /* the next request refreshes it; the rules read the token, not this */
      }
    }
    setTick((t) => t + 1);
    return user.emailVerified;
  }, [user]);

  return { needsVerification, recheck };
}
