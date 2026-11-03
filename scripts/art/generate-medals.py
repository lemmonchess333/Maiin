#!/usr/bin/env python3
"""Illustrate the challenge medals in the badges' material (docs/badges/MEDAL_ART_BRIEF.md).

One illustration per challenge DEFINITION and tier, never per edition: the
edition ("NOV 2026") and the tier's goal ("50 km") are drawn in code over
the art (src/features/challenges/MedalArt.tsx), so a new month needs no new
image. 11 definitions x 3 tiers = 33 medals, plus 3 tier masters.

Pipeline, all through gemini-image.py (key from GEMINI_API_KEY only) and
key-hexagon.py, as generate-badges.py runs the badges:

  1. MASTER  — one gold medal: a round coin with a five-pointed star,
     generated with a gold BADGE as the style reference (default
     public/badges/month_master.webp, put on magenta first) so the rim
     metal, the black enamel face, the lighting and the camera are the
     badges', and medals and badges read as one family. A medal is round,
     never a hexagon.
  2. TIERS   — bronze / silver image-edited from the gold master: only the
     metal and the glow change.
  3. MEDALS  — each definition image-edited from ITS tier master: only the
     emblem changes. The lower third of the face stays plain enamel: the
     goal is printed there in code.
  4. KEY     — magenta → alpha, the coin fitted to the `coin` frame (it
     fills 96% of the square), 512 px WebP at q82 into
     public/medals/<definition>-<tier>.webp.

Then add each "<definition>-<tier>" that came out well to MEDAL_ART_KEYS in
src/features/challenges/medalArt.ts; the procedural medal stands in for any
that is not listed.

Usage (from the repo root):
  GEMINI_API_KEY=… python3 scripts/art/generate-medals.py [--style-ref path.png|.webp] [--work DIR] [--only definition …] [--tiers gold …] [--skip-masters]

--work keeps the intermediates (masters, raw generations, keyed PNGs) so one
medal can be re-rolled with --only (and --tiers) and --skip-masters without
regenerating the masters."""
import argparse, os, subprocess, sys, time, concurrent.futures as cf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
GEN = os.path.join(HERE, "gemini-image.py")
KEY_HEX = os.path.join(HERE, "key-hexagon.py")

# The tiers a challenge awards (functions/lib/medals.js MEDAL_TIERS). The
# metal and glow pairs are the badges' (generate-badges.py METAL).
METAL = {
    "bronze": ("polished warm copper-bronze", "warm amber"),
    "silver": ("polished brushed-steel silver", "cool white"),
    "gold": ("polished gold", "warm golden"),
}
TIER_EDIT = {
    "bronze": ("polished warm copper-bronze metal", "a warm amber ember glow"),
    "silver": ("polished brushed-steel silver metal", "a cool white glow"),
}

# definition · emblem. The definitions are MEDAL_DEFINITIONS in
# src/features/challenges/medalArt.ts, one per challenge the server builds
# (functions/lib/challengeDefs.js), pinned equal by medalArt.cross.test.ts.
# Emblems are filled silhouettes (line art reads worse as metal relief on a
# black face), each distinct from the 30 badges' emblems, and drawn from the
# icon each definition carries in challengeDefs.js where it has one.
MEDALS = [
    ("weekly-warrior", "a small dumbbell held inside an open laurel wreath"),
    ("monthly-mileage", "a pair of running footprints climbing a gently curving path"),
    ("strength-builder", "a short barbell loaded with one large round plate at each end, held level"),
    ("active-days", "a calendar page with a bold tick mark on it"),
    ("training-minutes", "a round clock face with its hands at ten past ten"),
    ("hybrid-hero", "a dumbbell and a running shoe side by side beneath a single five-pointed star"),
    ("fastest-5k", "a stopwatch with three short speed lines trailing from its left side"),
    ("spring-reset", "a young sprout with two leaves rising from a small mound of soil"),
    ("summer-shred", "a round sun with short straight rays"),
    ("autumn-push", "a single maple leaf"),
    ("winter-bulk", "a six-pointed snowflake"),
]

MASTER_PROMPT = (
    "A premium challenge medal for a fitness app, from the same object family as the reference badge: the "
    "same polished gold metal, the same deep black polished enamel face, the same studio lighting and "
    "straight-on camera. But this medal is ROUND, not a hexagon: a circular coin seen straight on and "
    "centred, held in a thick bevelled rim of polished gold metal with fine milled notches around its outer "
    "edge and one sharp specular highlight along its upper-left edge. The face is deep black polished "
    "enamel, smooth and glossy, with a warm golden light glowing up from behind the centre so the enamel "
    "shades from near-black at the rim to a dark warm amber in the middle. In the upper half of the face, "
    "one emblem: a five-pointed star, sculpted as a solid polished gold metal relief with a clean simple "
    "silhouette, softly lit from the top left, with a faint warm golden glow around it as if lit from "
    "within. The lower third of the face is plain black enamel with nothing on it. No ribbon, no loop or "
    "ring at the top, no text, no letters, no numbers, no other objects. Symmetrical, sharp, photoreal 3D "
    "render, app-icon quality, the coin filling about 92% of the square frame. Flat solid magenta "
    "(#FF00FF) background with no shadow, reflection or gradient on the background."
)


def tier_prompt(tier):
    metal, glow = TIER_EDIT[tier]
    return (
        "Keep this exact round medal, camera angle, framing, lighting, the milled rim, the smooth black enamel "
        "face, the star emblem with its size and place in the upper half of the face, the plain lower third "
        "of the face, and the flat solid magenta background. Change only the metal and the glow: every gold "
        f"metal part (the bevelled rim and the star emblem) becomes {metal}, and the warm golden light behind "
        f"the face and around the emblem becomes {glow}. Nothing else changes."
    )


def medal_prompt(tier, emblem):
    metal, glow = METAL[tier]
    return (
        f"Keep this exact round medal: camera angle, framing, the bevelled milled {metal} metal rim, the "
        f"smooth black enamel face, the lighting, the {glow} glow behind the face, the plain lower third of "
        "the face with nothing on it, and the flat solid magenta background. Replace only the emblem: remove "
        f"the star and put in its place {emblem}, sculpted as the same solid {metal} metal relief, the same "
        f"overall size and in the same place in the upper half of the face, with the same faint {glow} glow "
        "around it. A simple, clean, iconic silhouette that reads clearly at small size. No text, no "
        "letters, no numbers. Nothing else changes."
    )


def main():
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("GEMINI_API_KEY is not set (never commit it; export it for the run)")
    ap = argparse.ArgumentParser()
    ap.add_argument("--style-ref", default=os.path.join(ROOT, "public", "badges", "month_master.webp"),
                    help="a gold badge, as the material reference for the master (put on magenta first)")
    ap.add_argument("--work", default=os.path.join(HERE, ".work-medals"))
    ap.add_argument("--out-dir", default=os.path.join(ROOT, "public", "medals"))
    ap.add_argument("--only", nargs="*", default=[], help="definitions to make (default: all)")
    ap.add_argument("--tiers", nargs="*", default=list(METAL), help="tiers to make (default: all three)")
    ap.add_argument("--skip-masters", action="store_true", help="reuse --work/tier-*.png")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    os.makedirs(a.out_dir, exist_ok=True)

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
        # The committed badge is keyed WebP; the model is sent PNG, on the
        # magenta the medals are generated on.
        ref = None
        if a.style_ref and os.path.exists(a.style_ref):
            badge = Image.open(a.style_ref).convert("RGBA")
            ref = os.path.join(a.work, "style-ref.png")
            Image.alpha_composite(Image.new("RGBA", badge.size, (255, 0, 255, 255)), badge).convert("RGB").save(ref)
        ok, msg = gen(tier_png("gold"), MASTER_PROMPT, ref)
        print("master gold:", "ok" if ok else "FAILED " + msg)
        if not ok:
            sys.exit(1)
        with cf.ThreadPoolExecutor(a.workers) as ex:
            for t, (ok, msg) in zip(TIER_EDIT, ex.map(lambda t: gen(tier_png(t), tier_prompt(t), tier_png("gold")), TIER_EDIT)):
                print(f"tier {t}:", "ok" if ok else "FAILED " + msg)

    def one(job):
        definition, emblem, tier = job
        key = f"{definition}-{tier}"
        raw = os.path.join(a.work, f"{key}.png")
        ok, msg = gen(raw, medal_prompt(tier, emblem), tier_png(tier))
        if not ok:
            return key, "FAILED " + msg
        stem = os.path.join(a.work, f"keyed-{key}")
        k = subprocess.run([sys.executable, KEY_HEX, raw, stem, "512", "coin"], capture_output=True, text=True)
        if k.returncode != 0:
            return key, "KEY FAILED " + k.stderr[-200:]
        dst = os.path.join(a.out_dir, f"{key}.webp")
        Image.open(stem + ".png").save(dst, quality=82, method=6)
        return key, f"ok {os.path.getsize(dst)} B  {k.stdout.splitlines()[0]}"

    jobs = [(d, e, t) for d, e in MEDALS if not a.only or d in a.only for t in METAL if t in a.tiers]
    made = []
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for key, msg in ex.map(one, jobs):
            print(key, msg, flush=True)
            if msg.startswith("ok"):
                made.append(key)
    if made:
        print("\nAdd to MEDAL_ART_KEYS (src/features/challenges/medalArt.ts) once reviewed:")
        for key in made:
            print(f'  "{key}",')


if __name__ == "__main__":
    main()
