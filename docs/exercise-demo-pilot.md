# Exercise visual-demo pilot (D-LIFT-20)

The audit's "animation route": give each lift a visual demo, not just text +
a muscle diagram. This documents the **pilot** — a QA-gated, offline,
asset-generating pipeline using Google's **Nano Banana** (Gemini 2.5 Flash
Image) — and the consumer seam already wired in the app.

This is deliberately a _pilot_: generate keyframes for the **top ~30 lifts**,
human-QA every frame, and only scale to all 153 if quality clears the bar.

## The hard constraint

**A wrong demo is worse than no demo.** Image models routinely get joint
angles, grip, bar path, and limb counts wrong, and a form guide that shows bad
technique is an injury + credibility risk. So:

- generation is **offline + reviewed**, never runtime / on-device (Tropos is
  iOS-first — ship pre-generated static assets);
- every frame is **QA'd against the exercise's `instructions` + `commonMistakes`**
  (D-LIFT-19) before it's committed;
- the app **always has a working fallback** — the free-exercise-db start/finish
  photos (D-LIFT-18) render when an exercise has no reviewed `media`.

## Why Nano Banana

- Tropos already integrates Gemini (`src/lib/gemini.ts`), so no new vendor.
- Nano Banana's strength is **character-consistent** generation/editing — one
  on-brand "coach" rendered the same across every exercise, which is exactly
  what a demo set needs (a consistent figure, not 30 different people).
- One-time generation cost; assets are static.

It is **not** good enough for unreviewed auto-animation — sequence-to-sequence
motion consistency is still unreliable. So the pilot produces **2 reviewed
keyframes** (start + finish), shown as a start↔finish toggle / cross-fade, not
a generated motion clip. If quality is high, a 3rd mid-rep frame can be added.

## Pipeline

`scripts/generate-exercise-demos.mjs` (operator-run, NOT in CI):

1. Reads the top-N exercises from `src/lib/exercises.ts` (default 30, the
   compounds + most-used accessories).
2. For each, prompts `gemini-2.5-flash-image` (Nano Banana) with:
   - a fixed **coach style preamble** (same physique, attire, neutral studio,
     side ¾ angle, flat lighting) so every exercise matches;
   - the exercise name + equipment + its `instructions` so the pose is correct;
   - a request for the **start** position, then an _edit_ of that image into the
     **finish** position (Nano Banana's edit path keeps the figure consistent).
3. Writes `public/exercise-demos/<exercise-id>/{start,finish}.webp` + a
   `manifest.json` (id → media paths).
4. **STOP — human QA.** Review every frame against the instructions; reject and
   regenerate the bad ones. Only commit the reviewed assets + set each
   exercise's `media: ["exercise-demos/<id>/start.webp", ".../finish.webp"]`
   in `exercises.ts`.

Run:

```bash
# Preview the coach style on a single lift before scaling:
GEMINI_API_KEY=… node scripts/generate-exercise-demos.mjs --only squat

# Full pilot batch:
GEMINI_API_KEY=… node scripts/generate-exercise-demos.mjs --limit 30
# review public/exercise-demos/** by eye, delete/regen bad frames, then
# wire the reviewed ids into exercises.ts `media` and commit.
```

### Coach style — one character, shared with the muscle diagram

`COACH_STYLE` renders the **same shirtless anatomical figure** as the app's
muscle diagram (`react-body-highlighter` in `MuscleHeatMap.tsx`) — flat
fitness-chart body on a neutral light-grey ground — so the form demo and the
"muscles trained" figure read as **one coach**, not two strangers. The primary
muscles are prompted to tint purple to echo the heat-map's accent.

**That tint is cosmetic only.** The model cannot reliably or accurately light
the correct muscles, and "a wrong demo is worse than none" applies double to
anatomy. The real, volume-driven muscle readout stays the `MuscleHeatMap` SVG.
A single moving body with _data-accurate_ muscle glow is the rigged-3D path
(fallback #3 below), not something image-gen can fake honestly.

## Consumer seam (already in the app)

- `Exercise.media?: string[]` (D-LIFT-19) holds the reviewed asset paths.
- `getExerciseDemo` (`src/lib/exerciseDemo.ts`) prefers `media` when present,
  falling back to the free-exercise-db photos otherwise — so the moment a
  reviewed exercise's `media` is set, its demo upgrades with no UI change.
- The form guide renders the demo in both History → Form and the mid-workout
  sheet (D-LIFT-14).

So shipping a demo for an exercise = generate → QA → set `media` → done. No app
change per exercise.

## Fallback ladder (if Nano Banana quality is insufficient)

1. free-exercise-db start/finish photos (already rendering — D-LIFT-18).
2. Licensed real-human GIF/clip library (accurate; licensing to clear).
3. Rigged 3D avatar pre-rendered to short WebM/Lottie (gold standard; heavy art
   effort) — only once the data model + surfaces (this seam) are in place.

## Status

- [x] Data model field (`Exercise.media`) — D-LIFT-19.
- [x] Consumer seam (`getExerciseDemo` prefers `media`) — this PR.
- [x] Generation script + QA workflow — this doc + `scripts/`.
- [ ] **Operator:** run the script with a `GEMINI_API_KEY`, QA the frames, wire
      reviewed `media` into `exercises.ts`, commit assets. (Needs an API key +
      human review — can't be done in CI.)
