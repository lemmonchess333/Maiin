# Firestore rules + storage + CSP security audit — 2026-05-26

## Scope

Manual code review of the Firestore security rules (`firestore.rules`, 659 lines), Storage rules (`storage.rules`), index.html CSP header, and Cloud Functions surface that exposes social-write paths. Triggered by a third-party review pass.

The 2026-05-25 audit (Codex, `docs/audits/2026-05-25-security-audit.md`) covered Stripe / Apple webhook surface + auth / kill-switch policy. Those three findings were shipped via PR #761 + #763. **This audit covers what that one didn't reach** — the social-layer Firestore rules.

## Methodology

1. Pattern scan of `firestore.rules` for `allow read|write|create|update` against `request.auth != null` (single-auth-check rules are usually wide-open by accident).
2. Cross-check against client write patterns in `src/lib/socialApi.ts` to identify direct-client-write paths that aren't gated by Cloud Functions.
3. Read of `storage.rules` for MIME-type and size validation.
4. Spot-check of `index.html` CSP header.
5. Spot-check of Cloud Functions logging for personal-health-adjacent data leaks.

## Executive summary

- **No authentication-layer findings.** Sub1 audit + F3 follow-up (PR #761, #763) closed the meaningful auth-side gaps.
- **The social layer trusts clients too much.** Firestore rules pre-W1f were tightened on writes but reads stayed permissive; multiple counter / spam vectors remain.
- **Twelve findings** across rules, storage, CSP, and log hygiene.

## Findings

### 1) Activities readable by any authenticated user (**P0 / Critical**)

- **Evidence:** `firestore.rules:277` — `allow read: if request.auth != null;` for `/activities/{activityId}`.
- **Why it matters:** Activities carry GPS run traces (`routePreview`), workout volume, body metrics surfaces, distance / duration / elevation. A scripted `db.collection('activities').get()` from any account harvests the entire user base's locations, training patterns, and timing. `visibility` field on the doc is purely informational at the rule layer.
- **Fix:** visibility-aware read:
  ```
  allow read: if request.auth != null && (
    resource.data.visibility == 'public'
    || resource.data.authorId == request.auth.uid
    || (resource.data.visibility == 'followers'
        && exists(/databases/$(database)/documents/followers/$(resource.data.authorId)/users/$(request.auth.uid)))
  );
  ```
- **PR scope:** **PR 1 (this audit).**

### 2) Activity counters are forgeable (**P0 / Critical**)

- **Evidence:** `firestore.rules:287-288` — `hasOnly(['kudosCount', 'commentCount'])` restricts which fields change but **NOT what values they take**. Any authed user can write `{ kudosCount: 999999, commentCount: -50 }`.
- **Why it matters:** Counter fraud → fake-viral activities, ranking pollution, leaderboard corruption. Trivially exploitable.
- **Fix:** Move counter mutations to Cloud Function callable (`incrementKudos`, `incrementComment`). Deny direct client writes to those fields. The CF validates the corresponding kudos / comment doc exists before incrementing.
- **PR scope:** **PR 2 (follow-up).**

### 3) Feed spam (**P1 / High**)

- **Evidence:** `firestore.rules:354-366` allows any authed user to write into any other user's `/feeds/{uid}/items/{doc}` as long as `authorId == auth.uid`.
- **Why it matters:** Impersonation prevented, but rate not. User A can script-write 100k feed items into User B's feed.
- **Fix:** Server-side fan-out. Replace client direct-writes with a CF callable that respects the existing `rateLimiter.js isRateLimited`. As a side effect, the existing rate-limit helper now applies to social writes (closes #12 below).
- **PR scope:** **PR 3 (follow-up).**

### 4) Challenge prefix junk (**P1 / High**)

- **Evidence:** `firestore.rules:325-334` allows create with any of 5 prefixes (`weekly-`, `monthly-`, `seasonal-`, `fastest-5k-`, `group-goal-`) but **no body validation**.
- **Why it matters:** Junk-doc spam bounded to those namespaces. Not catastrophic but pollutes the global challenge surface.
- **Fix:** Move challenge creation to admin SDK only (operator-seeded), OR add strict schema validation + exact-ID allowlist.
- **PR scope:** **PR 4 (follow-up).**

### 5) Crew member counts forgeable (**P1 / High**)

- **Evidence:** `firestore.rules:504-506` — same `hasOnly()` pattern as #2 but for `memberCount`.
- **Why it matters:** Identical to #2. Crew → 1,000,000 members on a write.
- **Fix:** Server-side join/leave callable. Same shape as #2 (counter mutation via CF). Deny direct client write to `memberCount`.
- **PR scope:** **PR 2 (follow-up, paired with #2).**

### 6) Notification spam (**P1 / High**)

- **Evidence:** `firestore.rules:437-444` allows any authed user to create notifications in any other user's `/notifications/{uid}/items/`. `fromUserId == auth.uid` prevents impersonation; content is uncontrolled.
- **Why it matters:** Fake-looking "Tropos: you owe us $500" notifications, fake follow-back prompts, etc. Social-engineering surface.
- **Fix:** Server-side notification creation. CF receives `{toUid, type, ...}`, validates the relationship (e.g. notification to a user you follow), enforces type union, applies rate limit.
- **PR scope:** **PR 3 (follow-up, paired with #3).**

### 7) Activity creation has no schema validation (**P1 / High**)

- **Evidence:** `firestore.rules:278-279` only checks `authorId == auth.uid`. No field allowlist, no enum check, no numeric bounds.
- **Why it matters:** Pathological documents — `{visibility: 'undefined', distance: -9999, exercises: [Array(10000)], nested: massive}` — are accepted. Reads of feeds containing them become expensive and crash UI.
- **Fix:** Strict `hasOnly()` allowlist + enum check on `visibility` / `type` + numeric bounds + size caps on lists.
- **PR scope:** **PR 1 (this audit).**

### 8) Storage accepts SVG (**P2 / Medium**)

- **Evidence:** `storage.rules:15,24` — `contentType.matches('image/.*')` accepts `image/svg+xml`.
- **Why it matters:** Stored XSS if an SVG profile photo is ever rendered inline (e.g. `<img>` with `<script>` payload). Tropos currently uses `<img src>` everywhere which sandboxes — but future template changes could regress.
- **Fix:** MIME allowlist:
  ```
  request.resource.contentType in ['image/jpeg', 'image/png', 'image/webp']
  ```
- **PR scope:** **PR 4 (follow-up).**

### 9) CSP allows `'unsafe-inline'` (**P2 / Medium**)

- **Evidence:** `index.html:14` — `script-src 'self' 'unsafe-inline' https://js.stripe.com;`.
- **Why it matters:** Inline-script XSS protection weakened. The reason is the dark-mode initialization script that runs pre-React.
- **Fix:** Replace inline script with a nonce or move to an external file. Tighten CSP.
- **PR scope:** **PR 4 (follow-up).**

### 10) Vertex AI response logged in full (**P2 / Low-Medium**)

- **Evidence:** `functions/index.js:892` — `console.log("Vertex AI response:", JSON.stringify(data))`.
- **Why it matters:** Personal health-adjacent data (food names, nutrition descriptions) goes to Cloud Logging in full. Not exfiltrable from outside, but expands the data-residency surface.
- **Fix:** Log metadata only: `{ status: response.status, hasError: !!data.error, model: ... }`.
- **PR scope:** **PR 4 (follow-up).**

### 11) Document growth / payload size abuse (**P1 / High** — found in second-pass review)

- **Evidence:** `firestore.rules:278-279` allows arbitrary array sizes in submitted activity payloads.
- **Why it matters:** A hostile user can write 100K-point GPS arrays. Firestore has a 1MB hard cap per document, but soft caps via rules prevent the legitimate-but-broken case too. Without per-field size limits:
  - Feed listings become expensive (one bad doc bloats every aggregate read)
  - UI crashes trying to render the payload
  - Storage / read costs balloon
- **Fix:** Per-array size caps in the create rule:
  - `routePreview.size() <= 5000`
  - `exercises.size() <= 100`
  - `muscleGroups.size() <= 20`
  - String fields ≤ 200 chars
- **PR scope:** **PR 1 (this audit, paired with #7).**

### 12) No rate limiting on social writes (**P1 / High** — found in second-pass review)

- **Evidence:** Social writes (kudos, comments, follows, notifications) go client-direct via `updateDoc` / `setDoc` (see `src/lib/socialApi.ts:212-226 toggleKudos`). Firestore rules can't rate-limit; the existing `functions/rateLimiter.js isRateLimited` helper only applies to CF-backed endpoints.
- **Why it matters:** `for (let i=0; i<100000; i++) toggleKudos(...)` is possible from any logged-in client. Same shape: kudos spam, comment spam, follow spam, notification spam.
- **Fix:** Migrate social writes to Cloud Functions (matches #3 and #6). Rate limiting comes free via the existing `isRateLimited` helper. App Check enforcement at the Firestore + Functions layer adds a second tier (would block scripted abuse from non-app contexts).
- **PR scope:** **PR 3 (follow-up, paired with #3 + #6) — the rate limit comes for free when the writes move to CFs.**

## Strengths observed

- **Auth layer:** Sub1 audit + F3 follow-up closed the credential / token-revocation / payment surfaces.
- **Account deletion:** PR #739 + #765 close the zombie-charge and cross-platform-conflict gaps.
- **Owner-only personal data:** `/users/{uid}` is locked to owner; `/users/{uid}/public/{doc}` only mirrors safe fields via the schema-strict allowlist.
- **Webhook signature verification:** Stripe + Apple both verified before any trust.
- **Existing rate-limit helper:** `functions/rateLimiter.js` is solid; just not yet applied to social writes (#12).

## Priority remediation plan

| PR                    | Findings                                                              | Estimate | Risk reduction |
| --------------------- | --------------------------------------------------------------------- | -------- | -------------- |
| **PR 1 (this slice)** | #1 + #7 + #11 — activity contract hardening                           | 3-5h     | **~75%**       |
| PR 2 (follow-up)      | #2 + #5 — counter writes via CF                                       | 2-3h     | ~10%           |
| PR 3 (follow-up)      | #3 + #6 + #12 — server-side fan-out + notifications (rate limit free) | ~1 day   | ~10%           |
| PR 4 (follow-up)      | #4 + #8 + #9 + #10 — challenge schema + MIME + CSP + log redaction    | 2-4h     | ~5%            |

## Remaining risk after PR 1

After PR 1 ships, the following pre-launch risks are **still open**:

- **Counter fraud (#2, #5):** kudos / comment / member counts can still be set to arbitrary values. Leaderboards and viral-feeling activities can be forged. Mitigation: leaderboard reads should treat counters with suspicion until PR 2 lands; flag any activity with counter delta >1 per request for review.
- **Feed + notification spam (#3, #6):** A hostile user can still script writes to other users' feeds and notifications. Severity bounded by:
  - **PR 1 protects READS** — even if feeds are spammed with junk, the activity rows referenced by feed items now enforce visibility, so the spammer can't make their private workouts surface to followers
  - But the feed-item-row itself can still carry arbitrary attacker-controlled content (`summary` string, `activityTitle`, etc.)
- **Rate limiting on social writes (#12):** still absent; depends on #3/#6 migration.
- **Challenge spam (#4):** bounded to the 5 namespace prefixes; still uncontrolled body schema.
- **Storage MIME / SVG XSS (#8):** still active; mitigated by current rendering paths (no `<img>` interpreting SVG inline scripts) but a future template change could regress.
- **CSP `unsafe-inline` (#9):** XSS surface still slightly weakened.
- **Vertex response log (#10):** PII-adjacent data still ends up in Cloud Logging at full payload.

**Severity scoring (post-PR 1):**

| Area                     | Pre-PR-1     | Post-PR-1 |
| ------------------------ | ------------ | --------- |
| Authentication           | 8/10         | 8/10      |
| Personal data protection | 4/10         | 8/10      |
| Social system integrity  | 3/10         | 5/10      |
| Abuse resistance         | 3/10         | 4/10      |
| Storage security         | 7/10         | 7/10      |
| Infrastructure           | 8/10         | 8/10      |
| **Overall**              | **5.5–6/10** | **~7/10** |

PR 1 closes the largest gap (personal data exfiltration via direct `activities` query). PR 2 + PR 3 are needed to fully close the social-integrity tier.

## Remaining risk after PR 2

PR 2 closes findings **#2 (counter forgery)** and **#5 (crew memberCount forgery)** by:

- Moving `kudos/{aid}/users/{uid}` create+delete to `toggleKudosCallable`. Rule layer denies direct client writes (`allow create, delete: if false`).
- Moving `comments/{aid}/items/{cid}` create+delete to `addCommentCallable` / `deleteCommentCallable`. Server validates text length (1-1000 chars), trims, and caps `authorName` at 100 chars. Rules deny direct writes.
- Moving `groups/{crewId}/members/{userId}` writes + `memberCount` mutation to `setCrewMembershipCallable`. Server flips the member sub-doc and the parent doc's counter inside one transaction; the operation is idempotent (no-op when already in/out state). Rules deny direct writes to both.
- Tightening `/activities` update to **owner-only visibility update** — the prior non-owner counter affectedKeys path is gone.
- All four CFs apply `accountDeletionLocks.assertCallableActorNotDeleting` — replaces the rule-layer freeze that lived on `/groups/{crewId}/members/{userId}` and adds equivalent protection for kudos/comments.

Still open after PR 2:

- **Feed + notification spam (#3, #6):** unchanged from post-PR-1. PR 3 will route these via server-side fan-out.
- **Rate limiting on social writes (#12):** partial — `toggleKudosCallable` (30/60s), `addCommentCallable` (20/60s), `setCrewMembershipCallable` (10/60s) all apply per-uid limits. Direct-write paths in PR 3's scope still uncapped.
- **Challenge spam (#4):** unchanged from post-PR-1.
- **Storage MIME / SVG XSS (#8):** unchanged.
- **CSP `unsafe-inline` (#9):** unchanged.
- **Vertex response log (#10):** unchanged.

**Severity scoring (post-PR 2):**

| Area                     | Pre-PR-1     | Post-PR-1 | Post-PR-2   |
| ------------------------ | ------------ | --------- | ----------- |
| Authentication           | 8/10         | 8/10      | 8/10        |
| Personal data protection | 4/10         | 8/10      | 8/10        |
| Social system integrity  | 3/10         | 5/10      | 7/10        |
| Abuse resistance         | 3/10         | 4/10      | 5/10        |
| Storage security         | 7/10         | 7/10      | 7/10        |
| Infrastructure           | 8/10         | 8/10      | 8/10        |
| **Overall**              | **5.5–6/10** | **~7/10** | **~7.5/10** |

## Suggested verification tests after PR 1

- `firestore.rules.test.ts` emulator suite adds:
  - private activity not readable by other users
  - followers-only activity only readable by valid followers
  - public activities remain readable
  - oversized `routePreview` / `caption` / `exercises` writes rejected
  - invalid `visibility` / `type` writes rejected
  - missing `authorId` or mismatched `authorId` rejected
  - valid activity creation still works (regression guard)

## Dependency audit

Not re-run in this audit pass. The 2026-05-25 doc noted environmental `npm audit` failure (HTTP 403); same constraint applies here. Recommended follow-up via `osv-scanner` or NPM_TOKEN-authenticated audit in CI remains as P2.
