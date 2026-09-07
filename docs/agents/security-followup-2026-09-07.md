# Security follow-up — 7 September 2026

Baseline: `d38349db82ca2ea8f52f4de62189aa1e549560b1`, which includes security PR #2190. This pass addresses three concrete findings without changing authentication policy, production Rules, training logic or artwork assets.

## Changes and evidence

### 1. Development-tool dependency advisories

The fresh full root audit started at **12 package findings: 3 high, 8 moderate, 1 low**. The three high findings traced to Sharp/libvips via unused `@vite-pwa/assets-generator` and `vite-plugin-pwa` packages. The low finding was in esbuild via tsx.

Tropos uses its own committed service worker, registration code and icons. Source/config/workflow searches found no PWA-plugin, generator or Workbox imports. Artwork preview/extraction scripts do import Sharp directly, but previously relied on it being hoisted from the unused generator.

- Remove the unused generator, Vite PWA plugin and Workbox window package.
- Declare `sharp ^0.35.4` directly as a development dependency.
- Update tsx within its existing major to `^4.23.13`, resolving patched esbuild `0.28.2`.
- Make the root CI audit include development dependencies; high/critical findings block merging.

The updated full root audit has **8 moderate findings, 0 high, 0 critical, 0 low**. Those remaining chains involve the Admin/Google SDK used by development and seeding scripts. The server lockfile is unchanged from #2190 and still has its documented nine moderate findings. Counts are package-tree advisories, not a count of demonstrated exploits.

The [Sharp 0.35 release notes](https://sharp.pixelplumbing.com/changelog/v0.35.0/) describe breaking API removals; searches found no use of those removed properties in Tropos's scripts. Validate the existing preview pipeline and full application build before release; do not regenerate committed exercise art as part of this upgrade.

### 2. App Check debug credentials in release builds

Previously, setting `VITE_APP_CHECK_DEBUG_TOKEN` enabled the Firebase debug provider even in production. A registered debug token permits attestation bypass; it must not be distributed. This is a configuration-dependent exposure, **not evidence that a real token was shipped or abused**.

The runtime now reads that variable only in a development branch. A Vite build guard also rejects any non-empty value from the resolved environment, including `.env.local`, mode files and process environment. It applies to every build mode, including native builds, and never prints the value. Local development still works.

Before the fix, five new cases failed: production runtime setup and four release/configuration cases. Tests invoke Vite's actual config resolver so the env-file path is covered, not just a hand-built env object. The existing SDK mock prevents any Google request during unit tests.

Reference: [Firebase debug-provider guidance](https://firebase.google.com/docs/app-check/web/debug-provider).

### 3. App Check blocked by the content security policy

The configured reCAPTCHA v3 provider requires script, frame and fetch resources under `www.google.com/recaptcha/`. The existing policy omitted those paths. Four new policy assertions failed against the baseline.

Add Google's documented reCAPTCHA paths to `script-src`, `frame-src` and `connect-src`, including the secondary `recaptcha.google.com/recaptcha/` frame source. Do not grant all of `www.google.com`, introduce wildcard Google origins or enable inline/eval scripts. The existing `www.gstatic.com` script allowance already covers reCAPTCHA's static resources.

The browser regression test uses the actual CSP meta tag with CSP enforcement enabled. Synthetic, locally intercepted responses establish that the required script/frame/fetch paths work and an unrelated Google script is blocked. It uses no credentials, real reCAPTCHA requests or Firebase writes. CI runs this check explicitly in Chromium.

Reference: [Google's reCAPTCHA CSP requirements](https://developers.google.com/recaptcha/docs/faq#im-using-content-security-policy-csp-on-my-website-how-can-i-configure-it-to-work-with-recaptcha).

## Validation and release

The PR records the final `npm run verify`, dependency audit, preview-pipeline and browser results, plus the served Hosting build stamp. These changes do not require a Functions or Rules deploy. Native clients receive the runtime/CSP changes only in a later signed native build.

This fixes App Check integration prerequisites; it does **not** establish successful attestation or enable enforcement. Registration, production request metrics and native-provider rollout remain operator tasks. Storage's first cross-service approval and active production Rules verification remain open. The progress-photo encryption/key-management decision is also unchanged. No production permissions were widened and no user data was rewritten.
