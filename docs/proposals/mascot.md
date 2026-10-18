# A mascot for the first-visit guide and setup — proposal

Status: proposal, 2026-10-18. Not locked. If the owner agrees, it locks as
**FV3** and reverses FV1's call 1 (FV1 declined a character, "1C", on
2026-10-04, because it needed an illustrator, a set of poses and a change of
voice). FV1's row gets a STATUS line pointing here; its body stays as written.

The owner asked for a mascot "to help with onboarding and maybe some other
parts". ChatGPT draws the character. This file covers everything else: what
it is, where it goes, what it never does, the poses to draw, and the brief to
hand ChatGPT.

## The self-grill

Each question was decided in the order it depends on the last.

**Q1. Reverse FV1's "no character"?** Yes. FV1's first two reasons are gone:
ChatGPT draws, and the pose list below is fixed and short. The third reason,
a change of voice, is avoided by Q4. Reference apps: Duolingo's owl talks and
guilt-trips; Headspace's characters show a mood and never speak; Strava,
Hevy, Strong, MacroFactor, MyFitnessPal and Nike Run Club have none. Tropos
follows Headspace, not Duolingo. The Tropos-specific reason, for GLOSSARY.md:
the app plans lifting, running and food together, so a new account has more
to learn than in any one-sport app, and the owner wants that teaching to feel
friendly.

**Q2. What is it?** The Tropos mark, come alive. It is a soft, rounded
hexagon in brand purple. The chevron cut out of the logo becomes its face: two
small upward chevrons read as happy, closed eyes ("^ ^"). It has short,
simple arms, and legs only when a pose needs them. It is not a person, so it
never competes with the exercise figures. It is not an animal, so it never
leans towards one sport. Two more reasons:

- FV1's guide is already the mark lifting out of Home's header, so the
  mascot inherits that entrance: the mark in the header wakes up, opens its
  eyes and flies down to the guide card.
- A geometric character can be rebuilt as a few small SVGs. Each pose is a
  few kilobytes, it is recoloured by theme, and each part (eyes, arms) can
  move on its own. A painted animal would be a PNG per pose, heavier (the
  app just lost 12 MB of pictures), and ChatGPT keeps a character the same
  from pose to pose badly. The exercise-art redraw showed that.

**Q3. Does it speak?** No. It is never "I" and never "!". The words beside
it stay in the house voice (CODING_STANDARDS.md): second person, plain, and
observational. The mascot shows the mood with its pose; the text says the
thing. This keeps every word FV1 wrote, and its voice tests, unchanged.

**Q4. A name?** Not in the app at launch, because a character that never
speaks has no use for one there. Its working name in files and code is
`Tropo`. If the owner wants it named in the app or in marketing later, that
is a copy change, not a redesign.

**Q5. Where does it appear?** Only where the app is already teaching or
welcoming, never where the person is working. The phases are below. The rule
for anything not listed: no.

**Q6. Can it guilt anyone?** Never. It has no sad pose, no "you missed a
day", no disappointed face on a streak, and no begging on the Pro page. A
missed workout is still next on the plan (FV1's own words), and the mascot
has nothing to add to that.

**Q7. Can people turn it off?** No switch. Scarcity is the control: the walk
is once per account and skippable, each hint is once, and phase 2's moments
are rare. Reduce Motion stills every animation.

**Q8. Does it replace the logo?** No. The app icon, the launch animation,
Home's header mark and the sign-in screens keep the plain hexagon. The mascot
appears only while the guide is talking, and in the moments listed below.
The DESIGN_GUIDE hexagon rule gains one line: the mascot is the mark's guide
form.

**Q9. Before launch or after?** Phase 1 is a reskin of surfaces that already
exist, plus one new spot, the welcome screen. It can ship before 1.0 if the
art is ready, and never blocks the TestFlight build. Phase 2 waits until
phase 1 has been seen on a phone.

**Q10. How do we know it helped?** FV1's events already measure it.
`guide_finished` against `guide_skipped`, and setup's step events, from the
4 weeks before against the 4 weeks after. It is a success if more people
finish the walk and setup completion does not drop.

## Where it appears

### Phase 1: setup and the guide

| #   | Screen                                      | When                                                                                              | Pose                                      | Size                      | What it does                                                                                                                                                          |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Welcome (`Login.tsx`, first visit)          | Signed out, first open                                                                            | `wave`                                    | 120 px                    | Replaces the app-icon image above "Your training and food, planned together". Waves once.                                                                             |
| 2   | Setup's chapter bar (`Onboarding.tsx`)      | Every setup step                                                                                  | `walk`                                    | 28 px                     | Walks along the five chapters (Your aim → Start) as the person continues, and back on Back. It is a companion, not a talker.                                          |
| 3   | Setup, "Anything to work around?"           | Injuries step                                                                                     | `reassure`                                | 28 px, in the bar         | Swaps to a calm hand-on-chest pose for this one step. Nothing is written about it.                                                                                    |
| 4   | Setup, creating the plan                    | After "Start my plan", while `completeOnboarding` runs and the button reads "Creating your plan…" | `build`                                   | 28 px, in the bar         | Stacks hexagon blocks at the end of the chapter bar until the plan is made. No new screen.                                                                            |
| 5   | Setup, "Your plan"                          | The last step, the first week built from the answers                                              | `present`                                 | 64 px, beside the heading | Gestures at the week once, then rests.                                                                                                                                |
| 6   | Home's first-visit walk (`GuideWalk`)       | Once per account, first 7 days                                                                    | `point-left`, `point-right`, `point-down` | 40 px                     | Replaces `GuideMark` in the walk's card. It points towards the card being explained, wakes up and flies down out of Home's header, and flies back when the walk ends. |
| 7   | One-time hints (`GuideHint`)                | Train's order, first set, Food's composer, first run                                              | `lift`, `lift`, `food`, `run`             | 32 px                     | Replaces `GuideMark` in each hint, holding a prop for the place: a dumbbell, a plate, a running shoe. "Got it" gets a `nod`.                                          |
| 8   | Settings → Support & legal → Show me around | Replay                                                                                            | as #6                                     | as #6                     | No change beyond #6.                                                                                                                                                  |

### Phase 2: after phase 1 is seen on a phone

| #   | Screen                                                 | Pose                     | Note                                                                                       |
| --- | ------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| 9   | `EmptyState` (used in 22 files)                        | `rest`, `search`, `wait` | Replaces the stroke hexagon, keeping the screen's domain colour on the prop, not the body. |
| 10  | First week complete (`FirstWeekCard`, all rows ticked) | `celebrate`              | Once per account.                                                                          |
| 11  | Badge earned (`BadgeEarnedModal`)                      | `celebrate`              | Beside the badge, never on it.                                                             |
| 12  | Rest-day card                                          | `rest`                   | Only on a planned rest day, never on a missed day.                                         |

### Never

- The live workout and the live run screens. The person is working, and the
  screen is theirs.
- Loading spinners and placeholders. (DESIGN_GUIDE: the mark is never a
  loading placeholder. #4 is the person's own plan being made, shown in
  the bar they have been following, not a page-wide spinner.)
- Errors, offline banners and refused actions. An error with a cute face
  reads as not taking it seriously.
- The Pro and Upgrade pages, trial reminders and anything to do with money.
- Push notifications, emails and share cards.
- The social feed, other people's profiles, moderation and blocking.
- Streak loss, missed sessions and a high-calorie day.

## Poses to draw

Fourteen for phase 1 and phase 2 together. Each is one character, facing the
viewer unless it is pointing, on a transparent background.

| ID                                          | Pose                                             | Phase | Props, in their domain colour                                   |
| ------------------------------------------- | ------------------------------------------------ | ----- | --------------------------------------------------------------- |
| `idle`                                      | Standing, eyes open, arms down                   | 1     | —                                                               |
| `blink`                                     | As `idle`, eyes as "^ ^"                         | 1     | — (the eye layer swaps; not a separate drawing if built as SVG) |
| `wave`                                      | One arm up, waving                               | 1     | —                                                               |
| `walk`                                      | Mid-stride, side-on, small legs                  | 1     | —                                                               |
| `reassure`                                  | Hand on chest, soft eyes                         | 1     | —                                                               |
| `build`                                     | Placing a small hexagon block on a stack         | 1     | Purple blocks                                                   |
| `present`                                   | Both arms out to one side, "here it is"          | 1     | —                                                               |
| `point-left` / `point-right` / `point-down` | One arm pointing                                 | 1     | — (right is a mirror of left)                                   |
| `lift`                                      | Holding a dumbbell overhead, easy, not straining | 1     | Dumbbell, purple `#7B72E9`                                      |
| `run`                                       | Jogging, side-on                                 | 1     | Shoes, coral `#D4637A`                                          |
| `food`                                      | Holding a plate with a fork                      | 1     | Plate, orange `#D9884E`                                         |
| `nod`                                       | Eyes "^ ^", a small bow                          | 1     | —                                                               |
| `celebrate`                                 | Both arms up, a few small hexagon confetti       | 2     | Gold `#FFD700` confetti only                                    |
| `rest`                                      | Sitting, eyes closed, a small "z"                | 2     | —                                                               |
| `search`                                    | Shading its eyes with a hand, looking            | 2     | —                                                               |
| `wait`                                      | Sitting, legs swinging                           | 2     | —                                                               |

There are no sad, tired, angry or disappointed poses. That is on purpose
(Q6).

## How it is built (after the owner picks a design)

1. **ChatGPT** draws a character sheet from the brief below, and the owner
   picks one design.
2. **Claude** rebuilds that design as SVG: one file of shared parts (body,
   eyes, arms, props) and one small composition per pose, coloured with the
   app's tokens, so dark and light both work. This avoids putting ChatGPT
   PNGs in the app, which would be heavy, fixed to one colour and drift from
   pose to pose.
3. **Motion** uses Framer Motion, which the app already has: the walk along
   the chapter bar, a blink every few seconds while on screen, the wave once,
   and FV1's flight into and out of Home's header. Reduce Motion: no blink,
   no walk (it is placed on its chapter), no flight (it appears).
4. **Accessibility:** the mascot is decoration (`aria-hidden`). The words
   beside it carry every meaning, as they do today. It is fixed in pixels and
   gives way before text does at 320 px and 2× text, under
   `largeText.capture.spec.ts`.
5. **Code:** one component, `Mascot` (`src/components/guide/Mascot.tsx`,
   `pose` and `size` props), replaces `GuideMark` in `GuideWalk` and
   `GuideHint`. `firstGuide.ts` names each stop's pose, so the choice is
   tested without rendering. Budget: all phase 1 poses under 30 KB together.

## The brief for ChatGPT (paste this)

> Design a mascot for Tropos, an iPhone fitness app that plans lifting,
> running and food together. The app's logo is a purple hexagon with rounded
> corners and an upward chevron (^) cut out of it.
>
> The mascot is that logo come alive: a soft, rounded hexagon body in purple
> #7B72E9, slightly lighter (#9590E0) towards the top. Its face is two small
> upward chevrons (^ ^) that read as happy, closed eyes, with an open-eyed
> version (two small rounded ovals) for when it looks at something. It has no
> mouth or nose. It has short, rounded arms and, only when a pose needs them,
> two short legs. It wears no clothes and has no hair or accessories of its
> own.
>
> Style: flat vector, no outlines or a single thin outline, no gradients
> beyond the one on the body, no texture, no 3D, no glow and no drop shadow.
> Simple enough to read at 28 pixels tall and still look good at 120. Calm
> and friendly, like Headspace's characters, not loud like a cartoon. It
> must look right on a near-black background (#0E0E11) and on a light grey
> one (#F2F2F7).
>
> First, give me 3 different takes on the character, each standing, facing
> the viewer, on a transparent background, so I can pick one.
>
> Then, for the chosen one, draw a character sheet with these poses, each on
> a transparent background, the character the same size and the same design
> in every pose:
> idle (standing, eyes open); wave (one arm up); walk (side-on, mid-stride);
> reassure (hand on chest, soft eyes); build (placing a small purple hexagon
> block on a stack); present (both arms out to one side, "here it is");
> point-left; point-down; lift (holding a purple dumbbell overhead, easy,
> not straining); run (jogging side-on, coral #D4637A shoes); food (holding a
> plate, orange #D9884E, with a fork); nod (eyes ^ ^, a small bow);
> celebrate (both arms up, a few small gold #FFD700 hexagon confetti);
> rest (sitting, eyes closed, a small "z"); search (shading its eyes,
> looking); wait (sitting, legs swinging).
>
> No sad, angry, tired or disappointed poses. No speech bubbles and no text
> in any image.

Send the three takes back here. Once one is picked, Claude builds the SVG set
from it and opens the phase 1 PR.

## What a lock changes

- `.claude/plans/programme-run-followups.md`: a new **FV3** row, and a
  STATUS line on FV1 ("call 1 reversed by FV3: the guide's face is the
  mascot, the voice is unchanged").
- `DESIGN_GUIDE.md` §7: the hexagon rule's guide exception names the mascot.
  §14 gets the never list above.
- `GLOSSARY.md`: the reference-app deviation and its reason (Q1).
- `CLAUDE.md`'s first-visit guide paragraph: "The Tropos mark is the guide
  (no character…)" becomes the mascot, with the voice unchanged.
- Tests: `firstGuide.test.ts` pins each stop's pose and that no pose is in
  the never list's places; the voice tests stay as they are.
