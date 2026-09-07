# Tropos security audit — 7 September 2026

Source baseline: `6f550f849b12b1af39cfed4adacd1acbf5f761b7`. The public Firebase Hosting `/sw.js` served `BUILD_STAMP = "6f550f849b12"` at the start of this audit. This is a bounded source review and regression pass, not an ASVS certification or a claim that no vulnerabilities remain.

## Confirmed findings and changes

| Finding | Assessment | Reproduction and fix |
| --- | --- | --- |
| Stale offline flush | Low; defence in depth for account isolation. Existing owner Rules still deny writes to another user's private documents. No cross-user server write was demonstrated. | Three new tests failed before the fix: a flush after sign-out, after an account switch, and a switch while a prior acknowledgement is pending. Every replay now checks live Auth identity, including legacy queue entries. Pending entries remain available when their owner returns. |
| Incomplete emulator isolation | Medium development/test safety risk; not a demonstrated production authentication bypass. | A real callable SDK request in emulator mode selected a cloud URL. Raw food-analysis URLs also hard-coded the production project. Connect Functions to loopback and derive HTTP endpoints from the configured project. No cloud fallback when the local service is unavailable. |
| Comment avatar validation | Low; inconsistent enforcement of the existing public-content URL boundary. Browser CSP already limits image loading; arbitrary-origin tracking was not demonstrated on a device. | Real HTTP calls with emulator-issued credentials persisted unsupported avatar URLs through both comment endpoints. Apply an HTTPS origin/length allowlist before Admin writes. Valid provider/Storage URLs survive without truncation. Unsupported values fall back to initials; comments still save. |
| CSV formula/cell injection | Medium, conditional on untrusted/imported text being exported and opened in a spreadsheet. No remote command execution was attempted or claimed. | Nine original regression cases failed: formula-like names and malformed scalar fields entered CSV unchanged. Quote/escape every scalar as needed and prefix formula-like text with an apostrophe. Cover whitespace/control prefixes, full-width prefixes, embedded quotes, separators and newlines. Real numeric values keep their numeric representation. |
| Server dependency advisories | Five high/critical package findings in the original lockfile; exploit reachability differs by package. | Compatible lockfile updates clear all high/critical advisories without an Admin SDK major migration. Functions dependency auditing now blocks high/critical regressions in CI; deployment uses `npm ci`. |

The tests exercise generated export bytes; they do not claim compatibility with every spreadsheet importer or safety after a user removes the text prefix and re-saves a file. See [OWASP CSV injection guidance](https://owasp.org/www-community/attacks/CSV_Injection).

## What was tested

- **Clean baseline:** separate detached worktree at the SHA above; 8,212 client unit tests passed (341 emulator-gated skips), and all 1,420 Functions tests passed with Auth/Firestore emulators.
- **Client regressions:** stale-account replay, existing durable meal/weight/water queue behaviour, real SDK callable URL selection, HTTP endpoint selection, CSV output and ordinary export formatting.
- **HTTP boundary:** use the exported production `onCall` handlers behind a local HTTP server, with real Auth-emulator ID tokens and Firestore transactions. No mocked authorisation decision. Missing/invalid tokens and unverified email claims are refused; supplied author IDs do not override the token; another account's private activity cannot be commented on. Own-post success fixtures avoid notification delivery.
- **Functions:** full suite, including subscription sanitisation, webhook reconciliation, account deletion, rate limits/quotas, block guards, program commands and push-token ownership. A clock-dependent rate-limit test was stabilised by controlling `Date.now` at the expiry boundary while keeping real emulator transport/transactions. The limiter itself is unchanged.
- **Rules:** run the existing Firestore suites as unprivileged test clients, then Storage separately. These suites share a project ID in places; running Storage concurrently with the profile suite caused fixture interference in the first audit command. That command was corrected to match CI's separation, without changing Rules.
- **Release:** compare the deployed source of both affected comment callables with the uploaded `index.js` (including the CI SHA marker), dependency lockfile and three helper files. The verifier was exercised locally with a matching synthetic archive and a stale archive; stale bytes are rejected. Actual production verification is a separate post-deploy gate.

Only loopback emulators received adversarial requests and synthetic writes. A temporary socket guard refused non-loopback connections in local test processes. No real-user records, production recovery emails, paid AI calls, subscription transactions or production load tests were used.

Final test counts and release identifiers are recorded in the PR and its check/deployment logs. A merged source revision is not evidence that its Hosting, Functions, Firestore Rules or Storage Rules revision is deployed.

## Coverage and remaining work

| Area | Evidence from this pass | Limit / next action |
| --- | --- | --- |
| Auth and account isolation | Auth-provider/queue source traces, regression suites, actual HTTP token checks | No native secure-storage extraction or stolen-device exercise. SDK persisted caches are not a confidentiality boundary against someone controlling the browser profile. |
| Firestore authorisation | Owner subcollections, public projection, memberships, billing-field and collection-group rule suites | Exact active production Rules release was not retrieved through an authenticated Firebase Rules API in this pass. Emulator success alone does not establish production configuration. |
| Storage | Owner-only private prefixes, MIME/size/deletion-freeze rule tests; deployment gate reviewed | `STORAGE_XSERVICE_APPROVED` and the one-time Storage→Firestore permission must be verified by a project owner. Do not bypass this gate: an unapproved cross-service deployment can deny all uploads. |
| Functions trust boundaries | Authenticated UID, verification/deletion/rate-limit gates, private activity refusal and sanitisation tests | Native App Check provider/enforcement remains a staged operational task. Verify token coverage before enforcement; bulk enabling would break legitimate clients. |
| Sensitive photos and GPS | Existing device-local meal-photo contract, public-route privacy filtering, progress-vault source reviewed | Progress-photo encryption derives its key from public UID material; it is not end-to-end secrecy. Existing product decision in `docs/LAUNCH_TODO.md` remains open. Route-zone filtering removes points but a connecting chord can reveal passage through an area. |
| Injection | CSV fixes, comment URL boundary, React rendering and trusted artwork HTML sinks reviewed | No browser-engine exploit, full native webview penetration test or executable spreadsheet payload was run. |
| Dependencies | Fresh `npm audit`: production root tree **0 advisories**. Full root/dev tree 12 (1 low, 8 moderate, 3 high). Functions improved from 16 (1 low, 10 moderate, 4 high, 1 critical) to **9 moderate, 0 high/critical** through compatible transitive updates. | Counts describe dependency trees, not reachable exploits. The removed critical finding was in the unused RTDB WebSocket path; other patched dependencies include grpc-js, protobufjs, form-data and fast-xml-builder. Remaining Functions chains involve uuid/Google SDK dependencies; Admin SDK major-migration constraints remain. Root dev-tool high findings inherit sharp/libvips through the PWA assets generator; an audit-suggested PWA downgrade was declined. These need an explicit toolchain/SDK migration with its own compatibility checks. |
| Secrets and CI | Current tracked source scan found no matches for private-key material, GitHub tokens, AWS access keys or live Stripe secret keys; deploy actions reviewed | Pattern scan is not exhaustive and excludes fixtures/docs/assets. Git history, cloud IAM, secret rotation, branch-protection enforcement and organisation settings were not comprehensively audited. |
| Hosting/mobile | Live HSTS, nosniff, referrer policy, anti-framing CSP/X-Frame-Options and Permissions-Policy observed. Existing meta CSP inspected. Capacitor config has no arbitrary cleartext/navigation override. | No iPhone/Android hardware security test. The web deployment does not update an installed native binary. |

Community-space likes/comments have a deliberately different block contract from workout activities: the notification backstop suppresses delivery, but the underlying space interaction can persist. That distinction is documented in `CLAUDE.md`; this audit did not silently change it or claim those mutations are blocked.

## Release and rollback

Review the PR's full unit/build/lint, emulator and authenticated/capture E2E checks before merge. Hosting and Functions deploy independently. The source-verification step must pass before describing the avatar fix as verified live. Firestore and Storage Rules were not modified by this change.

Rollback is a normal revert of the security PR followed by the existing Hosting/Functions deploys. No migration or destructive data rewrite is involved. Unsupported avatar fields on previously stored comments are not rewritten by this release; the new boundary applies to new writes.

References: [Firebase Functions emulator connection](https://firebase.google.com/docs/emulator-suite/connect_functions), [Firebase Rules testing](https://firebase.google.com/docs/rules/unit-tests), [App Check](https://firebase.google.com/docs/app-check), [Cloud Functions deployed-source API](https://docs.cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions/generateDownloadUrl).
