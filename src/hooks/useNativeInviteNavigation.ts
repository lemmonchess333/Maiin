import { useEffect, useEffectEvent, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { readPendingInvite, savePendingInvite } from "@/lib/pendingInvite";
import { logger } from "@/lib/logger";
import { isNativePlatform } from "@/lib/platform";

/** Keep the invite through sign-in/setup. Existing accounts confirm in People. */
export function useNativeInviteNavigation(
  ready: boolean,
  inSetup = false
): void {
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  const consume = useEffectEvent(() => {
    if (inSetup) {
      // Setup owns redemption; do not race its async finish by opening People.
      pending.current = null;
      return;
    }
    if (!ready || !pending.current) return;
    const code = pending.current;
    pending.current = null;
    // Setup may already have redeemed and cleared this invite.
    if (readPendingInvite() === code) void navigate("/social?tab=find");
  });
  const receive = useEffectEvent((code: string) => {
    savePendingInvite(code);
    if (readPendingInvite() !== code) return;
    pending.current = code;
    consume();
  });
  useEffect(() => {
    consume();
  }, [ready, inSetup]);
  useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;
    let stop = () => {};
    void import("@/lib/nativeInviteLinks")
      .then(({ listenForNativeInvites }) =>
        listenForNativeInvites((code) => {
          if (cancelled) return false;
          receive(code);
          return true;
        })
      )
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch(() => logger.warn("[invites] native link listener unavailable"));
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
}
