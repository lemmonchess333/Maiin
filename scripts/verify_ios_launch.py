"""Check a simulator screenshot taken after the app was launched.

ios-native-compile.yml installs the standard simulator build, launches it,
waits, and screenshots the simulator. The UIScene life cycle
(ios/App/App/SceneDelegate.swift, required of iOS 27 SDK builds) is wiring
a compile cannot check: a scene delegate the manifest names wrongly, or a
scene with no window, launches to a black screen while the process stays
up. Any lit pixel means a window is drawing: the launch mark, the web
view's boot screen, or the welcome screen past it.

Reads 8-bit PNGs (what `simctl io screenshot` writes) with the standard
library only, so the macOS runner needs nothing installed.
"""

import argparse
from pathlib import Path
import struct
import sys
import zlib

# A pixel is lit when a channel is above this: the app's own page colour,
# #0e0e11, is not, so a window showing nothing but the page is "dark".
LIT = 40


def decode_png(data):
    """Return (width, height, channels, rows) for an 8-bit, non-interlaced
    greyscale, RGB or RGBA PNG; rows are bytes with the filters undone."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, header = 8, [], None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    if header is None:
        raise ValueError("PNG has no header")
    width, height, depth, colour, _, _, interlace = header
    channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(colour)
    if depth != 8 or channels is None or interlace:
        raise ValueError("only 8-bit, non-interlaced, non-palette PNGs are read")
    raw = zlib.decompress(b"".join(idat))
    stride = width * channels
    rows, previous = [], bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        kind = raw[start]
        row = bytearray(raw[start + 1 : start + 1 + stride])
        for x in range(stride):
            a = row[x - channels] if x >= channels else 0
            b = previous[x]
            c = previous[x - channels] if x >= channels else 0
            if kind == 1:
                row[x] = (row[x] + a) & 0xFF
            elif kind == 2:
                row[x] = (row[x] + b) & 0xFF
            elif kind == 3:
                row[x] = (row[x] + ((a + b) >> 1)) & 0xFF
            elif kind == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                row[x] = (row[x] + pred) & 0xFF
            elif kind != 0:
                raise ValueError("unknown PNG filter")
        rows.append(bytes(row))
        previous = row
    return width, height, channels, rows


def lit_share(data, step=4):
    """The share of pixels, sampled every `step` in each direction, with a
    colour channel above LIT (alpha is not a colour)."""
    width, height, channels, rows = decode_png(data)
    colour = min(channels, 3)
    lit = total = 0
    for y in range(0, height, step):
        row = rows[y]
        for x in range(0, width, step):
            px = row[x * channels : x * channels + colour]
            total += 1
            if max(px) > LIT:
                lit += 1
    return lit / total if total else 0.0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--screenshot", required=True, type=Path)
    parser.add_argument(
        "--min-lit",
        type=float,
        default=0.002,
        help="the least share of lit pixels a drawing window shows",
    )
    args = parser.parse_args(argv)
    share = lit_share(args.screenshot.read_bytes())
    print(f"{share:.2%} of the screen is lit")
    if share < args.min_lit:
        print(
            "The app launched to a dark screen: no window is drawing. "
            "Check the scene manifest in Info.plist and SceneDelegate.swift.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
