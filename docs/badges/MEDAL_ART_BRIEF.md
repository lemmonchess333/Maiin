# Challenge medal artwork — the brief, and how to drop it in

The challenge medals (Soc15: a medal per challenge edition, a trophy case on
the profile, a reveal on Social) are drawn in code today
(`src/features/challenges/MedalArt.tsx`). The owner wants them illustrated
with Gemini like the badges (`ART_BRIEF.md` beside this file). The seam is
built and the art is not made yet: no key was available in the session that
built the seam. This is how to make it.

## What the art is, and what stays in code

- **One illustration per challenge definition and tier, never per
  edition.** Every month's Mileage shares the same three images; so does
  every week's Weekly Warrior. 11 definitions × bronze, silver, gold = 33
  medals.
- **Drawn in code over the art, always:** the ribbon (in the challenge's
  sport colour), the scroll across the foot of the medal with the edition
  on it ("NOV 2026"), and the tier's goal ("50 km", "25:00 5K") struck over
  the plain lower face in the metal's light. So a new month, a reader in
  miles, a changed goal: none of them needs a new image.
- **Until a medal's art is listed it is drawn.** `MedalArt` falls back to
  the procedural coin (a metal face with the sport's icon and the goal)
  whenever `imageSrc` is absent, still loading, or fails to load, the way
  `BadgeHex` falls back to the lucide hexagon.

## The look: one family with the badges, but round

The badges are pointy-top hexagons. A medal is a **round coin**, so the two
are never confused, made of the same materials so they read as one family:

- **Rim:** a thick bevelled rim of the tier metal with fine milled notches
  round its edge and one specular highlight along the upper left.
- **Face:** deep black polished enamel, smooth, lit from behind by the
  tier's glow (bronze warm amber, silver cool white, gold warm golden: the
  badges' pairs).
- **Emblem:** one filled silhouette in **solid tier-metal relief**, in the
  **upper half** of the face. The **lower third stays plain enamel**: the
  goal is printed there in code.
- **Nothing else:** no ribbon or loop (the ribbon is drawn in code in the
  sport's colour), no text, no numbers.
- **Background:** flat magenta (#FF00FF), keyed to alpha.

## How the medals are made — `scripts/art/generate-medals.py`

`GEMINI_API_KEY` from the environment only; `gemini-3-pro-image` through
`gemini-image.py`, as the badges are made. Four stages, ~36 calls:

1. **Master** — one gold coin with a five-pointed star, generated with a
   gold badge as the style reference (`--style-ref`, default
   `public/badges/month_master.webp`, put on magenta first), so the metal,
   enamel, light and camera are the badges'.
2. **Tier masters** — bronze and silver image-edited from the gold master:
   _"change only the metal and the glow"_.
3. **Medals** — each definition image-edited from its tier master:
   _"replace only the emblem"_, same size and place, lower third plain.
4. **Key + frame** — `key-hexagon.py … 512 coin` keys the magenta and fits
   the coin to the `coin` frame (it fills 96% of the square: x and y
   2..98 of 100), the box `MedalArt` draws the art in, so the
   illustration's rim meets the drawn rim. WebP at q82 into
   `public/medals/<definition>-<tier>.webp`.

```
GEMINI_API_KEY=… python3 scripts/art/generate-medals.py
# re-roll one against the saved tier masters:
GEMINI_API_KEY=… python3 scripts/art/generate-medals.py --skip-masters --only autumn-push --tiers silver
```

The prompts and the emblem table live in the script; edit them there, not
here, so this page cannot drift from what ran.

## Definitions and emblems

| Definition         | Challenge (functions/lib/challengeDefs.js)                 | Emblem                                        |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| `weekly-warrior`   | Weekly Warrior, `weekly-…`                                 | a small dumbbell inside an open laurel wreath |
| `monthly-mileage`  | {Month} Mileage, `monthly-…`                               | running footprints climbing a curving path    |
| `strength-builder` | {Month} Strength Builder, `strength-monthly-…`             | a short barbell with one large plate each end |
| `active-days`      | {Month} Active Days, `featured-monthly-…` (Jan, Mar…)      | a calendar page with a bold tick              |
| `training-minutes` | {Month} Training Minutes, `featured-monthly-…` (Feb, Apr…) | a clock face at ten past ten                  |
| `hybrid-hero`      | {Month} Hybrid Hero, `global-monthly-…`                    | a dumbbell and a running shoe under one star  |
| `fastest-5k`       | Fastest 5K, `fastest-5k-…`                                 | a stopwatch with speed lines                  |
| `spring-reset`     | Spring Reset, `seasonal-…` from March                      | a sprout with two leaves                      |
| `summer-shred`     | Summer Shred, `seasonal-…` from June                       | a round sun with short rays                   |
| `autumn-push`      | Autumn Push, `seasonal-…` from September                   | a maple leaf                                  |
| `winter-bulk`      | Winter Bulk, `seasonal-…` from December                    | a six-pointed snowflake                       |

The community goal (`group-goal-…`) awards no medal and has no art.
`medalDefinition` in `src/features/challenges/medalArt.ts` maps an edition
to its definition (the id prefix, and for the two that rotate the metric
or the month the season starts), and `medalArt.cross.test.ts` holds the
list equal to the server's catalogue and to this script's table.

## Dropping the art in

1. Run the script (or make a medal by hand to the look above, on magenta,
   and key it with `key-hexagon.py in.png out-stem 512 coin`).
2. Review each WebP in `public/medals/` at 64 px (the trophy case) and at
   184 px (the reveal), in both themes. The lower third of the face must
   be plain: the goal is printed there.
3. Add each reviewed `"<definition>-<tier>"` to `MEDAL_ART_KEYS` in
   `src/features/challenges/medalArt.ts` (the script prints the lines).
   A definition may light up one tier at a time; the rest stay drawn.
4. Look at `/dev/break-social` (the trophy case, and `?reveal=1` for the
   reveal) and run `break-social-lab.capture.spec.ts`, which measures both
   at 320 and 393 px with doubled text.
