---
Status: accepted
---

# Profile-field drift: observability seam, not a shared-schema consolidation

## Context

`functions/profileSanitizer.js` is an allow-list of the profile fields the
`completeOnboarding` / `configurePlan` callables may persist — 54 fields, each
with a per-field validator, fail-closed (anything not listed is dropped). It
exists to close a stored-data injection surface (a caller sending
`photoURL: "https://tracker/uid=victim"` or arbitrary extra fields into the
`merge: true` write).

A documented recurring mistake (CLAUDE.md): **"Any new persisted profile field
must also be added to the `functions/profileSanitizer.js` allow-list, or the
Cloud-Function write silently drops it."** A 2026-06-04
`/improve-codebase-architecture` sweep flagged this as a candidate to "make
`profileSanitizer` the single source of truth" — derive both the client
`UserProfile` type and the server allow-list from one schema, or add a drift
test pinning them equal.

## Decision

**Reject the structural consolidation. Add an observability seam instead:** the
pure `findUnexpectedProfileFields(input)` helper returns input keys that are
neither allow-listed nor server-managed, and the two handlers log them
(`completeOnboarding.unexpected_dropped_fields` / `configurePlan.*`). A
forgotten field becomes a loud line in Cloud Function logs the first real call
that sends one, instead of a silent data-loss bug.

## Considered options

- **Drift test: `UserProfile` keys ⊆ allow-list.** Rejected — noisy by
  construction. Many `UserProfile` fields legitimately aren't in the sanitizer:
  server-managed fields (`subscriptionTier`, `stripeCustomerId`, …) are
  deliberately deny-listed, and most fields are written client-side
  post-onboarding via `firestoreWrite`, never through these callables. The
  sanitizer governs ONE write path, not the whole profile, so set-equality is
  the wrong invariant.
- **Drift test: onboarding payload keys ⊆ allow-list.** Rejected — not
  enumerable. The `profileData` payload is built half from a static object
  literal (`Onboarding.tsx`) and half from a dynamic
  `Object.assign(profileData, plan.profileUpdates)` merge computed by the plan
  builder. There is no static "set of fields onboarding sends" to assert
  against.
- **Shared schema (e.g. Zod) generating both the TS type and the JS
  validators.** Rejected — a large cross-language (TS client ↔ JS functions)
  rewrite of a security-sensitive module, disproportionate to a risk confined
  to one narrow callable path. The depth isn't there: the allow-list isn't a
  shallow pass-through, and there's no second consumer that would make a shared
  schema earn its keep.

## Consequences

- The recurring mistake is mitigated, not eliminated: a forgotten field is
  still dropped, but now **loudly** (logged), so it's caught in the first
  onboarding/plan-rebuild that exercises it rather than via a user data-loss
  report.
- `profileSanitizer.js` stays pure and unit-testable; the logging side effect
  lives in the handlers (`functions/index.js`).
- **Do not re-suggest the schema-consolidation** in a future architecture
  sweep without a new forcing function (e.g. a second server consumer of the
  same field set, or the onboarding payload becoming statically enumerable).
  The half-dynamic payload is the load-bearing reason a clean drift test isn't
  achievable.
