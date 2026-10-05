# Unattempted alternative browser package

A bounded read-only follow-up on 2026-10-05 identified a normal npm package route that was not established by the earlier installed/cache search. The original browser setup logs remain unchanged.

Normal npm metadata confirmed published `@sparticuz/chromium@148.0.0`: 16 files, 68,969,932 unpacked bytes, Node requirement `>=22.17.0`, and no install/postinstall script. The publisher's package documentation describes a regular package containing Linux x64 Brotli-compressed Chromium payloads and Playwright integration through an explicitly configured executable and serverless launch arguments. The `-min` package omits the binary payload.

This is a separately compiled serverless headless-shell build. Its Chromium major version does not prove that it is the exact Chrome `148.0.7778.96` / Playwright revision `1223` expected by the unchanged artwork configuration. Native launch, ordinary isolated Playwright contexts and the existing player assertions have not been validated with it.

At the initial metadata-only stage, no package was installed, no browser payload was downloaded, no launch was attempted, and no configuration or test was changed. The single normal metadata request for `@playwright/browser-chromium@1.60.0` timed out at 15 seconds and was not retried.

The current outcome is therefore **configured-browser provisioning blocked; all three actual mobile checks not run**. A future deliberate attempt with this alternative would need to retain the repository's test runner, normal contexts and every existing assertion, and record the actual browser version and launch configuration. It must not be placed under revision-1223 cache names or reported as the exact default engine.

Publisher documentation: <https://www.npmjs.com/package/@sparticuz/chromium>. This metadata-only finding supplies no mobile or release approval. A later explicitly authorized, bounded alternate-package attempt installed the package but failed during documented extraction before browser startup. Its separate evidence is retained under `browser-alt/`; no mobile test ran.
