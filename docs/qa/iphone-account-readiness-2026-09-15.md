# iPhone and account readiness — 15 September 2026

This branch combines the previous account-reliability and iPhone-performance work with signup verification, complete cross-user cleanup, durable deletion retries, and a smaller Home import graph. This is a tested code change; it is not a production deployment or a physical-iPhone benchmark.

## Account deletion

Settings → Account → Delete account now uses a normal confirmation. Recent authentication remains required, with password, Google or Apple confirmation. Apple accounts still revoke their sign-in credential and receive the App Store subscription warning and subscription-settings link. Deleting the Tropos account cannot cancel an Apple-managed subscription.

A request acquires the write freeze before cleanup. It removes Firestore and Storage data before the Firebase Auth user. Failed cleanup retains the account credentials and a durable pending request. A five-minute scheduled worker resumes only requests accepted by this executor (`resumeVersion: 2`); historical requests are not automatically enrolled. A lost response or missing Auth user alone never becomes a success message. Completion must come from the callable or a server-confirmed completed receipt.

| Data | Behavior |
| --- | --- |
| Profile, workouts, meals, runs, routes, body metrics, programme and settings | Erase the user tree recursively, including legacy and nested descendants. |
| Uploaded progress/profile/food photos | Erase every existing user Storage prefix; any failed prefix prevents Auth deletion. |
| Device food photos and push state | Clear the current device once the request is durably accepted and again at completion if needed. Other devices remain subject to the existing local retention/cleanup behavior. |
| Authored activities and space posts | Erase originals, nested likes/comments and copies in former followers’ feeds, including retired spaces. |
| Comments on another person’s content | Replace visible content with “Comment deleted”; remove identity fields. Original text goes in a separate client-denied moderation-evidence collection. |
| Follows, blocks, kudos, likes, reactions, memberships and challenge participation | Remove the user’s references, including legacy records whose UID exists only in the document path. Counted edges use transactions to avoid decrementing twice. |
| Goal circles | Remove authored events and support references, remove membership, close owned circles and remove invite codes; preserve other members’ data. |
| Reports and moderation markers | Remove identity and free-form material for the deleted account, retain bounded minimal case metadata, and preserve a report against another account without the deleted reporter’s identity. |
| Stripe subscription | Save a private cancellation task before profile erasure; cancel immediately or retry after provider failure. Remove the task once cancellation succeeds. |
| Firebase Auth login | Delete only after the preceding cleanup and the late-write protection record succeed. |

The old follower-only cleanup helper was removed; its coverage is replaced by execution tests that seed actual feed copies and verify their removal. Social fan-out and the central activity/space engagement transactions check both accounts’ deletion state at commit time, preventing those delayed writers from recreating a cleaned reference.

The legacy ID-only edge scans use collection-group reference projections, full document-path cursors and durable checkpoints. They are correct and bounded per page, but their total reads scale with all matching collection-group references in the app. A future UID-field backfill/reverse index can reduce that cost; the current implementation does not pretend a bare-UID collection-group document-ID query is valid. Cursor documents are private and removed at completion.

## Retention and rollout

These are limited retained records, not a claim that all information disappears immediately. The privacy and terms copy now describes the distinction.

| Record | Expiry/removal |
| --- | --- |
| Completed deletion receipt | Firestore TTL: `accountDeletionRequests.cleanupAfter`, 30 days. |
| Late-write protection | Firestore TTL: `deletedAccounts.expiresAt`, 90 days. |
| Private deleted-comment evidence and minimized reports | Firestore TTL: `expiresAt`, 365 days. |
| Hashed billing identity protection | Firestore TTL: `deletedBillingIdentities.expiresAt`, 13 months. |
| Apple binding retained if the HMAC path is unavailable | Firestore TTL: `appleSubscriptions.deletionExpiresAt`, 13 months. |
| Deletion work cursors | Explicit removal when cleanup completes. |
| Pending Stripe cancellation | Explicit removal after successful cancellation; do not expire an unresolved billing task. |

Expiry fields are Firestore timestamps written through JavaScript Date values. TTL is asynchronous and requires an enabled policy; declaring a timestamp does not itself erase a record. Existing payment-provider records and the pre-existing post-deletion payment-event review policy remain separate. Restore-after-deletion billing policy decisions already listed in the inventory still need owner resolution before App Store submission.

Deploy the added collection-group/worker indexes first and wait for READY. Enable and verify the declared TTL policies. Audit legacy numeric expiry fields separately: this release writes correct timestamp fields for new records, but does not backfill historical documents. Deploy the rules and functions, verify the new worker plus its Stripe and billing-HMAC secret bindings, then release the client. The worker must be operational before the client promises automatic retries. Verify deployed source and an isolated test-account deletion, not only a green deployment workflow. No live account or production data was deleted during this work.

## Email verification

New email/password accounts verify before completing setup. The screen sends the first message immediately, shows delivery errors, offers resend with a cooldown, and supports correcting the address with password confirmation. Returning from Mail triggers Auth reload plus a forced token refresh. The actual onboarding callable rejects an unverified password claim. Already verified Apple/Google accounts continue without this step; existing completed accounts keep their current private access and social verification requirement. Account management, help and deletion stay accessible during verification.

If the branded email service is temporarily unavailable, the client can fall back to Firebase’s verification email. Rate-limit and authorization errors do not use this fallback. The branded callable reads the account’s current email from Auth instead of trusting an old token address.

## Home loading

Home subscribes to a lightweight normalized programme snapshot. It loads the full controller when maintenance is necessary (missing plan, legacy shape, stale week or race mismatch), or when an action needs it. The existing controller still owns migrations, rollover, command concurrency and offline behavior. The read-only claim map takes the snapshot directly. Shared race timing calculations no longer import or execute the full race generator just to label the Home view.

Import-graph tests enforce that Home cannot statically reach `useProgram`, `HomeProgramController` or `runScheduler`. Account switches drop the old snapshot and do not carry a loaded controller into the next account.

The bundle comparison uses the same Vite installation and `CAPACITOR_BUILD=true`, comparing the clean local merge of account (`e32d108`) and performance (`7ed65acd`) branches with this change. It walks the deduplicated static JS imports of index, Home, Layout and the authenticated root providers/components. These are minified bytes before compression, not measured launch times. The automatic Home graph decreased from 1,824,881 to 1,775,154 bytes (49,727 bytes, 2.73%). Across all lazy routes, the web build grew from 5,665.1 to 5,685.8 KiB because this pass also adds verification and deletion UI. The size ratchet now records the shared `runPlanTiming` chunk and the rebalanced `scheduleUtils` chunk, and lowers the generator/controller budgets. These chunks reuse the existing timing code; they do not duplicate the generator.

## Validation

- `npm run verify` passed: lint (0 errors, 95 warnings), both form-art audits, TypeScript, production build, and 9,290 application tests; 348 emulator-gated/skipped cases in the ordinary run.
- `npm test -- --reporter=json` in `functions/`: 1,383 passed, 108 emulator-gated tests skipped in the ordinary run.
- Focused real Firestore emulator: deletion paging/resume, nested cleanup, Auth-last ordering and the actual signup callable, and retry-page eligibility passed (3 tests).
- Firestore rules and collection-group emulator suites: 185 passed, including private evidence/work/billing access and reverse-block deletion freeze.
- Mocked 390 × 844 mobile browser review: light/dark signup, address correction, deletion confirmation, recent authentication, in-flight cleanup, durable pending state and Apple subscription warning. Checked controls meet 44 px minimum, no horizontal overflow, no page exceptions. This verifies local presentation and mocked transitions, not Apple or email-service integration.
- Capacitor web build, `npm run check:dist-size`, and `npm run check:cycles` passed. No circular dependencies.
- Physical-device release checks remain: signed iPhone build, real Mail return, Apple/Google reauthentication and revocation, subscription settings, large-account interruption/recovery, and launch/frame-time/memory/energy profiling.

## Production release sequencing

`deploy-production.yml` is the push/manual entry point for Firestore, Functions, Firebase Hosting and Pages. It serializes releases, deploys Firestore configuration additively, waits for configured indexes to be READY and TTL policies ACTIVE, then runs the existing Storage approval/test/source gate and deploys and checks backend source before either frontend is published. A failed prerequisite blocks both frontends. Backend changes are compared with the last successful release, so a later frontend-only commit cannot skip recovery from a failed backend deployment. Manual runs redeploy all stages. Individual workflows remain reusable implementation steps; use **Deploy production** for manual redeploys. Storage retains its existing cross-service approval gate and is a required release dependency. The owner must have approved Storage-to-Firestore access in Firebase Console and set `STORAGE_XSERVICE_APPROVED=true`; the workflow never grants that access or changes the variable. The last inspected Storage run (`33942538802`) passed tests but skipped deployment at that gate, so a new successful Storage release is required.

The source check covers `deleteMyAccount`, `resumeAccountDeletions`, `completeOnboarding`, and `sendVerificationEmailCallable` as well as the existing comment/training checks. Readiness checks cover pagination, missing/building indexes, collection versus collection-group scope, TTL activation/offset, and repair failures. The existing required emulator job also runs on `codex/**` branches, allowing the real check to pass before a direct merge.
