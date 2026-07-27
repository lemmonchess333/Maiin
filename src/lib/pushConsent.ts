/**
 * Push consent contract (push arc #961, slice 8 / #969) — the SHAPE only.
 *
 * The doc stored at `users/{uid}/settings/push`, as the client reads and
 * writes it (`usePushSettings`, `pushNotifications`).
 *
 * Model (Q6): a global kill-switch + per-type consent. A type sends only when
 * the global switch AND that type's flag are both on. Global defaults OFF
 * (explicit opt-in — no cold sends); per-type default ON (so opting in to push
 * enables the standard set, which the user can then pare back).
 *
 * The PREDICATE that enforces that model is NOT here. This header used to
 * claim "the senders import `mayTargetUser` directly and table-test it" — but
 * the senders are Cloud Functions, which cannot import TypeScript, and they
 * were running a hand-copied duplicate. The exported `mayTargetUser` had no
 * callers at all, so the tested copy was the dead one and the copy deciding
 * real pushes had no tests. It now lives, and is tested, where it runs:
 * `functions/lib/pushConsent.js` + `functions/__tests__/pushConsent.test.js`.
 *
 * Keep it that way. "May a server sender target this user?" is a server
 * question; a client-side answer to it can only ever drift out of sight.
 */
export type PushType = "streak" | "recap" | "badge";

export interface PushConsent {
  /** Global kill-switch. Off → no sender targets the user (tokens revoked). */
  enabled: boolean;
  streak: boolean;
  recap: boolean;
  badge: boolean;
}

export const DEFAULT_PUSH_CONSENT: PushConsent = {
  enabled: false,
  streak: true,
  recap: true,
  badge: true,
};
