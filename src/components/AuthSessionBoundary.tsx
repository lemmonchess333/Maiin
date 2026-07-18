import { Fragment, type ReactNode } from "react";

/**
 * HOME-ACCOUNT-01 — per-account remount boundary for the authenticated
 * app subtree.
 *
 * On a shared browser, switching accounts (sign out of A, sign in as B)
 * can leave `AppRoutes` mounted while only the `user` identity changes —
 * `onAuthStateChanged` can transition A → B without an intervening null.
 * Every authenticated-root provider (StreaksProvider, DailyLogsProvider,
 * RemindersProvider, SurfaceCoordinatorProvider, …) and every page holds
 * per-user Firestore subscriptions and cached React state; without a
 * remount, account B can briefly render account A's cached data.
 *
 * Keying the subtree by uid forces React to unmount account A's tree and
 * mount a fresh one for B whenever the uid changes — a single, robust
 * guarantee that no in-memory account state crosses the boundary,
 * independent of each provider's own cleanup. (The individual hooks are
 * still uid/generation-owned; this is defence in depth at the root.)
 *
 * A full page reload isn't relied upon: native (Capacitor) sign-in/out
 * doesn't reload the WebView, so the boundary is what makes the switch
 * clean on the platform the real users are on.
 */
export default function AuthSessionBoundary({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  return <Fragment key={uid}>{children}</Fragment>;
}
