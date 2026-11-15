# iPhone invite links

## What is implemented

A compatible installed iPhone app can receive `https://troposfit.com/?invite=K7P49M2H` through Capacitor on cold launch or while open. Only HTTPS links on that exact origin and root path, with one valid invite code, are accepted. Other URLs do not become routes. The app keeps the code through sign-in and setup; a signed-in person reaches Find people to confirm using it. The server’s first-14-days rule, blocks, restrictions and Approve followers behavior are unchanged. Receiving a link never redeems it by itself.

Browser welcome/sign-up shows the selectable code and an explicit Copy invite code action with success/failure feedback. It explains where to paste the code after installing. A link opened before installation **does not survive installation automatically**: Safari and the native app do not share storage. Copy the code first, or return to the original message and tap its link after installing a compatible build. No clipboard is read automatically.

## Release prerequisites, not performed by this change

1. With owner authorization, verify or enable Associated Domains for Apple bundle ID `com.tropos.app` and regenerate every distribution/development provisioning profile used to sign it. The checked-in entitlement now requests `applinks:troposfit.com`; an old profile can fail signing. The signing preflight accepts Apple's `["*"]` profile authorization for this capability while keeping the app's domain list explicit and other entitlement checks exact. The CI signing helper must not be assumed to enable the capability.
2. Verify the released app’s `application-identifier` entitlement, including its prefix. The public prefix is usually the Team ID but can differ on legacy accounts. Do not guess it or substitute the App Store numeric ID. This patch intentionally contains no fake prefix.
3. Supply that prefix as `IOS_APP_ID_PREFIX` to the **Firebase Hosting build** (`npm run build:hosting`) through an authorized deployment configuration change. The optional build plugin emits `dist/apple-app-site-association` with `<prefix>.com.tropos.app`, limited to root links carrying an eight-character invite parameter and, since App1 Q51 (2026-11-14), a shared post's address, `/activity/*`, which the app opens as the post (`nativePostLinks.ts`) and which without the app is the post's public page. No file is generated without configuration, on the GitHub Pages build, or on native builds. Invalid supplied prefixes fail the Hosting build. Do not claim links are enabled just because the JavaScript build passes.
4. Deploy the Hosting artifact only after approval. Confirm `https://troposfit.com/apple-app-site-association` returns the expected JSON, HTTP 200, `application/json`, and no redirect or sign-in. It must be the real file, not the SPA HTML fallback. Verify the Apple CDN has refreshed the association. Firebase’s existing dotfile ignore is unchanged because this uses Apple’s supported root location.
5. Release a newly signed iPhone build only after approval. Existing installed versions do not gain the entitlement or listener from a web deployment. DNS, Apple settings, profiles, CI settings and deployments have not been changed here.

## Physical-device acceptance

Use synthetic accounts/codes. Do not test with customer accounts or media.

- Installed app terminated: tap a fresh invite from Messages or Mail. Sign in and finish setup. The code survives and is redeemed once.
- Installed app open: tap a new link on welcome, midway through setup, and with Find people open. The latest code replaces the pending one. Old lookup responses must not name the previous inviter. Cancel/dismiss/back and tap another link; Find people must reopen.
- Clear or edit the invite field, dismiss it, then reopen the same invite link: the field refills and reopens. Manually replace a link's code and submit it: success/final refusal clears the old pending code, and a transient failure keeps the entered code, unless another link arrived during the request. A link received while the plan is already saving stays pending for confirmation in Find people; the older code is not redeemed.
- Warm delivery before a slow cold-launch result: the newer code wins. Unmount/remount must neither lose the cold URL nor replay one already consumed.
- New install: open a link in Safari, copy the code, install, and paste at “Invited by a friend?”; repeat by reopening the original message after installing. No promise of deferred deep linking.
- Clipboard denied/unavailable: the code stays selectable and the page gives manual-copy instructions. Check light/dark, VoiceOver, 320px width, and large text.
- Inviter approval on (including absent/default): inviter follows the new person, sees one request with Accept, and the new person cannot read followers-only posts before acceptance. With approval off, both follow immediately. Keep normal server refusal behavior for expired eligibility, blocks, reused codes and restricted accounts.
- Tap a legal link, auth callback, unknown path, foreign host, HTTP URL, malformed code, or duplicate invite parameters: no invite navigation or redemption.
- Safari can keep same-domain navigation in the browser, and users can prefer the website. Test from Messages/Mail rather than typing the address or tapping a same-domain page link. This patch does not add a custom URL scheme or invent an unverified App Store listing link.

Automated tests exercise URL validation, listener lifetime/order, live field updates, copy feedback and association scope. Linux tests cannot prove Apple CDN propagation, provisioning entitlements, system link preference, or physical-device behavior.
