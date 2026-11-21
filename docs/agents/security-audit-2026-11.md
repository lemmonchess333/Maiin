# Tropos security audit, November 2026

Baseline: `6f1d1b62e` (main on 18 November 2026). The question: how could a
signed-in or signed-out person read, write or cost what they shouldn't,
across `firestore.rules`, `storage.rules`, the callables and HTTPS
functions in `functions/`, App Check, and what the client trusts. This is a
bounded source review with tests for every fix, not a certification that
nothing is left.

## How it was done

- `firestore.rules` (2,840 lines) and `storage.rules` read in full, each
  collection held against what CLAUDE.md's Data Model section says its
  reader and writer are.
- An inventory of all 53 client-reachable endpoints (47 in
  `functions/index.js`, 3 in `revenueCat.js`, 2 in `email/accountEmails.js`,
  1 in `currentWeather.js`): auth, which uid each acts on, the deletion
  freeze, restriction, verified email, block checks, rate limits, paid
  calls, `maxInstances`.
- A separate sweep of billing and entitlement: webhooks, the website
  checkout, `computeEffectiveTier`, the AI scan quota, Pro gates.
- Every collection-group sweep checked for a client-writable field that
  decides what other people get.
- A Claude Fable advisor reviewed the findings and the fix plan before any
  code was written; its review moved three fixes and added three findings
  (S2, S7 and O6 below). A second review read every diff and found four
  more problems, each fixed on its branch: S3 counted a retried upload
  again, S4 quieted a request that came from an invite, S5 dropped "didn't
  use a scan" when nothing was charged, and S6's last email could be
  followed by more. Each PR records both reviews.

Limits. The Firestore emulator could not be downloaded in this session (the
proxy refuses `storage.googleapis.com`), so the two rules PRs prove red and
green in CI: a first commit with the tests alone, then the fix. Nothing was
sent to production: no probes, no deploys, no console. Earlier passes'
findings were not re-tested except where named below.

## Severity

- **High**: anyone can read or change another person's private data, or
  get Pro, or run up unbounded cost, with no account-level limit.
- **Medium**: a privacy leak that takes effort, a cost one account can
  multiply far past its intended bound, or one account denying a feature
  to everyone.
- **Low**: integrity of cosmetic or self-reported figures, leaks of
  already-public data across a block, or abuse bounded by an existing limit.

No High finding was found.

## Fixed, one draft PR each

| ID  | Severity | Finding                                                                                                                                                                                                                | Where (main)                                                                   | PR    |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----- |
| S1  | Medium   | `deleteSegment` told the maker how many efforts everyone had on their segment, including never-shared runs, runs whose ends are in a privacy zone and runs by people who blocked them                                  | `functions/index.js:6741`, `functions/lib/segments.js:780`                     | #3392 |
| S2  | Medium   | One account could stop every props push: 1,000 owner-writable settings documents with `propsBundleDueAt` in 1970 fill the hourly sweep's read for good                                                                 | `functions/index.js:4391`, `:4346`; `firestore.rules:884`                      | #3394 |
| S3  | Medium   | Unbounded Cloud Vision spend through uploads (every upload to a screened folder is a paid screen, and Storage limits no account's uploads), and the upload trigger kept a photo, with no retry, whenever Vision failed | `functions/index.js:7671`, `:7632`; `storage.rules`                            | #3397 |
| S4  | Medium   | Push spam by follow request: request, cancel, request again; each one rewrote the tray row and pushed, outside the push budget                                                                                         | `functions/index.js:9997`, `:9888`, `:4270`; `firestore.rules:2311`            | #3400 |
| S5  | Medium   | AI scans refunded on every failure, including an answer the person can make fail by typing a long list, so the 100-a-day cap stopped bounding Gemini spend                                                             | `functions/index.js:1528`, `:1801`; `functions/lib/aiScanQuota.js:176`, `:185` | #3405 |
| S6  | Medium   | Every report emailed the owner, no cap: one account could send 240 a day through the Resend allowance that password resets and verification share                                                                      | `functions/index.js:7790`                                                      | #3407 |
| S7  | Low      | A public post's props and comments were readable by someone its author blocked, though the post itself is refused across a block                                                                                       | `firestore.rules:2178`                                                         | #3395 |

### Reproduction and fix

**S1.** Write any run (owner writes to `users/{uid}/runs` are open), call
`createSegment` on a street someone runs, wait, call `deleteSegment`, read
`efforts`, repeat (10 creates and 20 deletes an hour). Each answer counts
everyone's laps since the segment was made, which the board never shows.
Fix: the callable answers `{ deleted: true }`; the app ignored the count.

**S2.** As any signed-in account, `setDoc` a thousand
`users/{uid}/settings/p{n}` documents each with
`propsBundleDueAt: new Date(0)`. `hourlyPropsBundle` reads
`collectionGroup("settings").where("propsBundleDueAt", "<=", now).limit(1000)`,
which Firestore returns oldest first, and `sendPropsBundle` skips anything
not named `propsBundle` without removing it. Fix: the rules refuse a
client write of `settings/propsBundle`, `settings/pushBudget` and of the
field anywhere in `settings`; the sweep removes the field from a document
that is not a bundle.

**S3.** Upload files in a loop to `space-photos/{uid}/` (10 MB each, any
number) or call `screenPhoto` on the same path 30 times every 10 minutes:
each is a SafeSearch request at about $1.50 per 1,000 (the price
`docs/qa/pre-launch-backlog.md` gives). Separately, when Vision failed, the
trigger logged and kept the file, so a client that skipped the callable
kept every photo uploaded meanwhile. Fix: 100 trigger screens and 100
callable screens a rolling day per account (Tropos heuristic: four times a
busy day's 25 uploads). Past the budget, the upload is deleted unscreened.
The trigger is now retried; an upload is counted once however often its
event is delivered again, and an error reading the count is retried rather
than read as over budget. A photo is never deleted because Vision failed
(a coordinator decision on #3397, 18 November): an image Vision rejects as
unreadable, or one too large to send, is deleted at once, and any other
failure is retried for a day, after which the photo is kept, marked with
custom metadata `screen: unscreened` and logged. A pass from the callable
stops the trigger screening that file again or deleting it on budget.

**S4.** From any unrestricted account, against someone who approves
followers (the default): create `followRequests/{them}/users/{me}`, delete
it, create it again, in a loop. Each create rewrote
`notifications/{them}/items/follow_request_{me}` with a new time, which
`onNotificationItemWritten` pushes. Fix: `createNotification` gains
`quietForMs`; a follow request row written in the last day is left as it
is (Tropos heuristic: a day, as the props bundle's once a day), so no
push and no unread. A request that comes from joining by invite is always
told.

**S5.** On a Pro or trial account, send `analyzeFoodText` a meal of about
150 different foods. The answer runs past `maxOutputTokens` (8,192), comes
back cut short, does not parse, and the catch refunds the scan
(`isServiceFailure(undefined)` is true). Repeat at the rate limit: about
2,000 maximum-cost calls a day instead of 100. Fix: at most five refunds
per action per UTC day (Tropos heuristic), counted in their own field;
the quota itself is unchanged.

**S6.** File a report every six minutes from a throwaway account (no
verified email needed; reporting your own public post passes): 240 emails
a day to the owner, from the allowance password resets, verification and
trial reminders use. Fix: three alerts a rolling day per reporter and 50
a UTC day from everyone (Tropos heuristics), one counter read and written
in one transaction; the 50th says it is the last until midnight UTC;
reports past either are stored and queued as always.

**S7.** As someone the author blocked, `getDocs(collection(db, "kudos",
postId, "users"))` or the same on `comments/{postId}/items` for a public
post: allowed, while `getDoc` of the post is refused. Fix: the block check
applies to every branch for anyone but the author.

## Open items found

None of these had a PR when the audit was written. Each needed a product,
billing or operational call, or was already in flight elsewhere. The next
section records what was decided.

| ID  | Severity            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                          | Where                                                                                               | What would close it                                                                                                                                                                                                                                  |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Medium              | App Check is enforced on no callable and no HTTPS function, so every cost and abuse bound above is per account, and accounts are free                                                                                                                                                                                                                                                                                            | `docs/app-check-rollout.md`; `functions/index.js` (no `enforceAppCheck`)                            | The staged rollout already written down: native attestation, 99% verified for seven days, then per-callable enforcement. The paid endpoints first (`analyzeFood`, `analyzeFoodText`, `screenPhoto`, `createReport`, `sendPasswordResetLinkCallable`) |
| O2  | Medium              | Anyone signed in can list anyone's followers and following, including an account that approves followers and one that blocked the reader                                                                                                                                                                                                                                                                                         | `firestore.rules:2231`, `:2264`                                                                     | Draft PR #3154, waiting on the follow-count backfill and an iPhone build that reads the server's counts (`docs/qa/pre-launch-backlog.md`, "Then close the lists")                                                                                    |
| O3  | Medium              | Deleting an account cancels a legacy Stripe subscription only. A website purchase (RevenueCat Billing on Tropos's own Stripe account) keeps renewing, and the app's "cancel first" warning shows only for Apple                                                                                                                                                                                                                  | `functions/lib/accountDeletionRetry.js:56`; `src/components/settings/AccountSection.tsx:103`        | Cancel the RevenueCat Billing subscription in the deletion executor, and widen the warning to website purchases. Touches the irreversible deletion path, so it wants its own reviewed change                                                         |
| O4  | Medium (unverified) | The website trial may be had again by each new account: on RevenueCat Billing trial eligibility follows the App User ID (the uid), and nothing on the server records a website trial                                                                                                                                                                                                                                             | `src/lib/purchaseProvider.ts:113`                                                                   | Check RevenueCat Billing's trial rules; if per App User ID, decide between no website trial, a card-fingerprint check, or accepting it                                                                                                               |
| O5  | Low to Medium       | The legacy `createCheckoutSession` is still deployed. Its trial check reads `hasUsedTrial` and `trialExpiresAt` only, which a RevenueCat or App Store trial never sets, so a direct call gets a second trial (card required) if the Stripe price variables are still set                                                                                                                                                         | `functions/index.js:2014`; `functions/lib/checkoutTrial.js:75`                                      | CLAUDE.md already plans to retire it once the website checkout has worked; until then, also refuse a trial when `subscriptionTrial` is set                                                                                                           |
| O6  | Medium to Low       | A Space's week is a count and two sums over its members once five trained. Four throwaway accounts join a small race Space and train once each: the fifth member's week, never-shared sessions included, is the remainder                                                                                                                                                                                                        | `functions/lib/spaceWeeks.js:76`; `firestore.rules:1954`                                            | A floor on established accounts, rounding, or accepting it. No cheap code fix                                                                                                                                                                        |
| O7  | Low to Medium       | Client-written facts decide things others see: streak badges trust `streaks/data.currentStreak` and `anchorStreak` as the client wrote them; session badges, league points, medals, challenge boards, segment times, Space weeks and the live pulse count client-written sessions. The pulse and Space weeks have no per-person cap, so one account saving ten empty workouts moves "Today: N sessions on Tropos" past its floor | `functions/lib/badgeAwards.js:542`; `firestore.rules:919`; `functions/lib/pulse.js`, `weekTally.js` | Accept self-reported sessions (Strava does, then flags); cap credits per person per day for the pulse and Space weeks (for example 3); recount the streak on the server rather than trust the certificate                                            |
| O8  | Low to Medium       | The password-reset cap (500 sends a day for the whole project) can be used up by about 170 throwaway accounts asking three times each; real resets then answer `ok` and send nothing for a rolling day                                                                                                                                                                                                                           | `functions/lib/passwordResetRequest.js:51`                                                          | Accept (the cap protects the Resend allowance), raise it with the Resend plan, or alert on the `dailyCap` log line (the backlog row "Resend's daily allowance fits" suggests it)                                                                     |
| O9  | Low (unverified)    | `lookupInvite` limits per caller address from `context.rawRequest.ip`. If the runtime trusts `X-Forwarded-For`, the leftmost entry is the caller's to write, and one caller can spend the project's 2,000 lookups a day, blanking inviters' names on the welcome screen. Walking codes for names stays out of reach (6.6e11 codes)                                                                                               | `functions/index.js:10333`                                                                          | Log the header once in production to see; if spoofable, key on the last proxy hop instead                                                                                                                                                            |
| O10 | Low                 | Pro features enforced only in the app: half, marathon and ultra plans after week one (`racePlanFreeWeekUsed`), history ranges past three months, faster pace updates, adaptive calories and macros, the step-based activity offer, the Pro parts of the weekly review                                                                                                                                                            | `src/lib/historyAccess.ts`, `paceUpdateAccess.ts`, `stepActivity.ts`; `firestore.rules:569`         | A revenue call, not a data one: each is the person's own data. Moving any to the server is a Pro-gate change for the owner                                                                                                                           |
| O11 | Low                 | The website checkout link carries the uid (`pay.rev.cat/<token>/<uid>`), and uids are public, so anyone can buy or start a trial for someone else's account; the buyer keeps the receipt and can cancel. It grants nothing free and cannot take Pro away                                                                                                                                                                         | `src/lib/purchaseProvider.ts:121`                                                                   | Accept (it is RevenueCat's model), or show "bought by someone else" on a purchase whose email is not the account's                                                                                                                                   |
| O12 | Low                 | RevenueCat Billing and the legacy Stripe webhook both write `subscriptionSource: "stripe"`, so a lapse on one can switch off Pro still paid on the other until the next sync                                                                                                                                                                                                                                                     | `functions/lib/revenueCatEntitlement.js:53`                                                         | A distinct source for RevenueCat Billing once the legacy path is retired                                                                                                                                                                             |
| O13 | Low (unverified)    | With the public RevenueCat key in the app, anyone may read any uid's subscriber record (status, store, dates, management link)                                                                                                                                                                                                                                                                                                   | RevenueCat's API                                                                                    | Check what the public key returns; inherent to App User ID = uid                                                                                                                                                                                     |
| O14 | Low                 | A deleted restricted account's identities are kept only as its exact email and its Google or Apple ids, so a plus-alias or a new address is a fresh account, and unlinking or changing email before deleting keeps nothing                                                                                                                                                                                                       | `functions/lib/restrictedIdentities.js:36`                                                          | Normalise aliases for known providers; accept the rest                                                                                                                                                                                               |
| O15 | Low                 | `publicPostPage` is signed out, uncached (`no-cache`) and unlimited: about eight reads per hit on a known public post                                                                                                                                                                                                                                                                                                            | `functions/lib/publicPost.js`                                                                       | A short `s-maxage`, traded against a post made private disappearing at once                                                                                                                                                                          |
| O16 | Low                 | Segments have no cap per area (200 per account), so throwaway verified accounts can pile segments on a popular route, which every runner there then pays to match; a segment's name shows on the runs of someone who blocked its maker                                                                                                                                                                                           | `functions/lib/segments.js:110`                                                                     | A cap per start cell; leave the maker's segments off a blocker's runs                                                                                                                                                                                |
| O17 | Low                 | Space member names skip the word filter and restriction: the member document takes any name of 50 characters and its owner may change it at any time, restricted or not, unlike a challenge row, which must match the public profile and takes no client update. Shown only as a fallback in suggestions                                                                                                                         | `firestore.rules:1888`                                                                              | Mirror the challenge participant rule and send the public profile's name from `useSpaceMembership.ts:111`                                                                                                                                            |
| O18 | Low to Medium       | Storage bytes per account are unbounded: files uploaded and never named by a post stay                                                                                                                                                                                                                                                                                                                                           | `storage.rules`                                                                                     | A sweep of files no post or profile names, or a per-account quota                                                                                                                                                                                    |
| O19 | Low                 | The admin callables (`resolveReport`, `liftRestriction`) accept any valid admin token, with no recent sign-in or revocation check, unlike `deleteMyAccount`                                                                                                                                                                                                                                                                      | `functions/index.js:7910`                                                                           | Require a recent sign-in for Restrict and Lift                                                                                                                                                                                                       |
| O20 | Low                 | A direct follow (to an account with Approve followers off) can be repeated to make the "started following you" row unread again; it is not pushed, and New followers is off by default                                                                                                                                                                                                                                           | `functions/index.js:9944`                                                                           | The same `quietForMs` as S4, if wanted                                                                                                                                                                                                               |
| O21 | Cost                | Every real photo is screened twice, by the callable and by the trigger                                                                                                                                                                                                                                                                                                                                                           | `functions/index.js:7613`, `:7671`                                                                  | Record the callable's pass per object generation and let the trigger skip it                                                                                                                                                                         |
| O22 | Low                 | A post's photos and map are fetchable by any signed-in account holding the path, including after a block                                                                                                                                                                                                                                                                                                                         | `storage.rules`                                                                                     | Draft PRs #3066 and #3067, authenticated media, already open                                                                                                                                                                                         |

## Decided (18 November, after the owner said to decide them)

The owner answered the list above with "You figure it out". Each item now
has a decision. Four need something only the owner's accounts can do; they
are listed after the table.

| ID  | Decision                                                   | Why, and what follows                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Keep App Check off in code; enforce by the written rollout | Enforcing today refuses every iPhone request, as native attestation has not shipped. The rollout (`docs/app-check-rollout.md`) stays the plan, paid endpoints first. Turning it on is a console step                                                                                                                                         |
| O2  | Close the lists with #3154, as planned                     | It waits on the follow-count backfill and an iPhone build that reads the server's counts; closing earlier would break other people's profiles on older builds                                                                                                                                                                                |
| O3  | Warn now (#3441); cancel on the server next                | The warning ships in #3441. RevenueCat's API v2 can cancel a Web Billing subscription (`POST /v2/projects/{project_id}/subscriptions/{subscription_id}/actions/cancel`, permission `customer_information:subscriptions:read_write`), so the deletion executor can cancel it once a key with that permission exists                           |
| O4  | Confirmed real; the fix is an offer setting                | RevenueCat Billing judges trial eligibility per customer, and a customer is an App User ID, which is the uid; every option ("has never made any purchase", "didn't have any subscription yet" and the rest) is per customer, so a new account is always eligible. The website offer should carry no free trial; that is a RevenueCat setting |
| O5  | Fixed: #3439                                               | A trial from any store now counts. Retiring the function stays CLAUDE.md's plan                                                                                                                                                                                                                                                              |
| O6  | Accept                                                     | The week counts saved sessions by Run27 call 11's lock, so counting only shared ones would re-decide a lock. The inference needs four accounts in the same small Space and yields one person's weekly sessions and kilometres                                                                                                                |
| O7  | Accept self-reported sessions; no per-person cap yet       | Every fitness app trusts what its users log; Strava flags rather than refuses. The pulse and Space week figures are cosmetic. Revisit a daily cap per person if a figure is gamed                                                                                                                                                            |
| O8  | Accept the cap; alert on it                                | The cap protects the email allowance every account email shares. The backlog row "Resend's daily allowance fits" already asks for a log alert on `dailyCap`                                                                                                                                                                                  |
| O9  | Accept                                                     | The worst case blanks inviters' first names on the welcome screen for a day; no data is exposed                                                                                                                                                                                                                                              |
| O10 | No change                                                  | Moving a Pro gate to the server is a Pro-gate change, outside this session's brief. Each gate protects revenue, not anyone's data                                                                                                                                                                                                            |
| O11 | Accept                                                     | It is how RevenueCat's purchase links work, and the buyer pays                                                                                                                                                                                                                                                                               |
| O12 | Fix with the legacy Stripe path's retirement               | A distinct source then costs one line                                                                                                                                                                                                                                                                                                        |
| O13 | Accept                                                     | Inherent to App User ID = uid; the record is billing status, not the person's data                                                                                                                                                                                                                                                           |
| O14 | Accept                                                     | Normalising aliases would also restrict real other people at shared providers                                                                                                                                                                                                                                                                |
| O15 | Accept                                                     | No cache keeps a post made private gone at once, which matters more than eight reads a hit                                                                                                                                                                                                                                                   |
| O16 | Accept for now                                             | Revisit a cap per start cell when segments have real use                                                                                                                                                                                                                                                                                     |
| O17 | Accept for now                                             | The name shows only where the public profile's name fails to load                                                                                                                                                                                                                                                                            |
| O18 | Defer                                                      | S3 bounds the paid part; a sweep of files no post names is housekeeping                                                                                                                                                                                                                                                                      |
| O19 | Accept                                                     | Two admin accounts; a stolen admin token is a bigger problem than this check                                                                                                                                                                                                                                                                 |
| O20 | Fixed in #3400                                             | Direct follows get the same day's quiet as follow requests                                                                                                                                                                                                                                                                                   |
| O21 | Fixed in #3397                                             | The callable records its pass per object generation, and the trigger neither screens that file again nor deletes it on budget                                                                                                                                                                                                                |
| O22 | #3066 and #3067, as planned                                | Already open                                                                                                                                                                                                                                                                                                                                 |

### Needs the owner's accounts

1. **RevenueCat:** create a secret API v2 key with `customer_information:subscriptions:read_write` and store it in Secret Manager, with the project id as a plain variable, so the deletion can cancel a website subscription (O3). The code change follows once the key exists.
2. **RevenueCat:** take the free trial off the website offer, or accept that each new account can take one (O4).
3. **Firebase console:** App Check enforcement when the rollout's numbers allow (O1).
4. **Functions variables:** check whether `STRIPE_PRICE_ID_*` are still set; if so, the dormant checkout can still sell (O5 closes its trial).

Sources: [RevenueCat, Configure Products & Prices (trial eligibility)](https://www.revenuecat.com/docs/web/web-billing/product-setup); [RevenueCat API v2, Subscription (cancel)](https://www.revenuecat.com/docs/api-v2/subscription).

## Open items from earlier passes

- **App Check enforcement** (September audit, follow-up): still off; O1.
- **Active production rules verification**: the workflow exists
  (`verify-production-rules.yml`); this pass did not run it.
- **Storage cross-service approval**: `STORAGE_XSERVICE_APPROVED` has been
  set since 15 September (CLAUDE.md); not re-checked here.
- **Progress-photo encryption key** (key derived from public uid material):
  not re-examined.
- **Dependency advisories**: another session's draft PR #3388 gates the root
  tree's audit; not repeated here.
- **Refusal-guard survivors** (20 September sweep): not re-run.

## Checked and found sound

- Billing: the RevenueCat webhook compares secrets in constant time and
  refuses an unset one; neither webhook trusts the event body (both re-read
  the provider); sandbox purchases grant nothing outside the allow-list;
  `computeEffectiveTier` reads only `subscriptionTier`,
  `subscriptionExpiresAt` and `trialExpiresAt`, which the rules lock on
  update and hold null on create, and nothing else that grants Pro is
  client-writable.
- The AI quota is a check-and-increment in one transaction on the server's
  UTC day, fails closed, and gives the free plan nothing.
- No endpoint acts on a uid taken from the request without checking it is
  the caller's or authorised; every client id is validated before it
  reaches a path; every endpoint has a `maxInstances` cap; every admin
  callable checks `ADMIN_UIDS`, which fails closed when empty.
- The collections added since September match CLAUDE.md's readers and
  writers: `leagueMembers`, `leagueGroups` and standings, `leagueWeeks`,
  `leagueStatus`, `users/{uid}/leagueResults`, `users/{uid}/medals`,
  `segments` and its board, `segmentOwners`, `users/{uid}/segmentEfforts`,
  `spaces/{id}/sessions` and `weeks`, `inviteCodes`, `followRequests`,
  `followCounts`, `restrictedIdentities`, `goalSpaces/{id}/meetups`,
  `users/{uid}/hiddenPosts`, `users/{uid}/healthWorkoutExports`, `pulse`,
  `raceCohorts`, and the badge fields of `streaks/data` and the public
  profile.
- `publicPostPage` shows only a public, unflagged post by an unrestricted,
  living account, cuts the route's ends on the server and escapes what it
  writes into the page.
- The other collection-group sweeps (`members`, `sessions`, `spaceWeeks`,
  `meetups`, `items`, `devices`) read no field a client can forge for
  someone else.

## After the PRs merge

Each PR's own test plan covers its checks. Only production shows two of
them: the photo screen budget's retries and logs (a new section in
`docs/qa/pre-launch-backlog.md`, in PR #3397), and that report alerts stop
at 50 a day (the `createReport.alert_held` log line, which shows only once
it happens).
