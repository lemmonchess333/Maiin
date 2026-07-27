/**
 * Push consent predicate — the gate EVERY server sender passes through.
 *
 * `mayTargetUserConsent(consent, type)` answers "may a sender of `type`
 * target this user?" against the doc at `users/{uid}/settings/push`. A type
 * sends only when the global kill-switch AND that type's flag are both on.
 * Global defaults OFF (explicit opt-in — no cold sends); a per-type flag
 * that is ABSENT counts as on, so older docs written before a type existed
 * get the standard set rather than silently going dark.
 *
 * WHY IT LIVES HERE (2026-07-27). It used to be inlined in `index.js` under
 * a comment reading "Mirrors src/lib/pushConsent.mayTargetUser" — while the
 * TS function it named had ZERO callers. So the arrangement was the exact
 * inversion CLAUDE.md calls the project's #1 recurring mistake: the tested
 * copy was dead, and the copy deciding whether a real human's phone buzzes
 * was untested. The two bodies happened to agree, which is the part that
 * makes it dangerous — nothing would have said so if they stopped.
 *
 * The client copy is now deleted rather than pinned by a cross-test. A
 * cross-test is the right tool when BOTH copies run (see
 * `runEligibility.cross.test.ts`); here only one ever did. "May a server
 * sender target this user?" is a server question, and the client has no
 * business answering it. What the client legitimately shares is the SHAPE —
 * `PushConsent` / `DEFAULT_PUSH_CONSENT` in `src/lib/pushConsent.ts`, still
 * read by `usePushSettings` and `pushNotifications` — not the predicate.
 *
 * Consequence worth stating plainly: this file is now the ONLY definition.
 * A change here changes real push behaviour with no second copy to compare
 * against, so `functions/__tests__/pushConsent.test.js` is the whole safety
 * net. It pins the copy that runs, which is the point (ADR-0008).
 */

/** @typedef {"streak" | "recap" | "badge"} PushType */

/**
 * @param {{enabled?: boolean, streak?: boolean, recap?: boolean, badge?: boolean} | null | undefined} consent
 * @param {PushType} type
 * @returns {boolean}
 */
function mayTargetUserConsent(consent, type) {
  if (!consent || !consent.enabled) return false;
  return consent[type] !== false;
}

module.exports = { mayTargetUserConsent };
