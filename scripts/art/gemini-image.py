#!/usr/bin/env python3
"""Generate (or image-edit) one image with the Gemini image API.

The key comes from GEMINI_API_KEY in the environment — never from argv,
never from a file in the repo. Usage:
  GEMINI_API_KEY=… python3 scripts/art/gemini-image.py --out x.png \
      --prompt "…" [--ref master.png …] [--aspect 3:2] [--model gemini-3-pro-image]

Used for the badge seal (docs/badges/ART_BRIEF.md, "The seal"): one
master, then --ref master.png with an edit prompt per tier metal."""
import argparse, base64, json, os, sys, urllib.request, urllib.error, time
S = os.path.dirname(os.path.abspath(__file__))
KEY = os.environ.get("GEMINI_API_KEY") or sys.exit("GEMINI_API_KEY is not set (never commit it; export it for the run)")
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--prompt", required=True)
ap.add_argument("--ref", action="append", default=[])
ap.add_argument("--model", default="gemini-3-pro-image")
ap.add_argument("--size", default="1K")
ap.add_argument("--aspect", default="1:1", help="1:1, 3:2, 2:3, 16:9, 4:3 … (model-dependent)")
a = ap.parse_args()
parts = [{"text": a.prompt}]
for r in a.ref:
    parts.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(open(r, "rb").read()).decode()}})
body = {"contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": a.aspect, "imageSize": a.size}}}
url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent"
def call(b):
    req = urllib.request.Request(url, data=json.dumps(b).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)
try:
    resp = call(body)
except urllib.error.HTTPError as e:
    msg = e.read().decode()[:400]
    if e.code == 400 and "imageSize" in msg or "imageConfig" in msg:
        body["generationConfig"].pop("imageConfig", None)
        resp = call(body)
    else:
        print("HTTP", e.code, msg.replace(KEY, "<key>")); sys.exit(1)
cands = resp.get("candidates") or []
if not cands:
    print("no candidates:", json.dumps(resp)[:500]); sys.exit(1)
saved = False
for p in cands[0].get("content", {}).get("parts", []):
    if "inlineData" in p:
        open(a.out, "wb").write(base64.b64decode(p["inlineData"]["data"])); saved = True; break
    if "text" in p:
        print("text:", p["text"][:300])
if not saved:
    print("no image; finishReason:", cands[0].get("finishReason")); sys.exit(1)
print("saved", a.out, os.path.getsize(a.out))
