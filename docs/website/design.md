# troposfit.com: the website's design

troposfit.com is Tropos's marketing website: one promise, the app shown doing
real things, and every page ending at the App Store. It replaces the single
App Store page of App1 Q52 (#3375) with the pages below, on the same
addresses, and keeps every address the app has handed out answering.

The research behind it is `research.md` beside this file. The captures of
every page, at 393 px (a phone, 2x) and 1440 px (a laptop, 1x), are in
`captures/`. Labels: **Tropos decision** marks a choice made here with the
advisor, not set by a lock, a rule or the owner.

## What the site is for

1. **Say what Tropos is in one line.** "Your training and food, planned
   together" is the welcome's own headline, so the site and the app open on
   the same words.
2. **Show the app doing it.** Real app screens, the app's own drawings and the
   welcome's photographs; no stock art beyond those, no drawn phones.
3. **Send everyone to the App Store.** Apple's badge in each page's hero, a
   "Get the app" button and a QR code at each page's foot, and "Get the app"
   in the header.
4. **Claim only what is on main.** Every claim is one the App Store listing
   makes (`docs/app-store/listing.md`, checked against the code) or one the
   code on main does, read from where the app itself says it (the Pro list,
   the prices); the table under "Words" names each source.

## The pages

| Address    | Page             | What it holds                                                                                                                                     |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`        | Home             | The welcome's photographs and promise with the badge; Home's session screen; the three sports; Social; Pro; the foot                              |
| `/lifting` | Lifting          | The plan, a session that starts from the last, short and sore-joint options with the drawn guides, the record of it all                           |
| `/running` | Running          | Race plans from 5K to marathon and the next run, the run itself, sharing a run with its ends hidden                                               |
| `/food`    | Food             | The target, logging by typing, search or barcode, photo logging with Pro and where the photo goes, water and weight                               |
| `/social`  | Social           | Circles and meet-ups, challenges and medals, the weekly league and its tiers, Spaces, who sees what                                               |
| `/pro`     | Pro              | What Pro adds, what stays free, the price as the app states it, four questions                                                                    |
| `/about`   | About            | What Tropos is for, how it treats you, who runs it                                                                                                |
| `/press`   | Press kit        | The facts, a paragraph to quote, the logo and icon files, the brand colours, the app screens                                                      |
| `/support` | Support          | The app's own page (`src/pages/Support.tsx`), in the site's header and footer                                                                     |
| `/privacy` | Privacy Policy   | The app's own page, the same                                                                                                                      |
| `/terms`   | Terms of Service | The app's own page, the same                                                                                                                      |
| any other  | Home, or the 404 | One of the app's own addresses (a widget's tap, an old web-app link, `/space/…`, `/upgrade`) is Home; anything else is the 404, with a 404 status |

**One page each for Lifting, Running and Food, not sections of Home (Tropos
decision).** Each sport has more than a section's worth that is true and
worth saying, each is a search a person makes on its own ("lifting plan app",
"5K plan", "calorie target"), and Runna, Hevy and Strava give theirs pages.
Home carries a card for each that opens its page.

**Food and Social share their addresses with the app's tabs.** `/food` and
`/social` were the web app's Food and Social. On troposfit.com they are now
the website's Food and Social pages, which is also what the food widget's
`/food?from=widget` shows in a browser (on an iPhone with Tropos the widget
opens the app, as before).

**Support, Privacy and Terms are the app's own pages** in the site's header
and footer, as the App Store listing links them. The Support page loses an em
dash and its line about using "the app or the website", now that there is
no web app on troposfit.com.

### Home

- **Hero.** On a phone, the welcome itself: one photograph at a time, filling
  the screen and fading to the next (`WelcomePhotos`, unchanged), the lockup
  at the top and the words at the foot. From 768 px the photographs stand side
  by side across the width (three, then all five from 1200 px), still and
  full height: a 9:19.5 photograph stretched across a laptop would show a band
  of someone's chest (Tropos decision). Kicker "For iPhone"; headline "Your
  training and food, planned together"; "Tell Tropos your goal and the days
  you can train. It plans your lifting and running week and works out a daily
  calorie target to match."; the badge; "Free to download. Pro is optional."
- **Know what today is for.** Home's session screen (Push A, its drawing, the
  week) beside "Home opens on today's session: its name, the muscles it works,
  about how long it takes and one button to start. Under it, your week so
  far." and three lines: 2 to 6 lift sessions a week on the days you choose;
  runs planned around your lifts, from easy to long; miss a lift and it waits
  for your next lift day.
- **Lifting, running and food in one plan.** Three cards, each the sport's
  drawing in its own light with its kicker in the sport's colour (purple,
  coral, orange) and one line, opening its page.
- **Train with the people you know.** A weekly challenge's board beside three
  lines on props, Circles, and challenges and the league "once 10 people
  train on Tropos", and a link to Social.
- **Tropos Pro.** "What Pro adds", what stays free, and the first four lines
  of the Pro list, linking to Pro.
- **The foot.** "Plan your first week in the app", Get the app, and a QR code
  on a wide screen.

An address that brought the visitor adds its line to the hero, as #3375's page
did: a friend's invite (who sent it, the code, Copy invite code), a shared
Space ("Get Tropos on your iPhone to open this Space.") and the checkout's
return ("Payment received. Pro is on for your account in the Tropos app.").

### Lifting, Running and Food

Each opens on its hero: the kicker in the sport's colour, the headline, one or
two sentences and the badge, beside the app's own drawing of the sport in one
soft light of its colour (DESIGN_GUIDE §14o): the overhead press, which faces
you (§14p), and the sprinting runner. Food's hero is its app screen in the
orange light, because its drawings are 192 px squares that would blur at a
hero's size. On a phone the picture comes first and gives up its lower part so
the badge stays in the first screen.

Then three or four blocks, each a headline a person would say out loud, two
sentences, a short list and one picture (an app screen or the app's
drawings), alternating sides on a wide screen. The headlines:

- **Lifting:** "Strength sessions built around your week"; "Every session
  starts from your last" (a lift day's exercises); "Short on time, or
  working around a sore joint" (six drawn form guides); "See it add up"
  (words only: the one recent capture of Analytics shows its Badges tab,
  which Trim1 call 3(c) has since moved to the profile).
- **Running:** "From your first 5K to a marathon"; "Your next run, already
  planned" (Train's next run and the race plan, with the four race chips and
  "5K and 10K plans are free. Plans for a half marathon or longer are part of
  Pro after their first week."); "Every run, measured" (the running drawing,
  with segments timed against the people you follow); "Share the run, keep
  your front door private".
- **Food:** "Eat for the plan you're on"; "Log it the way you'd say it" (the
  food drawings); "A photo of the meal, with Pro" (where the photo goes);
  "Water and weight on Home".

Each page ends on the foot, with "Next: running" (and so on) beside Get the
app, so a visitor can read the sports in turn.

### Social

People first, as Strava orders it: the hero is the welcome's photograph of
three women running together (Soc16 allows photographs of communities). Then
Circles, challenges and medals (the challenge board and one challenge's three
medals, `public/medals/`), the weekly league with its five tiers drawn by the
app's own `TierBadge`, Spaces, and who sees what. It says plainly that
challenges, the league and Spaces open once at least 10 people are training
on Tropos (App1 Q6, `enoughPeople.ts`), beside each of those claims, and
that Circles, the feed and following work from the first day: a page
promising a busy league to the first hundred people would be showing an
empty room as a full one.

### Pro

"What Pro adds", with the Pro page's own list (`PRO_INCLUDES`, seven lines),
the free line (`FREE_KEEPS`) and the price card: "7 days free, then £34.99 a
year", "Or £3.99 a month. The App Store shows the price in your own
currency.", and the renewal terms the iPhone paywall shows. Every figure is
read from `proPlans.ts`, so the site cannot drift from the app. Four
questions, answered from the same sources: do I need Pro, how the trial
works, how to cancel, and "Can I buy Pro on this website? Not yet. Pro is
sold in the Tropos app, through the App Store." (Q77 is open; the website
does not sell, #3375's option 4).

### About

"One plan for lifting, running and food": why one plan, four ways Tropos
treats people (your numbers against your own; meal photos are stored only on
your phone; no adverts and your data is not sold; a missed day is just a
day), each true
of the app and said in its own terms, and "Tropos is operated by Myles
Kennedy", the operator the Terms name, with the support address.

### Press kit

MacroFactor's shape: the facts (name, what it is, iPhone and iOS 15.4 or
later, category, price, website, press contact), a short and a long
paragraph in the listing's words, the logo files one by one (the lockup in
white and in ink as transparent PNGs, the mark as SVG, the app icon as SVG
and a 1024 px PNG), the three brand colours with their meanings, and the six
app screens. The welcome's photographs are not offered: their Unsplash+
licence is Tropos's, not a publication's.

### The 404

The welcome's photographs, "There's no page at this address", "The link may
be old or mistyped. Tropos is an iPhone app, and this site says what it
does.", the six pages as pills and the badge. It is a real 404: Hosting
serves it as `404.html` with a 404 status for any address that is neither a
page nor one of the app's own (below), and it carries `noindex`.

### Captures

Each page in `captures/`, as `<page>-393.webp` (393 px wide at 2x, a phone)
and `<page>-1440.webp` (1440 px at 1x), full length: `home`, `lifting`,
`running`, `food`, `social`, `pro`, `about`, `press`, `support`, `privacy`
(its 393 px capture in two parts, past WebP's size limit), `terms` and
`404`. They are the build PR's code, served with firebase.json's rules,
with Reduce Motion on so the welcome's photographs hold still.

## The look

- **Dark, as the signed-out app is** (§14p): the page `#0E0E11`, cards
  `#17171B` with their lit edge (`card-shadow`, §14o), the app's tokens and its
  two faces, Plus Jakarta Sans for words and Archivo for the wordmark and the
  few figures.
- **The lockup** in the header and footer: the mark at 26 px in brand purple
  beside "Tropos" in Archivo 800 (§14p, DS8 call 3).
- **Type.** The app's scale on a phone: a page's headline at the hero size
  (36 px), a section's at the h1 size (31 px), body text at 17 px. On a wide
  screen 56, 40 and 19 px (Tropos decision: §0's 25 to 38 px is measured on
  phone screens, and on a 1440 px page 36 px reads as small print).
- **Colour on the sports, not on buttons.** Purple, coral and orange appear on
  kickers, ticks, the lights behind drawings and the drawings themselves.
  Every button is neutral (Get the app is white on dark, §14i), and no hue
  means anything other than its sport.
- **One light per hero**, behind the drawing or screen (§14o). No glass, no
  neon, no gradient across hues.
- **The column** is 72 rem wide at most, with the app's 16 px side margin on a
  phone and 32 px from 768 px; sections are 64 px apart on a phone and 96 px
  wide, with a hairline between them; cards have the app's 24 to 28 px
  radius.
- **The header** sits on the page (over Home's photographs, in the stage's
  fixed light colours): the lockup, Lifting, Running, Food, Social and Pro,
  and Get the app. Below 768 px the pages fold into a menu, a `<details>`,
  so it opens before any script has loaded. **The footer** has the lockup and
  one line, The app, Company and Legal, "© 2026 Tropos" and Apple's credit.
- **Touch targets** are 44 px or more everywhere (§10); every link and button
  has a visible focus ring.

### The App Store badge

Apple's own black "Download on the App Store" artwork (#3375's file,
unchanged), 48 px tall with a quarter of its height clear around it, under
each page's main message. **One per page** (Apple: "one App Store badge per
layout"): in the hero of every product page and the 404, and at the foot of
About and Press, whose heroes have none. The header's and the foot's "Get the
app" are plain buttons, not the badge. Apple's credit ("Apple and the Apple
logo are trademarks of Apple Inc. …") is given once, in the footer, where the
site gives its legal notices. `prerender.test.tsx` holds every page to one
badge.

**A QR code** beside the foot's button from 1024 px, as Nike Run Club's site
has, because a laptop is where the site is often read and the app is
iPhone-only. It opens the same listing (`src/website/art/app-store-qr.svg`,
made once and checked by decoding).

### App screens

Captures of the app as it runs from the capture rig, on the repo's seeded
demo accounts: every name and number on them is made up ("E2E Tester", "Maya
Chen", "Jordan Reyes"), as Apple asks ("fictional account information").
Each is shown as the screen itself with rounded corners and a lit edge, **with
no phone drawn around it**: Apple allows its device images only as it
supplies them, and forbids drawing or simulating one (Tropos decision, from
Apple's rules; research.md).

The rig could not run in the sandbox this was made in: its Firestore
emulator's download host (storage.googleapis.com) is blocked there. So the
screens are the most recent rig captures already on main, from 11 to 13
November 2026, cropped (`src/website/screens/README.md` names each source).
Home's session screen and Food's are the app as it is after DS4 and Food's
November rework; none shows a run's map, because none of the recent
captures does. **Follow-up:** a capture spec for the website's screens on the
season athlete (`app-store.capture.spec.ts`'s account), with a run's map,
once the rig can run.

## Words

The house voice (CODING_STANDARDS.md): observational, no exclamation marks, no
AI-tells ("unlock", "elevate", "journey"), sentence-case buttons of a verb and
its object, the person as the one who trains, ’ for an apostrophe. Headlines
are sentences a person would say. `prerender.test.tsx` checks every page's
text for exclamation marks, em dashes, straight apostrophes and the banned
words; `copyMechanics.test.ts` already reads every string in `src/`.

Where each claim comes from:

| Claim on the site                                                                                                                                                                                             | Source on main                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2 to 6 sessions, the three splits, starting weights from bodyweight, kg or lb, progression, warm-ups, rest timer, plate calculator, 45/30 min, the five limitations, over 150 drawn exercises, deloads, bests | App Store listing, Lifting                                               |
| A lift you miss waits for your next lift day                                                                                                                                                                  | ADR-0002, `layOutWeek.ts`                                                |
| Race plans 5K to marathon from race day, base, build, taper; run types; spoken splits and pace alerts; adjust a week; routes; paces; predictions; shoes; hiding the ends                                      | App Store listing, Running                                               |
| Half marathon and longer are Pro after the first week; 5K and 10K free                                                                                                                                        | `FREE_KEEPS`, `PRO_INCLUDES`                                             |
| Privacy zones; segments against the people you follow                                                                                                                                                         | `privacyZones.ts`; Run26 call 3                                          |
| The calorie target's inputs; typing, search, barcode; usual breakfast in one tap; water and weight trend                                                                                                      | App Store listing, Food                                                  |
| Photo logging, 100 scans a day; asked before sending; read by Google's Gemini; kept on the phone                                                                                                              | `PRO_INCLUDES`, `DAILY_AI_LIMITS`, Food9, `aiConsent.ts`, Privacy Policy |
| Circles of up to 8; meet-ups, weekly repeats, pace groups, the reminder about a day before                                                                                                                    | `GOAL_SPACE_MAX_MEMBERS`; Run26 call 4; Run27 call 10                    |
| Weekly, monthly and seasonal challenges; medals and the trophy case                                                                                                                                           | App Store listing; Soc15                                                 |
| The league: opt-in, about 20, points out of 100 for your plan, five tiers                                                                                                                                     | Soc15 call 3, `leagueRules.ts`                                           |
| Leagues, challenges and Spaces wait for 10 people                                                                                                                                                             | App1 Q6, `enoughPeople.ts`                                               |
| Approve followers; followers or everyone; block and report                                                                                                                                                    | Polish2; `shareComposer.ts`; S4                                          |
| Pro's list, what stays free, £3.99 a month, £34.99 a year, the 7-day trial, renewal terms                                                                                                                     | `proIncludesCopy.ts`, `proPlans.ts`                                      |
| No adverts, data not sold                                                                                                                                                                                     | Privacy Policy                                                           |
| A planned rest day keeps the streak                                                                                                                                                                           | App1 Q32, `restDays.ts`                                                  |
| iOS 15.4 or later                                                                                                                                                                                             | `IPHONEOS_DEPLOYMENT_TARGET`                                             |
| Operated by Myles Kennedy                                                                                                                                                                                     | Terms of Service, section 12                                             |

Left out on purpose, though on main: Live Activities and widgets (built, but
not yet seen on a phone; the backlog's device rows hold them). Not claimed
because not built: live heart rate during a run and Apple Watch (Pro's
readiness from sleep and heart rate in Apple Health is claimed, in Pro's own
words). Ratings, user counts and press quotes: there are none yet.

## How it is built

- **React, drawn at build time.** The pages are React components in
  `src/website/`, so they share the app's tokens, components and copy. After
  the Hosting build, `scripts/website/prerender.ts` renders each page on the
  server and writes it into its own HTML with its own title, description,
  canonical address and preview tags: Home over `index.html`, the rest as
  `<page>/index.html`. A visitor's first screen is the HTML; the script then
  takes it over (`hydrateRoot`) and moves between pages without a reload.
- **Addresses without a trailing slash.** firebase.json gains
  `"trailingSlash": false`, so Hosting serves `/lifting` from
  `lifting/index.html` and sends `/lifting/` there (checked on the Hosting
  emulator). Without it, `/privacy`, the App Store listing's address, would
  answer with a redirect to `/privacy/`. Nothing else in firebase.json
  changes; its security headers stay as they are.
- **The app's own addresses get Home; nothing else does.** firebase.json's
  last rewrite was `**` to `index.html`. It becomes one `regex` rewrite of
  the app's route prefixes (`/settings`, `/space`, `/upgrade`, `/program`
  and the rest, from `APP_ADDRESS_PREFIXES`, which a test holds to
  `src/App.tsx`'s routes and another to firebase.json), so a shared Space, a
  widget's tap or an old web-app link still answers with Home and its line,
  and anything else gets the real 404. A shared post's page
  (`publicPostPage`, unchanged) is Home's HTML with the post's data; Home's
  drawing stays hidden there until the post's own page replaces it.
  Checked on the Hosting emulator: it does not let `/settings/**` match
  `/settings`, which is why the rule is a regex.
- **Home's HTML keeps no canonical address (Tropos decision).** It is
  also the page `publicPostPage` fills with a post, and that function
  removes the page's preview tags but not a canonical link, so a canonical
  written into Home's HTML would tell search engines every shared post is
  Home. In the browser, Home at any other address names the front page as
  its canonical copy, and `/upgrade` and `/settings/…` ask not to be
  indexed (#3375's `landingHead`).
- **Only what the website uses ships.** From the app's `public/` folder,
  the icons, the static legal pages and the few drawings the pages draw
  (`WEBSITE_PUBLIC_ART`; `prerender.test.tsx` holds every picture a page
  names to that list). #3375 serves a worker at `sw.js` that clears the old
  web app's caches and unregisters, so a browser that used the app here
  gets the website.
- **No new SDK or tracker.** The website has no analytics: the app's Firebase
  Analytics runs behind the consent the signed-in app asks for, and the
  website has no account to ask. It loads no third-party script; its policy
  is #3375's (`script-src 'self'`).
- **sitemap.xml and robots.txt** list the eleven pages and allow everything; a
  shared post stays readable, because link previews are fetched by crawlers
  that obey robots.txt. **Preview pictures** (1200 x 630) for Home and each
  product page are drawn by `scripts/website/renderOgImages.ts` from the
  site's own pictures.
- **No Firebase in the website.** The Pro list's scan limit moved into
  `src/lib/dailyAiLimits.ts` (re-exported from `subscription.ts`, so nothing
  else changes), because reading it from `subscription.ts` pulled the whole
  Firebase SDK into the website.

## Performance and access

Lighthouse 12, mobile (its default throttling), on the Hosting build served
with Hosting's compression (`scripts/website/serveHosting.ts`):

| Page    | Performance | Accessibility | Best practices | SEO |
| ------- | ----------- | ------------- | -------------- | --- |
| Home    | 98          | 100           | 100            | 100 |
| Lifting | 96          | 100           | 100            | 100 |
| Running | 97          | 100           | 100            | 100 |
| Food    | 98          | 100           | 100            | 100 |
| Social  | 93          | 100           | 100            | 100 |
| Pro     | 98          | 100           | 100            | 100 |
| About   | 98          | 100           | 100            | 100 |

The first screen is HTML and one stylesheet; each later page's script is
fetched when its address opens. Social's hero photograph (the welcome's
1080 px file, 199 KB) is its slowest picture; a smaller copy for the
website is a possible follow-up.

## Owner steps

None to deploy it beyond the usual release. Because firebase.json changes,
that release also runs the backend chain (Firestore, Storage, Functions)
before Hosting, as any firebase.json change does. After it, the App Store
listing's **Marketing URL** can be `https://troposfit.com` (listing.md leaves
it empty "until troposfit.com has a home page of its own").
