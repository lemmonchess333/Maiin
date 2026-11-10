---
name: screen-critique
description: >
  Critique one Tropos screen the way Together was critiqued (Soc16): what a
  person comes to it for, measured against DESIGN_GUIDE §14m with the screen
  scorer, set beside the reference apps doing the same job, traced to its
  cause in the code, checked for a new account and for words that contradict
  the state, then a self-grill and a cheapest-first list of fixes for the
  owner to call. Use when the owner says a screen "feels off", "disjointed",
  "flat", "vibe coded", asks why a screen doesn't work, or asks for a screen
  or the main screens to be reviewed.
---

# Screen critique

The Together critique (Soc16, 2026-11-10) worked because it started from the
owner's own words and screenshots, asked what the screen is *for* before how
it looks, counted the measured rules instead of describing a feeling, looked
at what Strava and Nike Run Club put on the same screen, found the cause in
how the code was laid out, and looked at the page as a new account sees it.
This skill makes those six steps the same every time.

It writes a critique, not code. The owner calls each fix; a call that
changes the design is locked (`lock-decision`) before it is built.

## 0. Before you start

- Read `DESIGN_GUIDE.md` §0, §14m (the measured rules, numbered 1–44) and the
  dated §14 entries for this screen. Read `.claude/plans/programme-run-followups.md`
  rows that name it. A critique that re-decides a lock is wasted; if a fix
  reverses one, say so and name the row.
- Get the screen as it is now, not as an old capture shows it. Ask the owner
  for their screenshots if they have them, and capture it yourself either way.

## 1. Measure it

Score the main screens on the emulator rig (`docs/agents/capture-rig.md`
for the build, the env and the seed chain):

```bash
# inside: npx -y firebase-tools@15.34.0 emulators:exec --only auth,firestore \
#   --project demo-tropos "<the full seed chain> && npm run score:screens"
```

`screenshots/score/report.md` has a table per screen and theme: the hero's
share and top (rule 1), the largest text and whether the hero holds it
(rule 2), text sizes (7), colour share (9), hues and the leading hue's share
(11), chrome (17), filled buttons and coloured fills (21, 12), and rows with
a picture (25). The frames are beside it. To score a screen it does not
list, add it to `SCREENS` in `e2e/design-qa/screenScore.capture.spec.ts`.

The scorer is approximate (it picks "the hero" as the largest block). Open
each frame and check every ✗ by eye before you repeat it. A measured miss
you have looked at is a finding; an unread ✗ is not.

Capture three states, not one: a new account (the e2e user before its seeds
add history, or a freshly signed-up emulator account), a typical one (the
seeded e2e user) and a heavy one (`seed:rich`). Every new user lives in the
first state; CLAUDE.md's "design for the user base" applies.

## 2. Ask what the screen is for

One sentence: what does a person open this screen to find out or to do? Then
read the screen in that order. The usual root cause of "disjointed" is a
screen laid out by code module (a list that hosts other features as slots)
rather than by that question: name the component that composes the page and
show how its structure became the page's order.

## 3. Set it beside the apps that do the same job

Search Mobbin (`mcp__Mobbin__search_screens`) for the same screen in three
or more of the reference apps CLAUDE.md lists for the domain. Look at the
images; cite each as its `mobbin_url`. Say what they put first, what they
draw (own art, the person's data, photographs, and where), and what they
leave out. 3+ apps doing X invisibly means Tropos needs a reason to surface
X. Show Mobbin's usage notice verbatim when it comes back.

## 4. The new-account pass and the contradiction hunt

- Every count: what does it read at 0, 1 and 2? A count that only says the
  room is empty ("1 member", "1 so far") is a finding; the app's own floors
  are the plan group's 3, the pulse's 10, the Spaces directory's minimum.
- Every empty state: does it lead with the first action (rule 33), or a
  hexagon and a sentence (allowed only for no results and errors)?
- Every headline against the state under it: "You're in the league" over
  "Leagues open when 10 people have joined" is a contradiction a person
  feels as "something's wrong" without being able to say what.

## 5. Write the critique

In plain words, the owner's own complaints answered one by one, then:

1. **The root cause** in one paragraph (usually step 2's).
2. **What the rules measured** (step 1's misses you confirmed by eye), each
   with its number and the rule's limit.
3. **What the reference apps do** (step 3), with links.
4. **A self-grill:** the three or four strongest objections to your own
   fixes, each answered (the Together one asked "a race hero only works for
   people with a race?" and answered with a fallback ladder).
5. **Fixes, cheapest first,** each one sentence, each naming what it moves
   in the measures. Say which need the owner's call and which reverse a lock.
6. **What you could not check** (a state the seeds do not give, a device-only
   effect), so nothing reads as verified that was not.

Offer before-and-after mockups or captures for the larger fixes; a visual
change starts as one (DESIGN_GUIDE's header).

## 6. After the owner calls it

Lock the calls (`lock-decision`), build each screen as its own PR with
before-and-after captures from the rig, re-run `npm run score:screens` and
put the before and after tables in the PR, and add a device row to
`docs/qa/pre-launch-backlog.md` for anything only a phone shows.

## A sweep of every main screen

One critique per screen, in parallel, is a multi-agent workflow and costs
about one critique's worth of usage per screen. Run it only when the owner
asks for it ("use a workflow"); otherwise critique one screen at a time.
