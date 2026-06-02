/**
 * Push consent contract (push arc #961, slice 8 / #969).
 *
 * The server-readable shape stored at `users/{uid}/settings/push`, plus the
 * pure predicate EVERY server sender gates on. Pure — no Firestore, no SDK —
 * so the senders (#966 streak, recap, badge) import `mayTargetUser` directly
 * and table-test it.
 *
 * Model (Q6): a global kill-switch + per-type consent. A type sends only when
 * the global switch AND that type's flag are both on. Global defaults OFF
 * (explicit opt-in — no cold sends); per-type default ON (so opting in to push
 * enables the standard set, which the user can then pare back).
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

/**
 * May a server sender of `type` target a user with this consent? True only
 * when the global switch is on AND the per-type flag isn't explicitly off
 * (absent type flag → on, so older docs default to the standard set).
 */
export function mayTargetUser(
  consent: Partial<PushConsent> | null | undefined,
  type: PushType
): boolean {
  if (!consent || !consent.enabled) return false;
  return consent[type] !== false;
}
