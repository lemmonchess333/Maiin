# Editorial imagery

City and community photography for **editorial surfaces**: the race and
Community Space cards, the race and Space headers, and Together's race
hero. Challenges carry their own medal art instead (Soc16). Licensed stock, plus (since 2026-09-14) generated frames where
the subject is generic — see "Licensing and provenance" below for which
route a given file may take.

The peer activity feed never uses these: feed cards render user-data
imagery (route scenes, muscle figures) by design. See `GLOSSARY.md` →
"Editorial imagery" and `src/lib/editorialImages.ts` for the resolution
logic.

### Unsplash+ Space covers — 2026-11-12

With Unsplash+ licensed for the welcome (DS9), the owner asked for the
Social covers to be improved where an Unsplash+ photograph is clearly
better, and for the race covers to stay. Twenty-one candidates were drawn
as directory cards and Space headers beside the current covers, and he
took five, then Triathlon & Multisport as a sixth. Trail Running and
Destination Races keep theirs.

| Asset                        | Photographer   | Was                                  | Now                                               |
| ---------------------------- | -------------- | ------------------------------------ | ------------------------------------------------- |
| `space-new-to-tropos`        | Leire Cavia    | Silhouettes on a red track           | Six friends in kit laughing at the camera         |
| `space-runners`              | Getty Images   | Five people in hoodies on a bridge   | A mixed group running at you through a green park |
| `space-womens-running`       | Natalia Blauth | Two women on a path, one in a hoodie | Three women running together, mountains behind    |
| `space-lifters`              | Getty Images   | A black-and-white squat class        | A class in the front rack, bright gym, in colour  |
| `space-hybrid-training`      | Leire Cavia    | One man on battle ropes              | A man and a woman passing a medicine ball         |
| `space-triathlon-multisport` | Getty Images   | Two swimmers seen from above         | A swimmer at eye level, red cap, sun and spray    |

Each is the full source width cut to 24:13, so the faces sit inside both
the directory card and the 393 × 176 header, original colour, no
retouching. Five are 1200 px wide and under 120 KB. `space-runners` is
1000 px at about 152 KB: its leaves reach 120 KB only at a quality that
blotches, the reason the audit below kept seven dense covers over budget.
Unsplash+ photographs carry model releases; the downloads were registered
through the Unsplash API. Sources, crops, hashes and each file's mark
check are in
[`sources-2026-11-12-social-covers.json`](./sources-2026-11-12-social-covers.json).

### Provenance found for the unrecorded covers — 2026-11-10

Twelve covers shipped with no source record (first committed in #1631 and
#1690, July 2026). Ten are now traced to exact free Unsplash photographs,
each confirmed by aligning the 2400 px download to the shipped file and by
eye: `space-trail-running` (Lucas Canino), `space-travel-racecations`
(Andrea Leopardi), `space-london-marathon` (Charles Postiaux),
`space-great-north-run` (Jack Foster), `space-brighton-marathon` (Rhys
Kentish), `space-edinburgh-marathon` (Mike Newbry), `space-cardiff-half`
(Nick Fewings), `space-great-birmingham-run` (Sarah Doffman),
`space-leeds-10k` (Paul Rigel) and `space-royal-parks-half` (V2F). Records,
with location evidence, are in
[`sources-2026-11-10-provenance.json`](./sources-2026-11-10-provenance.json).

`space-the-big-half` and `space-london-10000` were not found by text,
photographer or image searches. The owner supplied them through ChatGPT
(owner, 2026-11-10) and keeps them. Still open: nothing in
`space-royal-parks-half` or its caption shows that it is Hyde Park.

### Cover audit — 2026-11-10

The owner, on Social: the weekly challenge's photo is poor quality, so find a
better one and check whether any other cover falls below the marathon and
space covers. All 85 covers were drawn in every band they are used in and
their darkest flat area checked at 3× brightness. Six were weak. Four race
and space covers among them are replaced, each with a sharper photograph of
the same subject. `space-runners` keeps its photograph: the owner kept a
replacement only where it was clearly better (2026-11-10), and the group
running towards the camera is sharp enough at card size. `challenge-weekly`
is not replaced, because challenges move to their own medal art (Soc16) and
carry no photograph:

| Asset                        | Photographer    | Was                                         | Now                                                    |
| ---------------------------- | --------------- | ------------------------------------------- | ------------------------------------------------------ |
| `space-lifters`              | Sven Mieke      | Three people chatting, nobody lifting       | A squat class, three lifters (black and white)         |
| `space-seville-marathon`     | Taisia Karaseva | Fisheye, bent verticals, empty paving       | Plaza de España, straight and sharp                    |
| `space-bournemouth-half`     | Jordy Muñoz     | A sun in an orange sky, nothing of the town | Bournemouth Pier with the beach in front               |
| `space-los-angeles-marathon` | Jeffrey Clayton | Downtown a thin strip on a hazy horizon     | The downtown skyline, palms in front, mountains behind |

Each is a 2400 px Unsplash source, its download registered through the
Unsplash API, encoded as 1200 × 600 WebP under 120 KB. The race covers' records
carry their location evidence; none of their captions names the place, so each
is identified from its landmarks. The rooftop names on the Los Angeles towers
(2–3 px at card size) are treated as city signage, as the 2026-10-17
covers below treat theirs. Sources, crops and
hashes are in
[`sources-2026-11-10-cover-audit.json`](./sources-2026-11-10-cover-audit.json).

Seven covers are over 120 KB and are kept as they are: `space-royal-parks-half`
(250 KB), `space-trail-running`, `space-great-north-run`, `space-the-big-half`,
`space-london-marathon`, `space-london-10000` and `space-edinburgh-marathon`.
They are dense crowd and city scenes: at 1200 px they reach 120 KB only at
WebP quality 55 or lower (`space-royal-parks-half` is still 212 KB there),
which brings back the blotches this audit replaced covers for, and a cover
loads only with its card. The covers that had no source record are traced in
the section above.

### Real Social covers — 2026-10-31

Eight generic challenge and Space covers now use distinct, real Pexels
photographs. The challenge images show a timed workout, a deadlift, a track
run, a trail run and a group run. The Space images show gym friends, two women
running together and a mixed running group. These are editorial examples,
not Tropos members, endorsements or named events. All ship locally as
1200 × 600 WebP files below 120 KB, with no retouching or recolouring.
The source pages, photographers, licence, exact crops and hashes are in
[`sources-2026-10-31-real-social-covers.json`](./sources-2026-10-31-real-social-covers.json).
The generated-image record below remains for provenance of the replaced files.

### Earlier Social editorial refresh — 2026-10-31

Eight generic challenge and Space covers used generated, brand-free
photography. Training Minutes and Strength Builder replaced photos with visible
Nike marks. Lifters, Runners and Women's Running showed people training together;
Fastest 5K, Mileage and Together kept the athlete readable at mobile card size.
These were editorial scenes, not Tropos members or real events. All eight were
1200 × 600 WebP files below 120 KB, checked in the challenge/Space crops and
at 3× brightness for marks. Full prompts, source and output hashes, and encode
settings are in
[`sources-2026-10-31-social-refresh.json`](./sources-2026-10-31-social-refresh.json).
The older source records below remain as history of the covers they replaced.

### Marathon and seasonal refresh — 2026-10-17

Eight new destination covers show Cape Town, Rome, Athens, Prague, Vienna,
Frankfurt, Honolulu and Los Angeles. They are real licensed Unsplash photographs
of the destination, not official race images or a course guarantee.

The four seasonal covers now use generated generic editorial athletes, with
clear spring greenery, summer coast, autumn foliage and winter gym light.
These depict neither real Tropos members nor a named race. The built-in image
generation tool produced each seasonal asset separately. Monthly Strength
Builder used a real licensed barbell photograph by Ambitious Studio\* | Rick
Barrett in that refresh, replacing the generated plate-loading scene after its
equipment geometry failed visual review. The 2026-10-31 refresh replaced that
cover again. Full prompts for generated assets, source/output hashes,
crops and encoding settings are recorded in
[`sources-marathons-challenges-2026-10-17.json`](./sources-marathons-challenges-2026-10-17.json).
The superseded generated strength record is retained in `supersededImages`.
The earlier seasonal source records below are retained as history.

Every new asset is a local landscape WebP, 1200 px wide and under 120 KB.
Challenge cards have a taller photo band so the subject remains readable on
small screens. The four seasonal covers and monthly strength use an upper focal
point. Existing unique challenge covers continue to resolve by challenge ID.

## Drop-in contract

The welcome's photographs of athletes are not here: they live in
`src/assets/welcome/` with their own rules.

Photographs here are for places and communities only (Soc16): a race shows
its real place, a Space its cover. A challenge carries no photograph; its
picture is its own medal (`MedalArt`), as Strava's, Nike Run Club's and
Garmin's challenges are badge art. The `challenge-*` covers were retired on
2026-11-10, and `editorialImages.test.ts` fails on any file here that is
not a `space-` stem. Their manifests below stay as history.

Add files with this stem (any of `.webp .avif .jpg .jpeg .png`; prefer WebP
≤ 120 KB, landscape, ≥ 800 px wide):

| File                   | Used for                                    |
| ---------------------- | ------------------------------------------- |
| `space-<spaceId>.webp` | Community Space and race cards (directory,  |
|                        | header, Together's race hero, and each race |
|                        | in the run plan's race list): one per id in |
|                        | `spaceDefs.ts` SPACE_DEFS, e.g.             |
|                        | `space-trail-running.webp`                  |

**No two files may be the same photo**: `editorialImages.test.ts` fails on
a byte-identical pair. Until 2026-10 several race cards shared a city view;
the owner's word for it was "recycled".

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
routes, and every file records which one it took in a source manifest or its
commit message:

- **Licensed stock** — Unsplash/Pexels licences qualify; note the source
  URL. No watermarked, editorial-only, or scraped imagery.
- **Generated** — via the built-in image generation tool or
  `scripts/art/gemini-image.py` (`GEMINI_API_KEY` from the environment only).
  Note the model and keep the prompt in a source manifest or commit message.
  Use this where the subject is generic; do NOT use it
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

### Marathon expansion — 2026-09-14

Fourteen distinct destination photos cover the newly added marathons. All are
real photographs under the free Unsplash License, downloaded into the app;
there are no remote image dependencies. Source pages, photographers, location
evidence, original hashes, crop rectangles and shipped-file hashes are in
[`sources-marathon-expansion-2026-09-14.json`](./sources-marathon-expansion-2026-09-14.json).
These show city context rather than official race photography or a promised
future course. The scope and date sources are documented in
[`marathon-expansion.md`](../../../docs/proposals/marathon-expansion.md).

| Race                   | Photographer       | Source                                                                                                          |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| yorkshire-marathon     | Al Elmes           | [Photo](https://unsplash.com/photos/an-aerial-view-of-a-city-with-a-cathedral-yBPCyAkGfik)                      |
| chester-marathon       | Martina Jorden     | [Photo](https://unsplash.com/photos/a-group-of-people-walking-down-a-street-next-to-tall-buildings-hvXetOc-gDA) |
| loch-ness-marathon     | Piotr Musioł       | [Photo](https://unsplash.com/photos/black-wooden-fence-near-lake-during-daytime-1niYyd4NbxE)                    |
| newport-marathon       | Richard Williams   | [Photo](https://unsplash.com/photos/newport-transporter-bridge-over-river-Pn4zpHUfFwg)                          |
| belfast-marathon       | K. Mitch Hodge     | [Photo](https://unsplash.com/photos/belfast-city-hall-uk-ctdOWCcXYUM)                                           |
| leeds-marathon         | Paul Rigel         | [Photo](https://unsplash.com/photos/an-aerial-view-of-a-city-with-tall-buildings-2G6Jl7M7PJc)                   |
| milton-keynes-marathon | Ethan Wilkinson    | [Photo](https://unsplash.com/photos/aerial-view-of-green-grass-field-near-lake-during-daytime-mdIObkQ8sXA)      |
| new-york-city-marathon | Brett Wharton      | [Photo](https://unsplash.com/photos/a-view-of-a-city-skyline-from-a-park-hblDWOyKork)                           |
| chicago-marathon       | Ruben Mavarez      | [Photo](https://unsplash.com/photos/chicago-skyline-with-a-bridge-over-the-river-EccNx7qWjzE)                   |
| paris-marathon         | Madalena Veloso    | [Photo](https://unsplash.com/photos/arc-de-triomphe-e2rtyRTCsns)                                                |
| dublin-marathon        | Alessandro Santoro | [Photo](https://unsplash.com/photos/hapenny-bridge-over-river-liffey-dublin-57S4Ui1jtVw)                        |
| southampton-marathon   | Colin Osborne      | [Photo](https://unsplash.com/photos/a-marina-filled-with-lots-of-boats-next-to-tall-buildings-7w4nbbYLJKY)      |
| boston-marathon        | Jun Ren            | [Photo](https://unsplash.com/photos/w5PnmpqSX_s)                                                                |
| berlin-marathon        | Xander Gonera      | [Photo](https://unsplash.com/photos/the-brandenburg-gate-in-berlin-germany-EmGJdoIvp3A)                         |

### Race catalogue and missing covers — 2026-10-04

Sixteen licensed Unsplash destination photographs cover the eight new races
and the eight existing races that had no photograph. All 42 races now have a
local cover. Credits, source and licence links, original/output hashes and crop
details are recorded in
[`sources-race-expansion-2026-10-04.json`](./sources-race-expansion-2026-10-04.json).

The images retain their original colour, ship at 1000–1200 px wide and remain
under 120 KB each. Review covered directory cards in both themes, the wider
393 × 176 Space-header crop, and 3× brightness. These are destination images,
not official race photography or a promise about the course.

### Shorter races and ultras — 2026-10-04

Fifteen additional race covers use eight new licensed destination photographs
and the existing Edinburgh, Valencia, York and Inverness images. Races in the
same location can share the same photograph. All covers are landscape WebP,
at least 800 px wide and below 120 KB. Source links, photographers, licences,
hashes and reuse references are in
[`sources-short-races-ultras-2026-10-04.json`](./sources-short-races-ultras-2026-10-04.json).

The new locations are Bournemouth, Sheffield, Lincoln, the Forth road bridges,
the Kelpies, the South Downs, Avebury and the Chiltern Hills. These illustrate
the destination or region, not an official race image or course guarantee.

### One photo per challenge and per race — 2026-10-17

The owner, on Social: "needs to have a lot more, these are just recycled".
Three photos had covered every challenge by metric, two of them shared with
the Lifters and Hybrid Training spaces, and seven race covers reused another
race's city photograph. Sixteen licensed Unsplash photographs replace them:
nine challenge covers, one for each challenge the server defines, and seven
race covers. `challenge-lift`, `challenge-run` and `challenge-hybrid` are
retired (their records stay in the 2026-09-14 source files); `space-lifters`
and `space-hybrid-training` keep their photographs, now on one card each.
Credits, source pages, hashes, crops, encodings and the race covers' location
evidence are in [`sources-2026-10-17.json`](./sources-2026-10-17.json).

| Asset                     | Photographer      | Subject                                   |
| ------------------------- | ----------------- | ----------------------------------------- |
| `challenge-weekly`        | Morrow Solutions  | Back squat set-up, dark gym               |
| `challenge-mileage`       | lucas Favre       | Runner on a wet road at dusk              |
| `challenge-hybrid-hero`   | Alora Griffiths   | Kettlebells and a hex bar on a track      |
| `challenge-season-spring` | Fran Couto        | Runner on a forest singletrack            |
| `challenge-season-summer` | Milos Lopusina    | Beach run at sunset                       |
| `challenge-season-autumn` | Greg Rosenke      | Two runners on a misty leaf-covered trail |
| `challenge-season-winter` | Corey Young       | Deadlift set-up, black and white          |
| `challenge-fastest-5k`    | R\_ INVSCIMENTO   | Track race, panned blur                   |
| `challenge-together`      | Gaëtan Spinhayer  | Runners strung along a ridge at dusk      |
| `space-edinburgh-5k`      | Rob Wingate       | Calton Hill at twilight                   |
| `space-edinburgh-half`    | Joan              | The castle above autumn trees             |
| `space-bournemouth-5k`    | Belinda Fewings   | Boscombe Pier in a storm                  |
| `space-bournemouth-half`  | Tomas Kostadinov  | Sunset over the beach                     |
| `space-river-ness-5k`     | Ben Wicks         | Inverness from the River Ness             |
| `space-valencia-half`     | Northleg Official | Torres de Quart                           |
| `space-york-10k`          | Scott Precious    | The Minster through the city walls        |

All are landscape WebP at 1200 × 753, original colour, below 120 KB, and were
checked at 3x brightness. The kettlebell's moulded "24KG" is its weight, not a
maker's mark. The Dugald Stewart Monument's carved name on Calton Hill is
faint at 3x and treated like the city signage above. Northleg asks for a
credit link (northleg.com); the Unsplash License does not require one. In the
challenge card's 361 × 112 band `challenge-weekly` loses the lifter's head;
the bar and back still read.
