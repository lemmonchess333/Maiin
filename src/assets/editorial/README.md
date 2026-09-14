# Editorial imagery

Athlete and city photography for **editorial surfaces** — licensed stock
plus, since 2026-09-14, generated frames where the subject is generic
(see "Licensing and provenance") (challenge
cards today; plan/curated surfaces may join later). The peer activity
feed never uses these — feed cards render user-data imagery (route
scenes, muscle figures) by design. See `CONTEXT.md` → "Editorial
imagery" and `src/lib/editorialImages.ts` for the resolution logic.

## Drop-in contract

Add files with these exact stems (any of `.webp .avif .jpg .jpeg .png`;
prefer WebP ≤ 120 KB, landscape, ≥ 800 px wide):

| File                    | Used for                                     |
| ----------------------- | -------------------------------------------- |
| `challenge-run.webp`    | running challenges (total_km, fastest)       |
| `challenge-lift.webp`   | lifting challenges (volume, count)           |
| `challenge-hybrid.webp` | hybrid + any other metric                    |
| `space-<spaceId>.webp`  | Community Space cards (directory + header) — |
|                         | one per id in `spaceDefs.ts` SPACE_DEFS,     |
|                         | e.g. `space-trail-running.webp`              |

They're picked up at **build time** (`import.meta.glob`) — no code
change needed. Until a file exists, the surface renders its designed
no-photo fallback (accent-tinted band + ghosted icon), so shipping
without assets is safe.

## Art direction

The renderer applies a sport-coded tint wash + a bottom scrim, and
overlays white text — so choose images that survive that treatment:

- moody / golden-hour / silhouette or back-view athletes beat bright
  grinning-model stock (which reads as advertising);
- meaningful detail in the upper two-thirds (the bottom band sits
  under a dark scrim + text);
- avoid busy high-contrast bottoms and embedded text/logos.

## Removed: the `food-*` stems

The Food calorie hero rendered an ambient time-of-day photo behind the
ring (`mealPhotoImage`, `--food-photo-scrim` / `--food-photo-ring-bed`).
`3929aeb7` ("Simplify daily summaries and reopenable logging controls",
2026-09-09) took the photo out of `FoodHeroCard` and with it the only
consumer, but left the three assets, both token pairs and this section
behind. All of that is gone now. **Don't re-add `food-*.webp` on the
strength of a table row**: nothing resolves those stems, so the files
would ship as dead weight in every build.

## Licensing and provenance

Only add images you have rights to distribute in a shipped app. Two
routes, and every file records which one it took in its commit message:

- **Licensed stock** — Unsplash/Pexels licences qualify; note the source
  URL. No watermarked, editorial-only, or scraped imagery.
- **Generated** — via `scripts/art/gemini-image.py` (`GEMINI_API_KEY`
  from the environment only). Note the model and keep the prompt in the
  commit message. Use this where the subject is generic; do NOT use it
  for a named real place — the race spaces are photographs of London,
  Newcastle, Edinburgh and the rest, and a generated stand-in would be
  a claim about a real city that isn't true.

**No trademarks, ever — this is the rule the set has actually broken.**
An audit on 2026-09-14 found three shipped files carrying live marks:
`challenge-lift` (ROGUE on the plyo box, mirrored BLUE STAR signage,
branded plates), `space-lifters` (a Houston Rockets jersey and a Nike
swoosh) and `space-triathlon-multisport` (a Movistar team skinsuit on a
CANYON bike). All three rendered on the Social page. They were replaced
with generated, brand-free frames. When sourcing or generating, check at
**3x brightness** before committing: a mark that is invisible in the
thumbnail is still in the file, and the wash the renderer applies does
not remove it.

Two known and accepted: `space-new-to-tropos` has "TRAINING DEPT" on a
shirt and `space-womens-running` has race bibs — generic apparel text
and meet numbers, neither a mark anyone owns. Incidental street signage
in the city shots (ARNDALE, ATLAS BAR) is the same category: it is what
the real place looks like.
