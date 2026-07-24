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
| `food-breakfast.webp`   | Food calorie hero, morning (before 11:00)    |
| `food-lunch.webp`       | Food calorie hero, midday (11:00–17:00)      |
| `food-dinner.webp`      | Food calorie hero, evening (after 17:00)     |

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

For the `food-*` shots specifically: prefer **calm flat-lays** (a plate
of eggs, a lunch bowl) over busy plated scenes — the calorie number sits
centred over the image behind a radial scrim, so a quiet centre reads
crispest. The food hero renders these in **dark mode only** (a photo
behind the light card washes out muddy); light mode keeps the purple
halo, so tune candidates against a dark scrim.

**Crop tight — no letterbox.** The food hero paints the image
edge-to-edge over the whole card (`object-cover`, `absolute inset-0`),
so any black/blank border baked into the file renders as a hard band
inside the card and reads as "the photo doesn't fit". When sourcing
from a phone screenshot, crop to the photo's true bounds — don't leave
the surrounding letterbox rows in. Check the finished file's outer rows
and columns are actual image content before committing it.

**Grade the asset dark (mean luminance ≈ 105).** The hero's scrim is
deliberately light (0.42) so the food stays visible, which means the
contrast that keeps the ring and captions readable has to come from the
IMAGE, not the wash. A bright, un-graded shot dropped in as-is will
wash the text out. The shipped `food-breakfast.webp` was graded to
≈ 34% darker than its source; match that, or move the
`--food-photo-scrim` values in `src/index.css` to suit the new photo.
Check with: `sharp(file).stats()` → mean of the RGB channel means.

## Licensing

Only add images you have rights to distribute in a shipped app —
Unsplash/Pexels licences qualify; note the source URL in the commit
message so provenance is auditable. No watermarked, editorial-only, or
scraped imagery.
