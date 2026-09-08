/** Fail closed before the capture script creates an Admin SDK client or
 * launches a browser. This harness may mutate only its disposable fixture. */
export function assertVisualCaptureEnvironment(env = process.env) {
  const localHost = (value, port) =>
    value === `127.0.0.1:${port}` || value === `localhost:${port}`;
  if (
    env.E2E_AUTH_EMULATOR !== "1" ||
    env.GCLOUD_PROJECT !== "demo-tropos" ||
    !localHost(env.FIREBASE_AUTH_EMULATOR_HOST, 9099) ||
    !localHost(env.FIRESTORE_EMULATOR_HOST, 8080)
  ) {
    throw new Error(
      "Visual capture requires E2E_AUTH_EMULATOR=1, GCLOUD_PROJECT=demo-tropos, " +
        "and local Auth (9099) / Firestore (8080) emulator hosts. " +
        "Refusing to initialize Firebase or capture against another destination."
    );
  }
}
