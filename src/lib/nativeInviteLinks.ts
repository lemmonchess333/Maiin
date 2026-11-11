import { isNativePlatform } from "@/lib/platform";
import { INVITE_PARAM, PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";
import { normaliseInviteCode } from "@/lib/inviteCode";

/** Native URL events are untrusted input, not arbitrary routes to navigate. */
export function nativeInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  try {
    const url = new URL(input);
    if (
      url.origin !== PUBLIC_APP_ORIGIN ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.searchParams.getAll(INVITE_PARAM).length !== 1
    ) {
      return null;
    }
    return normaliseInviteCode(url.searchParams.get(INVITE_PARAM));
  } catch {
    return null;
  }
}

// Capacitor retains the launch URL. Reading it on every subscriber mount
// would restore a code already used or overwrite a newer warm link.
let launchConsumed = false;
let launchQuery: Promise<{ url: string } | undefined> | undefined;

/** Listen first, then check cold launch; a newer warm event always wins. */
export async function listenForNativeInvites(
  onCode: (code: string) => boolean
): Promise<() => void> {
  if (!isNativePlatform()) return () => {};
  const { App } = await import("@capacitor/app");
  let live = true;
  let receivedWarmInvite = false;
  const listener = await App.addListener("appUrlOpen", ({ url }) => {
    const code = nativeInviteCode(url);
    if (!live || !code) return;
    if (onCode(code)) {
      receivedWarmInvite = true;
      launchConsumed = true;
    }
  });
  if (!launchConsumed) {
    // Do not wait to return the unsubscribe handle: StrictMode/unmount can
    // remove the listener even while the native launch query is pending.
    launchQuery ??= App.getLaunchUrl();
    void launchQuery
      .then((launch) => {
        const code = nativeInviteCode(launch?.url);
        if (
          live &&
          !launchConsumed &&
          !receivedWarmInvite &&
          code &&
          onCode(code)
        ) {
          launchConsumed = true;
        }
      })
      .catch(() => {});
  }
  return () => {
    live = false;
    void listener.remove().catch(() => {});
  };
}
