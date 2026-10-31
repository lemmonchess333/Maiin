import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";

/** The app paths a local notification may open. The app writes them, but
 *  a tap is input like any other: anything else opens nothing. */
const LOCAL_NOTIFICATION_ROUTES = new Set(["/review"]);

export function localNotificationRoute(route: unknown): string | null {
  return typeof route === "string" && LOCAL_NOTIFICATION_ROUTES.has(route)
    ? route
    : null;
}

/**
 * Opens the page a tapped local notification names (the Monday review's
 * `/review`), on the phone and on the web, as useNativePushNavigation does
 * for a push. A tap that starts the app is held until Auth and the router
 * are ready. The notifications module loads on its own, so the app's
 * first chunk does not carry the plugin.
 */
export function useLocalNotificationNavigation(ready: boolean): void {
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  const consume = useCallback(() => {
    if (!ready || pending.current === null) return;
    const route = pending.current;
    pending.current = null;
    void navigate(route);
  }, [ready, navigate]);

  useEffect(() => {
    consume();
  }, [consume]);
  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    void import("@/lib/notifications")
      .then(({ listenForNotificationRoutes }) =>
        listenForNotificationRoutes((tapped) => {
          const route = localNotificationRoute(tapped);
          if (cancelled || !route) return;
          pending.current = route;
          consume();
        })
      )
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch((error) => {
        if (!cancelled)
          logger.warn("[notifications] tap listener failed", error);
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [consume]);
}
