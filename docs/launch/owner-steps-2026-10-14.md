# Your launch steps (written 2026-10-14)

Do these in order. Each step says where to click and how to tell it worked.
The sources are `docs/iap/revenuecat-setup.md`, `docs/LAUNCH_TODO.md` §19,
`docs/app-store/listing.md` ("Before submitting") and
`docs/qa/pre-launch-backlog.md`.

Two facts you'll use many times:

- **A uid** is found in Firebase Console → Authentication → Users → the UID
  column. It is a 28-character string.
- **A "repository variable"** is set in GitHub → lemmonchess333/Maiin →
  Settings → Secrets and variables → Actions → the **Variables** tab →
  New repository variable. Variables are not Secrets; use the Variables tab.
  After changing any of them, go to Actions → **Deploy production** →
  Run workflow (branch: main). That run writes them into the functions.

**Warning:** once any one of the variables below is set on GitHub, the deploy
replaces _all_ of the functions' plain settings with what GitHub holds. Set
every variable in Part 1 together, then run one deploy.

---

## Part 1 — Settings on GitHub (about 15 minutes, one deploy)

### 1.1 Make the App Review demo account

1. Open the app (the web build is fine) and sign up with email and password,
   for example `appreview@troposfit.com` with a strong password. Finish setup.
2. Write the email and password down. They go in App Store Connect's review
   notes later (step 4.4).
3. Firebase Console → Authentication → Users → copy this account's **UID**.
4. Copy **your own** account's UID as well.

### 1.2 Add the repository variables

Add each of these as a repository variable (see the top of this page for
where):

| Name                      | Value                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| `REVENUECAT_SANDBOX_UIDS` | `<your uid>,<demo uid>` (comma, no spaces)                                |
| `ADMIN_UIDS`              | `<your uid>` (opens the moderation page for you)                          |
| `MODERATION_ALERT_EMAIL`  | the inbox report alerts should reach, e.g. your own email                 |
| `RESEND_FROM`             | `Tropos <no-reply@troposfit.com>` (**only after Part 2.1 says Verified**) |
| `PUBLIC_APP_BASE_URL`     | `https://troposfit.com/` (only once Part 3 works; skip it until then)     |

If a **Secret** named `VITE_ADMIN_UIDS` exists under the Secrets tab, delete
it. The `ADMIN_UIDS` variable now covers it.

### 1.3 Deploy and check

1. Actions → Deploy production → Run workflow → main. Wait for it to go green.
   In the log, the step "Write functions/.env from repository variables"
   lists the names it wrote.
2. Google Cloud console → Cloud Functions → `revenueCatWebhook` → Variables.
   `REVENUECAT_SANDBOX_UIDS` should be there. Check `createReport` too: it
   should show `ADMIN_UIDS`, `RESEND_FROM` and `MODERATION_ALERT_EMAIL`.
3. Signed in as yourself, open
   `https://lemmonchess333.github.io/Maiin/admin/moderation`. You should see
   "All clear. No pending reports." If it says "Not authorised", the uid in
   `ADMIN_UIDS` is wrong.

---

## Part 2 — Email (Resend + Apple's relay)

Until this is done, password resets, verification links, trial reminders and
report alerts reach **only the Resend account owner's address**.

### 2.1 Verify troposfit.com in Resend

1. resend.com → Domains → **Add Domain** → enter `troposfit.com` and pick the
   region nearest you.
2. Resend shows about 3–4 DNS records: an MX and a TXT (SPF) on
   `send.troposfit.com`, a TXT `resend._domainkey` (DKIM), and an optional
   DMARC TXT.
3. In Cloudflare → troposfit.com → DNS → add each record **exactly** as shown.
   Set them to **DNS only (grey cloud)**. For a name like
   `send.troposfit.com`, type only `send`.
4. Back in Resend, click **Verify**. It usually turns green within minutes,
   occasionally up to an hour.
5. Once it says **Verified**, set `RESEND_FROM` as in step 1.2 and run Deploy
   production.

### 2.2 Let mail reach "Hide My Email" users (Sign in with Apple)

1. developer.apple.com → Certificates, Identifiers & Profiles → **Services** →
   _Sign in with Apple for Email Communication_ → Configure.
2. Add the domains `troposfit.com` and `send.troposfit.com`. Also add the
   address `no-reply@troposfit.com` if it asks for email sources. Register.
   Apple checks the domain's SPF, which step 2.1 added.

### 2.3 Check it works

1. On the sign-in screen, choose "Forgot password" for an email account you
   own. The email should arrive from `no-reply@troposfit.com`, not in spam.
2. Do the same for an account that signed in with Apple using _Hide My
   Email_. It should arrive in that iCloud inbox.
3. Sign in to a second account and report one of your own comments with a
   note. Within a minute, "New report: …" should arrive at
   `MODERATION_ALERT_EMAIL`. If it doesn't: Cloud Logging → `createReport` →
   look for an `alert_failed` line, which shows Resend's answer.

---

## Part 3 — troposfit.com serving the app (needed for the App Store URLs)

1. Firebase Console → Hosting → **Add custom domain** → `troposfit.com`
   (project `adaptive-fitness-af8bb`).
2. Firebase shows DNS records (A/TXT). Add them in Cloudflare as **DNS only
   (grey cloud)**. A proxied (orange cloud) record stalls the certificate.
3. Wait until Firebase shows "Connected". That can take up to about 24 hours.
4. In a **private window**, check that these three load without signing in:
   `https://troposfit.com/terms`, `/privacy`, `/support`.
5. Then set `PUBLIC_APP_BASE_URL` (step 1.2) and redeploy.

---

## Part 4 — RevenueCat and App Store Connect (purchases)

Already done: the webhook, both secrets and the server functions all work.
These steps are what's left.

### 4.1 App Store Connect: check each of these is done

- [ ] Business → Agreements: the **Paid Apps** agreement is **Active**, with
      banking and tax filled in. Products won't load until it is.
- [ ] Your app → **Subscriptions**: one group (e.g. "Tropos Pro") holding
      exactly two products with exactly these IDs:
      `com.tropos.app.pro.monthly` (1 month) and `com.tropos.app.pro.yearly`
      (1 year). Each has a price, a display name and a description.
- [ ] On **each** product: Introductory Offer → **Free**, **7 days**, new
      subscribers.
- [ ] App Information → App Store Server Notifications: Production and
      Sandbox URLs both set to
      `https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/appleIAPWebhook`.

### 4.2 RevenueCat dashboard: check each of these is done

- [ ] Project → App Store app with bundle `com.tropos.app`, and the `.p8` In-App
      Purchase key uploaded with its Key ID and Issuer ID.
- [ ] Entitlement named exactly `pro`, with both products attached.
- [ ] Offering `default` with a **Monthly** package → the monthly product and
      an **Annual** package → the yearly product. Mark it Current.
- [ ] Project settings → transfer behaviour: **Keep with original App User
      ID** (do not transfer).
- [ ] Copy the **public** Apple SDK key (starts `appl_`).

### 4.3 Turn purchases on in the iPhone build (only after 4.1 and 4.2 are complete)

1. GitHub → Settings → Secrets and variables → Actions → **Secrets** → New
   repository secret: `VITE_REVENUECAT_IOS_KEY` = the `appl_…` key.
2. The iOS build deliberately doesn't read that key yet. One line has to be
   added to `.github/workflows/deploy-ios.yml`, in the "Build web bundle and
   sync into the iOS project" step, under `env:` beside the other `VITE_`
   lines:
   ```yaml
   VITE_REVENUECAT_IOS_KEY: ${{ secrets.VITE_REVENUECAT_IOS_KEY }}
   ```
   You can edit this on github.com and commit to main, or ask the next Claude
   session to do it as a PR.
3. Actions → **deploy-ios** → Run workflow. This uploads a new TestFlight
   build.

### 4.4 Test it on your iPhone (TestFlight)

1. Settings → App Store → Sandbox Account: sign in with a sandbox tester
   (create one in App Store Connect → Users and Access → Sandbox).
2. In the TestFlight app, signed in as **your** account, buy Pro. Firebase →
   Firestore → `users/<your uid>` should show `subscriptionTier: "pro"` and
   `subscriptionSource: "ios_iap"`, and an AI food scan should work straight
   away.
3. Sign in as a third account that is _not_ on the list and buy again. The
   purchase sheet completes but the account stays free. That is correct.
4. Wait about 5 minutes (a sandbox month is short). Your account should go
   back to free.
5. With a US sandbox tester, the paywall's prices should all be in **$**, not
   £.

---

## Part 5 — The rest before you press Submit

1. **Version number.** App Store Connect's version is 1.0 but builds are
   stamped 1.2.0. Rename the App Store version to **1.2.0**.
2. **Firestore kill-switch**: Firebase Console → Firestore → collection
   `system` → doc `config` → add field `deletionExecutorEnabled`, type
   **boolean** (not string), value `true`.
3. **Budget alert**: Google Cloud console → Billing → Budgets & alerts →
   create a budget (e.g. £50/month) that emails you.
4. **Mapbox terms**: read the Directions section of
   mapbox.com/legal/product-terms. If it still forbids showing routes on a
   non-Mapbox map or saving them, tell Claude. The route planner would then
   need a change.
5. **App Store Connect listing**: paste the text from
   `docs/app-store/listing.md`, including:
   - Support URL `https://troposfit.com/support` and the Privacy/Terms links
     (only once Part 3 works);
   - Review notes with the **demo account email and password** from 1.1, and
     the moderation sentence from that file.
6. **Screenshots last**, once the app stops changing: 6.9-inch iPhone only.
7. **Reports within 24 hours**: the Terms promise it, so watch the
   `MODERATION_ALERT_EMAIL` inbox after launch.

---

## What Claude still has in flight (no action from you)

- #2810: lifting loads in lb, part 3. CI is running and it merges by itself.
- #2811 (kettlebells in whole lb) and #2814 (challenge distances in your
  unit): these wait for #2810, then need main merged in and marking ready.
  The next session can do this in a couple of minutes.
- #2813 (challenge copy) and #2817 (challenge titles): these merge by
  themselves.
- Four Together-page design calls still need your answer: the Join colour,
  the "Start a circle" style, hiding the weekly card when it's empty, and the
  page order (challenge → Circles → Spaces).
