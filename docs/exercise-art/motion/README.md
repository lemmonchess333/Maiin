# Home's hero animations

Home's session hero plays its picture as a flipbook: the runner running on
the spot, or the day's lead lift doing one rep. It plays about five seconds
when Home opens, then rests on its first frame (`HERO_MOTION_SECONDS`,
DESIGN_GUIDE §14h: Home's water glass is already the screen's one loop),
and never moves under Reduce Motion. Code: `src/components/home/HeroMotion.tsx`,
`src/lib/heroMotion.ts`; the registry `src/lib/heroMotion.data.ts` is
generated, never edited by hand.

## Which lifts need one

Every exercise `sessionLeadIndex` can pick for a generated plan. A sweep of
`freshLiftWeek` over every setup answer (1 to 6 lift days, five goals, three
levels, four session lengths, three kits, barbell at home, all 32 injury
combinations: 57,600 builds, 2026-11-10) finds 24, and every one has a
flipbook: the six compound primaries (bench press, overhead press, barbell
row, pull-ups, squat, deadlift) and 18 that kit and injury swaps put first
(bulgarian-split, incline-db-press, trap-bar-deadlift,
chest-supported-db-row, db-rdl, glute-bridge, db-bench,
chest-press-machine, inverted-row, landmine-press, db-shoulder-press,
goblet-squat, db-row, shoulder-press-machine, romanian-deadlift,
hip-thrust, arnold-press, kettlebell-swing). Re-run the sweep when
templates, swaps or the lead rule change. A lead with no flipbook shows its
still, as before.

**The deadlift's flipbook is drawn from the front (2026-11-12).** Its card
was redrawn from the front that day at the owner's request (the form guide
keeps its frames from behind), so its flipbook was made again from the
front drawings instead of form frames: the card's drawing to the front
lockout and back, 9:16, 3 s each, as in "How one is made":
`docs/exercise-art/pilots/redraw-20261112/deadlift-front/start.png` and
`lockout.png` (`docs/exercise-art/sources/deadlift/2026-11-12/build.py`).
For a few hours it had none: the first video call answered 402 until the
Gemini project's prepaid credits were topped up.

A day with no compound primary is pictured by its first compound movement
before an isolation (owner, 2026-11-10: a primary mover leads). The
straight-arm pulldown led 640 of the builds that way, a beginner's home
pull day, and the chest-supported row beside it leads them now; the
pulldown leads none.

## How one is made

1. **Two halves between reviewed form frames.** Never let the model choose
   where a rep ends: the first attempt's deadlift did not lock out, its row
   never straightened the arms and its bench bar stopped above the chest.
   Pair the card frame (`source` in `formArtCutouts.data.ts`) with the frame
   at the other end of the rep (the form set frame least like the card;
   check it is the lockout or full stretch), then make card → other end and
   other end → card, 3 s each:

   ```
   GEMINI_API_KEY=… python3 scripts/art/gemini-video.py --out down.mp4 \
     --frame <card>.webp --last <other>.webp --aspect 9:16 --duration 3 --prompt "…"
   ```

   Use 9:16 for anything that rises (squats, deadlifts, presses from the
   shoulders, pull-ups), so the figure has headroom; 16:9 otherwise.

2. **Cut and pack:**

   ```
   npx tsx scripts/art/hero-motion.ts --clip down.mp4 --then up.mp4 \
     --id <exercise-id> --still form-art/<exercise-id>.webp \
     --fps 6 --play-fps 12 --from 0 --to=-1 --preview preview.mp4
   ```

   It keys every frame like the stills (`keying.ts`), sets them in one box,
   writes `public/form-art/motion/<id>.webp` and this folder's
   `<id>/frames.json`, and regenerates the registry. `--highlight running`
   recolours a runner to coral. `--to` needs `=` for a negative value.

3. **Check each rep by eye** at both ends before committing: lockout, full
   extension, the bar to the chest. Send the owner the preview.

The runner (`run-easy`) was made from one clip with its drawing as both the
first and last frame, looped on one stride where two frames match.

## Limits learned the hard way

- **Gemini Omni Flash** (`gemini-omni-1.2-flash`) replaced Veo, shut down
  on the Gemini API on 2026-10-22. About $0.07 a second at 720p. Tier 1
  allows 8 requests a minute and **40 a day**; the account is prepaid, and
  a 402 means the credit ran out. Run at most two at a time.
- **The safety filter blocks the straight-arm pulldown**: drawn from
  behind, and our figures wear nothing. Local motion interpolation between
  its frames smears the arms. It no longer leads a day (above), so no
  hero needs it.
- **OpenAI is no alternative**: ChatGPT Images 2.0 makes stills only, and
  Sora's API shut down on 2026-09-24.
- **Size**: a lift sheet is 0.5 to 1 MB; the full set is about 18 MB of
  the native bundle, loaded on the web only on its day.
- **The key** comes from the environment, never argv or a file in the repo.
  If the owner pastes one in chat, ask them to rotate it after.
