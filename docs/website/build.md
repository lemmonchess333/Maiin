# troposfit.com: the website's design

troposfit.com is Tropos's marketing website: one promise, the app shown
doing real things, and every page ending at the App Store. It shows the
website and not the app (App1 Q52, owner 15 November 2026); the browser
app stays on the GitHub Pages preview. This document is the design: the
pages, their words, the look, how it is built, and the calls made on the
way. The research behind it is [research-build.md](./research-build.md); the captures
are in [captures-build/](./captures-build/), every page at 393 px and 1440 px.

It builds on draft PR #3375, which made the Hosting build a page of its
own (`website.html`, `src/website/`) and keeps every address troposfit.com
ever handed out answering. Every one still answers; a few now answer with
a better page (the table under Addresses).

## The pages

| Page             | Address           | Headline                                 | Captures                                                                                               |
| ---------------- | ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Home             | `/`               | Your training and food, planned together | [393](./captures-build/home-393.webp), [1440](./captures-build/home-1440.webp)                         |
| Lifting          | `/lifting`        | A lifting plan for the days you have     | [393](./captures-build/lifting-393.webp), [1440](./captures-build/lifting-1440.webp)                   |
| Running          | `/running`        | Runs and race plans that fit your week   | [393](./captures-build/running-393.webp), [1440](./captures-build/running-1440.webp)                   |
| Food             | `/food`           | Log food the way you’d say it            | [393](./captures-build/food-393.webp), [1440](./captures-build/food-1440.webp)                         |
| Social           | `/social`         | Train alongside your people              | [393](./captures-build/social-393.webp), [1440](./captures-build/social-1440.webp)                     |
| Pro              | `/pro`            | What Pro adds                            | [393](./captures-build/pro-393.webp), [1440](./captures-build/pro-1440.webp)                           |
| About            | `/about`          | One plan for lifting, running and food   | [393](./captures-build/about-393.webp), [1440](./captures-build/about-1440.webp)                       |
| Press kit        | `/press`          | Press kit                                | [393](./captures-build/press-393.webp), [1440](./captures-build/press-1440.webp)                       |
| Support          | `/support`        | Support (the app's page)                 | [393](./captures-build/support-393.webp), [1440](./captures-build/support-1440.webp)                   |
| Privacy Policy   | `/privacy`        | Privacy Policy (the app's page)          | [393](./captures-build/privacy-top-393.webp), [1440](./captures-build/privacy-top-1440.webp) (the top) |
| Terms of Service | `/terms`          | Terms of Service (the app's page)        | [393](./captures-build/terms-top-393.webp), [1440](./captures-build/terms-top-1440.webp) (the top)     |
| Not found        | any other address | This page isn’t here                     | [393](./captures-build/404-393.webp), [1440](./captures-build/404-1440.webp)                           |

The home page as an invite's link draws it (the code to copy):
[393](./captures-build/home-invite-top-393.webp),
[1440](./captures-build/home-invite-top-1440.webp).

Lifting, Running and Food are a page each rather than sections of Home
(a Tropos decision): each answers its own search ("lifting plan app",
"half marathon plan") with its own title and preview, as Hevy's and
Runna's do, and Home stays one screen of promise and a few of proof.

## What every page has

- **The header**: the lockup (DS8 call 3), the five sections (Lifting,
  Running, Food, Social, Pro), and "Get the app", a plain link to the App
  Store. On a phone the sections fold into a menu, a native disclosure
  that opens without script. The header floats over the page with a
  frosted ground and a lit rim (§14o allows glass on what floats), solid
  under Reduce Transparency or where blur is missing. On the home page,
  on a phone, it lies clear over the photographs, as the welcome's lockup
  does.
- **Apple's badge, once.** Apple's own black "Download on the App Store"
  SVG, unchanged (#3375's `AppStoreBadge`), 48 px tall with a quarter of
  its height clear around it. Apple asks for "one App Store badge per
  layout", in "a subordinate position to the image or main message", so
  a page carries it once: Home in its opening, under the headline, and
  every other page in its closing band. The header's "Get the app" and
  Home's closing "Get Tropos on the App Store" are links, not the badge.
- **The closing band**: a heading about what the first minutes give you,
  a line, and the badge. Every page ends at the App Store.
- **Safari's Smart App Banner** on every page but the home page (Calls
  made, 6).
- **The footer**: the sections, About, Press kit and Support, the Privacy
  Policy and Terms, "Tropos is run by Myles Kennedy, trading as Tropos"
  (the Privacy Policy's words), and Apple's trademark credit, which its
  guidelines ask for wherever the badge is used.

## Page by page

### Home

1. **The opening.** On a phone it is the welcome (§14p): the five
   photographs fill the screen and fade from one to the next every 4.5 s,
   the words sit at the foot on their own dark ground, then the badge. It
   stops 72 px short of the screen's foot so the next heading shows the
   page goes on. On a wide window the words take the left of the column
   and the photographs stand in a tall panel on the right, because each is
   cut 9:19.5 for a phone and would lose the face across a wide screen,
   with Home's own screen (today's Full Body A) standing in front of the
   panel's edge, so the first screen holds the promise, the people and the
   app. The photographs play once through and rest on the first: a website
   cannot offer a pause, and WCAG 2.2.2 asks that motion lasting more than
   five seconds can be paused or stops. The words are the welcome's:
   "Your training and food, planned together" and "Answer a few questions
   and get a week of training and a daily calorie target that fit you.
   Tropos is an iPhone app."
2. **What a training day looks like.** Three real screens in a row (on a
   phone, a row that scrolls sideways): Home with today's session, a
   workout part-way through, and Food against the day's target. Each has a
   two-to-three word heading and one sentence.
3. **Lifting and running in one week**, beside a race plan's week on
   Train: what setup asks, that lifts go in order so a missed day moves
   the next one along, and that Adjust this week keeps the race date.
4. **Lifting, running and food**: three cards, each with the app's own
   drawing in its section's light (the bench press, the runner, a plate),
   a line with a number, and a link to the page.
5. **Your week, reviewed**, beside the weekly review: what it counts, that
   it ends on the week ahead, and the performance score on Progress.
6. **Train alongside other people**, beside the feed, and a link to Social.
7. **What's free and what Pro adds**: the app's own "Free keeps" sentence
   and the three things Pro is for, with a link to Pro.
8. **Your first week, planned in a few minutes**, and a link to the App
   Store.

When React draws the home page for an address (below), the opening also
carries that address's line: a friend's invite and the code to copy, or
"Get Tropos on your iPhone to open this Space." These are #3375's,
unchanged. #3375's "Payment received." line moved with `/upgrade` to the
Pro page.

### Lifting (purple)

The opening: "A lifting plan for the days you have", "2 to 6 sessions a
week, split to suit your days. Each session starts from what you lifted
last time.", beside Home's lift. A row of four numbers: 2 to 6 sessions a
week, over 150 exercises each with a drawn guide, 45 or 30 minute
versions, 5 sore spots worked around. Then: Split to suit your week (the
split from the day count: full body on 2 or 3, upper and lower on 4,
push, pull and legs on 5 or 6), Every set arrives filled in, A drawing
for every exercise (eight of the drawn guides), four cards for a short
day or a sore one (Short on time?, Easier today, a lighter week, around a
sore spot), and New bests marked as you lift (the finish screen's new
best). Closing: "Get a lifting plan for your week".

### Running (coral)

The opening: "Runs and race plans that fit your week", beside a saved
long run on its pace-coloured map. Numbers: race plans from 5K to 100K,
road and trail; 4 kinds of run; 200 m hidden at each end of a shared run;
400 m, the shortest segment. Then: Every run, mapped (with the new-best
finish), Race plans built back from race day (and that a half marathon or
longer is Pro after its first week, in the app's own words), and four
cards: When you need an easier week (Adjust this week), Paces from your
own times (a recent race time at setup sets them; with Pro they get
faster as your runs show you're fitter, `paceUpdateAccess.ts`), Segments
with the people you follow ("There's no board of everyone"), Hide where
your runs start. Closing: "Plan your next race".

### Food (orange)

The opening: "Log food the way you’d say it", beside Food's ring. Then:
Type it, search it or scan it ("2 eggs on toast", the app's own example;
barcode scanning is free; the Log again list), two cards (A target from
your numbers, Weight without the swings), and a Pro card, "Log a meal
from a photo": up to the server's 100 a day, that Tropos asks before the
first photo is sent, and that "photos are read by Google and kept only on
your phone" (Food9 asks both halves to be said), then the adapting target
and macros. Closing: "Get your daily target".

### Social

The opening: "Train alongside your people", beside the feed. Then: A
league scored on your own plan, beside the Together tab's league card
("so a three-day week can win", the app's words, and the five tiers), and
in the same section, at body size, that leagues, challenges and Spaces
appear once enough people are training on Tropos (`enoughPeople.ts`), so
the page does not promise a first-day visitor what the app holds back.
Then four cards: Props and comments, A Circle of up to 8 (meet-ups in
each member's own time, weekly repeats, pace groups, the reminder a day
before), A Space for your race (and the week's totals once five members
trained), You choose who sees what. Then Challenges with medals (three
medals, the app's art, and the monthly community goal). Closing: "Train
with people you know".

### Pro

"What Pro adds": "Pro keeps your calorie target, macros and running paces
up to date as you log, weigh in and run, and adds logging a meal from a
photo.", then the app's own Pro list (`PRO_INCLUDES`), beside the plan
picker. Then What it costs: `getInlinePriceSummary(PRO_PLANS)` in the
figure face, "7 days free on either plan, then…", the iPhone paywall's
renewal terms (`getRenewalTerms("ios")`), that the trial is for new
subscribers, and "Prices are the UK’s. The App Store shows the price where
you are." Three questions: can I buy Pro on this website (no; in the app,
through the App Store), how do I cancel, what happens to my plan if Pro
ends (the app's "Free keeps…" sentence, `FREE_KEEPS`). Every line is read
from the app's code, so the website cannot show a different price or
list. It is also the page at `/upgrade`, with "Payment received." when
the checkout returns there. Closing: "Try Pro free for 7 days".

### About

"One plan for lifting, running and food": what Tropos is for, who runs it
(the Privacy Policy's words) and how to write. What Tropos holds to, each
true of the app today: no ads (and no data sold or used for advertising,
the Privacy Policy), meal photos stay on your phone, you choose who sees
what, nothing to buy to save a streak (`StreakSheet`'s "no freezes,
shields or tokens"). With thanks to: OpenStreetMap through OpenFreeMap,
MET Norway, Open Food Facts, and Unsplash+ for the photographs.

### Press kit

Tropos in a paragraph; the facts (iPhone, iOS 15.4 or later, the prices,
Health & Fitness, who runs it, the contact); the app icon (PNG, 1024 px)
and the mark in purple and white (SVG, drawn from `brandMark.ts`); six
screens of the app at full size (1320 by 2868), said to be demo accounts;
the colours (read from `THEME`) and the two typefaces. The welcome
photographs are not in the kit: they are licensed to Tropos for its own
use.

### Support, Privacy Policy, Terms of Service

The app's own pages, word for word, inside the website's header and
footer. Their Back button is hidden on the website (a `showBack` prop the
app leaves on), since the header and the browser already do its job.

### Not found

"This page isn’t here", "The address may be old or mistyped. Tropos
itself is an iPhone app.", the home page and the five sections, and the
closing band. It asks search engines not to list it.

## Addresses

Every address #3375 keeps still answers. These change, by design:

| Address                                        | Before (#3375)                               | Now                                                                                        |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/food`, `/food?from=widget`                   | the App Store page                           | the Food page (a widget's tap is still handed to the app by iOS)                           |
| `/social`                                      | the App Store page                           | the Social page                                                                            |
| `/upgrade`, `/upgrade?checkout=success`        | the App Store page, with "Payment received." | the Pro page, with "Payment received." (someone following an upgrade link wants the price) |
| `/lifting/` and any page with a slash          | the App Store page                           | a redirect to the page without it                                                          |
| an address the app never had (`/no-such-page`) | the App Store page, status 200               | Not found, status 404                                                                      |

An address the app answered (every `path=` in `src/App.tsx`:
`/settings/account`, `/program`, `/history`, `/space/…`) still lands on
the home page, the App Store page, because it was handed out or
bookmarked while troposfit.com served the app. firebase.json names them
in one rewrite, `/@(admin|dev|…|workout){,/**}` to `/index.html` (the
extglob and braces are the form Firebase's docs give; `/foo/**` alone
does not take `/foo`, which the Hosting emulator confirms), in place of
#3375's catch-all `**`, so anything else is a real 404 with the missing
page. `APP_ADDRESS_ROOTS` in `websiteAddress.ts` lists the roots, and
`websiteAddresses.test.tsx` holds it to `App.tsx` and to the rewrite.

## How it is built

- **Each page is a file of its own.** `npm run build:hosting` builds
  `website.html` as before, then `scripts/website/prerender.ts` draws every
  page with React on the server (`src/website/prerender.ts`, built by Vite
  so a picture has the same address in both builds) and writes it with
  its own title, description, canonical address and preview into
  `dist/<page>/index.html`. firebase.json gains `"trailingSlash": false`,
  so Hosting serves `/lifting` from `lifting/index.html` with no redirect
  (checked against the Hosting emulator). It also writes `sitemap.xml`,
  `robots.txt`, `404.html`, the preview pictures (`/og/`) and the press
  kit's files (`/press-kit/`).
- **A written page loads no framework.** `main.tsx` is 7 kB: on a page
  written for its address it only starts the home page's photo fade, a
  few lines of plain script. React is fetched only to draw what no file
  holds: an invite's code, a Space's line, the checkout's return, a shared
  post (`publicPostPage` still answers with the home page's file and its
  data block), and Not found.
- **The home page's file also answers the app's old addresses and a
  shared post** (`publicPostPage` fetches `/index.html`), so it names no
  canonical address and carries no Smart App Banner: the function swaps
  the description and preview tags for a post's own but leaves the rest
  of the head, so a canonical there would claim every post for the home
  page, and a second banner would sit beside the post's own. Changing
  that is a functions change, out of this work. Every other page has both.
- **Only what the website uses ships.** #3375's review left the Hosting
  build with `public/icons` and `public/legal` alone (`websiteEntry.ts`)
  and a worker that retires the app's at `sw.js`; the build copies in by
  name the few drawings the pages show (`SITE_ART_FILES`,
  `src/website/site/art.ts`).
- **Pictures**: the photographs load one at a time (the first with the
  page, the rest after it has drawn, none under Reduce Motion); the app's
  screens are WebP at 660 px wide, 27 to 56 kB each, and load as they
  near the screen.

## The look

- **Dark, as the signed-out app is** (§14p): the page `#0E0E11`, cards
  `#17171B` with the lit edge (`card-shadow`, §14o), text `#F4F4F6`.
- **The app's two faces**: Plus Jakarta Sans for words, Archivo for the
  figures (the number rows, the price) and the name.
- **Type**: a page's headline is 34 px on a phone and 56 to 60 px on a
  wide window, its section headings 28 and 40 px, body 17 px. The
  headline is each page's largest text (§14m rule 2). Display sizes stay
  in the app's reward screens, which the site shows as screens.
- **Colour on the pictures, not the chrome.** Each section's colour is a
  small kicker over its headline and one soft light behind its picture
  (§14o): purple for Lifting, Pro and Social, coral for Running, orange
  for Food. Buttons are neutral (white on dark, §14i); the badge is
  Apple's black.
- **Pictures are ours or the welcome's**: real app screens from the
  capture rig on demo accounts (never a real person's), the app's drawn
  exercise guides, food drawings and medals, and on the home page only,
  the welcome's five photographs. No other stock art of people.
- **No drawn phone.** Apple's guidelines allow only Apple's own bezels and
  never "graphics, illustrations, or logotypes to represent an Apple
  product", so a screen stands alone with its corners rounded.
- **Layout**: a 70 rem column (1120 px) with 16 px margins on a phone and
  32 px on a wide one; a section is a heading, two short paragraphs and
  its picture, picture left and right in turn on a wide window and under
  the words on a phone.

## Words

CODING_STANDARDS' house voice: observational, no exclamation marks, no
"unlock", "elevate" or "seamless", sentence case, one spelling
(programme), ’ for an apostrophe, and a number in a line where there is
one ("2 to 6 sessions a week", "up to 100 a day"). Every claim is on
main, checked against the code on 18 November 2026, and the ones that
could drift are read from the code: the Pro list and Free sentence, the
prices and trial, the AI cap, the brand colours. The app's own names are
used as the app shows them: Short on time?, Easier today, lighter week,
Adjust this week, Make a segment, Approve followers, Log again.

## Search, sharing and speed

- Each page has its own title (two to four words, then "· Tropos"),
  description, canonical address and Open Graph and Twitter tags with a
  1200 by 630 preview (`scripts/website/og-images.ts` draws them from the
  page's headline and picture).
- `sitemap.xml` lists the eleven pages; `robots.txt` points to it and
  keeps crawlers out of Hosting's `/__/`.
- No analytics. The website carries no Firebase SDK (#3375), and the
  consent the app asks for is asked inside the app, so a website visitor
  has given none. Adding analytics would add an SDK and a consent of its
  own; it is left for the owner (below).
- The security headers in firebase.json are unchanged, and the page's own
  policy (#3375's) needs no new host: everything is served from
  troposfit.com.

## Checks

- `scripts/website/check-site.ts` serves the Hosting build the way
  firebase.json says (`serveHosting.ts`, on #3375's `resolveHosting`) and
  opens every page and kept address at 393 and 1440 px in Chromium: the
  status, one headline and the right one, at most one badge, nothing wider
  than the screen, no error in the console. `--capture` saved this
  document's captures.
- Unit tests pin the pages' heads, the addresses, the app's routes
  against `APP_ADDRESS_ROOTS`, and that each page's figures come from the
  app's code.

## Calls made (Tropos decisions)

Each was decided with the advisor (Claude Fable) after its review of the
first captures; the review's other findings were fixed in the build.

1. **A page each for Lifting, Running and Food**, not sections of Home:
   each answers its own search with its own title and preview. Kept on the
   advisor's condition that no page runs on text alone, so a run of things
   with no screen of their own is a grid of cards.
2. **`/upgrade` opens the Pro page** (#3375 sent it to the App Store
   page), with "Payment received." when the checkout returns: someone
   following an upgrade link wants the price, and the home page has none.
3. **Social says that leagues, challenges and Spaces appear once enough
   people train**, in the league's own section at body size, beside the
   screen that shows "Join the league".
4. **No analytics.** The site carries no SDK and no cookie, and the app's
   consent is asked in the app. App Store campaign links (`ct=` per page)
   would count installs by page with neither, once App Store Connect's
   provider token is to hand (below).
5. **One badge a page**: Home's in its opening, under the headline, and a
   plain "Get Tropos on the App Store" button at its close; every other
   page's in its closing band.
6. **Safari's Smart App Banner** (Apple's own, no tracker) on every page
   but the home page, whose file a shared post's page shares.
7. **A real 404**: named rewrites in place of the catch-all.
8. **The site's buttons are neutral** (white on dark, §14i), where the
   app's signed-out "Get started" is filled purple (§14p): the site's way
   on is Apple's black badge, and a purple button beside it would be a
   second call to action in a second colour.
9. **Screens are cut at the tab bar's foot**, so no row peeks from under
   it, and the review is cut above its last line ("Load has run high…",
   which the measured rules would word as "You trained more than your
   usual week"; the app's string is left for its own pass). The Circle
   and Space screens were left out: the seeded Circle is a tester's, and
   a Space's cover is a photograph of people, which the brief allows only
   on the home page.

## For the owner

- **The App Store's Marketing URL** (`docs/app-store/listing.md`, "Leave
  it empty until troposfit.com has a home page of its own"): once this is
  live, it can be `https://troposfit.com`.
- **Google Search Console**: add troposfit.com and submit its sitemap.
- **Counting installs by page**, if wanted: App Store Connect's campaign
  links need its provider token (`pt=`), which only the account holder
  can read. With it, each page's badge can carry its own `ct=`.
- **A QR code beside the badge on a wide window**, for a desktop visitor
  who cannot install from the page (Nike Run Club's): not built, since
  drawing one needs a new dependency or Apple's own generator.
- **After the deploy**: the backlog's section "troposfit.com, the
  website" lists what only the live site can confirm, the trailing-slash
  redirect and the real 404 among them.
