# Editorial imagery

Licensed athlete photography for **editorial surfaces** (challenge
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

## Licensing

Only add images you have rights to distribute in a shipped app —
Unsplash/Pexels licences qualify; note the source URL in the commit
message so provenance is auditable. No watermarked, editorial-only, or
scraped imagery.
