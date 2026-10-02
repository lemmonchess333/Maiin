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
open ios/App/App.xcodeproj   # SPM project — there is no .xcworkspace
# Xcode → select your device → Run, or Product → Archive → Distribute → TestFlight
```

`npm run build` and `npx cap sync ios` are both verified to succeed against
`main`; only the Xcode step needs a Mac.

### B. Automated (`deploy-ios.yml`) — push-button after one-time setup, no Mac needed

`.github/workflows/deploy-ios.yml` builds the web bundle, runs
`cap sync ios`, archives a signed Release build, and uploads it to
TestFlight, on one of GitHub's macOS runners (`macos-26`; free for a public
repo). It is **manual-trigger only** (`workflow_dispatch`) so it never fires
unexpectedly on a push — you run it from the **Actions** tab when you want a
new TestFlight build, then install the build with Apple's TestFlight app.
Nothing in this route needs a Mac: every file below comes from Apple's or
Firebase's website, and the one step a Mac would normally do (the
certificate request) is done with openssl in a Codespace.

> ⚠️ The workflow has **never completed a run.** Treat the first run as a
> bring-up. Before archiving it checks every secret, the profile and the
> certificate, so a wrong file fails in the first minutes with a message
> naming it.

#### First: the App ID's capabilities

A provisioning profile carries the capabilities its App ID had when the
profile was made, and the archive refuses an app whose entitlements
(`ios/App/App/App.entitlements`) the profile lacks. So before making the
profile, open Apple Developer → Identifiers → `com.tropos.app` and turn on:

- **App Attest**: the native App Check provider.
- **HealthKit**: steps, through `capacitor-health`.
- **Sign in with Apple**: native Apple sign-in. On since 2026-07.

Turning a capability on later means making the profile again.

#### One-time secrets (Settings → Secrets and variables → Actions)

| Secret                                 | What it is                                                                  | Where it comes from                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `APPLE_TEAM_ID`                        | 10-character Apple Developer Team ID                                        | Apple Developer → Membership details                                                                                                 |
| `IOS_DIST_CERT_P12_BASE64`             | the Apple Distribution certificate and its private key, as a `.p12`, base64 | the Codespace commands below                                                                                                         |
| `IOS_DIST_CERT_PASSWORD`               | the password on that `.p12`                                                 | made by the same commands                                                                                                            |
| `IOS_PROVISIONING_PROFILE_BASE64`      | App Store Connect distribution profile for `com.tropos.app`, base64         | Apple Developer → Profiles → + → **App Store Connect** → `com.tropos.app` → the certificate above → download                         |
| `ASC_API_KEY_ID`                       | App Store Connect API key ID                                                | App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → generate one with the **App Manager** role |
| `ASC_API_ISSUER_ID`                    | the Issuer ID shown on the same page                                        | same page                                                                                                                            |
| `ASC_API_KEY_P8_BASE64`                | the key's `.p8` file, base64 (Apple lets you download it once)              | same page                                                                                                                            |
| `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` | the iOS app's `GoogleService-Info.plist`, base64                            | Firebase Console → Project settings → Your apps → **iOS app** → download                                                             |

The signing keychain's password is generated inside the job, so it has no
secret. Values are trimmed of surrounding whitespace, so a secret pasted
with a trailing newline still works.

#### The certificate without a Mac

On a Mac, Keychain Access makes the certificate request. In a Codespace,
openssl does the same job:

1. In the Codespace terminal:

   ```bash
   cd /workspaces/Maiin && mkdir -p ios-signing
   echo "/ios-signing/" >> .git/info/exclude   # keeps the private key out of git
   cd ios-signing
   openssl genrsa -out dist.key 2048
   openssl req -new -key dist.key -out dist.certSigningRequest -subj "/CN=Tropos Distribution/C=GB"
   ```

2. In the Explorer, right-click `ios-signing/dist.certSigningRequest` →
   **Download**.
3. Apple Developer → Certificates → **+** → **Apple Distribution** → upload
   that file → download `distribution.cer`.
4. Drag `distribution.cer` into the `ios-signing` folder, then:

   ```bash
   cd /workspaces/Maiin/ios-signing
   openssl x509 -inform DER -in distribution.cer -out dist.pem
   openssl rand -hex 16 | tr -d '\n' > IOS_DIST_CERT_PASSWORD.txt
   openssl pkcs12 -export -inkey dist.key -in dist.pem -name "Tropos Distribution" \
     -out dist.p12 -passout file:IOS_DIST_CERT_PASSWORD.txt \
     -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
   base64 -w0 dist.p12 > IOS_DIST_CERT_P12_BASE64.txt
   ```

   The `-keypbe`, `-certpbe` and `-macalg` options pick the older `.p12`
   encryption that macOS's `security` tool imports. OpenSSL 3's default can
   fail there with "MAC verification failed".

5. Open each `.txt` file, select all, copy, and paste it into the secret
   of the same name.

The profile, the API key and the Firebase plist go the same way: download
the file, drag it into `ios-signing`, run `base64 -w0 <file> > <SECRET>.txt`,
and paste. When every secret is set, delete the folder with
`rm -rf /workspaces/Maiin/ios-signing`. If the private key is ever lost,
revoke the certificate on Apple's site and make a new one.

`IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` is not signing material, but it is
the one secret without which the build is useless: every
`@capacitor-firebase/*` plugin calls `FirebaseApp.configure()` when the
bridge loads it at launch, and `configure()` aborts the process if the
bundle has no `GoogleService-Info.plist`. The file is gitignored
(`ios/.gitignore`) and referenced by the Xcode project, so on CI the
workflow writes it from this secret before `cap sync`, checks its
`BUNDLE_ID` is `com.tropos.app`, and — because the GoogleSignIn SDK
raises without it — registers the plist's `REVERSED_CLIENT_ID` as a URL
scheme in `Info.plist` for that build. Locally, drop the same file into
`ios/App/App/` and add the URL scheme by hand (LAUNCH_TODO §15 step 2).

The build step additionally reads the `VITE_FIREBASE_*` client config, the
same six secrets `deploy.yml` uses for the web deploy, so on this repo they
are already set. They are listed here because the workflow shipped without
them: the 2026-07-11 audit scoped the signing credentials to individual steps
and the build step never regained an env block, so every build produced a
bundle with a blank Firebase config where every sign-in returns
`auth/internal-error`. `scripts/check-web-env.mjs` now runs first and fails
the job instead.

`VITE_REVENUECAT_IOS_KEY` is deliberately NOT wired into this workflow. See
the comment on the build step, and the activation order in
`docs/iap/revenuecat-setup.md`.

#### First-run checklist

1. Turn on the App ID's capabilities, then add all the secrets above.
2. Make sure App Store Connect → Apps has an app for `com.tropos.app`. The
   upload has nowhere to go without one.
3. Actions tab → **Deploy iOS to TestFlight** → Run workflow.
4. The run checks the secrets, then the profile (team, bundle id, App
   Store type, expiry, the app's entitlements) and the certificate (a valid
   Apple Distribution identity that the profile was made for), before
   archiving. Its error names the piece to fix.
5. Signing: the project as committed signs automatically, which cannot
   work on a runner with no Apple account, so the workflow switches the App
   target alone to manual signing with the imported profile. It does this
   in the project file, not on the `xcodebuild` command line, where a
   profile setting would reach every Swift package target and be refused.
   The scheme is `App` and the project is `ios/App/App.xcodeproj`. There is
   no `.xcworkspace`: Capacitor 8 consumes its plugins through the local
   Swift package `ios/App/CapApp-SPM`, and the workflow archives with
   `-project`, the way `cap build ios` does.
6. Build numbers come from the workflow, not the project. `project.pbxproj`
   pins `MARKETING_VERSION = 1.0` and `CURRENT_PROJECT_VERSION = 1`; the
   archive step overrides them with `package.json`'s version and
   `$GITHUB_RUN_NUMBER`, because App Store Connect refuses any upload
   whose build number is not higher than the last one. Bump
   `package.json` to move the version testers and the App Store see; the
   build number takes care of itself.

#### Optional: auto-build on release

Once verified, you can add a `push: { tags: ['v*'] }` trigger so cutting a
version tag ships a TestFlight build. Keep it off `push: main` — every merge
becoming a TestFlight build spams testers and burns build numbers.

## Why not just auto-deploy native like the web?

iOS uploads need Apple code-signing secrets + a macOS runner, and every
upload consumes a build number / notifies testers. Manual-trigger (or
tag-triggered) is the sane default; the web can deploy on every push
because it has none of those constraints.
