import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";

/**
 * Opens the page a tapped Home Screen or Lock Screen widget names (Wid1):
 * today's session in Train, Food, or Home (`widgetLinks.ts`). A tap that
 * starts the app is held until sign-in and setup are done, as a tapped
 * notification's is (`useLocalNotificationNavigation`). The links module
 * loads on the phone only.
 */
export function useWidgetLinkNavigation(ready: boolean): void {
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
    if (!isNativePlatform()) return;
    let cancelled = false;
    let stop = () => {};
    void import("@/lib/widgetLinks")
      .then(({ listenForWidgetLinks }) =>
        listenForWidgetLinks((route) => {
          if (cancelled) return;
          pending.current = route;
          consume();
        })
      )
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch((error) => {
        if (!cancelled) logger.warn("[widgets] link listener failed", error);
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [consume]);
}
