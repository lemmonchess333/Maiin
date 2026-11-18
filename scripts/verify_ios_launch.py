"""Check a simulator screenshot taken after the app was launched.

ios-native-compile.yml installs the standard simulator build, launches it,
waits, and screenshots the simulator. The UIScene life cycle
(ios/App/App/SceneDelegate.swift, required of iOS 27 SDK builds) is wiring
a compile cannot check: a scene delegate the manifest names wrongly, or a
scene with no window, launches to a black screen while the process stays
up. A window drawing anything lights the middle of the screen: the launch
mark, the web view's boot screen, or the welcome screen past it. Only the
middle band is read, since the system draws the status bar and the home
indicator over a screen with no window too.

Reads 8-bit PNGs (what `simctl io screenshot` writes) with the standard
library only, so the macOS runner needs nothing installed. Exits 0 when the
screen is lit, 1 when it is dark and 2 when the screenshot cannot be read,
so a caller that allows a dark screen (the iPhone Duo's folded-away
display) still stops on a file it could not check.
"""

import argparse
from collections import Counter
from pathlib import Path
import struct
import sys
import zlib

# A pixel is lit when a channel is above this: the app's own page colour,
# #0e0e11, is not, so a window showing nothing but the page is "dark".
LIT = 40
PAGE = (0x0E, 0x0E, 0x11)
# The share of the height left out at the top (the status bar and the
# Dynamic Island, about 54 of 852 pt) and at the bottom (the home
# indicator), with room to spare.
TOP_BAND = 0.10
BOTTOM_BAND = 0.06


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


def middle_band(data, step=4):
    """The colours (r, g, b) of the middle band's pixels, sampled every
    `step` in each direction (alpha is not a colour)."""
    width, height, channels, rows = decode_png(data)
    colour = 1 if channels < 3 else 3  # grey, or grey and alpha: one colour
    top = int(height * TOP_BAND)
    bottom = height - int(height * BOTTOM_BAND)
    for y in range(top, bottom, step):
        row = rows[y]
        for x in range(0, width, step):
            px = tuple(row[x * channels : x * channels + colour])
            yield px * 3 if colour == 1 else px


def lit_share(data, step=4):
    """The share of the middle band's sampled pixels with a colour channel
    above LIT."""
    lit = total = 0
    for px in middle_band(data, step):
        total += 1
        if max(px) > LIT:
            lit += 1
    return lit / total if total else 0.0


def commonest(data, step=4):
    """The middle band's most common colour, which tells a dark screen's
    cause: black is no window at all, the page colour is the web view up
    with nothing drawn on it."""
    counts = Counter(middle_band(data, step))
    return counts.most_common(1)[0][0] if counts else (0, 0, 0)


def near(colour, target, tolerance=4):
    return all(abs(a - b) <= tolerance for a, b in zip(colour, target))


def dark_reason(colour):
    if near(colour, (0, 0, 0), 3):
        return (
            "The app launched to a black screen: no window is drawing. "
            "Check the scene manifest in Info.plist and SceneDelegate.swift."
        )
    if near(colour, PAGE):
        return (
            "The web view is up, showing the page's background with nothing "
            "on it: the web app did not mount. Check the app's log for a "
            "JavaScript error, and that the bundle was built with a Firebase "
            "config."
        )
    return "The middle of the screen is dark: nothing is drawn there."


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
    try:
        data = args.screenshot.read_bytes()
        share = lit_share(data)
        colour = commonest(data)
    except (OSError, ValueError, struct.error, zlib.error) as error:
        print(f"Could not read {args.screenshot}: {error}", file=sys.stderr)
        return 2
    print(
        f"{share:.2%} of the screen is lit; its middle is mostly "
        "#{:02x}{:02x}{:02x}".format(*colour)
    )
    if share < args.min_lit:
        print(dark_reason(colour), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
