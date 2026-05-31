---
name: verifier-tropos-web
description: Drive the Tropos Vite + React + Firebase web app against the local emulator and capture evidence (screenshots, console errors, navigation events) for a PR verification. Use when the /verify skill needs a handle to a running Tropos instance — not for unit tests, not for CI replay.
---

# verifier-tropos-web

Evidence-capture protocol for the Tropos web SPA. Boots the Firebase
emulator + a production-built preview server pointed at it, signs in
as a seeded test user, and drives Playwright against locally-cached
Chromium. The output is screenshots + a JSON capture of every console
error so a reviewer can replay what was observed.

## When to invoke

- `/verify` against a PR that touches `src/**` and needs runtime
  observation
- Confirming a fix actually works in the real auth → Firestore flow
  (not just that tests pass)
- Capturing pre-merge screenshots for a UI change

**Don't use for:** unit tests (those are CI), pure docs PRs, code
review (read the diff), changes that don't reach the React tree at
runtime (build config, types-only).

## What this protocol guarantees

- The app is built in production mode (the same artifact GitHub
  Pages would serve)
- The build is pointed at local Firebase emulators — no production
  data, no real Firestore writes, no real Auth requests
- A seeded test user (`e2e-test@tropos.test`) has a hydrated profile
  so authenticated routes have real data to render
- Chromium runs headlessly against the served bundle; screenshots
  capture what a user would see
- Every console error gets recorded with its full text

## Prerequisites

The remote container should already have:

- `npx firebase-tools` available (install via `npm install --no-save
firebase-tools` if absent — required for the emulator). Note: bare
  `npx firebase emulators:start` can fail with `could not determine
  executable to run` when firebase-tools isn't linked on PATH — after
  the install, invoke the local binary directly:
  `node_modules/.bin/firebase emulators:start ...`.
- Java (`which java`) — the auth emulator's a JAR
- A bundled Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (Playwright's download server is blocked by the container's outbound
  network policy — use the pre-cached one)

## Recipe

Run these in order. Each step depends on the previous.

### 1. Start emulators (background)

```bash
npx firebase emulators:start --only auth,firestore --project demo-tropos &
sleep 8
curl -sI http://127.0.0.1:9099 | head -1   # → HTTP/1.1 200 OK
curl -sI http://127.0.0.1:8080 | head -1   # → HTTP/1.1 404 Not Found (server up, root not mapped)
```

### 2. Seed the test user

The seed script defaults to `GCLOUD_PROJECT=adaptive-fitness-af8bb`
(production). Override it to match the emulator's `--project` flag.

```bash
E2E_AUTH_EMULATOR=1 \
  GCLOUD_PROJECT=demo-tropos \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npm run seed:e2e
```

Expected output: `[seed-e2e-user] Created user: <uid>` then
`Profile written for <uid>`. If it says "user already exists" that's
fine — the script is idempotent.

### 3. Build the preview bundle

The `VITE_USE_EMULATORS=true` flag triggers `connectAuthEmulator()` +
`connectFirestoreEmulator()` calls in `src/lib/firebase.ts:69`. The
other `VITE_FIREBASE_*` vars can be dummy strings — only the
project ID needs to match the emulator.

```bash
VITE_USE_EMULATORS=true \
  VITE_FIREBASE_API_KEY=demo \
  VITE_FIREBASE_AUTH_DOMAIN=localhost \
  VITE_FIREBASE_PROJECT_ID=demo-tropos \
  VITE_FIREBASE_STORAGE_BUCKET=demo.appspot.com \
  VITE_FIREBASE_MESSAGING_SENDER_ID=000000000 \
  VITE_FIREBASE_APP_ID=1:000000000:web:000000 \
  npm run build
```

### 4. Serve via vite preview (background)

```bash
npm run preview -- --port 4173 --strictPort &
sleep 3
curl -sI http://localhost:4173/Maiin/ | head -1   # → HTTP/1.1 200 OK
```

### 5. Drive with Playwright

Use the `drive.mjs` next to this SKILL.md as a starting template,
or copy + adapt for the specific surfaces under review. The driver
MUST:

- Set `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`
- Set `bypassCSP: true` on the context (production CSP doesn't
  allowlist `127.0.0.1:9099` — bypass is only safe because we're
  intentionally pointing at an emulator)
- Use `waitUntil: "domcontentloaded"` not `"networkidle"` — Firebase
  SDK keeps the network busy with background calls that have no
  emulator route
- Use `#login-email` / `#login-password` / `button[type="submit"]`
  selectors (matches `e2e/helpers/auth.ts`)
- Wait for `<nav>` first child visible as the sign-in success signal
  (bottom-nav only renders inside authenticated Layout)
- Capture console errors via `page.on("pageerror", ...)` and
  `page.on("console", m => m.type() === "error" && ...)`

Example skeleton at `./drive.mjs` in this skill directory.

### 6. Tear down

```bash
pkill -f "vite preview"
pkill -f "firebase emulators"
```

## Capture format

Every run emits:

- `screenshots/<NN>-<name>.png` — full sequence at consistent viewport
  (393×852, matches iPhone 14 production audit target)
- `errors.json` — every `pageerror` + `console.error` with file/line
  context, less the environment-noise classes (DEP0040, MetadataLookup,
  favicon 404)
- `summary.md` — verdict + step-by-step observations the verifier
  writes after the run

## Known environment noise to ignore

These come from the container, not the diff under review:

- `ERR_CERT_AUTHORITY_INVALID` on Firebase SDK background calls
  (region detection, installations, telemetry) — emulator only routes
  Auth + Firestore, other Firebase services hit the real cloud and
  fail TLS validation
- `Failed to load resource: 404 Not Found` for `favicon.ico` —
  vite preview doesn't serve the manifest icons
- `MetadataLookupWarning` / `DEP0040 (punycode)` in seed-script
  output — Node.js deprecations + GCP metadata fallback

## Known pre-existing bugs surfaced

These reproduce against the seeded user but aren't introduced by
any specific PR — note them in findings, don't FAIL for them:

- **`useProgram` setDoc with `undefined primaryGoal`**: the seed
  script writes a profile without `primaryGoal`, then `useProgram`
  attempts `setDoc({ primaryGoal: undefined })` which Firestore
  rejects. Surfaces as "Failed to load programme" on `/program`.
  The Section error boundary catches and renders Retry. Pre-existing.

## What to verify per common change type

| Change touches                                      | Drive these surfaces                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Auth / AuthProvider / Login                         | sign-in, sign-out, bottom-nav visible post-auth                     |
| Firestore reads / hooks                             | Home, Food, Program, History — the consumers render real data       |
| UI primitives (Button, IconButton, Spinner, Dialog) | Login (Button + Spinner), Home gear (IconButton), any modal trigger |
| Run / GPS / RunMap                                  | `/run` cold open + RunResumePrompt + setup modal                    |
| Food / scanner / favourites                         | `/food` composer focus, suggestions dropdown, scan button           |
| Program / Run scheduler / DayActionSheet            | `/program` Day peek → Manage CTA                                    |
| Settings sections                                   | `/settings/*` route per section                                     |
| Social / feed / crews                               | `/social` and sub-tabs                                              |

## When to file a `verifier-*` upgrade

If you hit a step that took >2 minutes to figure out — the seed-
script project ID mismatch, the CSP bypass, the chromium fallback
path — open a PR against this skill with the fix inline. The cost of
the next agent re-deriving it is higher than the cost of the edit.
