# Tropos Operator Runbook — everything you can do WITHOUT Claude

This is the complete, click-by-click guide to every task that needs a human
(browser consoles, Apple paperwork, real devices, watching production logs).
None of it needs Claude, and none of it needs you to write code. Follow it
top-to-bottom — the order matters because some parts feed others (e.g. the
Apple key you download in Part 2 is pasted into a secret in Part 3).

Related docs (this runbook links into them rather than duplicating):

- `docs/LAUNCH_TODO.md` — the master outside-code list (this runbook expands it)
- `docs/pre-launch-qa-checklist.md` — the QA overlay (Part 13/14 here expand it)
- `docs/iap/revenuecat-setup.md` — RevenueCat + App Store Connect walkthrough
- `docs/run-reliability-qa.md` — the on-device run QA script (Part 15)
- `docs/app-check-rollout.md` — App Check enforcement phases (Part 10)

**How to use this:** work through the parts in order. Each task tells you
(1) why it matters, (2) what you need, (3) exact steps, (4) how to know it
worked, (5) what to do if it doesn't. Tick the checkboxes as you go — this
file is in git, so ticking + committing from the GitHub web editor is fine.

**Golden rule for the consoles:** Google and Apple move menu items around.
If a named menu item isn't where this doc says, use the search box at the
top of the console (Firebase, Google Cloud, and App Store Connect all have
one) and type the feature name.

---

## Progress checklist (tick as you complete each part)

- [ ] Part 0 — One-time computer setup
- [ ] Part 1 — Fix photo uploads (Storage CORS)
- [ ] Part 2 — App Store Connect: agreements, subscriptions, keys
- [ ] Part 3 — Provision the Cloud Function secrets
- [ ] Part 4 — Un-strand the functions deploys + deploy Firestore rules
- [ ] Part 5 — RevenueCat
- [ ] Part 6 — Apple Small Business Program
- [ ] Part 7 — troposfit.com public pages + App Store URLs
- [ ] Part 8 — Resend email domain
- [ ] Part 9 — Firebase one-timers (kill switch + budget alert)
- [ ] Part 10 — reCAPTCHA + App Check (register only, don't enforce)
- [ ] Part 11 — Storage rules first deploy (cross-service approval)
- [ ] Part 12 — Register yourself as moderator
- [ ] Part 13 — Browser QA scripts
- [ ] Part 14 — Weekly production log check (recurring)
- [ ] Part 15 — Mac + iPhone work
- [ ] Part 16 — Non-technical prep (icon, screenshots, metadata, lawyer)

---

## Part 0 — One-time computer setup (~30 min)

**Why:** several tasks need a terminal with the Firebase CLI and a local
copy of the repo. Do this once and everything else gets easier.

**You need:** your Windows PC, the Google account that owns the
`adaptive-fitness-af8bb` Firebase project, and your GitHub login.

### 0.1 Install the tools

1. **Node.js** — go to <https://nodejs.org>, download the **LTS** Windows
   installer, run it, accept all defaults.
2. **Git for Windows** — go to <https://git-scm.com/download/win>, download,
   run, accept all defaults. This also installs **Git Bash**, which is the
   terminal you should use for everything in this doc.

   > **Always use Git Bash, not PowerShell or CMD.** Some of the project's
   > npm scripts (e.g. `build:hosting`) set environment variables inline in
   > a way that only works in a bash-style shell. Git Bash is in your Start
   > menu after installing Git.

3. Open **Git Bash** (Start menu → type "Git Bash") and check both worked:

   ```bash
   node -v     # should print v20.x or v22.x
   git --version
   ```

### 0.2 Get the repo and install dependencies

```bash
cd ~
git clone https://github.com/lemmonchess333/Maiin.git
cd Maiin
npm install
```

(If git asks you to sign in, a browser window opens — sign in to GitHub.)

### 0.3 Install and sign in to the Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

A browser opens — sign in with **the Google account that owns the Firebase
project**. Then verify:

```bash
firebase projects:list
```

You should see `adaptive-fitness-af8bb` in the list. If you don't, you're
signed into the wrong Google account — run `firebase logout` then
`firebase login` again.

### 0.4 Create your local `.env` (needed for Part 7's hosting deploy)

1. In the repo folder, copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Get the real values: **Firebase console** (<https://console.firebase.google.com>)
   → select **adaptive-fitness-af8bb** → click the **gear icon → Project
   settings** → scroll to **Your apps** → click the **Web app** → under
   "SDK setup and configuration" choose **Config**. You'll see a block like
   `apiKey: "..."`, `authDomain: "..."`, etc.
3. Open `.env` in Notepad (`notepad .env` from Git Bash) and fill each
   `VITE_FIREBASE_*` line with the matching value (apiKey →
   `VITE_FIREBASE_API_KEY`, and so on). Save.

### 0.5 Accounts you'll need along the way

| Account | Used in | URL |
| --- | --- | --- |
| Firebase / Google Cloud console | Parts 1, 3, 4, 9, 10, 11, 13, 14 | console.firebase.google.com / console.cloud.google.com |
| App Store Connect (Apple Developer membership) | Parts 2, 5, 6, 7 | appstoreconnect.apple.com |
| Stripe dashboard | Part 3 | dashboard.stripe.com |
| Resend | Parts 3, 8 | resend.com |
| Cloudflare (manages troposfit.com) | Parts 7, 8 | dash.cloudflare.com |
| GitHub | Parts 4, 10, 12 | github.com/lemmonchess333/Maiin |

---

## Part 1 — Fix photo uploads: Storage CORS (~15 min)

**Why:** the Progress Photo upload currently fails with a `storage/unknown`
error because the storage bucket rejects browser uploads. One config change
fixes it. No code involved.

**You need:** a desktop browser signed into the project's Google account.

### 1.1 Find the REAL bucket name first (2 min, don't skip)

The fix must target the exact bucket the app uploads to. A near-miss
(`.appspot.com` vs `.firebasestorage.app`) silently fixes nothing.

1. Open the live app (<https://lemmonchess333.github.io/Maiin/>), sign in.
2. Press **F12** to open DevTools → click the **Network** tab.
3. Go to **Social → Progress → + Add Photo** and attempt an upload (it will
   fail — that's expected).
4. In the Network list, click the red (failed) request. Look at its URL —
   it contains `/b/<BUCKET-NAME>/`. Write down that exact bucket name.
   It should be `adaptive-fitness-af8bb.firebasestorage.app`.

### 1.2 Apply the CORS policy in Cloud Shell

1. Open <https://shell.cloud.google.com/?project=adaptive-fitness-af8bb>
   on a desktop (mobile Cloud Shell is flaky). Accept any prompts; a black
   terminal appears at the bottom.
2. Paste this entire block and press Enter (creates the config file):

   ```bash
   cat > cors.json <<'EOF'
   [
     {
       "origin": [
         "https://lemmonchess333.github.io",
         "https://troposfit.com",
         "https://adaptive-fitness-af8bb.firebaseapp.com",
         "https://adaptive-fitness-af8bb.web.app",
         "http://localhost:5173",
         "http://localhost:4173"
       ],
       "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
       "maxAgeSeconds": 3600,
       "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"]
     }
   ]
   EOF
   ```

3. Apply it (swap the bucket name if step 1.1 showed something different):

   ```bash
   gsutil cors set cors.json gs://adaptive-fitness-af8bb.firebasestorage.app
   ```

4. Verify it stuck:

   ```bash
   gsutil cors get gs://adaptive-fitness-af8bb.firebasestorage.app
   ```

   It should print the JSON you just set.

### 1.3 Verify the fix in the app

1. Back in the app, hard-refresh: **Ctrl+Shift+R**.
2. Social → Progress → + Add Photo → pick a photo. It should upload.

**If it still fails:** note the NEW error code. `storage/unauthorized`
means the problem is now Storage *rules*, not CORS — that's a different fix
(bring the exact error to a Claude session). Any other error: screenshot
the DevTools Network entry and save it for later.

---

## Part 2 — App Store Connect: agreements, subscriptions, keys (~1–2 h)

**Why:** the app can't be submitted, and subscriptions can't work, until
this admin work is done. It's all browser clicking — no code.

**You need:** your Apple Developer account (the Account Holder login).

Full field-by-field detail lives in `docs/iap/revenuecat-setup.md` Part A —
this section is the ordered summary with the runbook-critical warnings.

### 2.1 Paid Apps agreement + banking + tax

1. Go to <https://appstoreconnect.apple.com> → **Business** (older UI:
   "Agreements, Tax, and Banking").
2. Find the **Paid Apps** agreement → accept it.
3. Complete **Bank Account** and **Tax Forms** until the Paid Apps row
   shows status **Active**. (Without this, subscription products can't go
   live and the Small Business Program can't be joined.)

### 2.2 App record (only if it doesn't exist yet)

1. **My Apps** → if Tropos isn't listed: **+ → New App**.
2. Platform iOS, Name "Tropos", Bundle ID **com.tropos.app** (must match
   exactly), SKU anything (e.g. `tropos-ios`), language English (UK).

### 2.3 Subscription products

1. **My Apps → Tropos** → in the left sidebar find **Subscriptions**
   (under "Monetization" or "Features" depending on UI version).
2. **Create a Subscription Group** — reference name "Pro".
3. Inside the group, create **two** subscriptions. The Product IDs must be
   EXACTLY these (they're hardcoded in `src/lib/purchaseProvider.ts`):
   - `com.tropos.app.pro.monthly` — duration **1 month**
   - `com.tropos.app.pro.yearly` — duration **1 year**
4. For each: set the price, add a localized display name + description.
5. For each: add an **Introductory Offer** → type **Free trial** →
   duration **7 days** (this is a per-product setting — do it on BOTH).
6. Each product needs a review screenshot before final submission — you
   can add that later from a device build; everything else can be done now.
7. Target state for both products: **"Ready to Submit"**.

### 2.4 In-App Purchase key (.p8) — DOWNLOAD ONCE, KEEP FOREVER

This key is consumed by Part 3 (secrets) and Part 5 (RevenueCat).

1. App Store Connect → **Users and Access** → **Integrations** tab →
   **In-App Purchase** (left sidebar).
2. **Generate In-App Purchase Key** → name it (e.g. "Tropos server").
3. **Download the `.p8` file — Apple only lets you download it ONCE.**
   Save it somewhere safe (password manager / backed-up folder).
4. Write down the **Key ID** (shown next to the key) and the **Issuer ID**
   (shown at the top of the Keys page).

### 2.5 App Store Server Notifications URL

> Do this AFTER Part 4's deploy is green (the URL must point at a deployed
> function).

1. **My Apps → Tropos → App Information** → scroll to **App Store Server
   Notifications**.
2. Set BOTH **Production Server URL** and **Sandbox Server URL** to:

   ```
   https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/appleIAPWebhook
   ```

3. Choose **Version 2** notifications where asked.

---

## Part 3 — Provision the Cloud Function secrets (~45 min)

**Why:** every functions deploy resolves its bound secrets against Google
Secret Manager. Any missing secret makes EVERY deploy fail (that's the
safety gate working). Provisioning is a one-time interactive task an agent
can't do for you — the values are yours.

**You need:** Git Bash (Part 0), the `.p8` + Key ID + Issuer ID from
Part 2.4, your Stripe login, your Resend login.

### 3.1 Get the authoritative list

Never trust a hand-written list (including this one) — the code prints its
own requirements:

```bash
cd ~/Maiin/functions
npm install
npm run secrets:check
```

This prints every secret the deployed code binds, with the exact
`firebase functions:secrets:set` command for each.

### 3.2 Check what's already provisioned

For each name in the list, this prints the value if it exists, or errors if
it doesn't:

```bash
firebase functions:secrets:access SECRET_NAME --project adaptive-fitness-af8bb
```

Anything that errors with "not found" needs setting below. (Re-setting an
existing secret is harmless — it just creates a new version.)

### 3.3 Set each secret

The command pattern (it prompts you to paste the value, then Enter):

```bash
firebase functions:secrets:set SECRET_NAME --project adaptive-fitness-af8bb
```

Where each value comes from:

| Secret | Where to get the value |
| --- | --- |
| `APPLE_KEY_ID` | Part 2.4 — the Key ID string |
| `APPLE_ISSUER_ID` | Part 2.4 — the Issuer ID string |
| `APPLE_PRIVATE_KEY` | The `.p8` file — use the file flag, see below |
| `STRIPE_SECRET_KEY` | Stripe dashboard → **Developers → API keys** → reveal the **Secret key** (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → **Developers → Webhooks** → the endpoint → **Signing secret** (`whsec_…`). If no endpoint exists yet, **Add endpoint** with URL `https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/stripeWebhook`, then copy its signing secret |
| `BILLING_HMAC_SECRET` | Generate fresh, see below. Save the value in your password manager |
| `BILLING_PREVIOUS_HMAC_SECRET` | Set to the SAME value as `BILLING_HMAC_SECRET` (the code binds it unconditionally; it only differs during a real key rotation) |
| `RESEND_API_KEY` | resend.com → **API Keys → Create API Key** (may already be provisioned — check with 3.2) |

**The `.p8` file** is multi-line, so don't paste it — point the CLI at the
file:

```bash
firebase functions:secrets:set APPLE_PRIVATE_KEY \
  --data-file "/c/Users/YOURNAME/path/to/AuthKey_XXXXXXXXXX.p8" \
  --project adaptive-fitness-af8bb
```

(In Git Bash, `C:\Users\...` is written `/c/Users/...`.)

**Generate the HMAC secret** (a random 64-character hex string):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output → save it in your password manager → paste it when
`functions:secrets:set BILLING_HMAC_SECRET` prompts → paste the same value
again for `BILLING_PREVIOUS_HMAC_SECRET`.

### 3.4 Verify

Re-run `npm run secrets:check`, then re-run the 3.2 access check on each
name — all should now print a value.

---

## Part 4 — Un-strand the functions deploys + Firestore rules (~30 min + watching)

**Why:** functions deploys have failed repeatedly in the past
(Secret Manager disabled, then a missing secret), so recent server code may
never have reached production even though PRs merged green. This forces a
fresh deploy and — crucially — verifies the deployed source by eye, because
a green CI run does NOT prove the upload happened (firebase-tools skips
uploads it thinks are duplicates; see "Cloud Functions deploy — known
gotchas" in `CLAUDE.md`).

**You need:** Parts 3 done; GitHub login; Firebase CLI.

### 4.1 Trigger the deploy manually

1. Go to <https://github.com/lemmonchess333/Maiin/actions>.
2. Left sidebar → **Deploy Cloud Functions**.
3. Click the **Run workflow** dropdown (right side) → branch `main` →
   green **Run workflow** button.
4. Wait for the run to finish (click into it to watch). Green = continue.
   Red = open the failed step, find the first line starting `Error:` —
   the usual culprit is an unprovisioned secret (go back to Part 3). The
   workflow also auto-files a GitHub issue on failure.

### 4.2 Deploy the Firestore rules

From Git Bash, in the repo folder:

```bash
cd ~/Maiin
firebase deploy --only firestore:rules --project adaptive-fitness-af8bb
```

This activates the tightened social rules — including the fix for crews,
which have been silently broken in production (rules said `/crews/`, code
uses `/groups/`).

### 4.3 Spot-check the deployed source (the step CI can't do)

1. Open <https://console.cloud.google.com/functions/list?project=adaptive-fitness-af8bb>.
2. For each function below, click it → **Source** tab → use Ctrl+F on the
   listed file to confirm the string exists:

| Function | Look for |
| --- | --- |
| `dailyRaceReconciliationSweep` | `_recoveryEndDateForRace` and `require("./lib/runModeResolution")` |
| `onWorkoutCreated` | `applyPartnerActivity` and `hybrid_score` |
| `onRunCreated` | `applyPartnerActivity` and `hybrid_score` |
| any function | top line is a `// CI build: <sha> @ <timestamp>` comment matching the run you just triggered |

3. If a string is missing, the dedup bug skipped the upload — re-run 4.1.

### 4.4 Now do Part 2.5

Set the App Store Server Notifications URL (it needed the deployed
`appleIAPWebhook` to exist).

---

## Part 5 — RevenueCat (~45 min)

**Why:** RevenueCat manages the subscription entitlement across devices and
platforms. The full walkthrough — every field, every setting, and the
reasoning — is **`docs/iap/revenuecat-setup.md`**. Follow that doc directly;
it was written for exactly this task. Summary of what you'll do:

1. Create an account at <https://app.revenuecat.com> → new project "Tropos".
2. Add an **App Store app** with bundle ID `com.tropos.app`; upload the
   In-App Purchase `.p8` from Part 2.4 (with its Key ID + Issuer ID).
3. Create entitlement **`pro`**; create an Offering containing both
   products (`com.tropos.app.pro.monthly`, `com.tropos.app.pro.yearly`) as
   packages.
4. Set transfer behaviour to **"keep with original App User ID"** (the doc
   explains why — record that you chose it).
5. Put the keys where the code expects them (doc Part C): the public SDK
   key into the Vite env, the webhook auth secret + REST key into Secret
   Manager.
6. Tick off the acceptance checklist at the bottom of that doc.

---

## Part 6 — Apple Small Business Program (~15 min)

**Why:** halves Apple's commission from 30% to 15% for under-$1M/yr
revenue. At £3.99/mo that's worth ~£0.60/user/month — more than ALL of
Tropos's infrastructure costs combined. Highest-leverage 15 minutes on this
list.

**You need:** the **Account Holder** Apple ID and the Paid Apps agreement
Active (Part 2.1).

1. Go to <https://developer.apple.com/app-store/small-business-program/>.
2. Click **Enroll** and follow the flow (it confirms your eligibility and
   asks you to agree to the terms).
3. Note: the reduced rate applies from the start of the next fiscal
   calendar period after approval — enrolling BEFORE launch means the very
   first sales get the 15% rate.

---

## Part 7 — troposfit.com public pages + App Store URLs (~1 h + DNS wait)

**Why:** Apple's reviewer opens your Terms / Privacy / Support links from
the public web, signed out. Right now `troposfit.com` doesn't resolve — a
dead legal or support URL is a classic first-submission rejection. The app
already serves public `/terms`, `/privacy`, and `/support` pages on Firebase
Hosting (they work signed-out); you just need to put the real domain in
front of them.

**You need:** Firebase CLI + local `.env` (Part 0.4), Cloudflare login.

### 7.1 Make sure the hosting deploy is current

From Git Bash:

```bash
cd ~/Maiin
git pull origin main
npm install
npm run build:hosting
firebase deploy --only hosting --project adaptive-fitness-af8bb
```

Then confirm in a **private/incognito window** (so you're signed out) that
these all load:

- <https://adaptive-fitness-af8bb.firebaseapp.com/terms>
- <https://adaptive-fitness-af8bb.firebaseapp.com/privacy>
- <https://adaptive-fitness-af8bb.firebaseapp.com/support>

### 7.2 Connect the domain

1. Firebase console → **Hosting** (left sidebar) → **Add custom domain**.
2. Enter `troposfit.com`. Firebase shows you DNS records to add (usually a
   TXT record for verification, then one or two A records).
3. In another tab: <https://dash.cloudflare.com> → select **troposfit.com**
   → **DNS → Records** → **Add record** for each record Firebase showed.
   - **Important:** set the proxy toggle to **"DNS only"** (grey cloud,
     NOT the orange cloud) on these records — the Cloudflare proxy
     interferes with Firebase's domain verification and SSL certificate.
4. Back in Firebase, click through the verification. Status will go
   Pending → Connected. SSL can take **up to 24 hours** — this is normal.
5. Optionally repeat for `www.troposfit.com` if Firebase offers it.

### 7.3 Verify

In a private window (signed out), all three must load with a padlock:

- <https://troposfit.com/terms>
- <https://troposfit.com/privacy>
- <https://troposfit.com/support>

> Note: keep using the `firebaseapp.com` URL for your own web sign-in
> testing. Sign-in from `troposfit.com` needs two extra allowlist entries
> before it works (Firebase console → Authentication → Settings →
> Authorized domains → add `troposfit.com`; and Google Cloud console →
> APIs & Services → Credentials → the "Browser key (auto created by
> Firebase)" → add `troposfit.com/*` to the referrer allowlist). The legal
> pages don't need sign-in, so this doesn't block Part 7.

### 7.4 Update App Store Connect to the real URLs

1. **My Apps → Tropos → App Information**:
   - **Privacy Policy URL** → `https://troposfit.com/privacy`
2. On the **1.0 version page**:
   - **Support URL** → `https://troposfit.com/support`
   - In the **Description** footer, use `https://troposfit.com/terms` and
     `https://troposfit.com/privacy`.
3. Check every other place a support/legal URL appears on the version page.
   **Never submit with a placeholder link.**

---

## Part 8 — Resend email domain (~20 min + DNS wait)

**Why:** password-reset and email-verification emails currently send from
`onboarding@resend.dev`, which ONLY delivers to your own Resend account —
real users would never receive them. Verifying your domain fixes delivery
and makes the emails come from `no-reply@troposfit.com`.

**You need:** Resend login, Cloudflare login.

1. <https://resend.com> → **Domains** → **Add Domain** → `troposfit.com`.
2. Resend shows DNS records (DKIM TXT records, possibly SPF/MX). Add each
   one in Cloudflare (**DNS → Records → Add record**), again with proxy
   set to **"DNS only"**.
3. Back in Resend, click **Verify**. May take minutes to a few hours.
   Target status: **Verified**.
4. The from-address (`RESEND_FROM`) is set in Part 12.3 below (it rides the
   same mechanism as the moderator allowlist). Until Part 12 is done,
   emails keep working but from the test address.

---

## Part 9 — Firebase one-timers: kill switch + budget alert (~15 min)

### 9.1 Pre-create the account-deletion kill switch as a BOOLEAN

**Why:** in an incident you pause account deletions by flipping
`system/config.deletionExecutorEnabled` to `false`. But the Firestore
console's "Add field" UI defaults to **string** type, and a string
`"false"` does NOT pause anything (the executor treats malformed types as
"keep running" by design). Pre-creating the field with the correct type
means the pause lever actually works on the day you need it.

1. Firebase console → **Firestore Database** → **Data** tab.
2. If there's no `system` collection: click **+ Start collection**,
   Collection ID `system`, Document ID `config`, and add the field in the
   same dialog. If `system/config` already exists, open it and click
   **+ Add field**.
3. Field name: `deletionExecutorEnabled`
   **Type: select `boolean` from the dropdown** (this is the whole point)
   Value: `true`.
4. Save. To pause deletions later: edit this field to `false` (it stays a
   boolean when you edit in place). To resume: back to `true`.

### 9.2 Google Cloud budget alert

**Why:** one email smoke-detector across everything (Gemini, Firebase,
functions) so a runaway cost can't build silently.

1. <https://console.cloud.google.com> → make sure the project selector (top
   bar) says **adaptive-fitness-af8bb**.
2. ☰ menu → **Billing** → **Budgets & alerts** → **Create budget**.
3. Scope: this project. Amount: **£50 per month** (or your comfort level).
4. Keep the default threshold alerts (50% / 90% / 100%) — emails go to the
   billing admin (you).
5. Save.

---

## Part 10 — reCAPTCHA + App Check: register, then WAIT (~30 min + weeks of patience)

**Why:** App Check proves API calls come from your real app, not bots or
scrapers. The client code is fully wired but idle because the site key was
never set. This part turns on **telemetry only**. Do NOT enforce anything
yet — enforcement with a broken token flow locks every user out. The
enforcement flip is its own carefully-staged procedure
(`docs/app-check-rollout.md`) gated on ≥99% verified traffic for a week.

### 10.1 Register the reCAPTCHA v3 site

1. <https://www.google.com/recaptcha/admin/create> (sign in with the
   project's Google account).
2. Label: `Tropos web`. Type: **reCAPTCHA v3**.
3. Domains — add ALL of these:
   - `lemmonchess333.github.io`
   - `troposfit.com`
   - `adaptive-fitness-af8bb.firebaseapp.com`
   - `adaptive-fitness-af8bb.web.app`
   - `localhost`
4. Submit. You get TWO keys: a **Site key** (public, goes in the client)
   and a **Secret key** (goes in Firebase). Keep the tab open.

### 10.2 Put the Site key into the web build

1. GitHub → the repo → **Settings** → **Secrets and variables** →
   **Actions** → **Secrets** tab → **New repository secret**.
2. Name: `VITE_RECAPTCHA_V3_SITE_KEY`. Value: the **Site key**. Save.
3. Rebuild the site so the key ships: **Actions** tab → the GitHub Pages
   deploy workflow ("Deploy") → open the most recent successful run →
   **Re-run all jobs**. (Re-runs pick up current secret values.)

### 10.3 Register the app in Firebase App Check

1. Firebase console → **App Check** (left sidebar, under Build or Release
   & Monitor depending on UI) → **Apps** tab.
2. Click the **web app** → choose provider **reCAPTCHA v3** → paste the
   **Secret key** → Save.
3. **Do not press Enforce on anything.**

### 10.4 Watch the numbers (over the next 1–2 weeks)

- After 24–48h: App Check → **APIs** tab → look at "verified requests %"
  for Cloud Functions / Firestore.
- Target before ANY enforcement: **≥99% verified, sustained ≥1 week**.
- Expect native iOS traffic to show as unverified until the Capacitor App
  Check plugin is wired (Part 15) — that's known and fine for now.
- When the numbers are ready, the flip procedure is
  `docs/app-check-rollout.md` (low-risk callables first, destructive ones
  last, never the webhooks). That step can involve a Claude session; the
  watching can't.

---

## Part 11 — Storage rules first deploy: cross-service approval (~20 min)

**Why:** the new Storage rules read Firestore (to freeze photo uploads
during account deletion). That cross-service read needs a ONE-TIME
interactive approval that only a human project owner can click — which is
why CI deliberately skips deploying these rules. Until you do this, the
deletion write-freeze isn't live.

**Warning first:** if the rule deploys WITHOUT the approval, the check
errors → denies → **all photo uploads break app-wide**. The interactive
deploy below triggers the approval prompt as part of the flow, which is why
it must be run by you, not CI. Have the rollback path ready (step 11.4).

1. From Git Bash:

   ```bash
   cd ~/Maiin
   git pull origin main
   firebase deploy --only storage --project adaptive-fitness-af8bb
   ```

2. When the CLI asks whether to grant Storage Rules access to Firestore —
   **answer yes**. (If no prompt appears and the deploy succeeds, the
   grant already existed. Fine.)
3. **Verify immediately** (don't wander off between deploy and check):
   - Firebase console → **Storage → Rules** → confirm the deployed text
     contains `isDeletionWriteFrozen`.
   - In the app, as a normal account, upload a progress photo → must
     succeed.
   - Freeze test: Firestore → create doc `accountDeletionRequests/<uid>`
     (use a TEST account's uid) with field `status` (string) = `running`
     → as that test account, try a photo upload → must be DENIED →
     delete the doc → upload works again.
4. **If uploads break app-wide:** Firebase console → Storage → Rules →
   the version history lets you view and restore the previous ruleset in
   two clicks. Restore, then bring the error text to a Claude session.
5. Re-enable CI auto-deploys for future storage-rules changes: GitHub →
   Settings → Secrets and variables → Actions → **Variables** tab →
   **New repository variable** → name `STORAGE_XSERVICE_APPROVED`, value
   `true`.

---

## Part 12 — Register yourself as moderator (~30 min)

**Why:** the profanity auto-filter runs by itself, but the human review
queue at `/admin/moderation` is locked until your account's UID is on both
the server allowlist (`ADMIN_UIDS`) and the client allowlist
(`VITE_ADMIN_UIDS`). Apple's reviewer checks that UGC apps have a working
moderation flow.

> Note: `docs/LAUNCH_TODO.md` §19 shows a `firebase functions:config:set`
> command for this — that command is DEAD (removed in the firebase-functions
> v7 migration). This part is the current method.

**You need:** GitHub web access. Two of the steps edit workflow YAML in the
GitHub web editor — copy the snippets EXACTLY (YAML breaks on wrong
indentation). If you're not comfortable, this one part is safe to save for
a future Claude session; everything else in this runbook stands alone.

### 12.1 Get your UID

Firebase console → **Authentication** → **Users** → find your account row →
copy the **User UID** (28-character string; there's a copy icon).

### 12.2 Store it as a GitHub variable

1. GitHub repo → **Settings → Secrets and variables → Actions** →
   **Variables** tab → **New repository variable**.
2. Name `ADMIN_UIDS`, value = your UID. Save.
3. Add a second variable: name `RESEND_FROM`, value
   `Tropos <no-reply@troposfit.com>` (requires Part 8 verified first).

### 12.3 Wire the variables into the functions deploy

1. GitHub → repo → open `.github/workflows/deploy-functions.yml` → click
   the **pencil icon** (Edit).
2. Find the step named `Install function dependencies` (around line 71):

   ```yaml
         - name: Install function dependencies
           run: cd functions && npm install
   ```

3. Directly BELOW those two lines, paste this block (the `-` must line up
   exactly with the `-` of the step above — 6 spaces before it):

   ```yaml
         - name: Write non-secret runtime config
           run: |
             {
               echo "ADMIN_UIDS=${{ vars.ADMIN_UIDS }}"
               echo "RESEND_FROM=${{ vars.RESEND_FROM }}"
             } > functions/.env
   ```

4. **Commit changes** → "Commit directly to the `main` branch".
5. Actions → **Deploy Cloud Functions** → **Run workflow** (editing the
   workflow file doesn't itself trigger a deploy).

### 12.4 Wire the client allowlist into the Pages build

1. Edit `.github/workflows/deploy.yml` the same way.
2. Find the `- run: npm run build` step's `env:` block (a list of
   `VITE_FIREBASE_*` lines, around lines 53–67). Add this line at the same
   indentation as the other `VITE_` lines:

   ```yaml
             VITE_ADMIN_UIDS: ${{ vars.ADMIN_UIDS }}
   ```

3. Commit directly to `main` → the Pages deploy runs automatically
   (~3 min).

### 12.5 Verify

Open <https://lemmonchess333.github.io/Maiin/admin/moderation> signed in as
your account. **"All clear. No pending reports."** (or a list of reports) =
working. **"Not authorised"** = the UID doesn't match on one side — re-copy
it and re-check 12.2–12.4.

---

## Part 13 — Browser QA scripts (~1–2 h, needs 2 test accounts)

**Why:** these verify security and data-isolation fixes that are already
shipped but only provable by hand. All doable in a desktop browser — no
device needed. Create two throwaway email/password test accounts first
(call them **A** and **B**).

### 13.1 Public-profile uid binding (rules test, no accounts needed)

Uses the Rules Playground — a simulator built into the Firestore console.

1. Firebase console → **Firestore Database** → **Rules** tab → click
   **Rules Playground** (panel to the left of the editor).
2. Configure: Simulation type **update** ·
   Location `/users/UID_A/public/profile` (paste A's real uid) ·
   **Authenticated ON** · Firebase UID = `UID_A`.
3. Build the document: add field `uid` (string) = `UID_B` (B's uid).
4. **Run** → expect **Denied** ✗ (that's the fix working — you can't
   claim someone else's uid).
5. Change the field to `uid` = `UID_A` → **Run** → expect **Allowed** ✓.

### 13.2 Expired-subscription guard

1. Firestore → **Data** → `users/<A's uid>` → add/edit two fields:
   `subscriptionTier` (string) = `pro`;
   `subscriptionExpiresAt` (string) = `2024-01-01T00:00:00.000Z`.
2. Open the app signed in as A → the app must treat A as **Free** (the
   upgrade prompts show; no Pro features).
3. Clean up: delete both fields.

### 13.3 Offline-queue isolation across accounts

1. Sign in as **A** in the app. Press F12 → **Network** tab → set the
   throttling dropdown to **Offline**.
2. Log a workout. It queues silently (no crash).
3. **Still offline**, sign out of A.
4. Set throttling back to **No throttling**. Sign in as **B**.
5. Check: B must NOT show A's workout anywhere. In DevTools →
   **Application** tab → **Local Storage** → the site origin → find key
   `tropos_offline_queue` → the queued entry must be tagged with A's uid.
6. Sign out of B, sign in as A (online) → the queue flushes → A's workout
   appears in A's history.
7. Repeat the same shape for a share post (key `tropos.share.queue`):
   queue a share offline as A → switch to B → nothing posts under B →
   back to A online → the post lands under A.

### 13.4 Social cold start (the state every launch user sees)

> Updated for the Together-first redesign (SOCIAL-HOME-01, Jul 2026).
> Older docs describing a "new users land on Find/People" smart default
> are superseded — Together is now the default tab for everyone.

1. Create a brand-new account (third throwaway), complete onboarding.
2. Go to **Social**. Confirm it lands on the **Together** tab, showing
   the cold-start **goal selector** (pick-a-goal Circle chooser) — it
   must look designed, not empty or broken.
3. Confirm **People is NOT a tab**: the person-search opens as a
   full-screen overlay from the header search icon, and closes cleanly.
4. Switch to the **Feed** tab → as a cold-start user the curated stack
   must render top-to-bottom: Partner Streak hero → monthly Hybrid
   challenge card → Share-your-training → "Crews unlock…" row — with NO
   "your feed is empty" text or skeleton loaders below it.
5. Settings → toggle to light mode → recheck steps 2–4. Both themes must
   look designed, not broken.
6. Share card check: with nothing logged it shows a prompt and NO button;
   after logging a workout it offers "Create a share card".

### 13.5 Min-version kill switch

1. Firestore → **Data** → collection `config` → doc `client` (create
   both if absent) → add field `minSupportedVersion` (string) = `9.9.9`.
2. Reload the app → you must be blocked by an upgrade screen.
3. Delete the field → reload → app works again. (Any error in reading the
   field fails OPEN by design — so if it doesn't block, check the field is
   exactly `minSupportedVersion`, string, on `config/client`.)

---

## Part 14 — Weekly production log check (~15 min/week, recurring)

**Why:** several server functions only prove themselves when they fire on
real data. Nobody can verify these from code — someone has to read the
logs. Do this weekly until every row has been seen once.

**How to read logs:** Firebase console → **Functions** → click a function →
**Logs** tab. (Or <https://console.cloud.google.com/logs> with query
`resource.type="cloud_function"` and the function name.)

Fire times in UK summer time (BST = UTC+1):

| Function | Fires | What a healthy log shows |
| --- | --- | --- |
| `dailyRaceReconciliationSweep` | daily 05:00 UK | `starting` → `done — noShow=X, recoveryCleared=Y`, no `fatal error:` lines |
| `weeklyFellBehindCheck` | Mondays 06:00 UK | `evaluating week …` → `done — set=X, clear=Y`, with `set` a small realistic number (NOT every active user) |
| `weeklyPerformanceRollup` | Sundays 00:15 UK (Mon) | timestamp confirms 23:15 **UTC** |
| `dailyPerformanceRefresh` | daily 03:10 UK | timestamp confirms 02:10 **UTC** |
| `rolloverChallenges` | daily 01:05 UK | after the 1st of a month: doc `challenges/global-monthly-<YYYY-MM-01>` exists with `metric: "hybrid_score"` |
| `onWorkoutCreated` | on every workout save | challenge-progress increment lines; `applyPartnerActivity` with no `error` |
| `onRunCreated` | on every run save | same; on a race-day run: `recovery-entry written for {uid}` |

Also each week: **App Check → APIs tab** — note the verified-request %
(feeds Part 10.4), and glance at **Actions** on GitHub for any red deploy
runs (a failed functions deploy auto-files an issue — check the Issues tab).

Event-driven items (tick when they naturally occur):

- First real iOS purchase → Firestore has
  `appleSubscriptions/<originalTransactionId>` with the buyer's uid.
- First real Stripe webhook → `stripeEvents/<event.id>` has BOTH
  `claimedAt` and `processedAt` fields.
- Two mutually-following accounts logging on the same day →
  `partnerBonds/<id>` flips `streak` 0→1.

---

## Part 15 — Mac + iPhone work

**Why:** App Store submission is physically impossible without a Mac —
Xcode is the only way to build the `.ipa`. **Sorting Mac access is itself a
task you can do right now:**

- Borrow a Mac for a day (simplest), or
- Rent a cloud Mac: MacinCloud / MacStadium, roughly $20–40 for a day —
  sign up in a browser, you get remote desktop into a Mac, or
- Buy a used M1 Mac mini (~£300–400) — worthwhile if iOS is the long-term
  channel (it is).

Once you have Mac access, the ordered task list already exists — work
through, in this order:

1. `docs/LAUNCH_TODO.md` → section **"Mac required (parking lot)"** —
   Xcode build, plist checks, `GoogleService-Info.plist` (lights up native
   analytics + Google sign-in), App Attest, haptics-on-device, IAP sandbox
   end-to-end, TestFlight.
2. `docs/run-reliability-qa.md` — a complete step-by-step on-device QA
   script for the run tracking flows (GPS, save/retry, airplane-mode
   cases). Written to be followed exactly, checkbox by checkbox.
3. `docs/pre-launch-qa-checklist.md` → the device-batched items (tooltip/
   coachmark on-device checks, food-photo persistence, Apple subscription
   uniqueness with a sandbox Apple ID).

While on the device, also capture the **App Store screenshots** (Part 16).

---

## Part 16 — Non-technical prep (do anytime, no tools needed)

### 16.1 App icon

The current icon is placeholder-tier. Commission or design a replacement:

- Deliverable: **1024×1024 PNG, no transparency, no rounded corners**
  (Apple applies the mask).
- Brief (from the design review): orbit / training-trajectory / stylised T
  / mountain-peak concept, purple-orange gradient, must read at 60×60.
- Where: any designer (Dribbble / Fiverr / a friend). Attach the brand
  colours: purple `#7B72E9`, coral `#D4637A`, orange `#D9884E`.

### 16.2 App Store metadata (draft in any notes app)

- **Name** (30 chars): Tropos
- **Subtitle** (30 chars): e.g. "Adaptive training & nutrition"
- **Description**: lead with what it does; footer must carry the
  troposfit.com terms + privacy links (Part 7.4).
- **Keywords** (100 chars, comma-separated, no spaces needed).
- **Category**: Health & Fitness.
- **Reviewer notes** (drafted now, pasted at submission): a demo/sandbox
  account login; a sentence that AI food analysis is an estimate, not
  medical advice; how UGC moderation works (report button → admin queue →
  hide/dismiss; auto-profanity filter).

### 16.3 Lawyer review of the legal pages

The in-app Terms + Privacy text was written to match the real data
practices, but it isn't a substitute for a professional read before public
launch. Send `https://troposfit.com/terms` + `/privacy` (after Part 7) to a
solicitor for a one-pass review.

---

## Suggested schedule

| When | Do | Time |
| --- | --- | --- |
| Session 1 | Part 0 (setup) → Part 1 (CORS — fixes a live bug today) | ~1 h |
| Session 2 | Part 2 (App Store Connect) → Part 6 (Small Business) | ~2 h |
| Session 3 | Part 3 (secrets) → Part 4 (deploys + spot-check) → Part 2.5 | ~1.5 h |
| Session 4 | Part 7 (domain) + Part 8 (Resend) — start early, DNS waits | ~1 h + wait |
| Session 5 | Part 9 (one-timers) → Part 10 (reCAPTCHA) → Part 11 (storage) | ~1 h |
| Session 6 | Part 12 (moderator) → Part 13 (browser QA) | ~2 h |
| Weekly | Part 14 (log check) | 15 min |
| In parallel | Part 15 (arrange Mac access) + Part 16 (icon, metadata) | — |
| With a Mac | Part 15 device work → screenshots → TestFlight | 1–2 days |

If you only manage three sessions: do 1, 3, and 4 — CORS, secrets+deploys,
and the public domain unblock everything else.
