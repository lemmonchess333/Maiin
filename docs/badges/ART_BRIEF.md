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

**Regenerated 2026-09-14 to match the seal.** The first set (pastel
tier-tinted enamel, cream relief motifs) read as visibly plainer than the
black obsidian capsule it was revealed from — the shell out-dressed the
prize. The medal is now the same object family as the seal, so the reveal
reads as one thing opening to show what was inside it:

- **Shape:** pointy-top hexagon, the seal's rim — a thick bevelled rim of
  the tier metal with one specular highlight along its upper-left edges.
- **Face:** deep black polished enamel, smooth (no facets — the facets are
  the seal's), lit from behind the centre by the tier's glow so it shades
  from near-black at the rim to the glow colour at the middle.
- **Motif:** a single emblem sculpted as **solid tier-metal relief**, centred,
  with a faint glow around it as if lit from within. Filled silhouettes —
  line art (rings, outlines) reads worse as metal relief on a black face.
  Kept **inside the face**: an emblem that overruns the rim confuses the
  keyer (see `marathon` below) and breaks the set.
- **Background:** flat magenta (#FF00FF) for keying — the one colour none
  of the four metals or the black face contains.

**Tier metal + glow** (the same pairs the seal uses): bronze = polished
copper-bronze · warm amber · silver = brushed-steel silver · cool white ·
gold = polished gold · warm golden · platinum = white-gold platinum · soft
violet-white.

## How the medals are made — `scripts/art/generate-badges.py`

The whole run is one script (`GEMINI_API_KEY` from the environment only;
`gemini-3-pro-image`), four stages, ~35 calls:

1. **Master** — one gold medal (the `month_master` gemstone), generated with
   the **gold seal master on magenta** passed as `--seal-ref`, so the rim,
   camera and lighting are the capsule's. (That reference is a working
   file from the seal run, not a committed asset — the keyed
   `seal_gold.webp` is what ships.)
2. **Tier masters** — bronze / silver / platinum image-edited from the gold
   master: _"change only the metal and the glow"_.
3. **Badges** — each of the other 29 image-edited from **its tier master**:
   _"replace only the centre emblem"_. Editing from the tier master rather
   than the gold one is what keeps every silver badge the same silver.
4. **Key + frame** — `key-hexagon.py … 512 medal` keys the magenta to
   alpha and fits the hexagon to the **medal frame** (x 5.5..94.5,
   y 0.5..99.5 of 100 — the framing the first set shipped with, so the
   grid does not shift), then WebP at q82 (~25 KB; q88 was
   indistinguishable at 2× modal size and 20% heavier).

`--only <id> …` with `--skip-masters` re-rolls a single badge against the
saved tier masters in `--work`. Two badges needed it on the first run:
`marathon` (wings drawn inside the coin, unreadable at 64 px; then wings
overrunning the rim, which the keyer measured as the hexagon and squashed
it 7%) and `three_plate` (a stubby dumbbell, too close to
`hybrid_athlete`). Both motif strings in the script carry the fix.

The master prompt and the two edit templates live in the script — edit
them there, not here, so the doc cannot drift from what actually ran.

## Per-badge motifs (id · tier · motif)

The original brief's motif list, kept for the intent behind each badge. The
strings that actually ran — and the ones to edit for a re-roll — are the
`BADGES` table in `scripts/art/generate-badges.py`; where the two differ
(`first_pr` is a trophy cup, `three_plate` is a long bar, `marathon`'s wings
stay inside the face) the script is the truth.

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
- **Scripted (what actually ran):** `scripts/art/generate-badges.py` — see
  "How the medals are made" above. The motif table lives in the script.
- **Figma MCP fallback:** the connected Figma server can generate + export
  badge assets if you'd rather design them there than prompt an image model.

All 30 are illustrated (first set 2026-08-29, regenerated to match the seal
2026-09-14).

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
