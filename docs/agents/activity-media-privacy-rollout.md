# Activity media privacy: reader-first stage and later cutover

Status: **reader/server-only preparatory stage**, split from the full privacy
patch. Not deployed. No production objects, tokens, accounts or documents
have been read or changed by this work.

This stage does **not** close the known-path or bearer-token exposure.
Storage rules and the app's legacy tokenized upload writers are unchanged
from main at `0de37832274a05ce1384bb8b7c01c8734ce0f5a9`. This retains the URL
format old readers expect during adoption; it does not establish that the
existing upload rules permit every operation in the deployed environment.

Included: `readActivityMedia`, `readReportedActivityMedia`, their client
readers, and generation-pinned legacy screening. Not included: an exported
`uploadActivityMedia` callable, client tokenless writers, Storage lockdown,
legacy-token revocation or a minimum-client-version policy. The server's
future upload helper and its unit tests remain dormant; no deployed endpoint
invokes that helper. The client has no tokenless-upload transport.

Gateway readers never fall back to a bearer URL after denial. A failed
Functions rollout prevents the new web build from publishing through the
existing pipeline, while legacy readers and writers remain available.

## Boundary

Only activity `post-photos/` and `route-maps/` are covered. Profile and
community Space photos retain their separate existing policy. This does not
claim to audit or repair every Firebase media surface.

The retained Storage rule allows any authenticated reader to fetch a known
object path, independently of its post. Retained upload writers publish
Firebase download-token URLs and cache images publicly for a year. Those URLs are
bearer capabilities: changing a post to private, removing a follower,
blocking someone, or tightening Storage rules does not revoke the URL.

The new gateway readers treat stored URLs as object identities, not image
sources. It requests bytes through authenticated callables. Every
read checks the current activity, current photo/map membership, live
accounts, visibility, the accepted-follower edge, and blocks in both
directions. Authorization is checked again after a generation-pinned,
size-bounded read. No signed URL or replacement bearer capability is sent.
No system can retract bytes already delivered to an authorized viewer.

In the future cutover, uploads will be screened before storage and written
through the server with no usable download token and
`private, no-store, max-age=0`. Direct uploads and metadata reads will be
denied then, not in this stage. Storage cannot implement the whole access
decision within its two-Firestore-read budget; the final cutover will deny
direct social-media reads rather than maintain an asynchronous ACL mirror.

## Release boundaries

This branch prepares only the reader-first stage. Its unchanged Storage
rules can precede the new Functions and web app in the existing pipeline
without imposing the final lockdown on old upload clients. Required CI and
review still precede publication; a local test pass is not deployment or
production verification.

Do not combine tokenless writers and final Storage lockdown with this stage.
The current pipeline deploys Storage before Functions and the web app, so a
combined first release would break old uploads before replacement callables
are available. Any later production token migration or minimum-client-version
decision needs separate approval. No such operation is authorized or executed
by preparing this branch.

1. **Isolated staging with synthetic data.** Test real Firebase Auth,
   Functions and Storage, not only mocks. This patch is not ready to deploy
   unchanged to a separate staging project: the server and client media
   identities, Firestore media URL rules and moderation URL validation
   allow only the production bucket names. A separately reviewed staging
   configuration must bind those checks and the actual SDK bucket to the
   same isolated project, while retaining production's strict allowlists.
   Until that prerequisite exists, this gate is blocked; do not substitute
   probes against production or loosen the production allowlists.
   `python3 scripts/prepare-activity-media-staging.py --project <isolated-project-id> --output <new-directory-outside-checkout>`
   prepares a reviewable patch, source hashes, blank-key web configuration
   template and checklist without modifying this checkout or cloud state.
   It removes manual patch preparation, not the need for an authorized
   isolated project, access, stage-specific fixtures and real service checks.
   Apply any reviewed patch only to a dedicated staging worktree, never to
   the production release branch or production deployment workflows.
   Verify the Admin SDK's upload
   produces no usable Firebase download token, the callable response is
   not cached, Firebase SDK direct reads fail, and byte limits work. Test
   owner, current follower, removed follower, stranger, bilateral blocks,
   private/public changes, deleted/removed media and account deletion. Use
   a synthetic legacy token to prove the URL initially works and then
   stops after the chosen revocation operation. Never use a customer's
   image as a probe.
2. **Server and gateway readers first; keep existing upload writers.**
   This branch is that compatibility release: authenticated read callables,
   generation-safe screening and gateway-reading clients, with existing
   upload writers and Storage rules retained. There is no upload callable
   export. Verify both old and gateway clients can display new legacy
   uploads, and the gateway denies unauthorized requests without falling
   back to direct URLs. The old exposure remains; do not call it fixed.
   Verify exact deployed source before treating gateway reader adoption as
   established.
3. **Approve the old-client policy and establish adoption before tokenless
   uploads.** Old clients use stored URLs directly as image sources and
   cannot display the new tokenless identities, even while Storage rules
   still allow reads. Before the first app release that writes those
   identities, decide whether to require an update or explicitly accept
   unavailable new images and, at final lockdown, uploads on old builds.
   Web users must refresh; installed iOS builds need their own release and
   update path. Verify compatible-reader adoption or the approved old-client
   policy before proceeding. There is no secure bearer-URL fallback.
   New clients fail closed: unavailable photo tiles and the existing drawn
   route fallback. Session logging and text posts should still work.
4. **Activate tokenless uploads.** Release the gateway upload writers only
   after the server is verified and the preceding adoption/policy gate is
   satisfied. Verify picking, screening, saving and viewing on supported
   web and native clients before changing Storage rules.
5. **Stop creation of legacy capabilities.** Deploy the final deny-direct
   Storage rules only after the server/app verification. Verify the exact
   rules release and its Storage service-agent IAM prerequisite. Check
   that no other upload writer or public bucket/object ACL bypasses this
   boundary. Quiesce concurrent legacy writes before inventory/revocation.
6. **Approved legacy migration.** Produce a dry-run inventory of only the
   two media prefixes, covering named files, orphaned files, metadata token
   lists, current generations, cache controls and retained object versions.
   Keep any manifest private; never log or commit token values or images.
   Revoke *all* legacy download tokens using generation/metageneration
   preconditions, and change future-response cache controls to no-store.
   Process bounded batches, checkpoint outcomes, retry only unchanged
   generations, and re-inventory to establish zero usable legacy tokens.
   Do not merely replace one token with another or remove URL fields.
   Rewriting stored URLs without revoking object metadata does not fix
   previously copied URLs. The app does not require a Firestore rewrite
   to read old records through the gateway.
7. **Verify and monitor.** With synthetic canaries, prove denied direct
   reads, denied old token URLs, authorized callable reads, immediate
   denial on the next request after follower removal/block/privacy
   change, and continued report-scoped moderator access. Verify deployed
   source and rules, callable error/cost rates, deletion cleanup, phone
   picking/viewing, offline behavior and account switching. Close only
   after rules, client adoption and token inventory all establish the
   intended boundary.

## Cache and compatibility limits

- Revocation cannot erase downloaded copies, screenshots, device caches or
  intermediary responses already cached with the old one-year public TTL.
  Changing cache headers now is not retroactive. Assess CDN/browser cache
  behavior in staging and communicate that residual limit accurately.
- The new app creates short-lived in-memory blob URLs and revokes them on
  image change, unmount and sign-out. It never persists image bytes or
  falls back to a token URL after a denial. An already-rendered image is
  not a promise of continuous authorization; the server controls each new
  read, and bytes already received cannot be recalled.
- Moderation uses a dedicated admin-gated, pending-report-scoped photo
  read. It does not grant moderators an arbitrary media-path endpoint.
- The small base64 callable payload adds bandwidth overhead versus direct
  images. Check feed performance, 240-read/minute per-user throttling,
  memory and Vision cost before release. There is no shared media cache.
- After the final cutover, rollback must retain deny-direct rules and
  revoked tokens. It may degrade image availability; it must not restore
  public tokens or the old permissive Storage reads. This reader-first
  stage has not applied either lockdown or token revocation.

## Review gates

For this preparatory stage, require the unchanged legacy Storage rules and
writers to remain compatible, no exported upload callable, gateway
positive/negative and race tests, client session/lifecycle tests, repository
lint/typecheck, full `npm run verify`, Functions suite, and staging/device
verification. Verify the two new read functions deploy before the web reader.

The later privacy cutover additionally requires Storage emulator tests
without skips for deny-direct rules, real tokenless-upload and legacy-token
revocation canaries, the approved old-client policy, and a complete legacy
inventory. Focused unit/emulator results alone are not a production release
approval, and passing the reader-first gates does not close the exposure.

The retained legacy upload predicates can consult three distinct Firestore
documents (deletion tombstone, deletion request and activity), while Storage
rules have a two-document cross-service budget. This needs separate
verification; keeping main's rules is not proof of upload availability.
The local synthetic probe denied an owner post-photo upload but also allowed
a progress-photo upload despite a seeded deletion tombstone. That run cannot
reliably distinguish the document budget from unavailable cross-service
reads. Conditional skips in the unchanged legacy suite are not a passed
compatibility gate. Do not loosen the rules or tests to pass this stage.
