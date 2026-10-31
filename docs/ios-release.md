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
npm run build:ios      # builds from the native asset root and runs cap sync ios
open ios/App/App.xcodeproj   # SPM project — there is no .xcworkspace
# Xcode → select your device → Run, or Product → Archive → Distribute → TestFlight
```

`npm run build:ios` uses the native asset root and copies the web bundle into
the iOS project; only the Xcode step needs a Mac. Select the `App` scheme to
archive the iPhone app with its embedded `TroposWatch` companion. The Watch
app's bundle ID is `com.tropos.app.watchkitapp`; its minimum is watchOS 9.
The ordinary iPhone run path remains available on iOS 15.4 without a Watch.

### B. Automated (`deploy-ios.yml`) — push-button after one-time setup, no Mac needed

`.github/workflows/deploy-ios.yml` builds the web bundle, runs
`cap sync ios`, archives a signed Release build, and uploads it to
TestFlight, on one of GitHub's macOS runners (`macos-26`; free for a public
repo). It is **manual-trigger only** (`workflow_dispatch`) so it never fires
unexpectedly on a push — you run it from the **Actions** tab when you want a
new TestFlight build, then install the build with Apple's TestFlight app.
Nothing in this route needs a Mac: every value below comes from Apple's or
Firebase's website.

> ⚠️ The workflow has **never completed a run.** Treat the first run as a
> bring-up. Before archiving it checks every secret, both profiles and the
> certificate, so a wrong file fails in the first minutes with a message
> naming it.

#### Signing: the API key, or your own certificate

A TestFlight archive with a Watch companion needs one Apple Distribution
certificate and separate App Store provisioning profiles for the iPhone and
Watch apps. The workflow gets them one of two ways:

- **From the API key (the default).** With none of the four
  `IOS_DIST_CERT_*` / iPhone and Watch provisioning profile secrets set, each
  run makes a private key on the runner, asks App Store Connect's API for one
  distribution certificate and a separate profile for each app ID
  (`scripts/ios/asc-signing.mjs`), and signs with those. The key never leaves
  the runner. Each run makes a new certificate and revokes the previous
  run's certificate. Apple Developer → Certificates shows one Apple
  Distribution certificate from these runs, and Profiles shows two profiles
  named `Tropos CI <serial>` and `Tropos CI <serial> Watch 1`. Revoking an
  old certificate does not affect builds already uploaded, which Apple
  signs itself. This needs the API key to have the **Admin** role.
- **Your own certificate.** Set all four secrets, including the Watch profile,
  and the run signs with them instead: the openssl steps under "Your own
  certificate" below. The API key then only uploads, which the **App
  Manager** role allows.

Either way the run checks the certificate and both profiles against the team,
their bundle IDs and each target's entitlements before it archives. It
requires production APNs in the iPhone profile, then verifies both signed
apps in the archive and exported IPA before uploading the verified artifact.

#### First: the App ID's capabilities

A provisioning profile carries the capabilities its App ID had when the
profile was made, and the archive refuses an app whose entitlements
(`ios/App/App/App.entitlements`) the profile lacks. So before the first
run, open Apple Developer → Identifiers → `com.tropos.app` and turn on:

- **App Attest**: the native App Check provider.
- **HealthKit**: steps, Watch run heart rate and optional completed-run export.
- **Sign in with Apple**: native Apple sign-in. On since 2026-07.
- **Push Notifications**: native remote notifications. The TestFlight profile
  must permit production APNs; see [iPhone push setup](ios-push-notifications.md)
  for the separate Firebase APNs key setup and device acceptance check.

Also register `com.tropos.app.watchkitapp` as a separate Watch App ID under
Identifiers. Turn on **HealthKit** there before making its App Store Connect
profile. The Watch profile must use the same Apple Distribution certificate
as the iPhone profile. The Watch target has its own entitlements file at
`ios/App/TroposWatch/TroposWatch.entitlements`.

Turning a capability on later means making the profile again. A run that
signs from the API key makes a new profile each time, so for that, run the
workflow again.

#### Secrets (Settings → Secrets and variables → Actions)

| Secret                                  | What it is                                                                                | Where it comes from                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                         | 10-character Apple Developer Team ID                                                      | Apple Developer → Membership details                                                                                                                                   |
| `ASC_API_KEY_ID`                        | App Store Connect API key ID                                                              | App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → generate one with the **Admin** role (App Manager with your own certificate) |
| `ASC_API_ISSUER_ID`                     | the Issuer ID shown on the same page                                                      | same page                                                                                                                                                              |
| `ASC_API_KEY_P8_BASE64`                 | the key's `.p8` file (Apple lets you download it once)                                    | same page. Paste the file's text as it is, or its base64                                                                                                               |
| `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`  | the iOS app's `GoogleService-Info.plist`                                                  | Firebase Console → Project settings → Your apps → **iOS app** → download. Paste the file's text as it is, or its base64                                                |
| `IOS_DIST_CERT_P12_BASE64`              | optional: your Apple Distribution certificate and its private key, as a `.p12`, base64    | the openssl steps below. Leave unset to sign from the API key                                                                                                          |
| `IOS_DIST_CERT_PASSWORD`                | optional: the password on that `.p12`                                                     | made by the same steps                                                                                                                                                 |
| `IOS_PROVISIONING_PROFILE_BASE64`       | optional: App Store Connect distribution profile for `com.tropos.app`, base64             | Apple Developer → Profiles → + → **App Store Connect** → `com.tropos.app` → the certificate above → download                                                           |
| `IOS_WATCH_PROVISIONING_PROFILE_BASE64` | optional: App Store Connect distribution profile for `com.tropos.app.watchkitapp`, base64 | Apple Developer → Profiles → + → **App Store Connect** → `com.tropos.app.watchkitapp` → the same certificate → download                                                |

The four optional ones go together: all four, or none. The signing
keychain's password is generated inside the job, so it has no secret.
Values are trimmed of surrounding whitespace, so a secret pasted with a
trailing newline still works. To paste a file's text, open it in any text
editor (the `.p8` starts with `-----BEGIN PRIVATE KEY-----`, the plist with
`<?xml`), select all and copy.

#### Your own certificate (optional) without a Mac

Skip this when signing from the API key. On a Mac, Keychain Access makes
the certificate request. In a Codespace, openssl does the same job:

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
   fail there with "MAC verification failed". The run that signs from the
   API key makes its `.p12` the same way.

5. Open each `.txt` file, select all, copy, and paste it into the secret
   of the same name.

Make separate App Store Connect profiles for `com.tropos.app` and
`com.tropos.app.watchkitapp`, selecting the same distribution certificate
for both. Download each file, drag it into `ios-signing`, run
`base64 -w0 <file> > <SECRET>.txt`, and paste the resulting text into
`IOS_PROVISIONING_PROFILE_BASE64` or
`IOS_WATCH_PROVISIONING_PROFILE_BASE64` respectively. When every secret is
set, delete the folder with `rm -rf /workspaces/Maiin/ios-signing`.
If the private key is ever lost, revoke the certificate on Apple's site and
make a new one.

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
`ios/App/App/` and add the URL scheme by hand: a `CFBundleURLTypes` entry in
`ios/App/App/Info.plist` whose URL scheme is that plist's `REVERSED_CLIENT_ID`.

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

1. Register both App IDs and turn on their capabilities, then add the five
   required secrets above (and the four optional ones only if you sign with
   your own certificate).
2. Make sure App Store Connect → Apps has an app for `com.tropos.app`. The
   upload has nowhere to go without one.
3. Actions tab → **Deploy iOS to TestFlight** → Run workflow.
4. The run checks the secrets, makes the certificate and two profiles from
   the API key unless you gave your own, then checks both profiles (team,
   bundle ID, App Store type, expiry, target entitlements) and the
   certificate (a valid Apple Distribution identity that both profiles name),
   before archiving. Its error names the piece to fix: an API key without
   the Admin role, an App ID that is missing or lacks a capability, or an
   account already holding as many distribution certificates as Apple
   allows.
5. Signing: the project as committed signs automatically, which cannot
   work on a runner with no Apple account, so the workflow switches the
   iPhone and Watch targets to manual signing with their imported profiles.
   It does this in the project file, not on the `xcodebuild` command line, where a
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
7. The iPhone target remains iPhone-only: `TARGETED_DEVICE_FAMILY = 1` on
   both of its configurations, pinned by `iosProjectWiring.test.ts`. An
   iPad still installs the iPhone app and runs it as an iPhone app. App
   Review tries it there too, so
   purchases on an iPad go through the App Store like any iPhone's
   (`isNativeIOS()` reads the native shell, not the user agent). Apple
   does not let an app drop iPad support once a version with it is on the
   App Store, so this has to be settled before the first release, not
   after.

#### Apple Watch release gate

The workflow verifies that the archive and exported IPA contain one
separately signed Watch app with the expected bundle ID, iPhone companion ID,
HealthKit entitlement and App Store profile. This is a packaging check. It
does not prove live Watch-to-phone behavior.

The current TestFlight path packages the Watch target but keeps connected
training disabled: the Vite bundle is built without
`VITE_CONNECTED_TRAINING_ENABLED=true`, and the native App Release setting is
`WATCH_RUN_RELEASE_ENABLED=NO`. `TroposConnectedTrainingEnabled` in the
iPhone Info.plist passes that native setting to the bridge. The native bridge
reports Watch runs unavailable in Release while the gate is off. Enable both
flags only after the paired-device checks below pass; a web deploy or a debug
build does not validate the TestFlight path.

Before inviting testers to use Watch runs, complete the real-device checks in
[`docs/proposals/connected-training.md`](proposals/connected-training.md):
start and control an outdoor run with the iPhone locked; interrupt the Watch
connection and recover without replaying stale controls; finish on Watch and
review on iPhone after an app restart; save once through the offline queue;
and verify Apple Health shows no workout when export is off and exactly one
when it is on. Test an account switch as well as revoked Health permissions.
Record the iPhone/Watch models and OS versions used for the check.

This Linux checkout has no Xcode or paired Apple devices. The watchOS target,
signing and live behavior remain unverified until the macOS workflow and this
device gate complete.

#### Optional: auto-build on release

Once verified, you can add a `push: { tags: ['v*'] }` trigger so cutting a
version tag ships a TestFlight build. Keep it off `push: main` — every merge
becoming a TestFlight build spams testers and burns build numbers.

## Why not just auto-deploy native like the web?

iOS uploads need Apple code-signing secrets + a macOS runner, and every
upload consumes a build number / notifies testers. Manual-trigger (or
tag-triggered) is the sane default; the web can deploy on every push
because it has none of those constraints.
