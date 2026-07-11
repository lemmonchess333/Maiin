# Editorial imagery

Licensed athlete photography for **editorial surfaces** (challenge
cards today; plan/curated surfaces may join later). The peer activity
feed never uses these — feed cards render user-data imagery (route
scenes, muscle figures) by design. See `CONTEXT.md` → "Editorial
imagery" and `src/lib/editorialImages.ts` for the resolution logic.

## Drop-in contract

Add files with these exact stems (any of `.webp .avif .jpg .jpeg .png`;
prefer WebP ≤ 120 KB, landscape, ≥ 800 px wide):

| File                    | Used for                               |
| ----------------------- | -------------------------------------- |
| `challenge-run.webp`    | running challenges (total_km, fastest) |
| `challenge-lift.webp`   | lifting challenges (volume, count)     |
| `challenge-hybrid.webp` | hybrid + any other metric              |

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

## Licensing

Only add images you have rights to distribute in a shipped app —
Unsplash/Pexels licences qualify; note the source URL in the commit
message so provenance is auditable. No watermarked, editorial-only, or
scraped imagery.
