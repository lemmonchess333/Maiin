import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { refreshDeviceTokenForCurrentUser } from "@/lib/pushNotifications";

/**
 * Non-prompting FCM token refresh (packet 17). Refreshes a rotated token on
 * sign-in and each foreground, but only when stored server consent is enabled
 * and browser permission is already granted (refreshDeviceTokenForCurrentUser
 * never prompts). Changing uid removes the old visibility listener and never
 * refreshes the old uid again.
 */
export function usePushTokenRefresh(): void {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const refresh = () => {
      if (cancelled) return;
      void refreshDeviceTokenForCurrentUser(uid);
    };

    refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [uid]);
}
