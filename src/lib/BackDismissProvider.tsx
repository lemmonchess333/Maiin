/**
 * BackDismissProvider — maintains a LIFO stack of overlay "dismissers" and the
 * back interceptors so the device/browser back affordance closes the topmost
 * open overlay instead of navigating the route away.
 *
 *   - NATIVE (Android): a Capacitor `@capacitor/app` backButton listener →
 *     dispatchBack(); if handled, swallow; else route back / exit.
 *   - WEB: a history-sentinel + popstate scheme (the platform has no back
 *     event). The pure accounting lives in `webBackController`; this binds it to
 *     the real history API and supplies the router-aware `wasNavigation` signal
 *     (compare location at open vs close) so the navigate-from-overlay case
 *     doesn't undo a navigation.
 *   - iOS: no back affordance (no hardware back; WKWebView swipe-back-nav off by
 *     default) → neither interceptor fires; overlays dismiss via backdrop/X.
 *
 * See `scratchpad/spec-back-dismiss.md`.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";
import { createWebBackController } from "./webBackController";
import { BackDismissContext, type BackDismissApi } from "./backDismiss";

/** Lazy handle to the Capacitor App plugin. Dynamic import keeps the native
 *  plugin out of the web bundle; the holder hides Capacitor's proxy from
 *  thenable-probing (same guard as lib/haptic.ts's loadNativeHaptics). */
type CapacitorAppPlugin = {
  addListener: (
    event: "backButton",
    cb: (ev: { canGoBack?: boolean }) => void
  ) => Promise<{ remove: () => void }>;
  exitApp: () => Promise<void>;
};
let appPluginPromise: Promise<{ plugin: CapacitorAppPlugin } | null> | null =
  null;
function loadCapacitorApp(): Promise<{ plugin: CapacitorAppPlugin } | null> {
  if (appPluginPromise) return appPluginPromise;
  appPluginPromise = import("@capacitor/app")
    .then((mod) => {
      const m = mod as unknown as { App?: CapacitorAppPlugin };
      return m?.App ? { plugin: m.App } : null;
    })
    .catch(() => null);
  return appPluginPromise;
}

interface StackEntry {
  id: number;
  handler: () => void;
  /** Set true when a web popstate is closing this entry, so its unregister
   *  tells the controller the sentinel was already popped by the user. */
  viaBack: boolean;
  /** Route pathname when the overlay opened — compared at close to detect the
   *  navigate-from-overlay case (web only). */
  openPath: string;
}

export function BackDismissProvider({ children }: { children: ReactNode }) {
  // Monotonic id + the live LIFO stack. Refs (not state) so the interceptors
  // always read the current top without re-subscribing.
  const nextId = useRef(0);
  const stack = useRef<StackEntry[]>([]);

  // Latest route pathname, read synchronously in register/unregister.
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  // WEB sentinel controller (null on native — native uses the backButton
  // listener, not history sentinels). Stable for the provider's lifetime.
  const webController = useMemo(
    () =>
      isNativePlatform()
        ? null
        : createWebBackController({
            pushSentinel: () =>
              window.history.pushState({ __overlayDismiss: true }, ""),
            back: () => window.history.back(),
          }),
    []
  );

  const register = useCallback(
    (handler: () => void) => {
      const id = nextId.current++;
      const entry: StackEntry = {
        id,
        handler,
        viaBack: false,
        openPath: pathRef.current,
      };
      stack.current.push(entry);
      webController?.onOpen();
      return () => {
        stack.current = stack.current.filter((e) => e.id !== id);
        webController?.onClose(
          entry.viaBack,
          pathRef.current !== entry.openPath
        );
      };
    },
    [webController]
  );

  const dispatchBack = useCallback(() => {
    const top = stack.current[stack.current.length - 1];
    if (!top) return false;
    // Registering the native backButton listener suppresses Android's default
    // back, so a throwing handler must not be allowed to brick the button
    // (no dismiss, no navigate, no exit). Swallow + log: the overlay stays
    // (recoverable via its on-screen close) rather than the app going dead.
    try {
      top.handler();
    } catch (err) {
      logger.error("[backDismiss] dismiss handler threw", err);
    }
    return true;
  }, []);

  // NATIVE (Android) interceptor.
  useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;
    let handle: { remove: () => void } | null = null;
    void loadCapacitorApp().then((holder) => {
      if (!holder || cancelled) return;
      holder.plugin
        .addListener("backButton", ({ canGoBack }) => {
          if (dispatchBack()) return; // an overlay closed — swallow the back
          if (canGoBack) window.history.back();
          else void holder.plugin.exitApp();
        })
        .then((h) => {
          if (cancelled) h.remove();
          else handle = h;
        });
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [dispatchBack]);

  // WEB interceptor: a popstate that the controller says was a user back on a
  // sentinel closes the topmost not-already-closing overlay.
  useEffect(() => {
    if (!webController) return;
    const onPop = () => {
      if (webController.onPop() !== "close-top") return;
      for (let i = stack.current.length - 1; i >= 0; i--) {
        const entry = stack.current[i];
        if (entry.viaBack) continue; // already closing via an earlier back
        entry.viaBack = true;
        try {
          entry.handler();
        } catch (err) {
          logger.error("[backDismiss] web dismiss handler threw", err);
        }
        return;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [webController]);

  const api = useMemo<BackDismissApi>(
    () => ({ register, dispatchBack }),
    [register, dispatchBack]
  );
  return (
    <BackDismissContext.Provider value={api}>
      {children}
    </BackDismissContext.Provider>
  );
}
