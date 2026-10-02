# RevenueCat + App Store Connect setup (IAP slice 1 / #1097)

Operator runbook for the monetisation foundation. **No app code** — this
produces the product IDs, keys, and entitlement that the code slices (#1098+)
consume. Follow it top-to-bottom; every decision is pre-made (per
[ADR-0006](../adr/0006-adopt-revenuecat-iap.md)) so you're not guessing.

**Prerequisites:** a paid Apple Developer account; the app's bundle id is
`com.tropos.app`.

These exact values are already hard-coded in the client
(`src/lib/purchaseProvider.ts`), so create them **verbatim** — a typo means the
store returns "product not found":

| Plan    | App Store product ID         | Entitlement |
| ------- | ---------------------------- | ----------- |
| Monthly | `com.tropos.app.pro.monthly` | `pro`       |
| Yearly  | `com.tropos.app.pro.yearly`  | `pro`       |

---

## Part A — App Store Connect

1. **Sign the Paid Apps agreement.** App Store Connect → **Business** → Agreements.
   IAP products stay "Missing Metadata"/unusable until the Paid Applications
   agreement is **active** (and banking + tax forms are filled). Do this first —
   it's the most common "my products don't show up" cause.

2. **Create the app record** (if not already) for bundle id `com.tropos.app`.

3. **Create a subscription group.** App → **Subscriptions** → create a group,
   e.g. **"Tropos Pro"**. (Monthly + Yearly live in the _same_ group so a user
   can upgrade/downgrade between them and only ever holds one.)

4. **Create the two auto-renewable subscriptions** in that group, with the
   **exact** product IDs above:
   - `com.tropos.app.pro.monthly` — duration **1 month**
   - `com.tropos.app.pro.yearly` — duration **1 year**
   - Set a price for each (your call; a common shape is yearly ≈ 10× monthly so
     the annual plan reads as a discount). Add a localised display name +
     description for each (required before review).

5. **Add the free-trial introductory offer.** On **each** product → Introductory
   Offer → **Free**, duration **7 days**, for **New subscribers**.
   - _Decision (#1097): intro offer is configured **per-product** (each of the
     two products carries its own 7-day free trial), not per-group — App Store
     introductory offers are a per-subscription setting._
   - This replaces the old no-card 7-day onboarding grant (closes the M2
     trial-farming finding — slice 6).

6. **Generate the In-App Purchase key for RevenueCat.** Users & Access →
   **Integrations** (or **Keys**) → **In-App Purchase** → generate a key.
   Download the `.p8` (you can only download it once) and note the **Key ID** +
   your **Issuer ID**. RevenueCat needs all three to read your products + receive
   App Store Server Notifications.

---

## Part B — RevenueCat

1. **Create a RevenueCat account + project** (free tier is fine for launch).

2. **Add an App** to the project → platform **App Store** → bundle id
   `com.tropos.app`. Upload the **`.p8` In-App Purchase key** + Key ID + Issuer
   ID from A6 so RC can validate receipts and ingest Apple notifications.

3. **Create the Entitlement** named **`pro`** (lowercase — the code checks
   `subscriptionTier === "pro"`).

4. **Create the Products** in RC for `com.tropos.app.pro.monthly` and
   `…pro.yearly`, and **attach both to the `pro` entitlement**.

5. **Create an Offering** (e.g. the default `default`) with two **Packages**:
   - a **Monthly** package → `com.tropos.app.pro.monthly`
   - an **Annual** package → `com.tropos.app.pro.yearly`
     (Slice 2's code reads the current Offering's packages to render the paywall,
     so you can re-price/swap products later without an app update.)

6. **Set the transfer behaviour deliberately** (Project settings → "Restore
   behavior" / transfer behaviour).
   - _Decision (#1097): choose **"Keep subscription with the original App User
     ID"** (i.e. do NOT auto-transfer to a new App User ID on conflict)._
   - Rationale: our App User ID = the Firebase `uid`. A subscription should stay
     bound to the account that bought it; auto-transfer would let a shared Apple
     ID silently move Pro between two Tropos accounts. This is the RC-native
     equivalent of the `appAccountToken` purchaser-binding the 2026-06 audit
     flagged.

7. **Collect the three keys:**
   - **Public SDK key** (Apple app → API keys, the `appl_…` public key) — goes
     in the **client** (Vite env).
   - **Webhook auth header secret** — a value _you_ choose; RC sends it on every
     webhook as the `Authorization` header. → **Secret Manager** (backend).
   - **REST API key** (Project → API keys, secret) — for the sync-on-purchase
     callable. → **Secret Manager** (backend).

8. **Configure the webhook** (Project → Integrations → Webhooks) pointing at the
   Cloud Function URL slice 3 will create
   (`https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/revenueCatWebhook`),
   with the `Authorization` header set to the secret from B7 (the bare secret or
   `Bearer <secret>`; the function accepts either). _(You'll paste the real URL
   after slice 3 deploys — fine to set this up last.)_

---

## Part C — where the keys live (so the code slices find them)

| Key                    | Home                                     | Name (slices will use)    |
| ---------------------- | ---------------------------------------- | ------------------------- |
| RC public SDK key      | Vite env (web build + native)            | `VITE_REVENUECAT_IOS_KEY` |
| RC webhook auth secret | Secret Manager (`defineSecret`)          | `REVENUECAT_WEBHOOK_AUTH` |
| RC REST API key        | Secret Manager (`defineSecret`)          | `REVENUECAT_REST_KEY`     |
| Sandbox Pro allow-list | Plain env var on both functions (no key) | `REVENUECAT_SANDBOX_UIDS` |

Provision the two backend secrets before slice 3 deploys (a deploy that
references an unprovisioned bound secret **fails** — that's the safety gate):

```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
firebase functions:secrets:set REVENUECAT_REST_KEY
```

Then let the functions read each new secret. A deploy grants the functions'
account access to a secret it binds, but the CI deploy account isn't allowed
to grant it, so the first CI deploy after a new secret fails with
`Permission 'secretmanager.secrets.setIamPolicy' denied`. Grant it yourself
once per new secret, before that deploy: Google Cloud console → Secret
Manager → the secret → Permissions → Grant access → principal
`adaptive-fitness-af8bb@appspot.gserviceaccount.com`, role **Secret Manager
Secret Accessor**. Or from a terminal:

```bash
gcloud secrets add-iam-policy-binding REVENUECAT_REST_KEY \
  --member=serviceAccount:adaptive-fitness-af8bb@appspot.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor --project adaptive-fitness-af8bb
```

The deploy checks only the secret's own permission list, so a project-wide
role does not count. Found on the first deploy of these two secrets
(2026-09-29).

Check the result on each secret's **Permissions** tab, not by the console's
notice. "No change – principal already exists on the policy" can still be
showing from the secret you did before: on the second attempt the REST key
was granted and the webhook secret was not, though the notice had appeared
on the webhook secret's page.

The public key just goes in the Vite prod env (and the GitHub Actions build
env). **Never** put the webhook/REST secrets in Vite — they're server-only.

### Sandbox purchases grant Pro only to listed uids

A sandbox purchase (TestFlight, StoreKit testing) costs nothing, and anyone
with a test build can attach one to any App User ID through the public SDK
key. So `revenueCatWebhook` and `syncRevenueCatEntitlement` grant Pro for a
sandbox purchase only when the buyer's Firebase uid is in
`REVENUECAT_SANDBOX_UIDS`: your own account and App Review's demo login. For
anyone else the purchase goes through in the store, the user stays free, and
the function logs `revenueCat.sandbox_refused` with the uid. Unset or empty
means no sandbox purchase grants Pro to anyone. Production purchases are
unaffected.

**Put App Review's demo account uid on the list before you submit.** The
reviewer buys in the sandbox. Without their uid on the list the purchase
succeeds and Pro never unlocks, which reads to them as a broken purchase.

It is a plain env var, not a secret, set the way `ADMIN_UIDS` is
(`functions/adminAuth.js`). Find each uid in Firebase Console →
Authentication → Users, then add the line to `functions/.env` (gitignored,
so it stays on your machine) and deploy the two functions from an up-to-date
checkout of `main`:

```bash
# functions/.env
REVENUECAT_SANDBOX_UIDS=<your uid>,<App Review demo uid>
```

```bash
firebase deploy --only functions:revenueCatWebhook,functions:syncRevenueCatEntitlement \
  --project adaptive-fitness-af8bb
```

Both functions read it, so both need it. Two things about how firebase-tools
treats plain env vars (read from its deploy code, `inferDetailsFromExisting`
in firebase-tools 15.30.2):

- **CI deploys carry no `functions/.env`.** A deploy without one keeps the
  variables each function already has, so the list survives later CI
  deploys. A function that a CI deploy creates for the first time gets none,
  so set the list after the first deploy that creates these two functions.
- **A deploy with a `functions/.env` replaces the deployed functions'
  variables with the file's contents.** Keep every plain variable those
  functions need in the file.

Adding or removing a uid means deploying the two functions again. Confirm
the value in the Google Cloud console (Cloud Functions → the function →
Variables) before relying on it.

---

## Acceptance checklist (#1097)

- [ ] Paid Apps agreement active; banking/tax done
- [ ] Subscription group + both Pro products live with the exact product IDs
- [ ] 7-day free-trial introductory offer on each product (per-product, recorded)
- [ ] RC project linked to App Store Connect via the `.p8` key
- [ ] Entitlement `pro` + an Offering mapping both products as packages
- [ ] Transfer behaviour set to "keep with original App User ID" (recorded)
- [ ] Public SDK key in Vite env; webhook auth secret + REST key in Secret Manager
- [x] (after slice 3) Webhook configured with the `Authorization` secret
- [ ] (after slice 3, before submission) `REVENUECAT_SANDBOX_UIDS` on both
      functions holds your uid and App Review's demo account uid

---

## What I build once you've done the above

- **Slice 2 (#1098):** `@revenuecat/purchases-capacitor` init + `logIn`/`logOut`
  on Firebase auth change (uid = App User ID). Needs only the **public key**, so
  I can scaffold it now and you drop the key in.
- **Slice 3 (#1099):** the real purchase flow through `purchaseProvider.ts`
  (client, #1454), plus the `revenueCatWebhook` function and the
  `syncRevenueCatEntitlement` callable (server, `functions/revenueCat.js`). Both
  re-read the subscriber from the REST API and write `subscriptionTier` /
  `subscriptionExpiresAt`, which also covers the lifecycle events slice 4
  planned. Needs the **webhook + REST secrets** before it merges; the QA row in
  CLAUDE.md has the checks.
- **Slices 4–8:** lifecycle webhooks, restore/manage, the web "Get it on iOS"
  funnel, then the sandbox-device test that retires the hand-rolled Apple path.

> The one thing neither of us can skip: **slices 2–8 can only be truly verified
> on a real iOS sandbox device** (IAP doesn't run in a simulator), signed in to
> an account on `REVENUECAT_SANDBOX_UIDS`. On any other account a sandbox
> purchase leaves the user free by design. Everything lands mergeable behind
> the current path; slice 8 is the on-device sign-off.
