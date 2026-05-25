# Security Audit Report — 2026-05-25

## Scope

- Frontend app (`src/**`) and Firebase backend (`functions/**`).
- Security rules and deployment config (`firestore.rules`, `storage.rules`, `firebase.json`).
- Focus areas: authn/authz, webhook integrity, input validation, secrets handling, redirect safety, idempotency, and abuse controls.

## Methodology

1. Manual code review of high-risk paths (auth gates, webhooks, checkout, account deletion flows, rules).
2. Pattern scan for dangerous sinks and credential leakage indicators.
3. Dependency vulnerability check (`npm audit`) for root and `functions/` package trees.

## Executive Summary

- **No critical remote-code-execution or obvious auth-bypass findings were identified** in sampled high-risk paths.
- The backend shows good hardening in several places: verified Stripe signatures, Apple signed payload verification, webhook idempotency docs, strict checkout return-path tokenization, price allowlisting, and Firestore rule protection around subscription fields.
- **Two medium-severity configuration/design risks** and **one low-severity defense-in-depth gap** were identified.

---

## Findings

### 1) Staging origin allowed in default production checkout return allowlist

- **Severity:** Medium
- **Area:** Payment redirect integrity / open-redirect blast radius
- **Evidence:** `helpers.js` default allowlist includes both production and staging origins even when not in emulator mode. The comments mark this as follow-up work. `createCheckoutSession` validates generated return URLs against this allowlist and would currently accept staging if base URL resolves there.
- **Why it matters:** If deployment/config drift sets base URL unexpectedly, checkout success/cancel redirects can land on staging domain. This is not arbitrary open redirect, but expands trusted post-payment destinations beyond strict production-only set.
- **References:** `functions/helpers.js` (`STAGING_STRIPE_RETURN_URL_ORIGINS`, `getDefaultStripeReturnUrlOrigins`, follow-up note); `functions/index.js` (`createCheckoutSession` + allowlist check).
- **Recommendation:** Split allowlists per environment (prod/staging) and require explicit env setting in production. Fail deployment if staging origins are present in prod config.

### 2) Feature-flag read path fails open on Firestore read errors

- **Severity:** Medium
- **Area:** Incident-response controls / kill-switch reliability
- **Evidence:** `isFlagEnabled()` returns `true` when the `config/flags` read fails.
- **Why it matters:** During partial Firestore outage or permission/config issue, kill-switched features may unexpectedly remain enabled, undermining emergency containment.
- **References:** `functions/index.js` (`isFlagEnabled`, catch block comment and return value).
- **Recommendation:** For high-risk features (AI scan, payment write paths), switch to fail-closed policy (`false` on read failure), or keep fail-open only for low-risk endpoints with per-flag policy metadata.

### 3) ID token verification does not explicitly check revocation state

- **Severity:** Low
- **Area:** Session invalidation hardening
- **Evidence:** `verifyAuth` uses `admin.auth().verifyIdToken(token)` without revocation check option.
- **Why it matters:** Revoked tokens can remain valid until expiry unless additional revocation checks are enforced, increasing exposure after credential compromise response events.
- **References:** `functions/index.js` (`verifyAuth`).
- **Recommendation:** For sensitive endpoints (checkout creation, deletion workflows, profile/security mutations), consider `verifyIdToken(token, true)` and/or additional recent-auth checks.

---

## Strengths Observed

- **Stripe webhook signature verification** via `constructEvent(req.rawBody, sig, webhookSecret)`.
- **Apple webhook signed payload verification** before trust/use.
- **Webhook deduplication strategy** present for Stripe and Apple delivery IDs.
- **Closed-set checkout path tokens** with server-synthesized URLs and allowlist validation (good SSRF/open-redirect posture).
- **Price allowlisting** prevents arbitrary price ID abuse.
- **Firestore rules** protect subscription ownership and prevent client-side mutation of billing fields.
- **Deletion-state write freeze + server-side deletion guards** reduce resurrection/race risks.

## Dependency Audit Result

- `npm audit` could not complete in this execution environment due to npm registry advisory endpoint returning **403 Forbidden** for both root and `functions/` lockfiles.
- This is an environmental limitation; package CVE status remains unverified in this run.

## Priority Remediation Plan

1. **P1:** Environment-specific checkout return URL allowlist split + startup invariant checks.
2. **P1:** Kill-switch policy refactor to fail-closed for high-risk toggles.
3. **P2:** Add revocation-aware auth verification where business impact warrants the latency/read tradeoff.
4. **P2:** Re-run dependency CVE scan in CI with working advisory access and archive artifacts.

## Suggested Verification Tests After Fixes

- Unit tests for prod env ensuring staging origins are rejected.
- Integration test forcing feature-flag read error and asserting fail-closed for selected flags.
- Endpoint tests showing revoked token rejection on protected routes.


## Auditor Notes on Dependency Scan Environment

- The `npm audit` failures in this run appear environmental (HTTP 403 from the advisory endpoint), not evidence of a repository defect.
- In constrained CI/agent environments this commonly comes from egress policy, missing npm auth token, or registry-side IP/rate blocking on audit-specific routes.
- This does **not** invalidate the three source-derived findings above, which came from static review of repository code and rules.

### Recommended CI fallback sequence

1. Retry with explicit registry and auth token:
   - `npm audit --omit=dev --json --registry=https://registry.npmjs.org`
   - with `NPM_TOKEN` configured in CI secrets.
2. If advisory endpoint is still blocked, run alternate scanners:
   - `npx audit-ci`
   - `npx better-npm-audit audit`
   - `osv-scanner` against lockfiles.
3. Archive scanner output as build artifacts and treat dependency findings as a separate track from application-logic findings.
