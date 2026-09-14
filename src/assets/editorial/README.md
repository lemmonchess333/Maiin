# Editorial imagery

Athlete and city photography for **editorial surfaces** — challenge
cards and Community Space cards today; plan/curated surfaces may join
later. Licensed stock, plus (since 2026-09-14) generated frames where
the subject is generic — see "Licensing and provenance" below for which
route a given file may take.

The peer activity feed never uses these: feed cards render user-data
imagery (route scenes, muscle figures) by design. See `CONTEXT.md` →
"Editorial imagery" and `src/lib/editorialImages.ts` for the resolution
logic.

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
with generated, brand-free frames, then superseded by the licensed photo
refresh below. When sourcing or generating, check at
**3x brightness** before committing: a mark that is invisible in the
thumbnail is still in the file, and the wash the renderer applies does
not remove it.

Incidental street signage in the city shots (ARNDALE, ATLAS BAR) records
what the real place looks like.

### Approved Social photo refresh — 2026-09-14

Six licensed Unsplash photographs now cover seven asset stems. The
lifting photograph is intentionally shared by lifting challenges and the
Lifters space. Credits, source URLs, licence links, original SHA-256 hashes,
crop rectangles and final encoding details are recorded in
[`sources-2026-09-14.json`](./sources-2026-09-14.json).

| Asset                             | Photographer   | Subject                     |
| --------------------------------- | -------------- | --------------------------- |
| `space-new-to-tropos`             | Steven Lelham  | Overhead track group        |
| `space-runners`                   | Fitsum Admasu  | Blue-hour runners           |
| `challenge-lift`, `space-lifters` | Victor Freitas | Hand and barbell detail     |
| `challenge-run`                   | Jeremy Lapak   | Runner on a sandstone slope |
| `space-triathlon-multisport`      | Markus Spiske  | Open-water swimmers         |
| `space-womens-running`            | Venti Views    | Golden-hour runner          |

The crops follow the approved shortlist, with extra headroom for Runners'
wider Space header, and exclude out-of-frame apparel logos. The swim caps
and track-group apparel needed additional local logo
removal with the built-in image editing tool; exact prompts are in the source
record. All final assets were checked at normal and 3x brightness. Originals
remain in the approved `tropos-social-photo-pack.zip`; only optimized covers ship here.
These photographs illustrate interests and challenges, not Tropos members,
endorsements or named local events.

### Follow-up Social photo upgrades — 2026-09-14

The Hybrid Training space and hybrid challenges now share Karsten Winegeart's
battle-rope photograph, with the small apparel and footwear logos removed using
the built-in image editor. This replaces the crowded Hybrid Training gym cover
and follows the existing shared-photo treatment for lifting.

The Manchester Marathon cover now uses Timiciuc Andrei's historic street view;
Great Manchester Run uses Balázs Gábor's riverside path and footbridge. Both are
real Manchester photographs. Their crops retain the main subject in the wider
Space header as well as the directory card.

All four assets are landscape WebP files below 120 KB. Photographer credits,
source URLs, downloaded-image hashes, exact crops, encoding details and the
logo-removal prompt are recorded in
[`sources-2026-09-14-followup.json`](./sources-2026-09-14-followup.json).
