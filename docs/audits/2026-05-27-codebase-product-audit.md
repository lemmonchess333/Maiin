# Codebase + Product Feature Audit — 2026-05-27

## Scope

- Frontend app architecture and feature surface under `src/**`.
- Firebase backend + policies under `functions/**`, `firestore.rules`, `storage.rules`.
- Existing audit artifacts and launch checklists.

## Snapshot

The repository is mature and broad for a V1/V1.1 fitness app:

- Strong domain coverage: running, lifting, nutrition, streaks, social, subscriptions, account deletion, moderation, and diagnostics.
- Strong automated test density across unit and feature logic (`src/lib/__tests__`, hooks/component tests, backend tests under `functions/__tests__`).
- Evidence of active hardening and operational documentation (security audit and launch TODO already in-repo).

Overall verdict: **product depth is strong; the largest remaining risks are operational reliability, release process rigor, and a few consistency gaps between code and deployment/manual steps.**

## What needs improvement (prioritized)

## P0 — Release and operational blockers

1. **Turn launch checklist items into enforceable automation where possible.**
   - Multiple critical tasks are still manual in `docs/LAUNCH_TODO.md` (CORS policy, App Check enforcement, Apple secrets, selective deploy commands).
   - Add CI checks/scripts that validate config preconditions (required functions config keys, allowed origins, bundle ID parity).

2. **Close the “manual security controls” gap.**
   - Security controls are documented but not all centrally verified at deploy time (e.g., App Check enforcement staged manually, environment-specific redirect policy correctness).
   - Convert these to startup assertions + CI gate tests for prod profile.

3. **Complete dependency vulnerability scanning in a stable CI environment.**
   - Existing security audit notes audit tooling was blocked by registry 403, leaving CVE status unresolved.
   - Add alternative scanner fallback chain and artifact retention.

## P1 — Architecture and maintainability

1. **Reduce domain concentration in utility layer over time.**
   - `src/lib` contains a very large number of mixed concerns (analytics, business rules, platform handling, AI, billing helpers).
   - Introduce clearer domain packages (e.g., `src/domains/run`, `src/domains/nutrition`, `src/domains/subscription`) with stricter boundaries.

2. **Formalize feature-level ownership and dependency rules.**
   - The codebase has many cross-cutting hooks/components and backend coupling points.
   - Add architecture decision records for critical invariants (subscription state authority, deletion ledger ownership, social write-path constraints).

3. **Unify backend/runtime package version drift strategy.**
   - Root and `functions/` use different major/minor dependency lines (intentional but needs policy).
   - Add a documented compatibility matrix and scheduled dependency refresh cadence.

## P1 — Testing and quality signal gaps

1. **Promote high-risk integration tests into mandatory CI gates.**
   - Ensure webhook idempotency, rate limiter behavior, checkout path validation, and account deletion flows are required on every protected branch merge.

2. **Add production-like smoke environment checks.**
   - Existing tests are strong locally, but add post-deploy synthetic checks (subscription purchase roundtrip, photo upload, crew permissions, run tracking basics).

3. **Track flaky E2E and platform-specific failures separately.**
   - Add flake dashboard/labels and quarantine process; do not let recurring flake degrade confidence.

## P2 — Feature improvements (product)

1. **Native reliability for run tracking and App Check parity.**
   - Launch docs already identify background run tracking and native App Check completion; these are high-impact trust features.

2. **Health ecosystem integrations (HealthKit first).**
   - Clear roadmap already listed; this should become the first major post-launch differentiation initiative.

3. **Subscription UX + entitlement resiliency polish.**
   - Existing backend hardening is good; add richer client-side reconciliation UX (clear pending/retry states, entitlement recovery affordances).

## Feature surface audit (current state)

- **Training / running:** robust (session reducer, run scheduling/program features, guided run, route/gps logic).
- **Nutrition:** robust (manual logging, scan paths, macro calculations, NLP parsing, scan quota handling).
- **Social/community:** robust (feed, comments, report flows, block-aware components, crews).
- **Account/security/privacy:** above average for stage (deletion inventories/guards, moderation/admin paths, App Check rollout docs).
- **Monetization:** mature foundation (Stripe + Apple purchase handling, reconciliation logic, pro gating).
- **Diagnostics/ops UX:** present (`Diagnostics` page, multiple audit docs), which is a strong operational signal.

## 30/60 day execution plan

### Next 30 days

- Convert launch checklist blockers into executable scripts and CI gates.
- Add prod config assertions for payments/App Check/origin allowlists.
- Complete CVE scanning pipeline with fallback tools.
- Run and archive full lint/typecheck/unit/functions-test/e2e smoke before each release candidate.

### 31–60 days

- Begin domain modularization of `src/lib` into explicit bounded contexts.
- Add post-deploy synthetic monitoring checks.
- Ship native App Check completion and background run reliability improvements.

## Commands run for this audit

- `rg --files`
- `cat package.json`
- `cat functions/package.json`
- `sed -n '1,220p' README.md`
- `sed -n '1,220p' docs/LAUNCH_TODO.md`
- `sed -n '1,220p' docs/audits/2026-05-25-security-audit.md`
- `npm run -s lint`
- `npm run -s typecheck`
