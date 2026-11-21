# Tropos: what to do next (November 2026)

Written 18 November 2026 for the owner, Myles. It is a draft for
decisions: nothing here has been agreed. It is not legal, tax or financial
advice, and section 7 says when to pay for that.

**How to read it.** Every claim about Tropos links to the file in this
repository that shows it. Every claim about the market, competitors, fees
and law links to its source, read on 18 November 2026 unless a date is
given. The research ran out of search allowance before a few points could
be checked; each of those is marked **unconfirmed**, and the last section
lists them. Money is shown in the currency it was published in. Where
pounds and dollars meet, this document assumes **£1 = $1.30**. That rate
was not checked in this run, so treat any figure converted between the two
as approximate.

## Contents

1. [The market](#1-the-market)
2. [Competitors](#2-competitors)
3. [Pricing and packaging for Pro](#3-pricing-and-packaging-for-pro)
4. [Launch plan](#4-launch-plan)
5. [Metrics and targets](#5-metrics-and-targets)
6. [Costs at 100, 1,000 and 10,000 users](#6-costs-at-100-1000-and-10000-users)
7. [Legal and compliance](#7-legal-and-compliance)
8. [The ten decisions](#8-the-ten-decisions)
9. [What could not be confirmed](#9-what-could-not-be-confirmed)

## The short version

- **The money is in spend, not installs.** People spent $4.5bn on Health &
  Fitness apps in app stores in 2025, 13% more than in 2024, while downloads
  rose 0.8% ([Sensor Tower, Feb 2026](https://sensortower.com/blog/health-and-fitness-apps-ai)).
  The UK is the second-largest market after the US
  ([Sensor Tower, Feb 2025](https://sensortower.com/blog/state-of-mobile-health-and-fitness-in-2025)).
- **Hybrid training is measured behaviour.** HYROX went from about 175,000
  racers in 2022/23 to over 1.4 million in 2025/26
  ([Infront](https://www.infront.sport/blog/participation-sports/hyrox-from-a-disruptive-fitness-race-to-a-global-mass-participation-powerhouse);
  [Infront, 8 Sep 2026](https://www.infront.sport/news/participations-sports/consortium-led-by-l-catterton-in-partnership-with-hyrox-founders-acquires-infronts-majority-stake-in-hyrox-clone)),
  and 54% of Strava users track more than one sport
  ([endurance.biz, Dec 2025](https://endurance.biz/2025/featured-news/stravas-12th-annual-year-in-sport-report-gen-z-doomscrolling-is-out-movement-is-in/)).
- **The big apps are moving towards Tropos's idea from three sides.**
  Strava added a strength log (May 2026), Garmin bought TrainingPeaks and
  TrainHeroic (July 2026) and added food logging (January 2026), Ladder
  added food (October 2025) and MacroFactor launched a lifting app (January
  2026). None of them yet plans lifts, runs and food as one week. That gap
  is open now and will not stay open.
- **Pro is priced below what it now holds.** Recommend UK £6.99 a month or
  £39.99 a year, US $7.99 or $49.99, the yearly plan first. At the same
  number of buyers this earns 25% more per UK subscriber in year one.
- **Offer the trial at the end of setup as well as at day 14.** Today the
  first offer comes about two weeks in, when the adapting target is ready.
  Adapty's figures suggest most Health & Fitness trials start on the day
  of install, so without an earlier, skippable offer Tropos will miss most
  of its trials.
- **The website checkout is worth having but not worth leading with.**
  Stripe's fee is about 2% of a yearly sale. The real costs are tax and
  consumer-law duties, and the UK app is not allowed to link to it.
- **Launch the UK first, quietly, in December; the US when the UK shows
  people coming back.** Submit to App Review by 7 December, release in the
  UK by 15 December, push in January through HYROX gyms, run clubs, one
  subreddit, creators and invites. Release in the US once its compliance
  list is done and the first UK sign-ups are still training in week four.
  No paid installs: a paying user costs $61 to $130 to buy through Apple
  Ads and returns about $37 in year one.
- **Be honest about the odds.** A bottom-up count gives about 3,200 UK
  installs in the first 90 days, and 1,100 if the channels underperform:
  roughly 70 or 10 paying subscribers by day 90. £100,000 a year of
  proceeds needs about 3,100 new subscribers a year, about 89,000 installs.
  The number that decides whether that is reachable is week-four return,
  by week of sign-up.
- **Costs stay small except AI.** At 10,000 monthly users the servers cost
  about £300 a month, more than half of it Gemini, whose price doubles on
  1 January 2027. Year one's known cash costs, before any pay for the
  founder, come to about £4,600 plus an accountant and US counsel.
- **Legal:** incorporate, register with the ICO, write the DPIA, raise the
  minimum age to 18 and add Apple's age signal before the US release
  (health figures already left analytics on 21 November, #3452), because Texas's law is in force and
  California's starts on 1 January 2027.

## 1. The market

### 1.1 Size and growth

Market-research firms disagree by a factor of three on the size of the
fitness app market, so this document sizes it from what people pay in app
stores instead.

| Measure                                                         | Figure                                         | Source                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global fitness apps, vendor estimate                            | $12.1bn (2025) to $33.6bn (2033), 13.4% a year | [Grand View via GII, 2 Jan 2026](https://www.giiresearch.com/report/grvi1941474-fitness-apps-market-size-share-trends-analysis.html)                                                                                                                    |
| Global fitness apps, vendor estimate                            | $12.1bn (2024) to $25.8bn (2030), 13.5% a year | [ResearchAndMarkets, 24 Dec 2025](https://www.businesswire.com/news/home/20251224075612/en/Fitness-Apps-Strategic-Business-Report-2025-2030-Subscription-Based-Apps-and-At-Home-Workouts-Drive-the-Global-Market-at-13.5-CAGR---ResearchAndMarkets.com) |
| Global fitness apps, vendor estimate                            | $3.5bn (2025) to $20.1bn (2034), 21.4% a year  | [IMARC, 30 Oct 2026](https://imarcgroup.com/fitness-app-market)                                                                                                                                                                                         |
| Health & Fitness in-app spend, 2025                             | $4.5bn, up 13%                                 | [Sensor Tower, Feb 2026](https://sensortower.com/blog/health-and-fitness-apps-ai)                                                                                                                                                                       |
| Health & Fitness downloads, 2025                                | 3.96bn, up 0.8%                                | Same                                                                                                                                                                                                                                                    |
| Share of 2024 spend                                             | US over half; UK second at 8%                  | [Sensor Tower, Feb 2025](https://sensortower.com/blog/state-of-mobile-health-and-fitness-in-2025)                                                                                                                                                       |
| UK weekly revenue at peak, Q4 2025                              | Strava about $608,000; Runna about $401,000    | [Sensor Tower, Jan 2026](https://sensortower.com/blog/2025-q4-unified-top-5-health-and-fitness-revenue-gb-600af518241bc16eb8dce802)                                                                                                                     |
| New subscription apps reaching $10,000 a month within two years | 4.6%                                           | [RevenueCat, State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)                                                                                                                                              |

Two readings. First, if the UK kept its 8% share in 2025, UK Health &
Fitness app-store spend was about $360 million (8% of $4.5bn; this
document's arithmetic). Second, Runna's UK peak of about $401,000 a week
would be about $21 million a year if held all year (×52), so its UK
revenue is somewhere under that: people in the UK already pay for running
plans. The last row is the honest one: most new subscription
apps never reach $10,000 a month.

### 1.2 The hybrid trend

| HYROX season | Racers (the secondary source counts tickets) | Source                                                                                                                                                                                       |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2022/23      | About 175,000                                | [Infront](https://www.infront.sport/blog/participation-sports/hyrox-from-a-disruptive-fitness-race-to-a-global-mass-participation-powerhouse)                                                |
| 2023/24      | About 205,000                                | [Rox Lyfe, 3 Jun 2025](https://roxlyfe.com/hyrox-reaches-1-million-tickets-sold/) (secondary)                                                                                                |
| 2024/25      | Over 600,000                                 | Same (secondary)                                                                                                                                                                             |
| 2025/26      | Over 1.4 million at 100+ events              | [Infront, 8 Sep 2026](https://www.infront.sport/news/participations-sports/consortium-led-by-l-catterton-in-partnership-with-hyrox-founders-acquires-infronts-majority-stake-in-hyrox-clone) |
| 2026/27      | Target over 2 million, 107 race weekends     | [endurance.biz, 20 Jul 2026](https://endurance.biz/2026/industry-news/targeting-2-million-athletes-hyrox-expands-global-calendar-for-2026-27-season/)                                        |

- **Gyms.** HYROX counted 5,000 affiliated training clubs in December 2024
  ([Morning Chalk Up](https://morningchalkup.com/2024/12/12/hyrox-hits-milestone-5000-training-clubs-worldwide/))
  and "more than 13,000 affiliated gyms, performance centers, and community
  events" by April 2026
  ([Morning Chalk Up](https://morningchalkup.com/2026/04/08/the-hyrox-effect-how-a-simple-formula-built-a-global-fitness-phenomenon/)).
  The UK had 1,700 affiliated gyms by December 2025
  ([endurance.biz](https://endurance.biz/2025/industry-news/hyrox-prepares-for-largest-ever-race-at-london-excel-and-unveils-london-week-of-fitness-featuring-hyrox-youngstars-in-2026/)).
- **Money.** An L Catterton consortium bought Infront's majority stake on
  8 September 2026. Bloomberg, as reported by Health Club Management, put
  HYROX's value at about €600m, its 2025 revenue at about €135m and its
  2026 forecast near €300m
  ([HCM, 8 Sep 2026](https://www.healthclubmanagement.co.uk/health-club-management-news/L-Catterton-led-consortium-buys-Hyrox-stake-as-founders-regain-control/363576)).
- **Strava's Year in Sport.** In 2024 running club participation rose 59%
  and weight training was the fastest-growing sport among women
  ([Strava, 4 Dec 2024](https://press.strava.com/articles/strava-releases-annual-year-in-sport-trend)).
  In 2025 Strava passed 180 million users, clubs reached 1 million,
  running clubs grew 3.5 times, 54% of users tracked more than one
  activity, and Gen Z were twice as likely as Gen X to call weight training
  their main sport
  ([endurance.biz](https://endurance.biz/2025/featured-news/stravas-12th-annual-year-in-sport-report-gen-z-doomscrolling-is-out-movement-is-in/);
  [Athletech](https://athletechnews.com/running-walking-strength-training-strava-year-in-sport-report/)).
- **Garmin.** Strength training activities rose 29% in 2025, the fourth
  year in a row above 20%; outdoor running rose 6%
  ([Garmin, 3 Dec 2025](https://www.garmin.com/en-US/blog/general/2025-garmin-connect-data-report/)).
- **ACSM's trend survey.** Wearables rank first for 2025, 2026 and 2027.
  Mobile exercise apps rank 2, 4 and 2; traditional strength training 5, 7
  and 5. "Hybrid" is not a named trend in any year
  ([2025](https://www.newswise.com/articles/acsm-announces-worldwide-fitness-trends-for-2025);
  [2026](https://acsm.org/top-fitness-trends-2026);
  [2027, 20 Oct 2026](https://athletechnews.com/wearables-once-again-claim-top-spot-in-acsm-top-fitness-trends-2027/)).
- **Strava itself.** A Sequoia-led round valued it at $2.2bn in May 2025
  ([Fortune, 13 Jan 2026](https://fortune.com/2026/01/13/how-strava-ran-toward-a-comeback-ipo/)).
  A confidential IPO filing was reported in January 2026; by 28 August
  2026 there was no public filing or listing date
  ([Forge](https://forgeglobal.com/insights/strava-upcoming-ipo-news/)).

### 1.3 What this means for Tropos

- **The UK is a lead market, not a test market.** It is the second-largest
  Health & Fitness spender, Runna's home, and has 1,700 HYROX gyms.
  Launch the UK and the US together.
- **The buyer already pays for plans.** The person Tropos is for lifts and
  runs ([grill Q1](../whole-app-2026-11/grill.md)), and the UK figures show
  that person paying Runna or Strava today.
- **The window is closing.** Every large competitor added the half it was
  missing in 2025 or 2026 (section 2.3). Tropos's advantage is that it was
  built as one plan from the start; that advantage shrinks each quarter.
- **The real market is smaller than HYROX's numbers suggest.** HYROX is a
  race business; many of its gym members follow the gym's own classes and
  need no app to plan their week, and Tropos has no HYROX stations (section
  2.2). The people Tropos is for plan their own lifting and running and
  will log food. No source counts them. The best proxy found is that 54% of
  Strava users track more than one activity; the beta survey (section 4.2)
  should ask how many testers write their own plan today. Treat the HYROX
  gyms as a channel to test, not as the market.
- **Distribution decides it, not features.** Ladder raised $90m of its
  $105m for marketing
  ([Leisure Opportunities](https://www.leisureopportunities.co.uk/news/Ladder-raises-US105-million-to-grow-its-strength-training-app/354576)).
  A solo founder cannot outspend that, so Tropos has to grow through the
  places hybrid athletes already gather (section 4).

## 2. Competitors

### 2.1 The field

Prices and ratings were read from the UK and US App Store listings and the
companies' own pages on 18 November 2026. The full notes, with a source for
every cell, are summarised here; each app's links are in section 2.2.

| App                | UK price                                      | US price                             | Trial                 | Free tier                                   | US rating (count) | Positioning                                  |
| ------------------ | --------------------------------------------- | ------------------------------------ | --------------------- | ------------------------------------------- | ----------------- | -------------------------------------------- |
| **Tropos (today)** | £3.99/mo, £34.99/yr                           | not set                              | 7 days                | Plan, tracking, barcode, 5K starter, social | not live          | One plan for lifting, running and food       |
| Runna              | £17.99/mo, £109.99/yr (from 10 Nov 2026)      | $19.99/mo, $119.99/yr                | 7 days                | Week 1 of a plan                            | 4.8 (36K)         | "5k to Marathon Training"                    |
| Strava             | £8.99/mo, £54.99/yr                           | $11.99/mo, $79.99/yr                 | 30 days               | Recording, feed, kudos                      | 4.8 (382K)        | "Track & share with friends"                 |
| Strava + Runna     | £124.99/yr                                    | $149.99/yr                           | 30 days for new users | none                                        | n/a               | Plans plus Strava                            |
| Nike Run Club      | Free                                          | Free                                 | none                  | Everything                                  | 4.8 (421K)        | "Let's run together"                         |
| Garmin Connect+    | £6.99/mo, £69.99/yr (secondary source)        | $6.99/mo, $69.99/yr                  | 30 days               | Connect itself, with a Garmin               | 4.4 (59K)         | "beat yesterday."                            |
| TrainingPeaks      | £18.99/mo, £129.99/yr                         | $19.95/mo, $134.99/yr                | 14 days               | Log and follow                              | 4.7 (13K)         | "The all-in-one app, for the all-in athlete" |
| Hevy               | £2.99/mo, £23.49/yr, £74.99 lifetime          | $2.99/mo, $23.99/yr, $74.99 lifetime | not stated            | 4 routines, 3 months' history               | 4.9 (104K)        | Free social gym logger                       |
| Strong             | £4.99/mo, £29.49/yr, £99.99 lifetime          | $4.99/mo, $29.99/yr, $99.99 lifetime | not stated            | 3 routines                                  | 4.9 (109K)        | "Think less. Lift more."                     |
| Fitbod             | £14.99/mo, £99.99/yr                          | $15.99/mo, $95.99/yr                 | 7 days                | None                                        | 4.8 (290K)        | "AI Personal Trainer & Workouts"             |
| Ladder             | **unconfirmed**                               | $29.99/mo, $179.99/yr                | 7 days                | None                                        | 5.0 (224K)        | Coach-led team plans                         |
| MyFitnessPal       | £15.99/mo, £64.99/yr (tier **unconfirmed**)   | $19.99/mo, $79.99/yr                 | 7 days (Premium+)     | Logging; barcode is paid                    | 4.7 (2.4M)        | "AI Coach & Nutrition Tracker"               |
| MacroFactor        | £10.99/mo, £62.99/yr; £89.99/yr with Workouts | $11.99/mo, $71.99/yr; $89.99 bundle  | 7 days (Workouts)     | None                                        | 4.8 (24K)         | Adaptive macro coach                         |
| Cronometer         | £9.99/mo, £59.99/yr                           | $10.99/mo, $59.99/yr                 | not stated            | Barcode, micronutrients, ads                | 4.8 (101K)        | "Science-backed nutrition tracking"          |
| Edge (hybrid)      | £22.99/mo, £129.99/yr                         | $29.99/mo, $129.99/yr                | 7 days                | None found                                  | 4.7 (51)          | "Run, Lift & Stay Consistent"                |
| HYBRD (hybrid)     | £14.99 to £19.99/mo                           | $14.99 to $19.99/mo                  | 7 days                | None found                                  | 4.8 (799)         | "AI coach for hybrid athletes"               |
| ROXFIT (HYROX)     | £13.99/mo, £69.99/yr                          | $15.99/mo, $79.99/yr                 | **unconfirmed**       | Free tier, paid Ultra                       | 4.8 (4.5K)        | "Compete better"                             |
| Repz (HYROX)       | £17.99/mo, £107.99/yr                         | $19.99/mo, $119.99/yr                | length not stated     | None found                                  | 4.6 (10)          | "built exclusively for HYROX athletes"       |

### 2.2 What each does that Tropos does not, and the reverse

Tropos today, from the code: an adapting lifting programme, GPS runs with
goal-driven plans, food logging with barcode free and the AI scan in Pro,
one week across both sports, a weekly review, readiness in words, and a
social layer of feed, Circles with meet-ups, Spaces, leagues, segments and
challenges ([CLAUDE.md](../../CLAUDE.md);
[grill](../whole-app-2026-11/grill.md)). It has no released Apple Watch
app (the Watch run and Health workout export exist behind a release flag,
[connectedTrainingRelease.ts](../../src/lib/connectedTrainingRelease.ts)),
no Android, no chat coach, and no ratings yet.

- **Runna** ([pricing](https://runna.com/pricing);
  [UK price change](https://support.runna.com/en/articles/18298149-changes-to-our-uk-subscription);
  [App Store](https://apps.apple.com/app/id1594204443)). It has: workouts
  on Apple Watch, Garmin, COROS and Fitbit; Android; coach-written plans
  with strength sessions for runners; a Strava bundle; a place among
  HYROX's 21 online training partners
  ([HYROX](https://hyrox.com/hyrox-online-training-partners)). Tropos has:
  a real lifting programme, food and adaptive expenditure, one week for
  both sports, its own social layer, a free 5K starter (Runna's beginner
  plans became paid on 5 June 2026,
  [the5krunner](https://the5krunner.com/2026/10/14/is-runna-free/)), and a
  yearly price about a third of Runna's.
- **Strava** ([UK App Store](https://apps.apple.com/gb/app/id426826309?l=en-gb);
  [subscribe](https://www.strava.com/subscribe);
  [features](https://support.strava.com/en-us/articles/15402044-what-features-are-included-in-a-strava-subscription)).
  It has: a network of 195 million users (May 2026), global segment leaderboards,
  routes and heatmaps, clubs, imports from almost every device, and since
  21 May 2026 a strength log with 14 partner integrations including Hevy
  and Fitbod
  ([Strava release via WHOOP](https://www.whoop.com/us/en/press-center/strava-overhauls-strength-experience-with-expanded-partner-ecosystem-new-workout-log-and-muscle-maps/)).
  Tropos has: a plan for both sports, food, readiness, leagues against your
  own plan, Circles with meet-ups. Tropos shows segment boards to followers
  only, by choice.
- **Nike Run Club** ([App Store](https://apps.apple.com/app/id387771637)).
  It has: everything free, audio-guided runs, a Watch app, Nike's brand.
  Tropos has: lifting (Nike keeps it in a separate app), food, a combined
  week, Circles and leagues. Free NRC is the bar Tropos's free running is
  judged against.
- **Garmin Connect and Connect+**
  ([Garmin, 27 Mar 2025](https://www.garmin.com/en-US/newsroom/press-release/wearables-health/elevate-your-health-and-fitness-goals-with-garmin-connect/);
  [App Store](https://apps.apple.com/us/app/garmin-connect/id583446403?ls=1)).
  It has: its own sensors for HRV, sleep and readiness, workouts sent to
  the watch, LiveTrack, food logging since January 2026
  ([DC Rainmaker](https://www.dcrainmaker.com/2026/01/garmin-connect-nutrition-logging-connect.html)),
  and since 22 July 2026 TrainingPeaks and TrainHeroic
  ([Peaksware](https://peaksware.com/garmin-acquires-trainingpeaks-and-trainheroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/)).
  Tropos has: no device needed, an adapting lifting programme, the AI meal
  scan, one planned week, leagues and Circles.
- **TrainingPeaks** ([pricing](https://trainingpeaks.com/pricing/for-athletes/);
  [Basic vs Premium](https://www.trainingpeaks.com/blog/what-you-get-with-trainingpeaks-premium/)).
  It has: a coach platform and plan marketplace, fitness and fatigue
  charts, triathlon depth. Tropos has: it writes and adapts the plan
  itself, where TrainingPeaks sells plans separately; food; social; a
  much lower price.
- **Hevy** ([pricing, 14 Oct 2026](https://www.hevyapp.com/hevy-pricing-comparison/);
  [Pro features](https://help.hevyapp.com/hc/en-us/articles/35119778922263-Hevy-Pro-Subscription-How-to-get-Pro-and-What-Does-It-Include)).
  It has: Watch and Wear OS apps, Android, a lifetime price, Strava sync,
  a coach platform, "18+ million" users ([Hevy](https://www.hevyapp.com/)).
  Tropos has: GPS runs and plans, food and adaptive expenditure, one week,
  readiness, leagues, Circles.
- **Strong** ([US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)).
  It has: a standalone Watch app, Android, a lifetime price, a long record
  as the simple logger. Tropos has: a generated, adapting programme,
  runs, food, a feed.
- **Fitbod** ([FAQ](https://fitbod.me/faqs/)). It has: AI-built strength
  sessions, Watch, Android, a UK gym-chain tie-in
  ([Bannatyne](https://help.fitbod.me/hc/en-us/articles/31891505074711-Welcome-to-Fitbod-A-Guide-for-Bannatyne-Members)).
  Its FAQ says "Fitbod is not a cardio app". Tropos has: runs, food,
  social, a free tier, about a third of the yearly price (40% at the
  recommended £39.99).
- **Ladder** ([pricing](https://joinladder.com/pricing);
  [Business Wire, 27 Oct 2025](https://www.businesswire.com/news/home/20251027087979/en)).
  It has: named coaches writing each week, video coaching, team chat, a
  Watch app, food logging since October 2025, two HYROX-style hybrid teams
  ([team page](https://www.joinladder.com/team/project-alpha)), and "more
  than 300,000 paid members". Tropos has: GPS runs and run plans, adaptive
  expenditure, open communities, a free tier, a fraction of the price.
- **MyFitnessPal** ([Premium+](https://www.myfitnesspal.com/premium-plus);
  [US App Store](https://apps.apple.com/us/app/myfitnesspal-calorie-counter/id341232718)).
  It has: the largest food database, Android and web, 35+ device links, an
  AI coach, and Cal AI, bought in March 2026
  ([TechCrunch](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)).
  Tropos has: free barcode scanning (MyFitnessPal charges for it), a
  lifting programme, runs and run plans, an expenditure estimate from
  weight and intake trends.
- **MacroFactor** ([subscriptions](https://help.macrofactorapp.com/en/articles/393-how-macrofactor-subscriptions-and-bundles-work);
  [Workouts](https://macrofactor.com/workouts/)). It has: the best-known
  adaptive expenditure method, a separate lifting app since January 2026
  with "basic cardio support", Android. Tropos has: one app and one
  subscription, a free tier, GPS runs and plans, social, at a little over
  half the UK yearly price of one MacroFactor app.
- **Cronometer** ([Gold](https://cronometer.com/gold/)). It has:
  micronutrient depth, imports from Garmin, Oura and Whoop, web and
  Android. Tropos has: lifting and running, training-aware macros, social.
- **Edge** ([UK App Store](https://apps.apple.com/gb/app/id6502700326);
  [help](https://intercom.help/findyouredge/en/articles/9728280-overview-of-edge)).
  The closest UK match: one plan across strength, conditioning and
  endurance, with a coaching team in chat. Tropos has: food and adaptive
  expenditure, segments, the feed, Circles and leagues, at about a quarter
  of the yearly price.
- **HYBRD** ([US App Store](https://apps.apple.com/us/app/hybrd-get-faster-stronger/id6670271875))
  has an AI chat coach and sync with Garmin, Watch, WHOOP and Strava.
  **ROXFIT** ([US App Store](https://apps.apple.com/us/app/roxfit/id6476465403))
  owns HYROX race results and analytics and raised £1.9m in March 2026
  with 260,000+ users
  ([TFN](https://techfundingnews.com/roxfit-1-9m-seed-ai-hyrox-training/)).
  **Repz** ([US App Store](https://apps.apple.com/us/app/repz-hyrox-training-plan/id6759493559))
  is an official HYROX partner with plans built on station weaknesses.
  Tropos has no HYROX stations; all three lack food and a full running
  plan.

### 2.3 What changed in 2025 and 2026

| Date        | Move                                         | Source                                                                                                                                                       |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 17 Apr 2025 | Strava agrees to buy Runna                   | [Strava](https://www.newswire.ca/news-releases/strava-to-acquire-runna-a-leading-running-training-app-804778829.html)                                        |
| 27 Oct 2025 | Ladder adds food logging                     | [Business Wire](https://www.businesswire.com/news/home/20251027087979/en)                                                                                    |
| 5 Jan 2026  | Garmin adds food logging to Connect+         | [DC Rainmaker](https://www.dcrainmaker.com/2026/01/garmin-connect-nutrition-logging-connect.html)                                                            |
| Jan 2026    | MacroFactor launches Workouts                | [MacroFactor, 29 Dec 2025](https://macrofactor.com/mm-dec-2025/)                                                                                             |
| 2 Mar 2026  | MyFitnessPal buys Cal AI                     | [TechCrunch](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)                                        |
| 21 May 2026 | Strava adds a strength log and 14 partners   | [9to5Mac](https://9to5mac.com/2026/05/21/strava-adds-dedicated-strength-training-support-for-sets-reps-weight-and-muscle-groups/)                            |
| 22 Jul 2026 | Garmin buys TrainingPeaks and TrainHeroic    | [Peaksware](https://peaksware.com/garmin-acquires-trainingpeaks-and-trainheroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/) |
| 10 Nov 2026 | Runna raises UK prices to £17.99 and £109.99 | [Runna](https://support.runna.com/en/articles/18298149-changes-to-our-uk-subscription)                                                                       |

### 2.4 Where Tropos stands

- **The position to own:** one plan that adapts across lifting, running
  and food, so the person never does the sums
  ([grill Q2](../whole-app-2026-11/grill.md)), for the price of one app.
  The stack it replaces costs £196.47 a year in the UK today: Runna
  £109.99, MacroFactor £62.99 and Hevy Pro £23.49 (prices in 2.1). The
  earlier repo analysis reached the same position
  ([competitive analysis](../competitive-analysis-running-2026.md);
  [GLOSSARY](../../GLOSSARY.md)).
- **The gaps that lose users:** no Watch app (Runna, Hevy, Strong, Fitbod,
  Ladder and NRC have one), no Android (every app above has it), no route
  into Strava, where the runners' friends are, and no ratings. The first
  three are product work; the fourth is the launch plan's job.
- **What not to chase:** Strava's network, MyFitnessPal's food database,
  Garmin's sensors. Tropos wins on the plan joining the three, not on any
  one of them.
- **What if Strava or Garmin ships one week across both sports?** They
  could, in 2027. Tropos has no moat against that; it has a head start, a
  price and a size. The head start is a plan that already joins lifting,
  running and food, which Strava, with no food, and Garmin, with no plan
  joining its two purchases, would each have to build. The price is a
  little over a third of Runna's. The size is small groups: Circles and meet-ups for a
  gym or a club, where Strava's strength is a network of millions. Use
  the head start to win the self-programming hybrid person before then,
  and connect to Strava rather than compete with it (decision 10).

## 3. Pricing and packaging for Pro

### 3.1 What Pro is today

- **Price:** £3.99 a month or £34.99 a year, with the yearly plan selected
  by default and labelled "Save 27%"
  ([proPlans.ts](../../src/lib/proPlans.ts)). On the phone the paywall
  shows only the App Store's own prices, and no price or Continue until
  RevenueCat returns them (#3406,
  [useProPlanPrices.ts](../../src/hooks/useProPlanPrices.ts)). The pound
  prices above are what the web build shows and what the App Store
  products should be set to.
- **Trial:** 7 days, one per account; an account that ever held the old
  onboarding free week is offered the price, not a trial
  ([subscription.ts](../../src/lib/subscription.ts)).
- **What Pro holds:** the app using your body's data to adjust things for
  you: the adapting calorie target, macros that follow the day, readiness
  from sleep and heart data, and the AI meal scan (Q45); history and charts
  older than three months, the training load chart and the score's details
  (Q84); half and full marathon plans after their first week (Q85). The
  plan, tracking, barcode scanning, unlimited routines, the 5K starter and
  anything that protects a person stay free (Q46, Q86)
  ([grill](../whole-app-2026-11/grill.md);
  [App1 row](../../.claude/plans/programme-run-followups.md)).
- **The AI scan** allows 100 photo scans and 100 typed meals a day on Pro
  and none on free ([aiScanQuota.js](../../functions/lib/aiScanQuota.js)).
- **Apple's cut** is 15%: Tropos was accepted into the Small Business
  Program on 18 August 2026
  ([pre-launch backlog](../qa/pre-launch-backlog.md)).
- **Open owner calls:** price and trial length are Round 7 questions still
  waiting, and the web engine is open again because the owner finds both
  Stripe's and Paddle's fees too high
  ([grill](../whole-app-2026-11/grill.md)).

### 3.2 Where the price sits

UK yearly prices, low to high: Hevy £23.49, Strong £29.49, **Tropos
£34.99**, Strava £54.99, Cronometer £59.99, MacroFactor £62.99, MyFitnessPal
£64.99, ROXFIT £69.99, Fitbod £99.99, Runna £109.99, Edge and TrainingPeaks
£129.99 (section 2.1). The median Health & Fitness app charges $9.99 a
month and $39.94 a year
([RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)).

Tropos's yearly price is near that median. Its monthly price is not:
£3.99 is about $5.19 at this document's rate, about half the median, and
it is the price that breaks the ladder.

| App                    | Yearly price ÷ monthly price |
| ---------------------- | ---------------------------- |
| MacroFactor (UK)       | 5.7 months                   |
| Runna (UK)             | 6.1 months                   |
| Strava (UK)            | 6.1 months                   |
| Fitbod (UK)            | 6.7 months                   |
| Hevy (UK)              | 7.9 months                   |
| **Tropos (UK, today)** | **8.8 months**               |

A runner who wants a 16-week race plan buys four months of Tropos for
£15.96 instead of a year for £34.99, and leaves after the race. That
matters because yearly subscribers stay: across all categories 28% of
yearly subscribers are still paying after a year against 8% of monthly
ones ([TechCrunch on RevenueCat 2026](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)),
and Health & Fitness is the one category where yearly plans bring in most
of the revenue, 60.6% in 2025
([Adapty 2026](https://adapty.io/state-of-in-app-subscriptions-2026)).

### 3.3 Recommendation

|                             | Today                                 | UK                                                                             | US         |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| Monthly                     | £3.99                                 | **£6.99**                                                                      | **$7.99**  |
| Yearly                      | £34.99                                | **£39.99**                                                                     | **$49.99** |
| Yearly as months of monthly | 8.8                                   | 5.7                                                                            | 6.3        |
| Saving shown on yearly      | 27%                                   | 52%                                                                            | 48%        |
| Trial                       | 7 days, first offered at about day 14 | 7 days, offered at the end of setup (skippable) and again when the value shows | Same       |

Why these numbers:

1. **The monthly price should protect the yearly one.** At £6.99 the race
   block costs £27.96 on monthly, so the yearly plan is the obvious buy.
2. **The yearly price sits a little above the median and below every app
   that writes the plan for you.** £39.99 is about $52 at this document's
   rate, against the $39.94 median, and 36% of Runna's new UK yearly
   price; it is below Strava, MacroFactor, MyFitnessPal and Fitbod.
3. **Pro now holds what others sell on their own:** race plans (Runna's
   product), adaptive expenditure (MacroFactor's) and the AI meal scan
   (MyFitnessPal Premium's).
4. **The US price is higher because US prices exclude tax.** A UK price
   includes 20% VAT; a US price has sales tax added on top. $49.99 earns
   $42.49 after Apple, against £28.33 (about $36.83) from £39.99. It is
   still 42% of Runna's US yearly price and below Strava ($79.99) and
   MacroFactor ($71.99).
5. **Now is the cheapest moment to set it.** No subscriber holds a price
   yet, and the grill's rule that the free line never moves down (Q47)
   makes a later rise harder to explain than a launch price.

Apple sets the other storefronts' prices from the base country's price
([Apple, Set a price](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price/)).
Whether £39.99 and $49.99 sit on the same price point in Apple's grid is
**unconfirmed**: set both by hand in App Store Connect.

**Trial: keep 7 days, and offer it twice.** Across all categories, trials
of 5 to 9 days convert at a median 37.4%, against 25.5% for trials of 4
days or less and 42.5% for 17 to 32 days
([RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)).
The longer trial converts better but delays every payment by three weeks,
so length is not the lever. Timing is.

Today the first offer comes when the adapting target is ready, which needs
14 days of weigh-ins (Q49, Q87), or at the end of a race plan's first week
(Q85); setup goes straight to Home with no offer, and whether one comes
back is an open owner call, Q72 ([CLAUDE.md](../../CLAUDE.md)). That is a
good second moment and a poor only one. Adapty reports 86.1% of Health &
Fitness trials on day 0, which most likely means they start on the day of
install ([Adapty, 27 Mar 2026](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)),
and every published download-to-trial benchmark is made mostly by apps
that ask at setup. A person who has not come back by day 14 is never
asked at all.

So answer Q72 yes: a skippable offer at the end of setup, naming what Pro
does from day one (the meal scan, race plans, readiness from sleep and
heart data), with the free plan one tap away. Keep the day-14 offer for
everyone who skipped it. The rule of one trial per account stays
([subscription.ts](../../src/lib/subscription.ts)): someone who took the
trial at setup and let it lapse is shown the price at day 14, not a second
trial. Measure trial-to-paid by where the trial started.

**Yearly first, monthly second, nothing else at launch.** No weekly plan,
no family plan and no lifetime price. Of 16 apps surveyed on 13 November,
2 sell a lifetime, both simple loggers
([grill](../whole-app-2026-11/grill.md)), and a lifetime price turns an AI
cost that recurs each month (section 6) into a payment made once.

**Launch offers:** use Apple offer codes, not a lower list price. Codes
give free or discounted periods, can be custom words up to 64 characters
or one-time codes in batches of 500 to 25,000, and allow up to 1 million
redemptions a quarter
([Apple, offer codes](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-offer-codes)).
Make the code a 30-day free trial **on the yearly plan**, not a free month
on the monthly one, so codes steer people towards the plan they keep.
Section 4 uses them for gyms, clubs, creators and invites.

### 3.4 The arithmetic

UK proceeds per payment = price ÷ 1.2 (VAT) × 0.85 (Apple's 15%). US
proceeds = price × 0.85, because Apple adds and remits US sales tax on top
of the price
([Apple, subscriptions](https://developer.apple.com/app-store/subscriptions/);
[Apple, Small Business Program](https://developer.apple.com/app-store/small-business-program/);
[Apple, Schedule 2 exhibits](https://developer.apple.com/support/downloads/terms/exhibits/Exhibits-to-Schedule-2-and-3-English-UK.pdf)).

| Plan                                                     | Price  | Proceeds per payment |
| -------------------------------------------------------- | ------ | -------------------- |
| UK monthly, today                                        | £3.99  | £2.83                |
| UK yearly, today                                         | £34.99 | £24.78               |
| UK monthly, recommended                                  | £6.99  | £4.95                |
| UK yearly, recommended                                   | £39.99 | £28.33               |
| US monthly at today's pound price in dollars (never set) | $3.99  | $3.39                |
| US yearly at today's pound price in dollars (never set)  | $34.99 | $29.74               |
| US monthly, recommended                                  | $7.99  | $6.79                |
| US yearly, recommended                                   | $49.99 | $42.49               |

**Year-one value of one subscriber.** Two published points fix a monthly
subscriber's year: 57% of Health & Fitness monthly subscribers pay a second
time ([RevenueCat renewal rates, 24 Apr 2026](https://www.revenuecat.com/blog/average-subscription-renewal-rates-by-app-category/)),
and 8% are still paying at month 12 (all categories, RevenueCat 2026 via
TechCrunch above). A steady monthly loss between them (82% kept each month
after the second payment) gives **3.8 payments in year one**. About two in
three Health & Fitness subscriptions sold are yearly
([RevenueCat 2025](https://revenuecat.com/state-of-subscription-apps-2025)).

|                                      | Monthly subscriber, year one | Yearly subscriber | Blend (2/3 yearly) |
| ------------------------------------ | ---------------------------- | ----------------- | ------------------ |
| UK today                             | 3.8 × £2.83 = £10.82         | £24.78            | **£20.13**         |
| UK recommended                       | 3.8 × £4.95 = £18.96         | £28.33            | **£25.20** (+25%)  |
| US at today's pound price in dollars | 3.8 × $3.39 = $12.98         | $29.74            | **$24.16**         |
| US recommended                       | 3.8 × $6.79 = $26.00         | $42.49            | **$36.99**         |

The new UK prices earn more unless they cut the number of paying
subscribers by more than 20% (1 − 20.13 ÷ 25.20). Tropos has never had a
US price, so the US rows show only what $49.99 is worth, not a gain. No
published study gives Tropos's price sensitivity, so treat 20% as the
threshold to watch, not a forecast. The blend holds the mix at two thirds
yearly; the new prices should push more people to yearly, which would
raise it, so the table is the cautious case.

**Over a subscriber's whole life,** not just year one: a yearly subscriber
who renews at the Health & Fitness median of 25% each year is worth £28.33
÷ (1 − 0.25) = **£37.77**; a monthly one, at the curve above carried on,
makes 4.2 payments, **£20.78**. On the two-thirds mix a new subscriber is
worth about **£32** in proceeds at the recommended UK prices. Section 5.3
uses that number.

### 3.5 The website checkout: worth it after fees?

**Where things stand.** The owner chose RevenueCat Billing with Tropos's
own Stripe account (Q77), and the build exists; the engine is open again
because both Stripe's and Paddle's fees look too high
([grill](../whole-app-2026-11/grill.md);
[RevenueCat setup, Part W](../iap/revenuecat-setup.md)). Since 21
November troposfit.com shows the App Store page and no app (App1 Q52,
#3375), so there is no signed-in page to start the checkout from: the
website sells nothing until the owner chooses how a web buyer reaches the
Purchase Link (the Part W rows of the
[pre-launch backlog](../qa/pre-launch-backlog.md)).

**The rules, by country.**

- **US.** Since 30 April 2025 a US app may link to a web checkout, and
  Apple's guidelines say so for the US storefront (3.1.1(a) and 3.1.3)
  ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
  On 11 December 2025 the Ninth Circuit upheld the contempt finding but
  allowed Apple to seek some commission, sending the rate back to the
  district court
  ([opinion](https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html);
  [IPWatchdog, 30 Jun 2026](https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/)).
  Apple proposed 15%, or 5% for Small Business Program apps, in August
  2026 ([9to5Mac, 13 Aug 2026](https://9to5mac.com/2026/08/13/apple-proposes-commissions-of-up-to-15-for-off-app-store-purchases-in-the-us/)).
  None was in effect as of the sources read; whether a rate was set in
  October or November 2026 is **unconfirmed**.
- **UK.** The UK storefront still bars in-app links to buying on the web.
  The CMA consulted on a steering requirement until 28 July 2026 with no
  outcome yet
  ([CMA case page](https://www.gov.uk/cma-cases/apples-mobile-platform);
  [consultation](https://www.gov.uk/government/consultations/proposed-steering-conduct-requirement-for-apples-mobile-platform)).
  UK web buyers can only be people who reach troposfit.com some other way.
- **EU.** From 1 October 2026 a link-out sale pays Apple a store services
  commission of 15%, or 10% for small businesses, on sales within seven
  days of the tap
  ([Apple, 18 Aug 2026](https://www.apple.com/newsroom/2026/08/apple-announces-changes-for-apps-in-the-european-union/)).

**The fees.** RevenueCat adds nothing for web sales
([RevenueCat web docs](https://www.revenuecat.com/docs/web/overview)).
Stripe on a UK account charges 1.5% + 20p for standard UK cards, 3.15% +
20p for international cards and 2% more for currency conversion; Stripe Tax
adds 0.5% or 40p where Tropos is registered
([Stripe UK pricing](https://stripe.com/gb/pricing)). Paddle charges 5% +
50¢ as merchant of record and quotes its own price under $10
([Paddle pricing](https://www.paddle.com/pricing)).

**Net per sale at the recommended prices** (this document's arithmetic;
the US Stripe row assumes an international card converted to pounds):

| Sale                                          | App Store (15%) | Web, Stripe       | Web, Paddle                 |
| --------------------------------------------- | --------------- | ----------------- | --------------------------- |
| UK yearly £39.99, Tropos not VAT-registered   | £28.33          | **£39.19** (+38%) | £30.94 (Paddle charges VAT) |
| UK yearly £39.99, Tropos VAT-registered       | £28.33          | £32.53 (+15%)     | £30.94                      |
| UK monthly £6.99, not registered              | £4.95           | £6.69 (+35%)      | quoted by Paddle            |
| US yearly $49.99, no link-out fee             | $42.49          | **$47.16** (+11%) | $46.99                      |
| US yearly $49.99, if a 5% link-out fee is set | $42.49          | $44.66 (+5%)      | $44.49                      |
| US monthly $7.99                              | $6.79           | $7.32 (+8%)       | quoted by Paddle            |

The UK rows turn on VAT. A UK company need not register until taxable
turnover passes £90,000 in 12 months
([GOV.UK](https://www.gov.uk/vat-registration/when-to-register)). Whether
App Store proceeds count towards that turnover is **unconfirmed**: ask an
accountant before relying on the top row. The registered rows leave out
Stripe Tax, which at 0.5% would take about 20p more from a £39.99 sale.
RevenueCat's 1% applies to App Store and web sales alike once monthly
revenue passes $2,500, so it changes no comparison.

**The verdict.** Stripe's fee is not the problem. On a £39.99 UK sale it is
80p (2%); Apple's is £5.00. What the web costs is everything Tropos must
then do as the seller: EU VAT from the first EU sale through the non-Union
One Stop Shop ([EC](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en)),
US sales tax once a state's threshold is passed
([Sales Tax at Scale, 16 Oct 2026](https://salestaxatscale.com/nexus/transaction-count-threshold-removal/)),
and the consumer rules in section 7.6, which the App Store otherwise
carries. So:

1. **Launch on the App Store alone.** The web checkout earns nothing until
   there are buyers, and every launch hour is worth more elsewhere.
2. **After the UK release, switch the web on for UK buyers of the yearly
   plan,** on Stripe, once the accountant confirms Tropos is under the VAT
   threshold, and for US buyers once the US is live. The yearly gain is
   £10.86 per UK sale and $4.66 per US sale; the monthly gain is too small
   to carry the duties.
3. **Add the US in-app link once 50 US subscriptions a month come through
   the App Store,** so there is a baseline to compare against, and watch
   the district court.
4. **No EU web sales** until the EU is worth registering for, or Paddle
   takes the tax. Whether RevenueCat Billing can refuse EU billing
   addresses is **unconfirmed**; if it cannot, the first EU sale brings the
   One Stop Shop duty with it.

At 100 web yearly sales a year the UK gain is about £1,086; it becomes
worth real effort when there are thousands.

## 4. Launch plan

### 4.1 Where launch starts from

The first release gate, on 31 October, was a no-go: no TestFlight build had
been installed, the phone checks were open, and the App Store record was
unfinished ([release gate](../launch/release-gate-2026-10-31.md)). Since
then a TestFlight build has made a sandbox purchase end to end, on
8 November ([RevenueCat setup](../iap/revenuecat-setup.md)). The rest of the
phone checks live in the [TestFlight script](../qa/testflight-script.md).
The plan below assumes they pass in the first week of December. If they do
not, every date after 7 December moves with them.

**Target: release in the UK by Tuesday 15 December 2026, quietly; push in
the UK from Tuesday 5 January; release in the US about Tuesday 16
February, if two conditions hold** (decision 4). Why this order:

- **A first submission may well be rejected,** and this one carries
  subscriptions, health data, other people's posts, an AI consent flow and
  new age declarations. Submitting on 7 December leaves room for two
  rounds before Christmas; an approved build waits for a manual release.
- **Ratings and a tested first week before the push.** A quiet December
  release in one country gives real ratings, real purchases and a first
  week of support before creators and communities send people in January.
  Whether New Year brings more people to fitness apps was **not checked**
  in this run; the plan does not depend on it.
- **The US has no channel yet and more law.** Every channel in section 4.5
  is British, and the US adds Texas's and California's age laws,
  Washington's health-data law and the FTC rule (section 7). Release there
  once the compliance list is done and the first UK sign-ups are still
  training in week four.

Owners: **Myles** (the owner), **Claude** (an agent session working in this
repository), **accountant** and **solicitor** (people to hire, section 7.7).
One person cannot do the outreach, the admin and the phone checks at once,
so the calendar keeps December to the phone checks, the admin and a small
beta, and leaves press, product pages and the second wave of outreach until
the app is out.

### 4.2 The calendar

**Phase 0, now to Sunday 6 December: decide, set up, test on phones.**

| Action                                                                                                                                                                                                                                                                                                                       | Owner         | By              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------- |
| Make the ten decisions in section 8                                                                                                                                                                                                                                                                                          | Myles         | Wed 25 Nov      |
| Set a Google Cloud budget alert, an open item in the [backlog](../qa/pre-launch-backlog.md)                                                                                                                                                                                                                                  | Myles         | Wed 25 Nov      |
| Verify identity with Companies House, incorporate, request a D-U-N-S number, pay the ICO fee (section 7.1)                                                                                                                                                                                                                   | Myles         | Fri 27 Nov      |
| Set the new prices in App Store Connect and RevenueCat, and in [proPlans.ts](../../src/lib/proPlans.ts)                                                                                                                                                                                                                      | Myles, Claude | Mon 30 Nov      |
| Lower the AI scan cap (section 6.4)                                                                                                                                                                                                                                                                                          | Claude        | Mon 30 Nov      |
| Decide how testers get Pro: the server grants Pro from a sandbox purchase only to accounts on `REVENUECAT_SANDBOX_UIDS` ([RevenueCat setup](../iap/revenuecat-setup.md)), so other testers meet a paywall they cannot pass. A RevenueCat promotional grant may be simpler; whether the server honours one is **unconfirmed** | Myles, Claude | Mon 30 Nov      |
| Correct the listing's age answer, which still says setup asks an age range ([listing](../app-store/listing.md))                                                                                                                                                                                                              | Claude        | Mon 30 Nov      |
| A skippable trial offer at the end of setup (decision 2)                                                                                                                                                                                                                                                                     | Claude        | Fri 4 Dec       |
| Minimum age 18 in setup, the Terms and the listing's rating (decision 6)                                                                                                                                                                                                                                                     | Claude, Myles | Fri 4 Dec       |
| An App Store rating prompt after a third finished session or a first best, never after a paywall or an error. The code has none today, and Apple's prompt does not show in TestFlight (**unconfirmed**), so check it on a development build                                                                                  | Claude        | Fri 4 Dec       |
| Closed beta: 5 HYROX gyms visited in person, 3 run clubs, friends; about 100 testers (section 4.3)                                                                                                                                                                                                                           | Myles         | from Mon 30 Nov |
| Run the [TestFlight script](../qa/testflight-script.md)'s phone checks on the build to be submitted                                                                                                                                                                                                                          | Myles         | Fri 4 Dec       |
| Final screenshots from the capture rig ([capture rig](../agents/capture-rig.md)) and listing text                                                                                                                                                                                                                            | Claude, Myles | Fri 4 Dec       |
| App Review notes: the demo account, why Health data is read, where the subscription terms are                                                                                                                                                                                                                                | Myles         | Fri 4 Dec       |

**Phase 1, Monday 7 December to release: submit and widen the beta.**

| Action                                                                                                                                                 | Owner                     | By                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------- |
| Submit the build for review in the UK storefront, set to release by hand                                                                               | Myles                     | Mon 7 Dec                        |
| Public TestFlight link; one post on r/HybridAthlete with the moderators' permission                                                                    | Myles                     | Tue 8 Dec                        |
| Draft the DPIA and the Online Safety Act illegal content risk assessment and children's access assessment, with Ofcom's free tools (sections 7.2, 7.3) | Claude drafts, Myles owns | Fri 11 Dec                       |
| Solicitor's review of the privacy notice, consent wording, subscription terms and the age decision (section 7.7)                                       | Solicitor                 | Fri 11 Dec                       |
| Nominate the January push for featuring                                                                                                                | Myles                     | Mon 14 Dec                       |
| **Release in the UK**                                                                                                                                  | Myles                     | **Tue 15 Dec**, latest Tue 5 Jan |
| Brief 10 UK creators; issue each a code and a custom product page link (sections 4.4, 4.5)                                                             | Myles                     | Fri 18 Dec                       |

**The first week after release.** What a first week needs, and who does
it:

- **Watch for failures daily:** crashes, failed purchases and restores,
  failed sign-ups, and the trial starts against the day before. Set an
  alert on each before release, not after the first complaint.
- **Support:** a short set of written replies for the questions that will
  come (cancelling, restoring a purchase, Health permissions, deleting an
  account), and a reply within a day to every email and every App Store
  review.
- **Moderation:** Myles watches the report queue
  ([AdminModeration](../../src/pages/AdminModeration.tsx)) daily, since
  the app has user posts from day one.
- **A fix in hand:** keep the next build ready to submit, and ask for an
  expedited review only for a fault that stops people training or paying.

**Days 1 to 30 (15 December to 13 January): make the first week work, then
push.**

| Action                                                                                                                              | Owner         | By             |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------- |
| Monday numbers review, by week of sign-up (section 5)                                                                               | Myles         | every Monday   |
| Release the Watch run app, or bring in runs recorded elsewhere through Apple Health, before the January run-club push (decision 10) | Claude, Myles | Mon 4 Jan      |
| UK push: creators go live over a fortnight, 15 more gyms, 5 more clubs, r/hyrox with permission                                     | Myles         | from Tue 5 Jan |
| Fix the largest drop between setup and the first session                                                                            | Claude, Myles | Fri 8 Jan      |
| Turn on the invite reward (section 4.6)                                                                                             | Claude        | Fri 8 Jan      |

**Days 31 to 60 (14 January to 12 February): read week four, decide the US.**

| Action                                                                                                                                         | Owner             | By         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| Start a product page optimisation test of the first three screenshots                                                                          | Myles             | Mon 18 Jan |
| Read week-four return for the December sign-ups                                                                                                | Myles             | Mon 25 Jan |
| The US gate (decision 4): is the compliance list done, and are 20% of December's finished setups back in week four? Set the US date or move it | Myles             | Fri 29 Jan |
| Second creator wave, keeping only the codes that converted                                                                                     | Myles             | Fri 5 Feb  |
| Move the Apple account to the company (decision 7)                                                                                             | Myles             | Fri 12 Feb |
| Open the web checkout for UK yearly buyers if the accountant has answered the VAT question (section 3.5)                                       | Myles, accountant | Fri 12 Feb |

**Days 61 to 90 (13 February to 14 March): the US, and what works.**

| Action                                                                                               | Owner            | By             |
| ---------------------------------------------------------------------------------------------------- | ---------------- | -------------- |
| **Release in the US** if the gate passed; pitch US press (section 4.7)                               | Myles            | **Tue 16 Feb** |
| Offer gym and club partners a members' code, based on the beta gyms that worked                      | Myles            | Fri 26 Feb     |
| A spring race push in Spaces and Circles: half and full marathon plans, which are Pro after week one | Myles, Claude    | Fri 5 Mar      |
| Online Safety Act assessments final, 3 months after the UK release (section 7.3)                     | Myles, solicitor | Mon 15 Mar     |
| Day-90 review against section 5; read trial-to-paid once 200 trials have ended (section 5.3)         | Myles            | Mon 15 Mar     |

### 4.3 TestFlight beta

Apple's limits: up to 100 internal testers and 10,000 external ones; each
build can be tested for 90 days; the first build sent to an external group
goes to App Review; a public link can carry sign-up criteria
([Apple, TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)).

**Goal:** about 100 testers in the closed beta by 6 December and 200 by
the UK release, 60 of them logging a session in their second week. Fewer
engaged testers beat more idle ones: the beta exists to find what stops a
new account reaching its first session, and to leave release day with
people who will rate the app. Ask each tester at day 7 and day 21 what they
used, whether they write their own training plan today, what they would
pay, and where they heard of Tropos.

**Where testers come from, in order of fit:**

1. HYROX gyms. The UK had 1,700 affiliated gyms by December 2025 (section
   1.2). Visit five in person first. Ask each for a gym Circle and a notice
   on the board, and offer members free Pro for the beta. Many members
   follow the gym's classes and need no plan, so ask for the ones who also
   run and lift on their own.
2. Run clubs. Strava's running clubs grew 3.5 times in 2025 (section 1.2),
   and Tropos's Circles already do what a club needs: meet-ups with pace
   groups, weekly repeats and a reminder the day before
   ([CLAUDE.md, data model](../../CLAUDE.md)).
3. r/HybridAthlete (about 50,600 members,
   [reddapi.dev](https://reddapi.dev/subreddits/hybridathlete/insights)) and
   r/hyrox (about 53,000, [Rankhog, 21 Oct 2026](https://rankhog.com/subreddits/hyrox)),
   with the moderators' permission first. r/running bans self-promotion
   ([rules via mirror, 2018](https://axebps-redlib.hf.space/r/running/comments/8t387c/subreddit_rules_posting_procedures_other))
   and r/Fitness requires talking to the moderators first
   ([rule 2 via mirror](https://cal1.lr.ggtyler.dev/r/Fitness/wiki/rules/rule2));
   both sources are weak, so read each subreddit's rules on the day.
4. A Tropos club on Strava. Clubs are free to create, and only admins
   create events ([Strava support, 16 Sep 2026](https://support.strava.com/hc/en-us/articles/221622188-Clubs-on-the-Mobile-App)).

**Seed in clusters, not one by one.** Since 21 November leagues,
challenges and Spaces show from the first day and say "Filling up" until
they have a few people in them (App1 Q6, #3447,
[fillingUp.ts](../../src/lib/fillingUp.ts)). The league is the exception:
the server forms no group under 10 people, so until then its card counts
who has joined. A gym or a club that joins together fills a Circle, a
challenge and the first league group at once. Ten scattered testers see
ten rooms that all say "Filling up".

### 4.4 App Store optimisation

**Text.** Apple allows a 30-character name and subtitle, a 100-character
keyword field and 170 characters of promotional text that can change
without a review
([Apple, product page](https://developer.apple.com/app-store/product-page/)).
The drafted listing uses all three well: "Tropos: Gym & Running Planner",
"Workout, run & calorie tracker", and keywords covering lifting, marathon,
hybrid, 5k, macro and protein
([listing](../app-store/listing.md)). Keep it. Do not put HYROX in the
keywords: the guidelines bar trademarked terms in metadata (2.3.7,
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
Reach HYROX searchers through custom product pages and partners instead.

**Screenshots.** Up to 10 per size, and up to 3 previews of 15 to 30
seconds ([Apple, product page](https://developer.apple.com/app-store/product-page/)).
Apple's page now lists the 6.3-inch class ("iPhone with Dynamic Island,
medium display", 1206 × 2622 or 1179 × 2556) as the required iPhone size
([Apple, screenshot specs](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/));
that reverses the 2024 rule, so confirm it in App Store Connect. Lead
with the three that make the case:

1. This week's plan, lifts and runs on one week.
2. Food that follows training: the day's target and its fuel label ("Long
   run tomorrow, fuel up today", [grill Q29](../whole-app-2026-11/grill.md)).
3. A Circle's meet-up and its people.

Then a run map, a lift with a new best, readiness, the weekly review.

**Custom product pages.** Up to 70, each with its own screenshots, text
and link, usable in Apple Ads and able to appear in search
([Apple, custom product pages](https://developer.apple.com/app-store/custom-product-pages/)).
Make three before the January push: hybrid and HYROX, runners, lifters.
Give each partner and creator a link to the right one, so installs can be
counted by source.

**Tests.** Product page optimisation runs up to 3 treatments for up to 90
days, once the app is live
([Apple, PPO](https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/create-a-test/)).

**Featuring.** Nominate in App Store Connect under Featuring; the help page
asks for at least three weeks' notice and the guidance says up to three
months for wider consideration
([Apple, nominate](https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring/);
[Apple, getting featured](https://developer.apple.com/app-store/getting-featured/)).

**In-app events** (up to 10 published, each up to 31 days, with Challenge
and Competition badges,
[Apple](https://developer.apple.com/app-store/in-app-events/)) fit
Tropos's monthly challenges and leagues, but a league needs 10 people
joined before it starts and an empty challenge reads "Filling up". Use
them from the second month.

**Ratings.** Competitors carry 4.7 to 5.0 from tens of thousands of
ratings (section 2.1); Tropos starts from none. The rating prompt in
Phase 0 is the cheapest growth work in this plan.

### 4.5 Communities, creators and partnerships

**Communities.** Section 4.3's four sources continue after launch. Add
parkrun as a later partner: the UK held 823 events with about 225,000
runners on one weekend in 2025
([unofficial statistics](https://elliott-line-rkfp.squarespace.com/parkrun/2025/6/1/parkrun-attendance-and-milestone-stats-for-31-may-2025-and-01-june-2025),
weak source), and Runna built its UK name partly through a parkrun
partnership
([Startups.co.uk, 17 Apr 2025](https://startups.co.uk/news/runna-acquired-by-strava/)).

**Creators.** Published rates for creators with 10,000 to 100,000
followers run $500 to $5,000 a post on Instagram and $200 to $2,000 on
TikTok ([ContentGrip, 8 May 2026](https://www.contentgrip.com/influencer-marketing-rate-card/));
a median micro-creator deliverable cost $150 in 2025 to 2026
([inBeat, 9 Oct 2026](https://inbeat.agency/blog/influencer-marketing-benchmark-report)).
Ladder grew by working with coaches who had small audiences, then moving
to TikTok
([RevenueCat Sub Club, 29 Nov 2023](https://revenuecat.com/blog/growth/sub-club-podcast-greg-stewart-ladder-fitness-app-growth)).

The plan: 10 UK hybrid, HYROX and run-club creators with 5,000 to 50,000
followers. Each gets Pro for free, a code that gives followers a free
month, and their own product page link. Pay a few of them for one
dedicated post. A budget cap of £3,000 for the 90 days is a suggestion,
not a researched figure; the owner sets it. Keep the creators whose codes
convert and drop the rest after the first wave.

**Partnerships.** HYROX lists 21 online training partners, Runna and Repz
among them ([HYROX](https://hyrox.com/hyrox-online-training-partners)).
That is a goal for later, once Tropos has users and ratings to show. For
now the partners are single gyms and clubs, each offered a Circle and a
members' code.

### 4.6 Referral

Tropos already has invite links and codes: joining through one makes the
inviter follow the new person at once, and a code can be renewed or
stopped ([inviteCodes.js](../../functions/lib/inviteCodes.js);
[CLAUDE.md](../../CLAUDE.md)). What it lacks is a reason to send one.

Add one: when an invited friend finishes a first session, the friend gets
a 30-day trial of the yearly plan and the inviter, if subscribed, a free
month on their own plan, both through Apple offer codes (section 3.3).
Rewarding the first session, not the install, pays for the invites that
bring people who train.

No published benchmark for referral in fitness apps was found in this run.
The target in section 5 is Tropos's own.

### 4.7 Press

Outlets seen covering fitness apps and hybrid training in 2025 and 2026: T3
Active ([3 Dec 2025](https://www.t3.com/active/running/strava-year-in-sport-trend-report-2025)),
Hybrid Magazine, a UK newsletter on hybrid training
([hybridmag.co.uk](https://www.hybridmag.co.uk/p/run-club-over-nightclub)),
Morning Chalk Up on HYROX, and Athletech News on the fitness-app business
(both cited in section 1). Men's Health UK, Runner's World, Coach, Tom's
Guide and TechRadar were **not checked** in this run. DC Rainmaker mostly
reviews hardware ([dcrainmaker.com](https://www.dcrainmaker.com/)).

The story: a UK solo founder builds the one app that plans lifting, running
and food as one week, at a little over a third of Runna's price, as HYROX
passes a million racers a season. Press is not worth December's time. Pitch
two or three UK outlets for the 5 January push, with a press page on
troposfit.com (one paragraph, five screenshots, a contact), and US outlets
for the US release.

Product Hunt is not worth launch-day effort for a consumer fitness app:
its fitness category's leading products carry 2 to 25 reviews
([Product Hunt](https://www.producthunt.com/categories/fitness), a weak
signal).

### 4.8 Why no paid installs yet

Apple Ads in the US Health & Fitness category cost $1.68 a tap and $3.77
an install in 2025 ([AppTweak, 19 Aug 2026](https://apptweak.com/en/aso-blog/apple-ads-benchmarks)).
At the median Health & Fitness download-to-paid rate of 2.9% by day 35,
3.5% on iOS, and 6.2% for the top quarter
([RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)):

| Download-to-paid | Cost of one paying user ($3.77 ÷ rate) | Year-one value at recommended US prices (3.4) |
| ---------------- | -------------------------------------- | --------------------------------------------- |
| 2.9%             | $130                                   | $36.99                                        |
| 3.5%             | $108                                   | $36.99                                        |
| 6.2%             | $61                                    | $36.99                                        |

Paid installs lose money in year one even at the top quarter's rate.
Spend nothing on them in the first 90 days, except, if the owner wants
it, a small Apple Ads budget on the word "Tropos" so a competitor cannot
buy it. Revisit when measured download-to-paid times year-one value beats
the cost of an install: at $3.77 an install that needs about 10%.

## 5. Metrics and targets

### 5.1 The five launch numbers

The app already sends the five numbers the grill chose (Q17), each once
per account. `onboarding_completed` goes as setup saves. The server decides
the other four: the first counted session, the first counted session on
days 21 to 27, the first verified trial and the first paid period, and the
app claims each before sending it, so a purchase the app never saw finish
still counts ([CLAUDE.md](../../CLAUDE.md);
[launchEvents.ts](../../src/lib/launchEvents.ts)). Count installs from App
Store Connect.

| Number         | Event                  | Published benchmark                                                                                                                                                                                                                                                                 | Tropos target, day 90                              |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Setup finished | `onboarding_completed` | None found                                                                                                                                                                                                                                                                          | 65% of installs                                    |
| First session  | `first_session_saved`  | None found                                                                                                                                                                                                                                                                          | 60% of finished setups, within 7 days              |
| Back in week 4 | `week_4_returned`      | No week-4 figure found. Day 30 on iOS, all apps: 8% ([Adjust, 16 Apr 2024](https://www.adjust.com/blog/what-makes-a-good-retention-rate/)); UK 3.2% in Q3 2023 ([AppsFlyer](https://appsflyer.com/?p=453529)). Health & Fitness day 1: 21% in North America, 24% in Europe (Adjust) | 20% of finished setups, about 13% of installs      |
| Trial started  | `trial_started`        | Download-to-trial within 30 days: Health & Fitness median 6.9% ([RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)); 14.5% in North America ([Adapty, 27 Mar 2026](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/))                 | 8% of installs within 30 days                      |
| Paid           | `subscription_started` | Trial-to-paid: median 37.7%, top quarter 51.4%. Download-to-paid by day 35: median 2.9%, 3.5% on iOS, top quarter 6.2% (RevenueCat 2026)                                                                                                                                            | Trial-to-paid 40%; download-to-paid 3.5% by day 35 |

The trial targets assume decision 2: an offer at the end of setup as well
as at day 14. Without the setup offer, Tropos asks only people who are
still there two weeks in, and the honest targets fall to about 3%
download-to-trial and 1% to 1.5% download-to-paid. Measure trial-to-paid
separately for the two offers.

The targets for setup and first session are Tropos's own: no published
benchmark was found. Week 4 is set well above the all-app day-30 figures
because it is measured on people who finished setup, not on installs, and
because a training plan gives people a reason to come back each week.

### 5.2 Subscriber numbers

| Number                                     | Benchmark                                                                                                                                                           | Target                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Monthly subscribers paying a second time   | Health & Fitness median 57%, quartiles 46% and 68% ([RevenueCat, 24 Apr 2026](https://www.revenuecat.com/blog/average-subscription-renewal-rates-by-app-category/)) | 57% or better                                            |
| Monthly churn after the second payment     | 18% a month on the median curve in section 3.4                                                                                                                      | Under 18%                                                |
| Yearly subscribers renewing                | Health & Fitness median 25%, quartiles 16% and 37% (same source)                                                                                                    | 25% or better; the first renewals arrive in January 2028 |
| Share of new subscriptions that are yearly | About two in three in Health & Fitness ([RevenueCat 2025](https://revenuecat.com/state-of-subscription-apps-2025))                                                  | 60% or more                                              |
| Refunds                                    | 4.71% for Health & Fitness in 2025; most categories 3% to 4% in 2026 (RevenueCat 2025 and 2026)                                                                     | Under 4%                                                 |

### 5.3 Day-90 goals, built from the channels

The day-90 window runs from the UK release on 15 December to 14 March, so
almost all of it is UK installs. Each row is an assumption, not a measured
rate: the reach comes from section 4, the rates are this document's
guesses, and the low case is what happens if each channel does roughly a
third as well.

| Channel                                              | Reach                      | Install rate, base / low | Base      | Low       |
| ---------------------------------------------------- | -------------------------- | ------------------------ | --------- | --------- |
| Beta testers moving to the App Store build           | 200 testers                | 75% / 50%                | 150       | 100       |
| HYROX gyms beyond the beta's five                    | 15 × 300 members (assumed) | 5% / 2%                  | 225       | 90        |
| Run clubs, the beta's 3 and 5 more                   | 8 × 100 members (assumed)  | 15% / 5%                 | 120       | 40        |
| r/HybridAthlete and r/hyrox, one permitted post each | About 104,000 members      | 0.3% / 0.1%              | 312       | 104       |
| UK creators from 5 January                           | 10 × 20,000 followers      | 0.3% / 0.1%              | 600       | 200       |
| App Store search and browse                          | 90 days                    | 15 a day / 5 a day       | 1,350     | 450       |
| Invites                                              | Share of the above         | 15% / 10%                | 414       | 98        |
| **Total installs**                                   |                            |                          | **3,171** | **1,082** |

From installs to subscribers, using the targets in 5.1. Only people who
installed at least 35 days before day 90 can be counted on day 35's
measure; with installs bunched around the January push, take that as
about 65% of them.

|                                               | Base         | Low          |
| --------------------------------------------- | ------------ | ------------ |
| Installs in 90 days                           | 3,171        | 1,082        |
| Installs at least 35 days old on day 90 (65%) | 2,061        | 703          |
| Download-to-paid by day 35                    | 3.5%         | 1.5%         |
| **Paying subscribers from those cohorts**     | **about 70** | **about 10** |
| Proceeds a month at £3.22 each (section 6.4)  | about £230   | about £30    |

These are small numbers, and the document should say so plainly: at day 90
Tropos will be a product with a few dozen paying subscribers whatever
happens. What day 90 can show is whether people come back.

**The one number that matters before April is week-four return, by week
of sign-up.** Installs can be bought later and conversion can be tuned
later; neither helps if people stop training with the app in their third
week. Target 20% of finished setups back in week four for the December
and January sign-ups. Below 10%, fix the first month before spending
anything on growth.

**What a real business needs.** A new subscriber is worth about £32 in
proceeds over their life at the recommended UK prices (section 3.4).
£100,000 a year of proceeds, held steady, needs about 3,100 new
subscribers a year to replace those who leave (£100,000 ÷ £32). At 3.5%
download-to-paid that is about 89,000 installs a year, about 245 a day;
at 2% it is about 156,000. No channel in section 4 has been shown to
deliver that without paid installs, and paid installs only pay back above
about 10% download-to-paid (section 4.8). The path, if there is one, is
retention well above the category's, invites, featuring, and a route into
Strava; week-four return is the first evidence for or against it.

**Other day-90 goals** of Tropos's own: 15% of new accounts joined through
an invite, and 50 ratings averaging 4.6 or more.

Read the numbers every Monday, by the week people signed up, not as one
running total: a running total hides whether the app is getting better.

**Small numbers mislead.** At 100 trials, a measured 40% trial-to-paid
could truly be anywhere from about 30% to 50% (95% interval: ± 1.96 ×
√(0.4 × 0.6 ÷ 100) = ± 9.6 points). At 200 trials the interval is ± 6.8
points. Do not change the price or the trial on fewer than 200 trials; at
the base case that point comes around day 90.

## 6. Costs at 100, 1,000 and 10,000 users

### 6.1 Unit prices

| Item                                                       | Price                                                                                                                         | Free each period                                                   | Source                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Firestore reads                                            | $0.03 per 100,000                                                                                                             | 50,000 a day                                                       | [Firestore pricing](https://cloud.google.com/firestore/pricing)                                                    |
| Firestore writes                                           | $0.09 per 100,000                                                                                                             | 20,000 a day                                                       | Same                                                                                                               |
| Firestore deletes                                          | $0.01 per 100,000                                                                                                             | 20,000 a day                                                       | Same                                                                                                               |
| Firestore storage                                          | About $0.15 per GiB a month (the page's unit is unclear)                                                                      | 1 GiB                                                              | Same                                                                                                               |
| Functions (Cloud Run rates)                                | $0.000024 per vCPU-second, $0.0000025 per GiB-second, $0.40 per million calls                                                 | 180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million calls a month | [Cloud Run pricing](https://cloud.google.com/run/pricing); [Firebase pricing](https://firebase.google.com/pricing) |
| Cloud Scheduler                                            | $0.10 per job a month                                                                                                         | 3 jobs                                                             | [Scheduler pricing](https://cloud.google.com/scheduler/pricing)                                                    |
| Sign-in (Firebase Auth)                                    | Free                                                                                                                          | To 50,000 monthly active users                                     | [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)                                    |
| Push, Hosting, Storage                                     | Free at this scale                                                                                                            | FCM free; Hosting 10 GB; Storage 5 GB                              | [Firebase pricing](https://firebase.google.com/pricing)                                                            |
| Gemini 3.8 Flash on Vertex AI, outside the global endpoint | $0.825 in and $4.125 out per million tokens to 31 Dec 2026; **$1.65 and $8.25 from 1 Jan 2027**; thinking is billed as output | A 50% credit on net spend to 31 Dec 2026                           | [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)                                      |
| One image to Gemini 3                                      | 1,120 tokens by default; 560 at medium; 280 at low                                                                            |                                                                    | [Gemini media resolution](https://ai.google.dev/gemini-api/docs/media-resolution)                                  |
| RevenueCat                                                 | 1% of monthly tracked revenue once past $2,500                                                                                | Below $2,500                                                       | [RevenueCat pricing](https://www.revenuecat.com/pricing/)                                                          |
| Resend                                                     | $20 a month for 50,000 emails                                                                                                 | 3,000 a month, 100 a day                                           | [Resend pricing](https://resend.com/pricing)                                                                       |
| Apple Developer Program                                    | $99 a year                                                                                                                    |                                                                    | [Apple enrolment](https://developer.apple.com/help/account/membership/program-enrollment/)                         |
| Apple's commission                                         | 15% while proceeds stay under $1m a year                                                                                      |                                                                    | [Apple, Small Business Program](https://developer.apple.com/app-store/small-business-program/)                     |

The functions are written against the first-generation API
([functions deploy notes](../agents/functions-deploy.md)), whose rates are
set differently from the Cloud Run rates above. At these volumes either
comes to tens of dollars a month.

### 6.2 What runs per user

- **The app reads live.** About 36 source files open live Firestore
  listeners, and the food diary loads up to 400 meals a page
  (`PAGE_SIZE` in [useMeals.ts](../../src/hooks/useMeals.ts)).
- **Each saved session fans out on the server.** Triggers recompute
  performance, badges, the league standing, Space weeks, the live pulse,
  challenge progress and segment efforts
  ([CLAUDE.md, data model](../../CLAUDE.md)).
- **13 scheduled jobs** run hourly, daily or weekly: the streak nudge,
  challenge announcements, the props bundle and the meet-up sweep every
  hour; performance refresh, race recounts and reconciliation every day;
  the performance rollup, league turn and fell-behind check every week
  ([functions/index.js](../../functions/index.js)).
- **No function keeps a warm instance,** so nothing costs money while idle.
- **AI runs only for Pro and trial accounts,** on `gemini-3.8-flash` at the
  `us` endpoint with thinking set low
  ([foodModel.js](../../functions/lib/foodModel.js)).
- **Email** carries verification, password resets and trial reminders
  today ([trialReminder.js](../../functions/lib/trialReminder.js)), and
  will carry the weekly review for people who opt in (Q55).

### 6.3 Assumptions

None of these were measured; replace each with the console's numbers after
two weeks of beta.

- "Users" means monthly active users; 35% of them are active on a given day.
- Firestore: 1,500 reads, 100 writes and 10 deletes per daily active user
  per day, plus 20% for the scheduled jobs; 10 MB stored per user, mostly
  GPS traces.
- Functions: 40 calls per daily active user per day, 0.3 seconds each, at
  1 vCPU and 0.5 GiB.
- AI: each Pro or trial account makes 30 photo scans and 15 typed meals a
  month on average, many making none and some several a day. A photo
  scan is 1,620 tokens in (1,120 for the image, 500 for the prompt) and
  800 out including thinking; a typed meal is 700 in and 600
  out. At 2027 prices that is **$0.0093 a photo, $0.0061 a typed meal and
  $0.37 a month per AI-using account**. The real counts are logged as
  `analyzeFood.usage`; checking them is an open item in the
  [backlog](../qa/pre-launch-backlog.md).
- Paying share: half the beta testers use Pro and none pay; at 1,000 users
  4% pay and 1% are in trial; at 10,000, 5% and 1%.
- Two thirds of subscribers are yearly, at the recommended UK prices.

### 6.4 The table

| A month                            | 100 users (the beta) | 1,000 users      | 10,000 users       |
| ---------------------------------- | -------------------- | ---------------- | ------------------ |
| Daily active users                 | 35                   | 350              | 3,500              |
| Firestore                          | $0.12                | $7               | $80                |
| Functions and Scheduler            | $1                   | $1               | $29                |
| Gemini                             | 50 accounts: $19     | 50 accounts: $19 | 600 accounts: $222 |
| RevenueCat                         | $0                   | $0               | $30                |
| Resend                             | $0                   | $0               | $20                |
| Apple Developer Program ($99 ÷ 12) | $8                   | $8               | $8                 |
| **Running costs**                  | **$28 (£21)**        | **$35 (£27)**    | **$388 (£299)**    |
| Paying subscribers                 | 0                    | 40               | 500                |
| **Proceeds after Apple**           | **£0**               | **£129**         | **£1,612**         |
| Apple's 15%, for comparison        | £0                   | £23              | £284               |

A paying subscriber brings £3.22 a month on this mix: two thirds at £28.33
÷ 12 and one third at £4.95.

**What the table says.**

1. **Below 1,000 users the bill is the Apple fee and a few dollars.**
   Firestore stays near its free allowance until a few hundred people use
   the app each day.
2. **At 10,000 users Gemini is more than half the bill** ($222 of $388).
   It costs $0.37 a month per AI user against about $3.07 (£2.36) a month
   from a yearly subscriber: 12%. Someone who pays for the meal scan may
   log three meals a day; at 90 photo scans and 30 typed meals a month
   that is $1.02, a third of a yearly subscriber's proceeds, and the 600
   accounts at 10,000 users would cost $612 a month, not $222. The price
   doubles on 1 January 2027, two weeks after the UK release; the beta
   column above is priced at 2027 rates, though December's are half that.
3. **The daily cap is the real exposure.** At 100 photo scans and 100
   typed meals a day, one account could cost 30 × (100 × $0.0093 + 100 ×
   $0.0061) = **$46 a month**, about fifteen times what a yearly
   subscriber pays. At 15 of each a day the worst case is 30 × 15 ×
   $0.0154 = $6.93, still generous for someone eating five times a day.
   Lower the cap, and test medium image resolution, which halves the
   image's tokens.
4. **Apple still takes about as much as all the infrastructure together**
   at 10,000 users (£284 against £299).
5. **This is a small business at 10,000 users.** Proceeds of £1,612 a
   month are about £19,300 a year, less about £3,600 of running costs.
   £100,000 a year of proceeds needs about 2,600 people paying at any one
   time (£100,000 ÷ £38.69 a year each on this mix), which at 5% paying is
   about 52,000 monthly users. Because subscribers leave, holding 2,600
   means winning about 3,100 new ones a year (section 5.3).

### 6.5 Year one in cash

The server bill is the small part. Known cash costs for the first year,
before any pay for the founder:

| Item                                                                           | Year one                    | Source                                                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Running costs without the Apple fee, rising from the beta to about 2,000 users | About £450                  | Section 6.4, averaged                                                                                                     |
| Apple Developer Program                                                        | $99, about £76              | [Apple](https://developer.apple.com/help/account/membership/program-enrollment/)                                          |
| Incorporation and the confirmation statement                                   | £150                        | [GOV.UK, 30 Oct 2025](https://www.gov.uk/government/news/companies-house-fees-are-changing-from-1-february-2026)          |
| ICO fee                                                                        | £52, or £47 by Direct Debit | [ICO](https://ico.org.uk/for-organisations/data-protection-fee/faqs-data-protection-fee-payment-and-online-registration/) |
| UK solicitor before launch, 6 hours assumed at £145                            | £870                        | [LawBite](https://www.lawbite.co.uk/pricing)                                                                              |
| Creators, if the owner sets the suggested cap                                  | £3,000                      | Section 4.5                                                                                                               |
| **Known total**                                                                | **About £4,600**            |                                                                                                                           |
| Accountant                                                                     | Not researched; get quotes  |                                                                                                                           |
| US counsel before the US push                                                  | No published prices found   |                                                                                                                           |
| Insurance, tools, a phone to test on                                           | Not researched              |                                                                                                                           |

Against that, if paying subscribers grow steadily through the year to 400
(base) or 100 (low), an assumption extended from section 5.3, year-one
proceeds are about £7,700 or £1,900 (an average of 200 or 50 subscribers ×
£3.22 × 12). In the low case the year loses money before the founder is
paid anything. Codes and invite rewards cost no cash; they cost revenue
not taken.

## 7. Legal and compliance

**This is research, not legal advice.** It sets out what a UK solo founder
in Tropos's position faces, so that the time paid for with a solicitor and
an accountant goes on the right questions. Section 7.7 says when to hire
them.

### 7.1 The company

- **Today Tropos is run by Myles as an individual.** The Terms name him as
  the operator ([TermsOfService.tsx](../../src/pages/TermsOfService.tsx)),
  and the listing's copyright line is his name
  ([listing](../app-store/listing.md)).
- **Incorporate a private limited company.** A sole trader is personally
  liable for everything the business owes; a company is a separate legal
  person ([GOV.UK](https://www.gov.uk/business-legal-structures)). Health
  data, other people's posts and US sales are the risks to keep off the
  founder's own assets.
- **How.** Verify identity through GOV.UK One Login first; it has been
  required of new directors since 18 November 2025
  ([Lewis Silkin, 11 Nov 2025](https://www.lewissilkin.com/en/insights/2025/11/11/how-to-verify-id-with-companies-house)).
  Incorporation costs £100 online and the yearly confirmation statement
  £50 ([GOV.UK](https://www.gov.uk/government/news/companies-house-fees-are-changing-from-1-february-2026)).
  Corporation Tax is 19% on profits to £50,000 and 25% above £250,000
  ([Budget 2026, Annex A](https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances)).
- **Apple.** Enrolling as an organisation needs a legal entity and a free
  D-U-N-S number, which takes about seven business days
  ([Apple, enrolment](https://developer.apple.com/help/account/membership/program-enrollment/);
  [Apple, D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/)).
  Whether the current membership can be converted, keeping the app record
  and the Small Business Program rate, is **unconfirmed**: ask Apple
  Developer Support this week.
- **EU storefronts** need verified trader status under the Digital Services
  Act. For an individual Apple publishes an address; for a company it
  publishes the company's
  ([Apple, DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)).
  Tropos's trader status was still pending on 7 November
  ([RevenueCat setup](../iap/revenuecat-setup.md)). Another reason to
  leave the EU until after the UK and US releases.

### 7.2 UK GDPR and data

- **ICO fee:** £52 a year at Tier 1, which covers Tropos
  ([ICO](https://ico.org.uk/for-organisations/data-protection-fee/faqs-data-protection-fee-payment-and-online-registration/)).
- **Health data is special category data.** Steps, sleep, heart rate, HRV,
  weight and body measurements all count, and need an Article 9 condition
  as well as a lawful basis; for a consumer app that in practice means
  explicit consent ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-rules-on-special-category-data/)).
  Tropos already asks before sending anything to Gemini
  ([CLAUDE.md, meal photos](../../CLAUDE.md)) and stores only daily
  summaries from Apple Health ([grill Q44](../whole-app-2026-11/grill.md)).
- **Write a DPIA before launch.** The ICO's list of likely high-risk
  processing includes fitness apps that track people, location, AI and
  combining data from several sources
  ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/examples-of-processing-likely-to-result-in-high-risk/)).
  Tropos does all four.
- **Data goes to the US.** The functions run in us-central1 and meal
  analysis uses the `us` endpoint
  ([foodModel.js](../../functions/lib/foodModel.js)). The UK-US data bridge
  covers only recipients certified to the UK Extension of the Data Privacy
  Framework, and health data must be marked sensitive
  ([GOV.UK factsheet](https://www.gov.uk/government/publications/uk-us-data-bridge-supporting-documents/uk-us-data-bridge-factsheet-for-uk-organisations));
  Firebase's terms rely on Google's certification, with standard clauses as
  the fallback ([Firebase terms](https://firebase.google.com/terms/data-processing-terms)).
  Check that Google and Resend appear on the list with the UK Extension.
- **Complaints.** Since 19 June 2026 controllers must offer an electronic
  complaint form and acknowledge a complaint within 30 days
  ([SI 2026/82](https://www.legislation.gov.uk/uksi/2026/82/made);
  [DLA Piper, 6 Feb 2026](https://privacymatters.dlapiper.com/2026/02/uk-commencement-of-the-data-protection-provisions-in-the-data-use-and-access-act/)).

### 7.3 Age

- **What the app checks.** Setup asks for a year of birth, and anyone born
  in this year minus 16 or earlier passes. It rests on the person's own
  answer ([age.ts](../../src/lib/age.ts);
  [App1 row](../../.claude/plans/programme-run-followups.md)).
- **The Children's code applies to 16 and 17 year olds.** It covers
  under-18s on any service likely to be used by them. It asks for
  high-privacy defaults, profiling off by default and location off by
  default ([ICO, services covered](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/);
  [ICO, geolocation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/10-geolocation/)).
  A calorie target worked out from body data and a run map shared with
  followers both sit awkwardly with that for a 16-year-old.
- **The Online Safety Act applies.** Posts, comments, Circles and Spaces
  make Tropos a user-to-user service, and there is no exemption for small
  services. A new service has 3 months from launch for its illegal content
  risk assessment and its children's access assessment, then 3 months for
  a children's risk assessment
  ([OSA Schedule 3](https://www.legislation.gov.uk/ukpga/2023/50/schedule/3);
  [Ofcom](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-protecting-children-from-harms-online)).
  Ofcom says self-declared age is "not highly effective"
  ([Ofcom](https://www.ofcom.org.uk/online-safety/protecting-children/age-checks-to-protect-children-online)),
  so a typed year of birth cannot show that children are kept out, whatever
  the minimum age.
- **Eating-disorder content is the specific risk.** It is primary priority
  content under the Act (s.61), and Ofcom's guidance names calorie counts
  and weights in an eating-disorder context, pro-ana groups and "body
  checks" ([OSA s.61](https://www.legislation.gov.uk/ukpga/2023/50/section/61);
  [Ofcom guidance, 24 Apr 2025](https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-protecting-children-from-harms-online/main-document/guidance-on-content-harmful-to-children.pdf)).
  A food app with weight posts and private groups has to show how it
  handles that.
- **Recommendation** (decision 6): raise the minimum age to 18 and read
  Apple's age signal. The Online Safety Act assessments are still needed,
  but the Children's code exposure narrows to people who lie about their
  age, the US laws reduce to "block anyone the store says is under 18",
  and the product needs no separate under-18 defaults. A solicitor should
  confirm how far this narrows the code's reach.

### 7.4 US state app store laws

| State                                    | In force for developers                  | What it asks                                                                                                      | Source                                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texas (SB 2420)                          | Since 4 June 2026, while the appeal runs | Use the store's age category; under-18s need a parent's consent, which Apple collects                             | [CCIA](https://ccianet.org/litigation/ccia-v-paxton-w-d-tex/); [Apple, 3 Jun 2026](https://developer.apple.com/news/?id=sg176nne)                                                                                    |
| California (AB 1043, amended by AB 1856) | 1 January 2027                           | Request an age signal at download and launch; the signal counts as knowing the user's age; up to $7,500 per child | [CalMatters](https://calmatters.digitaldemocracy.org/bills/ca_202520260ab1856); [Wiley, 8 Jun 2026](https://www.wiley.law/alert-Key-Developments-With-State-App-Store-Accountability-Acts-as-Texas-Act-Takes-Effect) |
| Alabama                                  | 1 January 2027                           | Similar                                                                                                           | Wiley, same                                                                                                                                                                                                          |
| Utah (SB 142, amended)                   | 6 May 2027                               | Similar, with private suits                                                                                       | [Alston & Bird, 27 Apr 2026](https://www.alstonprivacy.com/challenge-to-utahs-app-store-accountability-act-voluntarily-dismissed-following-statutory-amendments/)                                                    |
| Louisiana (HB 570, amended)              | 1 July 2027                              | Similar, enforced by the Attorney General                                                                         | [Alston & Bird, 27 May 2026](https://www.alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/)                                                                                   |

Two of these are in force by the US release. Releasing in the UK first
defers them, but not by much: they belong on the US gate's list
(decision 4). Apple's tools are the Declared
Age Range API, the Significant Change API and notices when a parent
withdraws consent ([Apple, 24 Feb 2026](https://developer.apple.com/news/?id=f5zj08ey)).
Apple also asks apps to declare social media features and, by
**12 January 2027**, "Shared Location"
([Apple, 2 Nov 2026](https://developer.apple.com/news/?id=yxkh08us)):
Tropos shares run maps. How these laws treat a sale on
the website, which skips the store's consent, is **unconfirmed**.

### 7.5 Health data

- **Washington's My Health My Data Act** covers Washington residents
  wherever the business is. Its "consumer health data" includes bodily
  measurements, so Apple Health figures, weight and food logs are likely
  in. It wants consent before collecting more than the service needs, a
  separate consent to share, and a consumer health data privacy policy
  linked from the home page, and anyone can sue
  ([Washington AG](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy);
  [RCW 19.373](https://lawfilesext.leg.wa.gov/Law/RCWPDF/RCW%20%2019%20%20TITLE/RCW%20%2019%20.373%20%20CHAPTER/RCW%20%2019%20.373%20%20COMBINEDCHAPTER.pdf)).
  Nevada has a similar law; Connecticut's rules on sensitive data widened
  on 1 July 2026
  ([Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/connecticut-and-nevada-legislatures-pass-health-data-laws);
  [Wiley, 27 Apr 2026](https://www.wiley.law/alert-Major-Changes-to-Connecticut-Consumer-Privacy-Law-Will-Take-Effect-July-1-2026)).
- **The FTC's Health Breach Notification Rule** covers health apps outside
  HIPAA, and counts an unauthorised disclosure, such as data passed to a
  third party's software kit, as a breach, with notice due within 60 days
  and penalties up to $51,744 per violation
  ([FTC, Apr 2024](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-changes-health-breach-notification-rule);
  [FTC basics](https://www.ftc.gov/business-guidance/resources/health-breach-notification-rule-basics-business)).
- **Apple** bars using health and fitness data for advertising or data
  mining (Guideline 5.1.3,
  [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
- **What Tropos does today:** until 21 November chart taps on Progress
  sent the figure tapped, such as a macro share, to Google Analytics,
  which could be read as the disclosure the FTC rule describes. #3452
  removed every health and training figure from analytics events, pinned
  by a test, and the listing now gives Health and Fitness the App
  functionality purpose only ([listing](../app-store/listing.md)). What
  remains before the US launch is a consumer health data policy.

### 7.6 Subscription law

- **In the app, Apple carries most of it.** Apple handles cancellation,
  refunds and price-rise notices as the developer's agent
  ([Apple Media Services Terms, 14 Sep 2026](https://www.apple.com/legal/internet-services/itunes/uk/terms.html)).
  Whether Tropos still counts as the trader for the new UK duties is
  **unconfirmed**.
- **UK, now.** The Consumer Contracts Regulations give 14 days to cancel;
  for digital content the right ends once supply starts with the person's
  express consent ([reg 37](https://www.legislation.gov.uk/uksi/2013/3134/regulation/37)).
- **UK, from 1 January 2027 (draft regulations laid 19 October 2026).** The
  subscription rules ask for key information just before sign-up, a
  reminder before a trial ends and every six months, cooling-off periods at
  the start, after a trial converts and after each yearly renewal, and an
  easy way out; the CMA can fine directly
  ([Freshfields, 2 Nov 2026](https://www.freshfields.com/en/our-thinking/blogs/risk-and-compliance/less-than-two-months-to-go-before-tough-new-uk-subscription-rules-bite-102o78a)).
  Tropos already reminds every trial two days before the last day to
  cancel, by email and on the phone, written with these rules in mind
  ([trialReminder.js](../../functions/lib/trialReminder.js)). The
  six-monthly reminder and the renewal cooling-off need a solicitor's
  answer.
- **EU, on the web:** 14 days to withdraw, and since 19 June 2026 a
  "withdraw from contract here" function
  ([Winston Taylor, 3 Jun 2026](https://www.winstontaylor.com/insights/eu-withdrawal-buttons-required-for-consumer-online-contracts-from-june-19-2026-are-you-ready)).
- **US.** The FTC's click-to-cancel rule was struck down on 8 July 2025 and
  rulemaking restarted in March 2026
  ([Kirkland, 19 Mar 2026](https://www.kirkland.com/publications/kirkland-alert/2026/03/ftc-restarts-subscription-rulemaking));
  ROSCA still requires clear terms, express consent and simple
  cancellation. California's automatic renewal law, as amended from 1 July
  2025, adds consent records kept for three years, yearly reminders,
  online cancellation and notice of price changes
  ([CalMatters, AB 2863](https://calmatters.digitaldemocracy.org/bills/ca_202320240ab2863)).
  New York requires cancellation by the same route as sign-up
  ([NY Senate](https://www.nysenate.gov/legislation/laws/GBS/527-A)).
- **On the website Tropos is the seller,** so it must do all of this
  itself. That, more than Stripe's fee, is the cost in section 3.5.

### 7.7 When to get a lawyer and an accountant

| When                                              | Who                   | For what                                                                                                          |
| ------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Now                                               | Accountant            | Whether App Store proceeds count towards the £90,000 VAT threshold; Corporation Tax set-up for the new company    |
| By 8 January, before launch                       | UK solicitor          | Privacy notice, consent wording, DPIA review, subscription terms against the January 2027 rules, the age decision |
| Within 3 months of launch                         | UK solicitor, briefly | Review the Online Safety Act assessments, drafted first with Ofcom's free tools                                   |
| Before the US web checkout or a US marketing push | US counsel            | Washington health-data consent, state renewal rules, Texas and California age signals, a breach plan              |
| Before selling in the EU                          | Solicitor             | Whether an EU GDPR representative and a DSA legal representative are needed (**unconfirmed**)                     |
| Before taking investment or a co-founder          | Solicitor             | Shareholder documents                                                                                             |

Published UK prices: SeedLegals plans run £649 to £2,699 a year
([SeedLegals](https://seedlegals.com/pricing/)); LawBite charges £145 an
hour and £149 for a contract review
([LawBite](https://www.lawbite.co.uk/pricing)). No published US counsel
prices were found.

## 8. The ten decisions

1. **The price. Recommend:** UK £6.99 a month and £39.99 a year; US $7.99
   and $49.99. **Because** the monthly price today lets a race block
   undercut the yearly plan, £39.99 stays below every app that writes the
   plan for you, and no subscriber holds a price yet (section 3.3).
2. **The trial and the setup offer (Q72). Recommend:** keep 7 days and one
   trial per account; add a skippable offer at the end of setup, and keep
   the day-14 offer for those who skip it. **Because** Adapty's figures
   suggest most Health & Fitness trials start on the day of install, and
   an app that asks only
   on day 14 asks only the people who are still there; without it the
   trial targets roughly halve (sections 3.3, 5.1).
3. **The launch order. Recommend:** submit by 7 December, release quietly
   in the UK by 15 December, push in the UK from 5 January. **Because** a
   first submission needs room for a rejection, a quiet release earns
   ratings and a tested first week before the push, and every channel in
   the plan is British (section 4.1).
4. **The US. Recommend:** release there about 16 February, only when two
   things are true: the compliance list is done (a consumer health data
   policy, Declared Age Range, the
   Shared Location declaration, the DPIA) and 20% of December's finished
   setups are back in week four. **Because** Texas's law is in force,
   California's starts on 1 January, Washington's lets anyone sue, and the
   US has no channel yet that would justify the risk before retention is
   known (sections 5.3, 7.4, 7.5).
5. **The website checkout. Recommend:** keep it built; open it to UK
   yearly buyers on Stripe after the accountant's VAT answer and once the
   website has a way into the Purchase Link (it has no app since Q52), add US buyers
   and the US in-app link at 50 US subscriptions a month, and sell nothing
   on the web in the EU yet. **Because** it earns 38% more per UK yearly
   sale while Tropos is under the VAT threshold and 11% more per US sale,
   Stripe's fee is only 2%, and the real cost is being the seller
   (section 3.5).
6. **The minimum age. Recommend:** raise it from 16 to 18 and read Apple's
   age signal. This overturns Q65. **Because** 16 and 17 year olds bring
   the Children's code, the hardest part of the Online Safety Act's
   children's duties on a calorie-and-weight app, and minors' consent rules
   in Texas, while the people the app is for are adults (section 7.3).
7. **The company. Recommend:** incorporate now; move the Apple account to
   it in February, after the UK release and before the EU. **Because** it
   keeps health-data, user-content and US risks off personal assets, and a
   new company's D-U-N-S number and Apple's checks should not hold up the
   first release (section 7.1).
8. **Growth spending. Recommend:** no paid installs in the first 90 days;
   a creator budget capped at about £3,000, paid partly in codes; every
   code a trial of the yearly plan. **Because** a paying user costs $61 to
   $130 to buy through Apple Ads and returns about $37 in year one, and a
   free month on the monthly plan steers people onto the plan they leave
   (sections 3.3, 4.8).
9. **The AI cap. Recommend:** lower it from 100 to 15 photo scans and 15
   typed meals a day, test medium image resolution, and measure real token
   counts in the beta. **Because** Gemini's price doubles on 1 January
   2027, one account at today's cap could cost $46 a month, and heavy
   scanners could take a third of a yearly subscriber's proceeds
   (section 6.4).
10. **Runs from other devices. Recommend:** before the January run-club
    push, release the Watch run app or bring in runs recorded elsewhere
    through Apple Health; then build a route into Strava; Android after
    that. **Because** a runner who records on a Garmin or a Watch cannot
    feed the plan today (this review found no code that imports workouts),
    the Watch run app exists behind a release flag
    ([connectedTrainingRelease.ts](../../src/lib/connectedTrainingRelease.ts)),
    Strava holds the runners' friends, and Android already waits for the
    iPhone app's phone checks ([grill Q63](../whole-app-2026-11/grill.md))
    (sections 2.2, 2.4).

## 9. What could not be confirmed

The research's search allowance ran out before these were checked. Each is
worth a few minutes before the decision it feeds.

- The pound to dollar rate. This document assumes £1 = $1.30.
- Whether Apple's grid puts £39.99 and $49.99 on the same price point.
- Whether the district court set a US link-out fee in October or November 2026.
- Whether App Store proceeds count towards the UK VAT threshold.
- Whether RevenueCat Billing can refuse EU billing addresses, and which
  Stripe Tax rate it incurs.
- Whether an individual Apple membership converts to a company keeping
  the app record and the Small Business Program rate.
- Whether Tropos or Apple is the trader for the UK subscription rules on
  in-app purchases; the UK rules themselves are still draft.
- How the US state age laws treat a website sale.
- Ladder's UK price; which MyFitnessPal UK price belongs to which tier;
  the trial lengths of Hevy, Strong, Cronometer, ROXFIT and Repz; Garmin
  Connect+'s UK price from Garmin itself.
- Apple's screenshot rule: its page now names the 6.3-inch class as the
  required size, reversing the 2024 rule.
- Reddit member counts, which come from third-party trackers, and parkrun
  attendance, which comes from an unofficial site.
- Referral benchmarks for fitness apps, and press contacts and pitching
  guidance; none were found.
- A seasonal January lift in fitness app installs, which the launch date
  leans on.
- Every running-cost assumption in section 6.3, and every install rate in
  section 5.3, until the beta and the first cohorts measure them.
- Whether Apple's review prompt shows in TestFlight builds, and whether
  the server honours a RevenueCat promotional grant of Pro.
- How long a D-U-N-S number takes for a new company; Apple says about seven
  business days.
