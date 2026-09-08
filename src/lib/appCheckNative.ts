import { CustomProvider } from "firebase/app-check";
import { setNativeAppCheckProvider } from "./appCheck";
import { isNativePlatform } from "./platform";

/** Register synchronously before Firebase services are created. The plugin
 * loads only when the native CustomProvider actually requests a token. */
export function registerNativeAppCheck(): void {
  if (!isNativePlatform()) return;
  let ready: Promise<
    (typeof import("@capacitor-firebase/app-check"))["FirebaseAppCheck"]
  > | null = null;
  setNativeAppCheckProvider(
    () =>
      new CustomProvider({
        getToken: async () => {
          ready ??= import("@capacitor-firebase/app-check")
            .then(async ({ FirebaseAppCheck }) => {
              // Real attestation in every release; debug secrets never cross JS.
              await FirebaseAppCheck.initialize({
                isTokenAutoRefreshEnabled: true,
                debugToken: false,
              });
              return FirebaseAppCheck;
            })
            .catch((error: unknown) => {
              ready = null;
              throw error;
            });
          const native = await ready;
          const { token, expireTimeMillis } = await native.getToken({
            forceRefresh: true,
          });
          // Never invent a one-hour expiry: Firebase's configured TTL can differ.
          if (
            !token ||
            !Number.isFinite(expireTimeMillis) ||
            expireTimeMillis! <= Date.now()
          ) {
            throw new Error(
              "Native App Check returned an invalid or expired token"
            );
          }
          return { token, expireTimeMillis: expireTimeMillis! };
        },
      })
  );
}
