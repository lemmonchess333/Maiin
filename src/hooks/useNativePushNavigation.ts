import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { listenForNativePushActions } from "@/lib/nativePush";
import { nativePushRoute } from "@/lib/nativePushRoute";
import { logger } from "@/lib/logger";

/** Hold a cold-start tap until Auth and the router are ready. */
export function useNativePushNavigation(
  uid: string | null,
  ready: boolean
): void {
  const navigate = useNavigate();
  const pending = useRef<unknown>(null);
  const consume = useCallback(() => {
    if (!uid || !ready || pending.current === null) return;
    const data = pending.current;
    pending.current = null;
    const route = nativePushRoute(data, uid);
    if (route) void navigate(route);
  }, [uid, ready, navigate]);

  useEffect(() => {
    consume();
  }, [consume]);
  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    void listenForNativePushActions((data) => {
      if (cancelled) return;
      pending.current = data;
      consume();
    })
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch((error) => {
        if (!cancelled)
          logger.warn("[push] native notification tap listener failed", error);
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [consume]);
}
