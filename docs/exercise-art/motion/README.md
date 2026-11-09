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
combinations: 57,600 builds, 2026-11-09) found 25: the six compound
primaries (bench press, overhead press, barbell row, pull-ups, squat,
deadlift) and 19 that kit and injury swaps put first (bulgarian-split,
incline-db-press, trap-bar-deadlift, chest-supported-db-row, db-rdl,
glute-bridge, db-bench, chest-press-machine, inverted-row, landmine-press,
db-shoulder-press, goblet-squat, db-row, shoulder-press-machine,
romanian-deadlift, hip-thrust, straight-arm-pulldown, arnold-press,
kettlebell-swing). Re-run the sweep when templates, swaps or the lead rule
change. A lead with no flipbook shows its still, as before.

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
- **The safety filter blocks the straight-arm pulldown**: the only lead
  drawn from behind, and our figures wear nothing. Local motion
  interpolation between its frames smears the arms. Still open.
- **OpenAI is no alternative**: ChatGPT Images 2.0 makes stills only, and
  Sora's API shut down on 2026-09-24.
- **Size**: a lift sheet is 0.5 to 1 MB; the full set is about 18 MB of
  the native bundle, loaded on the web only on its day.
- **The key** comes from the environment, never argv or a file in the repo.
  If the owner pastes one in chat, ask them to rotate it after.
