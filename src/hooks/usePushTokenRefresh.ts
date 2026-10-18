import { useEffect } from "react";
import { useUid } from "@/lib/auth";
import {
  refreshDeviceTokenForCurrentUser,
  getPushTokenLifecycleGeneration,
  onPushTokenLifecycleReady,
} from "@/lib/pushNotifications";
import { listenForNativePushRefresh } from "@/lib/nativePush";
import { logger } from "@/lib/logger";

/**
 * Non-prompting FCM token refresh (packet 17). Refreshes a rotated token on
 * sign-in and each foreground, but only when stored server consent is enabled
 * and browser permission is already granted (refreshDeviceTokenForCurrentUser
 * never prompts). Changing uid removes the old visibility listener and never
 * refreshes the old uid again.
 */
export function usePushTokenRefresh(): void {
  const uid = useUid();

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let stopNative = () => {};

    const refresh = () => {
      if (cancelled) return;
      void refreshDeviceTokenForCurrentUser(
        uid,
        getPushTokenLifecycleGeneration()
      );
    };

    refresh();
    const stopLifecycle = onPushTokenLifecycleReady(refresh);
    void listenForNativePushRefresh(refresh)
      .then((stop) => {
        if (cancelled) stop();
        else stopNative = stop;
      })
      .catch((error) => {
        if (!cancelled)
          logger.warn("[push] native token refresh listener failed", error);
      });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stopNative();
      stopLifecycle();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [uid]);
}
