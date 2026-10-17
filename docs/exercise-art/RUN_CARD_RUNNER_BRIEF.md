# The run cards' runner — art brief

The owner, 16 October 2026, on Train's and Home's run cards: "This needs to
look better and be more interesting. Should have modelled the guy running as
one." Home's lift card draws the canonical athlete doing the session's lead
lift (`LiftCTACard`, the lead exercise's card cut-out). The run cards draw a
48px icon tile, because no running pose exists: the Treadmill set walks, on
its machine.

This is the brief for that pose. It could not be made in the session that
wrote it: the art pipeline (`scripts/art/gemini-image.py`) needs
`GEMINI_API_KEY`, and the container had none.

## What to make

**Two single poses, not six-frame sets.** A card shows one frame. A running
form guide would be a separate brief.

1. `run-easy`: easy running, mid-stride. Side view, facing right. One foot
   just leaving the ground behind and the other leg's knee coming through.
   Arms bent near 90° and relaxed, upright torso, slight forward lean from the
   ankles, relaxed hands. It should read as running at a glance, never as
   walking. The Treadmill set fails here: both feet near the ground and
   straight arms read as a walk at card size.
2. `run-fast`: a faster stride for tempo, intervals and races. Longer stride,
   higher knee drive, stronger arm drive, the same identity and camera.

Follow `PRODUCTION_BRIEF.md` for everything it already covers:

- the canonical athlete, `identity/athlete-anatomy-v3.png` (bald, faceless,
  white/light-grey anatomy, fine dark contours, white trainers, smooth
  neutral pelvis), attached to every generation;
- one person and no text;
- colour for the muscles, in strength order:
  - primary in the strongest purple: glutes, quadriceps, hamstrings, calves;
  - secondary in lilac: hip flexors, core;
  - nothing else highlighted.

**Background:** solid black, so `scripts/art/cut-out-form-art.ts`'s keying
cuts it out as it cuts the exercise sets. No floor line, track, road, shadow
or scenery. The card supplies the ground.

**Canvas:** 1024×1024, the figure filling about 80% of the height with even
margins, the leading foot and trailing heel inside the frame.

## Review and release

Candidates stay outside `public/` until the owner releases them
(`OWNER_RELEASE.md`). Check them at the sizes they will be shown:

- 136px tall, in the right 42% of Home's run card, on both themes;
- 96px, in Train's run session card.

Reject a pose that reads as a walk, a jog in place or a sprint start at those
sizes.

## Wiring, once released

- **Files:** the cut-outs go in `public/form-art/` beside the exercise ones,
  e.g. `run-easy.webp`, made by the same keying.
- **Home (`src/components/home/RunCTACard.tsx`):** draw the pose where
  `LiftCTACard` draws its drawing:
  - `absolute right-2 top-3 h-[136px] w-[42%] object-contain object-right-top`;
  - the text gets `pr-[46%]`;
  - the drawing gives way under 14em of card.
  - The icon tile goes.
  - `run-fast` for tempo, intervals and race; `run-easy` for the rest.
- **Train (`src/components/program/ProgrammeRunSection.tsx`):**
  - the run `SessionCommandCard` takes the pose in its `figure` slot, as the
    lift card takes the muscle figure;
  - the "No run scheduled" card takes `run-easy` beside its words.
- **Tests:** a test pins which pose each run type gets, and the large-text
  capture spec covers the two cards at 320px and 2× text.

## Released, 17 October 2026

The owner was shown both poses as cut-outs on mock Home (136px) and Train
(96px) run cards, light and dark, beside the swimming and stairmaster
drafts, and asked which to release. They chose "Runner on run cards" and
nothing else, so swimming and stairmaster stay drafts.

- **Made with** `scripts/art/gemini-image.py` (gemini-3-pro-image), one
  generation per pose, with the canonical athlete and Kettlebell Swing
  frame 3 attached for identity and finish. The prompts and every input's
  and output's hash are in `run-poses/provenance.json`.
- **Sources:** `run-poses/run-easy.jpg` and `run-poses/run-fast.jpg`, kept
  exactly as the API returned them. It returned JPEG, not PNG.
- **Cut-outs:** `npm run art:run-poses` keys both with the exercise
  cut-outs' keying (`scripts/art/keying.ts`) into `public/form-art/` and
  writes `src/lib/runPoses.data.ts`. `runPoses.test.ts` fails when a source
  changes without its cut-out.
- **Status:** an owner release, as the elliptical and spin bike were. The
  exercise review's measured checks do not apply to a single pose, and
  none was run.
- **Findings:**
  - The easy stride is long for an easy run. It still reads as running at
    card size, which is what the brief asked of it.
  - On a white card, the figure's white edge leans on its contour lines,
    as every exercise cut-out's does.
- **Wired** as the "Wiring, once released" section above says, with one
  difference: the large-text capture spec does not reach a run card, and
  no capture was added for one. The run card uses the lift card's classes,
  so it gives way under 14em of card in the same way.
