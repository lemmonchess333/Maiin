#!/usr/bin/env python3
"""Animate a released drawing into a short clip with Gemini Omni Flash.

Home's hero plays a few seconds of its picture moving: the runner running
on the spot, the day's lead lift doing one rep. The drawing is given as
both the first and the last frame, so the clip ends where it starts and
loops (docs/exercise-art/motion/README.md). Veo, which did this before,
was shut down on the Gemini API on 2026-10-22; Omni Flash replaced it.

The key comes from GEMINI_API_KEY in the environment, sent as the
x-goog-api-key header: never from argv, never from a file in the repo,
and never printed (errors are redacted). Usage:
  GEMINI_API_KEY=… python3 scripts/art/gemini-video.py --out clip.mp4 \
      --frame docs/exercise-art/run-poses/run-easy.jpg --prompt "…" \
      [--duration 4] [--aspect 9:16] [--resolution 720p] [--last other.png]

The frame is padded with black to the clip's aspect (Omni Flash takes
16:9 and 9:16 only); the drawings sit on black, so the padding is part of
the backdrop that keying.ts later removes."""
import argparse, base64, io, json, os, sys, time, urllib.error, urllib.request

from PIL import Image

KEY = os.environ.get("GEMINI_API_KEY") or sys.exit(
    "GEMINI_API_KEY is not set (never commit it; export it for the run)"
)
API = "https://generativelanguage.googleapis.com/v1beta"

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--frame", required=True, help="first frame (and last, unless --last)")
ap.add_argument("--last", help="a different last frame")
ap.add_argument("--prompt", required=True)
ap.add_argument("--model", default="gemini-omni-1.2-flash")
ap.add_argument("--duration", type=int, default=4, help="3-10 s with two frames")
ap.add_argument("--aspect", default="9:16", choices=["9:16", "16:9"])
ap.add_argument("--resolution", default="720p", choices=["360p", "720p", "1080p"])
a = ap.parse_args()

if not 3 <= a.duration <= 10:
    sys.exit("--duration must be 3 to 10 seconds when a first and last frame are given")


def padded_jpeg(path: str) -> str:
    """The drawing on black, padded to the clip's aspect, as base64 JPEG."""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    tw, th = (9, 16) if a.aspect == "9:16" else (16, 9)
    if w * th > h * tw:  # too wide: pad top and bottom
        cw, ch = w, round(w * th / tw)
    else:  # too tall: pad the sides
        cw, ch = round(h * tw / th), h
    canvas = Image.new("RGB", (cw, ch), (0, 0, 0))
    canvas.paste(im, ((cw - w) // 2, (ch - h) // 2))
    buf = io.BytesIO()
    canvas.save(buf, "JPEG", quality=95)
    return base64.b64encode(buf.getvalue()).decode()


first = padded_jpeg(a.frame)
last = padded_jpeg(a.last) if a.last else first
body = {
    "model": a.model,
    "input": [
        {"type": "image", "data": first, "mime_type": "image/jpeg"},
        {"type": "image", "data": last, "mime_type": "image/jpeg"},
        {"type": "text", "text": a.prompt},
    ],
    "response_format": {
        "type": "video",
        "duration": f"{a.duration}s",
        "resolution": a.resolution,
        "aspect_ratio": a.aspect,
    },
    "background": False,
    "store": False,
    "stream": False,
}


def redact(text: str) -> str:
    return text.replace(KEY, "<key>")


def request(url: str, payload=None, timeout=600):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "x-goog-api-key": KEY},
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, redact(e.read().decode(errors="replace")[:800]))
        sys.exit(1)


def find_video(node):
    """The first {"type": "video", ...} item anywhere in the response."""
    if isinstance(node, dict):
        if node.get("type") == "video" and ("data" in node or "uri" in node):
            return node
        for value in node.values():
            found = find_video(value)
            if found:
                return found
    elif isinstance(node, list):
        for value in node:
            found = find_video(value)
            if found:
                return found
    return None


started = time.time()
response = json.loads(request(f"{API}/interactions", body))
video = find_video(response) or (response.get("output_video") if isinstance(response, dict) else None)
if not video:
    print("no video in the response:", redact(json.dumps(response)[:800]))
    sys.exit(1)
if video.get("data"):
    data = base64.b64decode(video["data"])
else:
    # Delivered as a file: wait until it is ready, then download it.
    uri = video["uri"]
    name = uri.split("/files/")[-1].split(":")[0].split("?")[0]
    for _ in range(60):
        meta = json.loads(request(f"{API}/files/{name}"))
        if meta.get("state") == "ACTIVE":
            break
        time.sleep(5)
    data = request(uri if uri.startswith("http") else f"{API}/files/{name}:download?alt=media")
open(a.out, "wb").write(data)
print(f"saved {a.out} ({len(data)} bytes) in {time.time() - started:.0f} s")
