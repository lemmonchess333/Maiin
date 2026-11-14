/**
 * Push consent contract (push arc #961, slice 8 / #969) — the SHAPE only.
 *
 * The doc stored at `users/{uid}/settings/push`, as the client reads and
 * writes it (`usePushSettings`, `pushNotifications`).
 *
 * Model (Q6): a global kill-switch + per-type consent. A type sends only when
 * the global switch AND that type's flag are both on. Global defaults OFF
 * (explicit opt-in — no cold sends); per-type default ON (so opting in to push
 * enables the standard set, which the user can then pare back). Monthly
 * challenge announcements and closing reminders have independent opt-ins
 * and both default OFF.
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
 *
 * `streak` and `recap` are old fields since App1 Q26 (13 November 2026):
 * the evening streak and Monday review reminders each have one switch and
 * one time in `settings/reminders` (`lib/reminderChoices.ts`), and these two
 * are read there as a fallback until those are written, and never written
 * again. `enabled` is now what tells the app that push carries those
 * reminders; Settings has no switch for it (the app turns it on, below).
 */
export type PushType =
  | "streak"
  | "recap"
  | "badge"
  | "challenges"
  | "challengeReminders";

export interface PushConsent {
  /** Global kill-switch. Off → no sender targets the user (tokens revoked). */
  enabled: boolean;
  streak: boolean;
  recap: boolean;
  badge: boolean;
  /** Separate opt-in: adding this type never enrolls existing push users. */
  challenges: boolean;
  /** Separate opt-in for one unfinished-goal reminder near month end. */
  challengeReminders: boolean;
}

export const DEFAULT_PUSH_CONSENT: PushConsent = {
  enabled: false,
  streak: true,
  recap: true,
  badge: true,
  challenges: false,
  challengeReminders: false,
};

/**
 * What the app writes when it turns push on by itself (App1 Q26): a reminder
 * push can carry was turned on, or a push-only kind was. Push on, and the
 * push-only kinds as they read while push was off, which is off, except
 * the one asked for: turning on the evening reminder never starts badge or
 * challenge alerts the person did not ask for. The old `streak` and `recap`
 * are not written.
 */
export function pushTurnedOn(
  asked: Partial<Pick<PushConsent, PushOnlyType>> = {}
): Partial<PushConsent> {
  return {
    enabled: true,
    badge: false,
    challenges: false,
    challengeReminders: false,
    ...asked,
  };
}

/** The kinds only the server can send: no time, no phone copy. */
export type PushOnlyType = "badge" | "challenges" | "challengeReminders";
