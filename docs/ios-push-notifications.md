# iPhone challenge notifications

## Home Screen installation

For a first iPhone installation, open [Tropos](https://adaptive-fitness-af8bb.firebaseapp.com/) in Safari and choose **Share → Add to Home Screen**. Open Tropos from that icon, sign in, then enable **Settings → Notifications → Push notifications → Monthly challenges**. Allow the notification prompt when enabling push. **Send a test push** checks delivery without waiting for a new month.

This uses the existing FCM web channel and needs no TestFlight build or native APNs provisioning. An ordinary Safari tab cannot subscribe to iPhone web push. The website must have its public VAPID key configured, as the existing Hosting/Pages workflows provide. [Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

## Monthly closing reminders

**Monthly challenge reminders** is a separate, default-off switch in the same settings. With global push enabled, it sends at most one reminder around 09:00 in your saved time zone during the last three local dates of the month. It only considers current monthly challenges you have joined and where Gold has not been reached, matching the cards' next-tier progression. Weekly and seasonal challenges are excluded. The shared distance challenge uses the community's total, rather than your personal distance. Several unfinished goals produce one reminder, and tapping it opens Together.

The existing hourly scheduler handles both launch announcements and closing reminders. Their server-owned account/month claims are independent, so receiving a launch announcement does not suppress the closing reminder. A confirmed zero-accepted delivery can retry on a later remaining morning; an ambiguous result is consumed to avoid duplicate alerts. There is no new daily reminder or background-app requirement.

## Native app delivery

The native app uses Firebase Messaging to register an FCM token, then the existing server ownership flow claims it for the signed-in account. Monthly challenge announcements require both the global push switch and the separate challenge switch. Existing accounts are not automatically enrolled. The app's test notification checks the same native delivery route.

The hourly scheduler targets 09:00 in the account's saved timezone on the first three local days of a month. It requires the current featured challenge to exist in Firestore with the expected definition. An atomic monthly marker prevents duplicate campaigns; only a confirmed zero-accepted send may retry on a later morning in that window. Missing or invalid timezones are skipped. This is a monthly announcement, not daily reminders to join.

A merge updates the website and backend. To put the native Messaging plugin, entitlements and bundled UI onto an iPhone, build and install a new signed TestFlight version using **Actions → Deploy iOS to TestFlight → Run workflow**. The workflow remains manual; its only input is an optional testing note. A green website deployment does not replace that step.

## One-time account setup

1. In Apple Developer → Certificates, Identifiers & Profiles → Identifiers, open the existing `com.tropos.app` App ID and enable **Push Notifications**. Keep its other capabilities enabled.
2. Regenerate its **App Store Connect distribution** provisioning profile after enabling the capability. The workflow creates a fresh profile when using its default API signing route. If you supplied your own certificate/profile secrets, update `IOS_PROVISIONING_PROFILE_BASE64` with the regenerated profile. TestFlight requires `aps-environment=production`. [Apple entitlement reference](https://developer.apple.com/documentation/bundleresources/entitlements/aps-environment)
3. Create or select an Apple APNs authentication key permitted for this app's production push environment. In Firebase Console → Project settings → Cloud Messaging → iOS app configuration, upload the APNs `.p8` key and enter its Apple key ID and team information. Match the iOS app's bundle ID. [Firebase setup](https://firebase.google.com/docs/cloud-messaging/ios/get-started)

The APNs key is different from the **App Store Connect API key** used for signing/upload, and from the **web VAPID key**. It belongs in Firebase's APNs configuration; this feature adds no APNs GitHub secret. Do not commit or paste private keys, device tokens or signing profiles into issues or logs. CI cannot prove the private Apple/Firebase account connection by inspecting this repository.

## What the build verifies

Before archiving, `scripts/verify_ios_push.py` checks that both the committed entitlements and the decoded profile allow production APNs. Missing capability or a development profile stops with setup instructions. Existing checks still enforce the team, bundle, profile expiry, App Store distribution and signing certificate.

After archiving, the verifier checks the app's code signature and reads its actual signed entitlements and embedded profile. It repeats those checks after IPA export, because export may sign again, and uploads that exact verified IPA. These gates establish signing configuration; a real device test still establishes delivery. Offline Python tests run in the existing CI unit job.

The native bridge follows the [Messaging plugin's iOS integration](https://capawesome.io/docs/sdks/capacitor/firebase/cloud-messaging/), while the server sends an APNs alert for iPhones. Existing web push continues through its service worker. Device tokens from the basic Capacitor Push Notifications plugin are APNs tokens; they must not be substituted for this Messaging plugin's FCM registration token.

## Device acceptance check

1. Install the new TestFlight build on a real iPhone and sign in. In Settings → Notifications, enable push, allow the iOS prompt, and enable challenge announcements separately.
2. Use **Send a test push** to check foreground presentation. Then background the iPhone app and send another test from Settings in a browser signed into the same account. Check the iOS banner or Notification Centre, then tap it and confirm the app opens normally. A local reminder's **Send test** button checks a different delivery channel.
3. Deny permission or disable global push, then confirm the settings describe the disabled state. Re-enable through iOS Settings if permission was denied. Disable only challenge announcements and confirm other opted-in push types remain available.
4. Sign out and sign into a different account on the same phone. The new account must claim its own registration; the prior account must not retain delivery to it. Do not log raw tokens to test this.
5. At the next monthly release, check that canonical challenge definitions exist and an opted-in account receives at most one monthly announcement. Tap it to open the challenge list. The scheduled sender skips accounts without explicit challenge consent and respects the local delivery window.

Apple controls presentation and delivery timing. Focus, Scheduled Summary, notification settings and network conditions can delay or suppress a banner; this is not an exact-time alarm. Background receipt and opening the app by tapping are separate checks. An FCM send success records provider acceptance rather than proof that the phone displayed a banner. [Firebase device testing](https://firebase.google.com/docs/cloud-messaging/ios/get-started)
