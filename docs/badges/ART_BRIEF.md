# Badge artwork — art-direction brief + Nano Banana prompts

Goal: replace the lucide-icon-in-a-hex with a cohesive set of premium,
illustrated badge medals, so earning one feels like Opal/Apple-Fitness, not a
greyscale icon grid. The render seam is already wired — this doc is how to
produce the art and drop it in.

## How it plugs in (already built)

- `BadgeHex` takes an optional `imageSrc`. When present, the image **is** the
  badge; when absent it falls back to the lucide metallic hex. So the
  catalogue can adopt artwork **incrementally** — a half-illustrated set still
  renders cleanly.
- `BADGE_ART` (`src/features/streaks/badges.ts`) maps `badge.id → asset path`.
  Both the grid and the tap-to-reveal moment read it.
- To light a badge up: generate its art → save to `public/badges/<id>.webp` →
  add one line to `BADGE_ART`, e.g.
  `month_master: "/Maiin/badges/month_master.webp"` (note the `/Maiin/` base).

## Visual identity (keep the whole set cohesive)

One template, only the **motif** and the **tier metal** vary:

- **Shape:** pointy-top hexagon medal (matches the existing `BadgeHex`
  geometry), centred, symmetrical, filling ~90% of a square frame.
- **Material:** a polished 3D **enamel medal** with a beveled **{tier} metal**
  rim. Deep glossy enamel face, faintly **{tier}-tinted**.
- **Motif:** a single iconic emblem in soft cream/white relief (or subtle
  metal), centred. No text, no letters, no numbers.
- **Light:** soft top-left studio key light + one crisp specular highlight on
  the rim; gentle inner glow.
- **Background:** transparent (or pure black to key out). Dramatic, premium,
  app-icon quality. Crisp edges.

**Tier metals:** bronze = warm copper (#CD7F32) · silver = brushed silver
(#C0C0C0) · gold = rich gold (#FFD700) · platinum = cool platinum / white-gold
(#E5E4E2).

## Prompt skeleton (Nano Banana / Gemini 2.5 Flash Image)

> Premium 3D enamel achievement medal, **pointy-top hexagon**, **{TIER_METAL}
> beveled metal rim** with a polished specular highlight, deep glossy
> **{TIER_TINT}-tinted enamel** face, a single centred **{MOTIF}** in soft
> cream relief, subtle inner glow, soft top-left studio key light, dramatic
> **transparent background**, symmetrical, centred, app-icon style, crisp,
> high detail, no text, no letters, no numbers.

Cohesion tips:

1. Generate **one master badge first** (e.g. `month_master`), then use Nano
   Banana's **image-edit** mode — "keep this exact medal style/material/
   lighting, replace the centre emblem with {MOTIF} and the rim metal with
   {TIER_METAL}" — for every other badge. Editing from a reference is what
   keeps the set consistent.
2. Render at 1024×1024, transparent. Then optimize → **512×512 WebP**
   (`cwebp -q 82` or squoosh) into `public/badges/<id>.webp` (~10–25 KB each).
3. Keep emblems simple/iconic — they read at 64px in the grid.

## Per-badge motifs (id · tier · motif)

**Consistency**

- `first_step` · bronze · a single forward footprint / a sprout breaking soil
- `three_day` · bronze · three small rising sparks
- `week_warrior` · silver · a stylised flame with 7 facets
- `two_week` · silver · a twin flame
- `month_master` · gold · a faceted gemstone
- `two_month` · gold · an interlocked unbreakable chain link
- `century_club` · platinum · a laurel-wreathed "100" medal _(emblem only — no digits; use a laurel wreath circling a star)_
- `year_long` · platinum · a crown above a laurel wreath
- `early_bird` · bronze · a sunrise over a horizon line

**Lifting**

- `first_pr` · bronze · an upward trophy chevron
- `plate_club` · silver · a single weight plate, edge-on
- `two_plate` · gold · two stacked weight plates
- `three_plate` · platinum · a barbell loaded with three plates each side, ablaze
- `programme_complete` · silver · a checklist clipboard with a tick
- `tonnage_100` · gold · a lightning bolt over an anvil

**Running**

- `first_5k` · bronze · a running shoe with a motion swoosh
- `10k_club` · silver · a target/bullseye with a runner silhouette
- `half_marathon` · gold · a finish-line ribbon medal
- `marathon` · platinum · a winged finish-line medal / olive branch
- `speed_demon` · silver · a winged shoe with speed lines
- `century_km` · gold · a winding road into the distance / a map pin trail

**Nutrition**

- `macro_master` · silver · a balanced three-segment ring (P/C/F) as a target
- `protein_pro` · gold · a stylised cut of meat / muscle fibre emblem
- `hydration_hero` · silver · a water droplet with a shine
- `meal_prep_master` · gold · crossed fork & knife over a plate

**Hybrid**

- `hybrid_athlete` · bronze · a dumbbell crossed with a running shoe
- `balanced` · silver · perfectly balanced scales (lift one side, run the other)
- `iron_runner` · silver · a barbell fused with a running track curve
- `triple_threat` · gold · a three-pointed star (lift / run / fuel)
- `ultimate_athlete` · platinum · a radiant crowned star / sunburst medal

## Generation options

- **Manual (simplest):** paste the skeleton + each motif into the Gemini app /
  AI Studio ("Nano Banana"), download, optimize, drop in `public/badges/`.
- **Scripted:** a `scripts/generate-badge-art.ts` that loops `BADGE_DEFINITIONS`,
  fills the skeleton per badge, calls the Gemini image API (the app already has
  Vertex creds via `src/lib/gemini.ts`), writes WebP to `public/badges/`.
  (Not committed yet — easy to add once the model/key path is chosen.)
- **Figma MCP fallback:** the connected Figma server can generate + export
  badge assets if you'd rather design them there than prompt an image model.

Start with the 8–10 **earnable** badges (consistency streaks + `balanced`) so
every shown medal is both real _and_ beautiful, then fill the rest as their
earning rules land.

## The seal (the sealed hexagon a new badge is tapped out of)

`BadgeEarnedModal` shows a new badge inside a sealed hexagon that the user
taps three times to crack and break open. Since 2026-09-13 the seal is
**rendered art**, one WebP per tier (`public/badges/seal_{tier}.webp`,
~25 KB each, registered in `SEAL_ART`), layered over an SVG seal
(`src/features/streaks/BadgeSeal.tsx`) that stays as the instant fallback
while the image loads. The cracks, the light sweep per tap, the shards
(cut from the same image along `SEAL_SHARDS`) and the dust on the break
are SVG/CSS on top of the art, so they still animate.

**The object:** a pointy-top hexagon of black obsidian cut like a black
diamond (six facets meeting behind the centre), held in a bevelled rim of
the tier metal, with a round wax-seal medallion of the same metal in the
centre embossed with the Tropos chevron, and the tier's light glowing from
inside. Bronze = copper rim, amber ember glow · silver = brushed steel,
cool white glow · gold = gold, golden glow · platinum = white gold,
violet-white glow (the stone itself takes a violet cast).

**How it was made** — `gemini-3-pro-image` via `scripts/art/gemini-image.py`
(key from `GEMINI_API_KEY`), one gold master then three image-edits so all
four are the same object, keyed and framed by `scripts/art/key-hexagon.py`:

Master prompt:

> A premium achievement capsule for a fitness app, seen straight on,
> centred: a pointy-top hexagon of deep black obsidian cut like a black
> diamond — six large flat triangular facets meeting behind the centre,
> each catching a soft studio key light from the top left slightly
> differently so the facet edges read as fine crisp lines — held in a
> thick bevelled rim of polished gold metal with one sharp specular
> highlight along its upper-left edges. In the exact centre a small round
> wax-seal medallion of the same polished gold, embossed with a single
> simple upward chevron mark (like a caret ^), sitting slightly recessed
> into the stone. A faint warm golden glow seeps out along the stone's
> inner edges and around the medallion, as if something bright is sealed
> inside. Symmetrical, sharp, photoreal 3D render, app-icon quality, the
> hexagon filling about 88% of the square frame. No text, no letters, no
> numbers, no other objects. Flat solid magenta (#FF00FF) background with
> no shadow, reflection or gradient on the background.

Tier edit (with the master as `--ref`):

> Keep this exact object, camera angle, framing, lighting, facets,
> wax-seal shape with its chevron, and the flat solid magenta background.
> Change only the metal and the glow: every gold metal part (the bevelled
> rim and the wax-seal medallion) becomes {polished warm copper-bronze
> metal | polished brushed-steel silver metal | polished white-gold
> platinum metal with a faint cool sheen}, and the golden inner glow
> becomes {a warm amber ember glow | a cool white glow | a soft
> violet-white glow}. Nothing else changes.

Then `key-hexagon.py master-{tier}.png keyed-{tier} 512` keys the magenta
to alpha (with despill), finds the hexagon, and maps its bounding box to
the app's seal frame (x 7..93, y 3..97 of 100 — `SEAL_HEX`) so the SVG
cracks, clip and shards line up with the art. The magenta background is
what makes keying trivial: it is the one colour none of the four metals
or the black stone contains. Review on `/dev/badge-seal` (dev builds) or
in the `badge-seal-*` capture frames.
