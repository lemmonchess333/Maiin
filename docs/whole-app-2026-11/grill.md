# The whole-app grill, 13 November 2026

The owner asked for "a grill me on everything possible involving the app
… broad to specific", then for sleep and heart data, pricing and what Pro
holds, a website that sells through Stripe, retention and renewal, and
notifications. Six rounds, 69 questions, each with a recommended answer
worded so "yes" accepts it. Facts came from five read-only passes over the
code and four web research passes (pricing, retention and notifications,
sleep and heart data, the website and its App Store rules).

**The owner's answer, 13 November: "Yes to all, fix the five faults now".**
Every recommended answer below is accepted, with one exception decided
earlier in the same exchange: **Q19 keeps Stripe**, since the owner wants a
website that sells Pro. The five Train calls in
`docs/train-week-2026-11/grill.md` were open at the same time and are taken
as accepted by the same words (plan file row TrainWk1).

The owner's standing brief for this work (13 November): "Ignore the rules,
we don't want to be held back, we just want the best app, the best
results, what would be best for the user and the most effective." Earlier
decisions are evidence here, not limits. Each answer that overturns one
says which.

## Round 1. What the app is

1. **Who it is for.** First for the person who lifts and runs and wants
   their food to follow. Lift-only and run-only people are fully served and
   never hit a dead end, but the hybrid person sets the priorities.
2. **The one promise.** One plan that adapts across training, food and
   recovery, so you never do the sums yourself. A feature that does not
   make, carry out or adjust the plan is a candidate to cut.
3. **Tying it together.** One shared picture of the week; each tab is a
   view of it.
4. **The tabs.** Five. The fifth is renamed from Analytics to Progress.
5. **How much the app decides.** Small, reversible changes happen with a
   one-line reason and an undo; big ones are offered.
6. **Social at small numbers.** Feed, follows and Circles work with ten
   people; leagues, challenges and Spaces stay quiet until there are
   enough people to fill them.
7. **What is free.** All training stays free at launch (refined by Q45).
8. **Leftovers.** Removed, not kept "just in case", with a clean-up of
   stored data.
9. **Phone checks first.** Seeing what shipped work on a phone comes before
   more large features. No TestFlight build starts until the owner asks.

## Round 2. The performance score, Analytics and operations

10. The single score moves into the details; the page leads with load
    against your usual and whether you can take more. The engine stays.
11. One lighter-week decision for both sports, its words matching the
    trigger that fired (today a lifting-only week is never offered one, and
    the banner says "running load" for all three triggers).
12. The score appears in one place: the weekly review keeps its verdict in
    words and drops the number (Trim1 call 5 said one page; it was two).
13. "This week" means Monday to Sunday everywhere; the score's window is
    labelled "last 7 days".
14. Every weekly count comes from one module (six places count sessions,
    three supply "planned", four define a food day). A food day is a
    finished day of 800 kcal or more, everywhere.
15. One record book: whatever is celebrated is visible in Bests.
16. Score details keeps one load model, the score's own. The two warnings
    from the minutes-based curve feed the lighter-week decision or go.
17. Five launch numbers: finished setup, first session within 7 days,
    week-4 return, trial start, paid. Wire the missing events
    (`trial_started`, `subscription_started` among eight never sent);
    delete the rest of the unused ones.
18. Person-to-person events send a push: comments, follow requests, an
    invite joined, a league result. Props arrive as one daily bundle.
19. **Stripe is kept** (the owner, for a website that sells), as the
    gateway under RevenueCat Billing once Q77 was answered. Fixed on
    13 November so it works (see "Fixed at once" below).
20. The two riskiest loose-flag flows are fixed first: finishing a lift
    (it can be "saved" and "needs attention" at once) and checkout (a
    completed purchase can be reported as failed).

## Round 3. Settings and leftovers

Three settings faults found, to be fixed: Gender in Settings writes a field
nothing reads (the engine reads `sex`, set only at setup); Age range in
Settings writes a field nothing reads (calories read `age`); Analytics'
planned sessions read `daysPerWeek`, written once at setup.

21. Each fact about a person is stored once; a second name for old
    accounts is read as a fallback and never written.
22. Profile asks for the sex used for calculations and a date of birth,
    with a line saying what they are for. Gender as an identity field goes.
23. "What kind of athlete" stops being a stored answer: the app reads the
    live plan. The setup answer is kept for first-week numbers only.
24. Fields that do nothing are deleted, one PR per document, with a script
    that strips stored copies: 19 on the profile, five on the programme.
25. The retired "structured" run mode is removed once a count shows no
    account holds it (a script for the owner to run).
26. One switch and one time per reminder; the app picks local or push.
27. The activation comparison group ends and the old first-week journey is
    removed. Overturns XB1's comparison group.
28. The redirects stay, except `/settings/legacy` and `/log`.

## Round 4. How the features connect

29. Food's hero and Home's energy card show the day's fuel label the app
    already works out ("Long run tomorrow, fuel up today").
30. A finished lift gets what a finished run gets: a recovery-food link,
    the props prompt, sharing to a Circle.
31. A 7-day step average offers a change to activity level; heart rate
    waits for the Watch. The steps tile leaves Home until it feeds
    something.
32. The streak stays as days, with covered rest days (closes the
    10 November open call).
33. Every badge is awarded by the server.
34. An unread dot on the Social tab, plus the pushes in Q18.
35. Coming back after a break is one check for both sports.
36. The weekly review ends with next week and any offered change, accepted
    in one tap. Overturns Rev1's "passive narration".
37. Space posts and feed posts become one kind of post, after launch.
38. A Hidden posts list under Social & privacy.

## Round 5. Sleep, heart, Pro, the website, retention, notifications

39. Sleep comes from Apple Health; Tropos tracks none itself.
40. Sleep and heart data may offer an easier session; they never rewrite
    the plan by themselves.
41. Readiness works with no watch: training load and a one-tap "how do you
    feel", sharper with sleep and heart data.
42. Readiness is words (for example Ready, Steady, Go easy) with a reason.
43. Resting heart rate and HRV come from Apple Health first, before the
    Watch app.
44. Only daily summaries are stored on the server, never raw samples.
45. **What Pro is:** the app using your body's data to adjust things for
    you. The adapting calorie target, macros that follow the day,
    readiness from sleep and heart, and the AI scan. The plan and tracking
    stay free.
46. Anything that protects a person stays free: the lighter-week offer,
    Easier today, race-week rest, coming back after a break.
47. The free and paid line is set before launch and never moved downward.
48. One Pro tier, monthly or yearly.
49. The adapting target is worked out for every account and applied for
    Pro; a free account is told when its personal target is ready.
50. The website explains and sends people to the App Store, sells and
    manages Pro through Stripe, and is where shared links land.
51. A public post gets a public page with the card and "Get Tropos", route
    ends hidden.
52. The website does not offer the app itself in the browser yet.
53. What people rely on is "my next session is ready"; the streak supports
    it.
54. A ladder for someone who stops (about day 3, 7, 14 and 30), then
    silence; later steps by email.
55. Email beyond receipts, with an opt-in at setup: the weekly review and
    the later win-back steps. No newsletters.
56. Pro shows what it did: monthly in the review, and a "your year" recap
    before a yearly renewal.
57. Date of birth replaces the age range; a birthday is one warm line and
    one push, with no offer.
58. Earned anniversaries (50th and 100th session, one year, 1,000 km) are
    full-screen and shareable.
59. Reminders go at the person's own usual time once learned.
60. A budget: at most one non-social push a day and five a week.
61. No notification uses guilt.
62. A reminder ignored three times running goes quiet, and Home says so
    once.
63. Android waits until the iPhone app has been through its phone checks.
64. No chat coach.
65. A minimum age of 16, checked by date of birth (setup already refuses
    under 16 by range).

## Round 6. What the code changed

The code read corrected three Round 5 answers: the installed Health plugin
cannot read sleep, resting heart rate or HRV (Q39, Q43); a 7-day trial
cannot see the adapting target switch on, which needs 14 days of
weigh-ins (Q49); the stored age never increases (Q57). It found five
faults, fixed at once (below).

66. One ask for notifications, on the first finish screen, turning on the
    session reminder and push together; the scattered asks go.
67. The trial wording names only what the person used.
68. Web checkout is fixed as one piece of work.
69. Every share carries a way back in.

## Fixed at once (owner: "fix the five faults now")

| Fault                                                                                                                                                      | Fix                                                                                                                                                                                                                                                         | PR branch                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Push asked for only from a Settings switch                                                                                                                 | The one ask (Q66)                                                                                                                                                                                                                                           | `claude/one-reminder-ask` |
| Web checkout could not start: no sign-in token, an address only the app's page answered, placeholder prices; no way to cancel; no reminder for a web trial | Replaced, not patched: the owner chose RevenueCat Billing on Stripe the same night (Q77, below). The web opens RevenueCat's hosted checkout as the signed-in account; Manage subscription opens RevenueCat's management link; a web trial gets the reminder | `claude/revenuecat-web`   |
| A share carried no link                                                                                                                                    | The link in every shared card's words; an absolute preview image                                                                                                                                                                                            | `claude/share-links`      |
| (Q67) Trial words named a target that never adapted                                                                                                        | Named only when it had                                                                                                                                                                                                                                      | `claude/trial-wording`    |

## What this overturns

| Earlier decision                                                                       | Overturned by                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sub4 (5 July): Stripe Checkout dormant for a later web store                           | Q19 and Q77: the web sells through RevenueCat Billing on Stripe; our own Stripe functions are retired once it works |
| Mob1 call 3: setup's optional reminder row                                             | Q66                                                                                                                 |
| XB1 call 8: the reminder offer only for new accounts in their first week, with no push | Q66                                                                                                                 |
| XB1's activation comparison group                                                      | Q27                                                                                                                 |
| Rev1: the weekly review is passive narration                                           | Q36                                                                                                                 |
| Trim1 call 5's placing: the score shown on two surfaces                                | Q12                                                                                                                 |
| Today's Pro list (what costs money to run)                                             | Q45                                                                                                                 |

## After the five faults: Q77 answered (13 November)

While the fixes were being written the owner asked: "Do we have to have
Stripe? Or can we use RevenueCat on the web?" RevenueCat's web billing
still needs a payment processor underneath (Stripe or Paddle); what it
removes is our own Stripe code. Its docs, read that night: RevenueCat
Billing uses Stripe as the gateway with Tropos as merchant of record,
adds no RevenueCat fee for the web, provides a hosted checkout (Web
Purchase Links) and a customer portal, and grants the same entitlements
as the App Store. The owner: **"Yes do RevenueCat on Stripe."** So the
patch to our own Stripe checkout was dropped unpushed, and
`claude/revenuecat-web` builds the web on RevenueCat instead. The old
`createCheckoutSession` and `stripeWebhook` stay dormant until the new
path has worked, then go.

## Waiting on Round 7

The research for these is in; the questions are not yet asked: the price
and trial length (Q45 to Q48), whether readiness has a number at all
(Q42), the win-back days (Q54), how much reminding at the person's own time
is worth (Q59), which Health plugin, and the App Store rules for the
website by country. Round 7 was sent with these as Q70 to Q81; Q77
(RevenueCat on the web) is answered above.
