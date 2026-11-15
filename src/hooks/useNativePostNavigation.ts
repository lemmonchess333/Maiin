import { useEffect, useEffectEvent, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";
import { isNativePlatform } from "@/lib/platform";

/**
 * A shared post's link, tapped on a phone with Tropos (App1 Q51), opens
 * the post in the app. The link is held until the app is ready for it
 * (signed in, setup done), so a link that wakes a signed-out app opens the
 * post once the person is in.
 */
export function useNativePostNavigation(ready: boolean): void {
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  const consume = useEffectEvent(() => {
    if (!ready || !pending.current) return;
    const route = pending.current;
    pending.current = null;
    void navigate(route);
  });
  const receive = useEffectEvent((route: string) => {
    pending.current = route;
    consume();
  });
  useEffect(() => {
    consume();
  }, [ready]);
  useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;
    let stop = () => {};
    void import("@/lib/nativePostLinks")
      .then(({ listenForNativePostLinks }) =>
        listenForNativePostLinks((route) => {
          if (!cancelled) receive(route);
        })
      )
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch(() =>
        logger.warn("[post-links] native link listener unavailable")
      );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
}
