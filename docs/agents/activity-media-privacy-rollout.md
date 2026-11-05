# Activity media privacy: review and staged rollout

Status: implementation prepared for review. **Not deployed. No production
objects, tokens, accounts or documents have been read or changed.**

## Boundary

Only activity `post-photos/` and `route-maps/` are covered. Profile and
community Space photos retain their separate existing policy. This does not
claim to audit or repair every Firebase media surface.

The old Storage rule allowed any authenticated reader to fetch a known
object path, independently of its post. The old app also published Firebase
download-token URLs and cached images publicly for a year. Those URLs are
bearer capabilities: changing a post to private, removing a follower,
blocking someone, or tightening Storage rules does not revoke the URL.

The new app treats both old and new stored URLs as object identities, not
image sources. It requests bytes through authenticated callables. Every
read checks the current activity, current photo/map membership, live
accounts, visibility, the accepted-follower edge, and blocks in both
directions. Authorization is checked again after a generation-pinned,
size-bounded read. No signed URL or replacement bearer capability is sent.
No system can retract bytes already delivered to an authorized viewer.

New uploads are screened before storage and written through the server
with no usable download token and `private, no-store, max-age=0`. Old
direct uploads and metadata reads are denied at final cutover. Storage
cannot implement the whole access decision within its two-Firestore-read
budget, so it deliberately denies direct social-media reads rather than
maintaining an asynchronous ACL mirror.

## Deployment is deliberately not authorized by this patch

Do not merge this as one ordinary production release. The current pipeline
deploys Storage before Functions and the web app. A combined release would
break old uploads before the new callables are available. Stage and verify
the release below in a separate review. Each production operation, legacy
token revocation and any minimum-client-version decision needs approval.

1. **Isolated staging with synthetic data.** Test real Firebase Auth,
   Functions and Storage, not only mocks. This patch is not ready to deploy
   unchanged to a separate staging project: the server and client media
   identities, Firestore media URL rules and moderation URL validation
   allow only the production bucket names. A separately reviewed staging
   configuration must bind those checks and the actual SDK bucket to the
   same isolated project, while retaining production's strict allowlists.
   Until that prerequisite exists, this gate is blocked; do not substitute
   probes against production or loosen the production allowlists.
   Verify the Admin SDK's upload
   produces no usable Firebase download token, the callable response is
   not cached, Firebase SDK direct reads fail, and byte limits work. Test
   owner, current follower, removed follower, stranger, bilateral blocks,
   private/public changes, deleted/removed media and account deletion. Use
   a synthetic legacy token to prove the URL initially works and then
   stops after the chosen revocation operation. Never use a customer's
   image as a probe.
2. **Server and gateway readers first; keep existing upload writers.**
   Split this combined patch into a release that publishes the authenticated
   callables, generation-safe screening and gateway-reading clients, without
   activating tokenless uploads or the final Storage lockdown. Keep the
   existing upload writers and screening trigger during this window. The
   current combined client already activates tokenless uploads, so it is
   not this compatibility release. The old exposure remains during this
   stage; do not call it fixed. Gateway readers can read old records without
   using their tokens.
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
- Rollback must retain deny-direct rules and revoked tokens. A rollback
  may degrade image availability; it must not restore public tokens or
  the old permissive Storage reads.

## Review gates

Require Storage emulator tests without skips, gateway positive/negative
and race tests, client session/lifecycle tests, repository lint/typecheck,
full `npm run verify`, Functions suite, and staging/device verification.
Focused unit/emulator results alone are not a production release approval.
