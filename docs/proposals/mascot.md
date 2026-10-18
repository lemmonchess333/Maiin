# A mascot for setup and the first-visit guide — proposal

Status: proposal, 2026-10-18, revised the same day after the owner's
answers. Not locked. If the owner agrees, it locks as **FV3** and reverses
FV1's call 1. On 2026-10-04 FV1 declined a character, "1C", because it
needed an illustrator, a set of poses and a change of voice. FV1's row gets
a STATUS line pointing here, and its body stays as written.

The owner asked for a mascot "to help with onboarding and maybe some other
parts". ChatGPT draws it. This file covers everything else: what it is, where
it goes, what it says, what it never does, the poses to draw, and the brief
to hand ChatGPT.

## The owner's calls (2026-10-18)

The first draft made the mascot the Tropos logo come alive, a silent
hexagon. The owner turned that down, and answered two questions:

- **The character is an animal.** ChatGPT draws three and the owner picks
  one.
- **It talks, in setup and the tips.** It speaks in short speech bubbles
  during setup, the first-visit walk and the one-time hints, and nowhere
  else.

## The decisions

**Q1. Reverse FV1's "no character"?** Yes. FV1's reasons were an
illustrator, the poses and the voice.

- **Illustrator:** ChatGPT draws.
- **Poses:** the list below is fixed and short.
- **Voice:** the change is fenced to three places (Q4).

Reference apps:

- Duolingo's owl and Finch's bird are animals that talk.
- Strava, Hevy, Strong, MacroFactor, MyFitnessPal and Nike Run Club have no
  mascot.

The Tropos-specific reason, for GLOSSARY.md: the app plans lifting, running
and food together, so a new account has more to learn than in a one-sport
app, and the owner wants that teaching to feel friendly.

**Q2. Which animal?** ChatGPT draws three, and the owner picks. The three
to ask for, each because it fits an app that does strength, running and food
at once:

| Animal            | Why it fits                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| **Fox**           | Quick and clever, and a runner by nature. The best-known shape of the three. |
| **Mountain goat** | Strong legs, sure-footed, always climbing: steady progress.                  |
| **Otter**         | Playful, and known for loving food. The warmest of the three.                |

**Q3. Its colours.** Its natural colours, plus **one thing in brand purple**
(`#7B72E9`), a sweatband, which ties it to Tropos without painting the
animal purple. What it holds takes that part of the app's colour:

- a purple dumbbell;
- coral running shoes (`#D4637A`);
- an orange plate (`#D9884E`);
- teal water (`#52A3BD`).

**Q4. How it talks.** In a speech bubble beside it, only in setup, the
first-visit walk and the one-time hints. Everywhere else the app keeps its
own calm voice (CODING_STANDARDS.md), so this becomes a fourth "genre
exception" there, beside the run's spoken coaching cues. Its rules:

- **It speaks as itself.** It can say "I" ("I'll build your first week").
- **One short sentence or two**, under about 20 words in all, so the bubble
  never covers what it is explaining.
- **Friendly and plain.** No "!", no emoji, no "crushing it", no "your
  journey". It sounds like a good coach, not an advert.
- **It never guilt-trips.** No sad face, no "you missed a day", no streak
  talk, and nothing about Pro or money.
- **It never says something the screen doesn't already back up.** The
  bubble explains the screen. It doesn't add claims.

**Q5. A name?** Yes, because it introduces itself. The name is picked once
the animal is: ChatGPT suggests five with its three designs, and the owner
chooses. Until then the files call it `mascot`.

**Q6. Can people turn it off?** No switch. Scarcity is the control:

- the walk is once per account and skippable;
- each hint shows once;
- it never appears in daily use outside those.

Reduce Motion stills it.

**Q7. Does it replace the logo?** No. The app icon, the launch animation,
Home's header mark and the sign-in screens keep the hexagon.

**Q8. Before launch or after?** Phase 1 can ship before 1.0 if the art is
ready, and it never blocks the TestFlight build. Phase 2 waits until phase 1
has been seen on a phone.

**Q9. How do we know it helped?** FV1's events already measure it:
`guide_finished` against `guide_skipped`, and setup's step events. Compare
the 4 weeks before with the 4 weeks after. It succeeds if more people finish
the walk, and setup completion doesn't drop.

## Where it appears, and what it says

The lines below are drafts. `[Name]` is replaced once it is chosen.

### Phase 1: setup and the guide

| #   | Screen                                | Pose                                        | Size   | Bubble                                                                                                                                    |
| --- | ------------------------------------- | ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Welcome (`Login.tsx`, first visit)    | `wave`                                      | 120 px | "Hi, I'm [Name]. Answer a few questions and I'll build your first week."                                                                  |
| 2   | Setup, first question                 | `idle`                                      | 48 px  | "Let's start with what you want from training."                                                                                           |
| 3   | Setup, the progress bar on every step | `walk`                                      | 28 px  | No bubble. It walks along the five chapters as the person goes.                                                                           |
| 4   | Setup, "Anything to work around?"     | `reassure`                                  | 48 px  | "Anything sore or off-limits? I'll keep it out of your plan."                                                                             |
| 5   | Setup, while the plan is made         | `build`                                     | 48 px  | "Building your week…"                                                                                                                     |
| 6   | Setup, "Your plan"                    | `present`                                   | 64 px  | "Here's your first week. Change anything you like before you start."                                                                      |
| 7   | Home's first-visit walk (`GuideWalk`) | `point-left` / `point-right` / `point-down` | 48 px  | Each stop's words, in its voice. For example, today's lift: "This is today's workout. Tap Start and I'll take you through it set by set." |
| 8   | One-time hints (`GuideHint`)          | `lift`, `food`, `run`                       | 40 px  | Each hint's words, in its voice. For example, Food's composer: "Type what you ate, or scan it. I'll work out the numbers."                |

On the walk and the hints the mascot replaces `GuideMark`, the logo that
does the job now. It wakes up in Home's header, comes down beside the card,
and goes back when the walk ends.

### Phase 2: after phase 1 is seen on a phone

| #   | Screen                                 | Pose                     | Talks?                                                     |
| --- | -------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| 9   | Empty screens (`EmptyState`, 22 files) | `rest`, `search`, `wait` | No. The empty state's own line stays.                      |
| 10  | First week complete                    | `celebrate`              | One line, once per account: "That's your first week done." |
| 11  | Badge earned                           | `celebrate`              | No                                                         |
| 12  | Planned rest day                       | `rest`                   | No                                                         |

### Never

- The live workout and live run screens.
- Loading spinners and placeholders, apart from #5.
- Errors, offline banners and refused actions.
- The Pro and Upgrade pages, trial reminders, and anything about money.
- Push notifications, emails and share cards.
- The social feed, other people's profiles, moderation and blocking.
- Missed sessions, lost streaks and a high-calorie day.

## Poses to draw

Seventeen images. Each shows the same character, the same size, on a
transparent background.

| ID                                          | Pose                                            | Phase |
| ------------------------------------------- | ----------------------------------------------- | ----- |
| `idle`                                      | Standing, looking at the viewer, relaxed        | 1     |
| `blink`                                     | As `idle`, eyes closed, for a blink             | 1     |
| `wave`                                      | One arm up, waving                              | 1     |
| `walk`                                      | Side-on, mid-stride                             | 1     |
| `reassure`                                  | Hand on chest, soft expression                  | 1     |
| `build`                                     | Placing a small purple block on a stack         | 1     |
| `present`                                   | Both arms out to one side, "here it is"         | 1     |
| `point-left` / `point-right` / `point-down` | One arm pointing                                | 1     |
| `lift`                                      | A purple dumbbell overhead, easy, not straining | 1     |
| `run`                                       | Jogging side-on, coral shoes                    | 1     |
| `food`                                      | Holding an orange plate with a fork             | 1     |
| `nod`                                       | Small nod, happy eyes                           | 1     |
| `celebrate`                                 | Both arms up, a little gold confetti            | 2     |
| `rest`                                      | Sitting, eyes closed, a small "z"               | 2     |
| `search`                                    | Shading its eyes, looking                       | 2     |

There are no sad, tired, angry or disappointed poses (Q4).

## How it is built

1. **ChatGPT** draws three animals, the owner picks one, and ChatGPT then
   draws the full pose sheet for it.
2. **Claude** checks the poses side by side. Same proportions, same
   sweatband, same colours. Any pose that drifts is sent back with the
   chosen design as the reference. The images are saved as WebP at three
   times their largest size, through the shrink step the exercise art
   already uses. Budget: all phase 1 poses under 400 KB together.
3. **Motion** uses Framer Motion, already in the app:
   - a blink every few seconds (swapping `idle` and `blink`);
   - a small bob while it talks;
   - the walk along the chapter bar;
   - the flight down from Home's header.

   Under Reduce Motion it stays still, and the bubble just appears.

4. **The bubble** is a real text element, so it scales with the phone's text
   size and screen readers read it. The picture is decoration
   (`aria-hidden`). At 320 px and 2× text, the picture shrinks before the
   words do, under `largeText.capture.spec.ts`.
5. **Code:**
   - One `Mascot` component (`pose`, `size`) and one `MascotSays` bubble.
   - `MascotSays` replaces `GuideMark` in `GuideWalk` and `GuideHint`.
   - `firstGuide.ts` holds every bubble's words and each stop's pose, so
     tests can pin the voice rules (Q4: no "!", the word limit) without
     rendering.

## The brief for ChatGPT (paste this)

> I'm making a mascot for Tropos, an iPhone fitness app that plans
> lifting, running and food together. The mascot guides new people through
> setting up the app, in short speech bubbles.
>
> First, draw three different animal mascots so I can choose: a fox, a
> mountain goat and an otter. Each standing, facing the viewer, friendly and
> calm, on a transparent background. Each wears one thing in purple
> #7B72E9, a sweatband, and is otherwise in its natural colours. Also
> suggest five short names for each.
>
> Style for all three: flat vector illustration, simple shapes, at most one
> thin outline, no 3D, no glow, no drop shadows, no texture. Friendly but
> not loud, like Headspace or Finch rather than a Saturday-morning
> cartoon. It must read clearly at 40 pixels tall and still look good at 160. It must look right on a near-black background (#0E0E11) and on a
> light grey one (#F2F2F7).
>
> No text and no speech bubbles in any image.

When I've picked one, send this second message:

> Now draw the one I picked as a character sheet. Same design, same size and
> same sweatband in every pose, each on a transparent background:
>
> - **idle:** standing, relaxed.
> - **blink:** idle with its eyes closed.
> - **wave:** one arm up.
> - **walk:** side-on, mid-stride.
> - **reassure:** hand on chest, soft expression.
> - **build:** placing a small purple block on a stack.
> - **present:** both arms out to one side, "here it is".
> - **point-left, point-right and point-down.**
> - **lift:** a purple #7B72E9 dumbbell overhead, easy, not straining.
> - **run:** jogging side-on, in coral #D4637A shoes.
> - **food:** holding an orange #D9884E plate with a fork.
> - **nod:** a small happy nod.
> - **celebrate:** both arms up, with a little gold #FFD700 confetti.
> - **rest:** sitting with its eyes closed and a small "z".
> - **search:** shading its eyes and looking.
>
> No sad, angry or tired poses, and no text in any image.

Send the three designs back here first. Once one is picked, the pose sheet
comes next, and then Claude builds phase 1.

## What a lock changes

- **`.claude/plans/programme-run-followups.md`:** a new **FV3** row, and a
  STATUS line on FV1: "call 1 reversed by FV3: the guide is an animal
  mascot that talks in setup, the walk and the hints".
- **`CODING_STANDARDS.md`, house voice:** the mascot's bubbles become a
  genre exception, with Q4's rules.
- **`DESIGN_GUIDE.md` §14:** the never list above. The hexagon rule's guide
  exception goes, because the guide is no longer the mark.
- **`GLOSSARY.md`:** the reference-app deviation and its reason (Q1).
- **`CLAUDE.md`,** the first-visit guide paragraph: "The Tropos mark is the
  guide (no character; the house voice holds)" is replaced.
- **Tests:** `firstGuide.test.ts` pins:
  - each bubble's word limit and no "!";
  - no guilt words;
  - each stop's pose;
  - that no pose is used in a "never" place.
