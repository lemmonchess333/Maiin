import { Capacitor } from "@capacitor/core";
import { isNativePlatform } from "./platform";

/** Old installed shells do not gain a native plugin from a web deployment. */
export function isNativePushAvailable(): boolean {
  return (
    isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("FirebaseMessaging")
  );
}

async function messaging() {
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  return FirebaseMessaging;
}

export async function nativePushPermission(request = false): Promise<boolean> {
  if (!isNativePushAvailable()) return false;
  const plugin = await messaging();
  const result = request
    ? await plugin.requestPermissions()
    : await plugin.checkPermissions();
  return result.receive === "granted";
}

/** Inspect the native push permission without opening the system prompt. */
export async function nativePushPermissionState(): Promise<
  "granted" | "denied" | "default"
> {
  if (!isNativePushAvailable()) return "default";
  const result = await (await messaging()).checkPermissions();
  if (result.receive === "granted") return "granted";
  if (result.receive === "denied") return "denied";
  return "default";
}

/** Firebase's FCM token, never the APNs device token. */
export async function getNativePushToken(): Promise<string> {
  const plugin = await messaging();
  try {
    return (await plugin.getToken()).token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/apns.*token|token.*apns/i.test(message)) throw error;
    // A first launch can reach JS before Apple's registration callback. The
    // plugin retains that event until consumed; retry only this setup race.
    await new Promise<void>((resolve, reject) => {
      let stopped = false;
      let removeListener = () => {};
      const finish = (failure?: Error) => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timeout);
        removeListener();
        if (failure) reject(failure);
        else resolve();
      };
      const timeout = setTimeout(
        () =>
          finish(
            new Error("Apple push registration did not complete. Try again.")
          ),
        12_000
      );
      void plugin
        .addListener("apnsTokenReceived", () => finish())
        .then(
          (handle) => {
            removeListener = () => {
              void handle.remove();
            };
            if (stopped) removeListener();
          },
          () => finish(new Error("Apple push registration is unavailable."))
        );
    });
    return (await plugin.getToken()).token;
  }
}

export async function deleteNativePushToken(): Promise<void> {
  if (isNativePushAvailable()) await (await messaging()).deleteToken();
}

/** Native banners are presented by FirebaseMessaging's iOS configuration. */
export async function listenForNativePushRefresh(
  onRefresh: () => void
): Promise<() => void> {
  if (!isNativePushAvailable()) return () => {};
  const plugin = await messaging();
  const token = await plugin.addListener("tokenReceived", () => onRefresh());
  try {
    const { App } = await import("@capacitor/app");
    const resume = await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) onRefresh();
    });
    return () => {
      void token.remove();
      void resume.remove();
    };
  } catch (error) {
    await token.remove();
    throw error;
  }
}

export async function listenForNativePushActions(
  onTap: (data: unknown) => void
): Promise<() => void> {
  if (!isNativePushAvailable()) return () => {};
  const handle = await (
    await messaging()
  ).addListener("notificationActionPerformed", (event) => {
    if (event.actionId === "tap") onTap(event.notification.data);
  });
  return () => {
    void handle.remove();
  };
}
