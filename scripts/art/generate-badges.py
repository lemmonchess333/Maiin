#!/usr/bin/env python3
"""Regenerate the 30 badge medals so they match the seal (docs/badges/ART_BRIEF.md).

Pipeline, all through gemini-image.py (key from GEMINI_API_KEY only) and
key-hexagon.py:

  1. MASTER  — one gold medal (the month_master gemstone), generated with the
     gold seal master as a style reference so rim, lighting and camera match
     the capsule the badge is revealed from.
  2. TIERS   — bronze / silver / platinum image-edited from the gold master:
     only the metal and the glow change.
  3. BADGES  — each badge image-edited from ITS tier master: only the centre
     emblem changes. month_master IS the gold master.
  4. KEY     — magenta → alpha, hexagon fitted to the medal frame, 512 px
     WebP at q82 into public/badges/<id>.webp.

Usage (from the repo root):
  GEMINI_API_KEY=… python3 scripts/art/generate-badges.py --seal-ref path/to/seal-master.png [--work DIR] [--only id …] [--skip-masters]

--work keeps the intermediates (masters, raw generations, keyed PNGs) so a
single badge can be re-rolled with --only without regenerating the masters.
The seal master on magenta is not committed (only its keyed WebP is), so
pass the file from the seal run; without it the master is generated from
the prompt alone and will drift from the capsule."""
import argparse, os, subprocess, sys, time, concurrent.futures as cf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "gemini-image.py")
KEY_HEX = os.path.join(HERE, "key-hexagon.py")
if not os.environ.get("GEMINI_API_KEY"):
    sys.exit("GEMINI_API_KEY is not set (never commit it; export it for the run)")

METAL = {
    "bronze": ("polished warm copper-bronze", "warm amber"),
    "silver": ("polished brushed-steel silver", "cool white"),
    "gold": ("polished gold", "warm golden"),
    "platinum": ("polished white-gold platinum", "soft violet-white"),
}
TIER_EDIT = {
    "bronze": ("polished warm copper-bronze metal", "a warm amber ember glow"),
    "silver": ("polished brushed-steel silver metal", "a cool white glow"),
    "platinum": ("polished white-gold platinum metal with a faint cool sheen", "a soft violet-white glow"),
}

MASTER_PROMPT = (
    "A premium achievement medal for a fitness app, the prize that was sealed inside the black obsidian "
    "capsule in the reference image, seen straight on and centred. Same object family as the reference: a "
    "pointy-top hexagon held in the same thick bevelled rim of polished gold metal with one sharp specular "
    "highlight along its upper-left edges. The face is deep black polished enamel, smooth and glossy (no "
    "facets), with a warm golden light glowing up from behind the centre so the enamel shades from near-black "
    "at the rim to a dark warm amber at the middle. In the exact centre, one emblem: a faceted gemstone, "
    "sculpted as a solid polished gold metal relief with clean simple silhouette, softly lit from the top "
    "left, with a faint warm golden glow around it as if lit from within. Symmetrical, sharp, photoreal 3D "
    "render, app-icon quality, the hexagon filling about 88% of the square frame. No text, no letters, no "
    "numbers, no other objects. Flat solid magenta (#FF00FF) background with no shadow, reflection or "
    "gradient on the background."
)

def tier_prompt(tier):
    metal, glow = TIER_EDIT[tier]
    return (
        "Keep this exact object, camera angle, framing, lighting, the smooth black enamel face, the gemstone "
        "emblem and its size, and the flat solid magenta background. Change only the metal and the glow: every "
        f"gold metal part (the bevelled rim and the gemstone emblem) becomes {metal}, and the warm golden light "
        f"behind the centre of the face and the glow around the emblem becomes {glow}. Nothing else changes."
    )

def badge_prompt(tier, motif):
    metal, glow = METAL[tier]
    return (
        f"Keep this exact medal: camera angle, framing, the bevelled {metal} metal rim, the smooth black enamel "
        f"face, the lighting, the {glow} glow behind the centre of the face, and the flat solid magenta "
        "background. Replace only the centre emblem: remove the gemstone and put in its place "
        f"{motif}, sculpted as the same solid {metal} metal relief, the same overall size as the gemstone was, "
        f"centred, with the same faint {glow} glow around it. A simple, clean, iconic silhouette that reads "
        "clearly at small size. No text, no letters, no numbers. Nothing else changes."
    )

# id · tier · motif. Emblems are solid silhouettes: they render as metal
# relief on a black face, so line-art motifs (rings, outlines) read worse
# than filled shapes. Keep every emblem INSIDE the face — marathon's wings
# overran the rim on the first pass and the keyer then measured the wing
# tips as the hexagon, squashing it 7%.
BADGES = [
    ("first_step", "bronze", "a single bare footprint pointing upward"),
    ("three_day", "bronze", "three four-pointed sparkle stars rising in a diagonal, the largest at the top right"),
    ("week_warrior", "silver", "a single stylised flame"),
    ("two_week", "silver", "a twin flame: two stylised flames side by side sharing one base"),
    ("month_master", "gold", None),  # the gold master itself
    ("two_month", "gold", "two interlocked chain links"),
    ("century_club", "platinum", "a laurel wreath circling a five-pointed star"),
    ("year_long", "platinum", "a royal crown sitting above a laurel wreath"),
    ("early_bird", "bronze", "a sunrise: a half sun with short rays rising over a straight horizon line"),
    ("first_pr", "bronze", "a trophy cup with two handles"),
    ("plate_club", "silver", "a single round weight plate seen face-on, with its centre hole"),
    ("two_plate", "gold", "two round weight plates side by side, overlapping slightly, seen face-on"),
    ("three_plate", "platinum", "a long straight barbell bar seen from the side, spanning most of the emblem width, with three large round plates stacked at each end"),
    ("programme_complete", "silver", "a clipboard with a bold tick mark on it"),
    ("tonnage_100", "gold", "a lightning bolt striking down onto an anvil"),
    ("first_5k", "bronze", "a running shoe in profile with a short motion swoosh behind it"),
    ("10k_club", "silver", "a target of three concentric rings"),
    ("half_marathon", "gold", "a round finisher's medal hanging from a short V-shaped ribbon"),
    ("marathon", "platinum", "a small round finisher's medal at the centre with a pair of spread wings, one each side, the whole emblem kept well inside the black face and never touching the rim"),
    ("speed_demon", "silver", "a winged running shoe in profile with three speed lines behind it"),
    ("century_km", "gold", "a winding road with a dashed centre line receding into the distance"),
    ("macro_master", "silver", "a ring made of three separate arc segments, like a donut chart"),
    ("protein_pro", "gold", "a flexed arm showing the bicep"),
    ("hydration_hero", "silver", "a single water droplet"),
    ("meal_prep_master", "gold", "a fork and a knife crossed over a round plate"),
    ("hybrid_athlete", "bronze", "a dumbbell crossed over a running shoe"),
    ("balanced", "silver", "a set of balanced weighing scales with two pans"),
    ("iron_runner", "silver", "a barbell above a curved running-track arc with lane lines"),
    ("triple_threat", "gold", "a three-pointed star"),
    ("ultimate_athlete", "platinum", "a five-pointed star with a small crown above it, surrounded by a sunburst of short rays"),
]

ap = argparse.ArgumentParser()
ap.add_argument("--seal-ref", help="the gold seal master on magenta, as a style reference for the medal master")
ap.add_argument("--work", default=os.path.join(HERE, ".work-badges"))
ap.add_argument("--out-dir", default=os.path.join(HERE, "..", "..", "public", "badges"))
ap.add_argument("--only", nargs="*", default=[])
ap.add_argument("--skip-masters", action="store_true", help="reuse --work/tier-*.png")
ap.add_argument("--workers", type=int, default=3)
a = ap.parse_args()
os.makedirs(a.work, exist_ok=True)

def gen(out, prompt, ref=None):
    """Call gemini-image.py; return (ok, redacted output)."""
    cmd = [sys.executable, GEN, "--out", out, "--prompt", prompt] + (["--ref", ref] if ref else [])
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(out):
            return True, r.stdout.strip()
        time.sleep(8 * (attempt + 1))
    return False, (r.stdout + r.stderr).replace(os.environ["GEMINI_API_KEY"], "<key>")[-300:]

tier_png = lambda t: os.path.join(a.work, f"tier-{t}.png")

if not a.skip_masters:
    ok, msg = gen(tier_png("gold"), MASTER_PROMPT, a.seal_ref)
    print("master gold:", "ok" if ok else "FAILED " + msg)
    if not ok: sys.exit(1)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for t, (ok, msg) in zip(TIER_EDIT, ex.map(lambda t: gen(tier_png(t), tier_prompt(t), tier_png("gold")), TIER_EDIT)):
            print(f"tier {t}:", "ok" if ok else "FAILED " + msg)

def one(row):
    bid, tier, motif = row
    raw = os.path.join(a.work, f"{bid}.png")
    if motif is None:
        Image.open(tier_png(tier)).save(raw)
        ok, msg = True, "master"
    else:
        ok, msg = gen(raw, badge_prompt(tier, motif), tier_png(tier))
    if not ok:
        return bid, "FAILED " + msg
    stem = os.path.join(a.work, f"keyed-{bid}")
    k = subprocess.run([sys.executable, KEY_HEX, raw, stem, "512", "medal"], capture_output=True, text=True)
    if k.returncode != 0:
        return bid, "KEY FAILED " + k.stderr[-200:]
    dst = os.path.join(a.out_dir, f"{bid}.webp")
    Image.open(stem + ".png").save(dst, quality=82, method=6)
    return bid, f"ok {os.path.getsize(dst)} B  {k.stdout.splitlines()[0]}"

rows = [r for r in BADGES if not a.only or r[0] in a.only]
with cf.ThreadPoolExecutor(a.workers) as ex:
    for bid, msg in ex.map(one, rows):
        print(bid, msg, flush=True)
