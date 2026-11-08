import { CustomProvider } from "firebase/app-check";
import { setNativeAppCheckProvider } from "./appCheck";
import { isNativePlatform } from "./platform";
import { traceBoot } from "./bootTrace";

/**
 * How long a token request may take before the app carries on without one.
 *
 * Every Auth, Firestore and Functions request waits for an App Check token
 * before it is sent, and Auth gives up on the whole request at 30 seconds,
 * calling it a network failure. On the first TestFlight builds (2026-11-08)
 * Google sign-in failed exactly so: the account picker, then 30 seconds,
 * then "Network issue". Enforcement is off (docs/app-check-rollout.md), so a
 * request without a token still succeeds; one that never leaves fails. A
 * token request that stalls now fails at this limit, and Firebase's App
 * Check sends the request on without it, as it does for any provider error.
 */
export const NATIVE_APP_CHECK_TIMEOUT_MS = 8_000;

function withinLimit<T>(work: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${what} took over ${NATIVE_APP_CHECK_TIMEOUT_MS / 1000} s; carrying on without App Check`
        )
      );
    }, NATIVE_APP_CHECK_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Register synchronously before Firebase services are created. The plugin
 * loads only when the native CustomProvider actually requests a token. */
export function registerNativeAppCheck(): void {
  if (!isNativePlatform()) return;
  // A holder, never the plugin: a promise resolved with a Capacitor plugin
  // calls its `then` on the native side and never settles. Set-up stalled
  // here on every request of the first TestFlight builds (2026-11-08), and
  // each Auth request then waited out the 8-second limit below.
  let ready: Promise<{
    plugin: (typeof import("@capacitor-firebase/app-check"))["FirebaseAppCheck"];
  }> | null = null;
  setNativeAppCheckProvider(
    () =>
      new CustomProvider({
        getToken: async () => {
          const started = Date.now();
          traceBoot("App Check: asking for a token");
          ready ??= import("@capacitor-firebase/app-check")
            .then(async ({ FirebaseAppCheck }) => {
              // Real attestation in every release; debug secrets never cross JS.
              await FirebaseAppCheck.initialize({
                isTokenAutoRefreshEnabled: true,
                debugToken: false,
              });
              return { plugin: FirebaseAppCheck };
            })
            .catch((error: unknown) => {
              ready = null;
              throw error;
            });
          let token: string | undefined;
          let expireTimeMillis: number | undefined;
          try {
            const pendingSetUp = ready;
            const { plugin: native } = await withinLimit(
              pendingSetUp,
              "App Check set-up"
            ).catch((error: unknown) => {
              // A set-up that stalled is asked again next time, as one that
              // failed already is.
              if (ready === pendingSetUp) ready = null;
              throw error;
            });
            ({ token, expireTimeMillis } = await withinLimit(
              native.getToken({ forceRefresh: true }),
              "App Check token"
            ));
          } catch (error) {
            traceBoot(
              `App Check failed after ${Date.now() - started} ms: ${message(error)}`
            );
            throw error;
          }
          traceBoot(`App Check token in ${Date.now() - started} ms`);
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
