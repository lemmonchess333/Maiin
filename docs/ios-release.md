# iOS release — getting changes onto the phone

## The core fact

A push to `main` updates the **web** build (GitHub Pages) automatically.
It does **not** update the **native iOS app**. The native app bundles its
web assets at build time (`capacitor webDir: dist` → `cap sync ios`), so it
only changes when an Xcode/TestFlight build runs. If the app on your phone
looks stale after a merge, this is why — the merge updated the web, not the
native bundle.

## Two ways to update the phone

### A. Manual (any Mac with Xcode) — works today, no setup

```bash
git pull origin main
npm install
npm run build          # produces dist/ (verified green in CI)
npx cap sync ios       # copies dist/ into the iOS project
open ios/App/App.xcworkspace
# Xcode → select your device → Run, or Product → Archive → Distribute → TestFlight
```

`npm run build` and `npx cap sync ios` are both verified to succeed against
`main`; only the Xcode step needs a Mac.

### B. Automated (`deploy-ios.yml`) — push-button after one-time setup

`.github/workflows/deploy-ios.yml` builds the web bundle, runs
`cap sync ios`, archives a signed Release build, and uploads it to
TestFlight on a macOS runner. It is **manual-trigger only**
(`workflow_dispatch`) so it never fires unexpectedly on a push — you run it
from the **Actions** tab when you want a new TestFlight build.

> ⚠️ The workflow is a **scaffold authored without a macOS runner or Apple
> credentials, so it has never executed.** Treat the first run as a
> bring-up: expect to adjust scheme/signing specifics for this project.

#### One-time secrets (Settings → Secrets and variables → Actions)

| Secret                            | What it is                                                                                         | How to get it                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                   | 10-char Apple Developer Team ID                                                                    | Apple Developer → Membership                                                |
| `IOS_DIST_CERT_P12_BASE64`        | Apple **Distribution** cert + private key, exported as `.p12`, then `base64 -i cert.p12 \| pbcopy` | Keychain Access → export your "Apple Distribution" identity                 |
| `IOS_DIST_CERT_PASSWORD`          | password you set on the `.p12` export                                                              | —                                                                           |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store provisioning profile for `com.tropos.app`, base64'd                                      | Apple Developer → Profiles (App Store distribution profile)                 |
| `KEYCHAIN_PASSWORD`               | any random string (ephemeral CI keychain)                                                          | `openssl rand -base64 24`                                                   |
| `ASC_API_KEY_ID`                  | App Store Connect API key ID                                                                       | App Store Connect → Users and Access → Integrations → App Store Connect API |
| `ASC_API_ISSUER_ID`               | Issuer ID from the same page                                                                       | —                                                                           |
| `ASC_API_KEY_P8_BASE64`           | the `.p8` API key file, base64'd (download is one-time!)                                           | same page → generate key                                                    |

#### First-run checklist

1. Add all secrets above.
2. Confirm the Xcode **scheme** is `App` and the workspace is
   `ios/App/App.xcworkspace` (defaults in the workflow).
3. Confirm the bundle id in `capacitor.config.ts` (`com.tropos.app`)
   matches the provisioning profile's app id.
4. Actions tab → **Deploy iOS to TestFlight** → Run workflow.
5. If signing fails, the usual culprit is a mismatch between the cert type
   (must be **Apple Distribution**), the provisioning profile (must be
   **App Store**), and `signingStyle: manual` in the export options.

#### Optional: auto-build on release

Once verified, you can add a `push: { tags: ['v*'] }` trigger so cutting a
version tag ships a TestFlight build. Keep it off `push: main` — every merge
becoming a TestFlight build spams testers and burns build numbers.

## Why not just auto-deploy native like the web?

iOS uploads need Apple code-signing secrets + a macOS runner, and every
upload consumes a build number / notifies testers. Manual-trigger (or
tag-triggered) is the sane default; the web can deploy on every push
because it has none of those constraints.
