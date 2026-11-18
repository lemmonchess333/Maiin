"""Offline checks for the launch screenshot check in ios-native-compile.yml."""

import struct
import tempfile
from pathlib import Path
import unittest
import zlib

import verify_ios_launch as verifier


def png(width, height, pixel, mark=None, channels=4, filt=0):
    """An 8-bit PNG filled with `pixel`, with an optional lit square
    `mark` = (x, y, size, pixel), every row written with filter `filt`
    (0 none, 1 sub, 2 up)."""
    colour = {3: 2, 4: 6}[channels]
    rows, previous = [], bytes(width * channels)
    for y in range(height):
        row = bytearray()
        for x in range(width):
            px = pixel
            if mark and mark[0] <= x < mark[0] + mark[2] and mark[1] <= y < mark[1] + mark[2]:
                px = mark[3]
            row += bytes(px[:channels])
        raw = bytearray(row)
        if filt == 1:
            for i in range(len(raw) - 1, channels - 1, -1):
                raw[i] = (raw[i] - raw[i - channels]) & 0xFF
        elif filt == 2:
            for i in range(len(raw)):
                raw[i] = (raw[i] - previous[i]) & 0xFF
        rows.append(bytes([filt]) + bytes(raw))
        previous = bytes(row)

    def chunk(kind, body):
        return (
            struct.pack(">I", len(body))
            + kind
            + body
            + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, colour, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"".join(rows)))
        + chunk(b"IEND", b"")
    )


PAGE = (14, 14, 17, 255)  # the app's page colour, #0e0e11
WHITE = (255, 255, 255, 255)


class LaunchScreenshotTests(unittest.TestCase):
    def test_black_screen_is_dark(self):
        self.assertEqual(verifier.lit_share(png(40, 80, (0, 0, 0, 255))), 0.0)

    def test_the_page_colour_alone_is_dark(self):
        self.assertEqual(verifier.lit_share(png(40, 80, PAGE)), 0.0)

    def test_a_mark_on_the_page_is_lit(self):
        share = verifier.lit_share(png(40, 80, PAGE, mark=(12, 30, 16, WHITE)))
        self.assertGreater(share, 0.05)

    def test_a_status_bar_over_a_black_screen_is_dark(self):
        # A scene with no window: the system's clock and battery glyphs in
        # the top band, the home indicator at the foot, black between.
        clock = png(40, 80, (0, 0, 0, 255), mark=(2, 1, 5, WHITE))
        self.assertEqual(verifier.lit_share(clock, step=1), 0.0)
        indicator = png(40, 80, (0, 0, 0, 255), mark=(15, 77, 3, WHITE))
        self.assertEqual(verifier.lit_share(indicator, step=1), 0.0)

    def test_filters_and_rgb_decode_alike(self):
        for filt in (0, 1, 2):
            for channels in (3, 4):
                data = png(24, 24, PAGE, mark=(4, 4, 8, WHITE), channels=channels, filt=filt)
                # The 24-row frame's middle band is rows 2 to 22: 21 rows.
                self.assertAlmostEqual(verifier.lit_share(data, step=1), 64 / (21 * 24))

    def test_main_fails_a_black_launch_and_passes_a_drawn_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            black = Path(tmp) / "black.png"
            black.write_bytes(png(40, 80, (0, 0, 0, 255)))
            drawn = Path(tmp) / "drawn.png"
            drawn.write_bytes(png(40, 80, PAGE, mark=(12, 30, 16, WHITE)))
            self.assertEqual(verifier.main(["--screenshot", str(black)]), 1)
            self.assertEqual(verifier.main(["--screenshot", str(drawn)]), 0)

    def test_rejects_what_it_cannot_read(self):
        with self.assertRaises(ValueError):
            verifier.decode_png(b"not a png")

    def test_main_tells_an_unreadable_shot_from_a_dark_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            garbled = Path(tmp) / "garbled.png"
            garbled.write_bytes(b"not a png")
            missing = Path(tmp) / "missing.png"
            self.assertEqual(verifier.main(["--screenshot", str(garbled)]), 2)
            self.assertEqual(verifier.main(["--screenshot", str(missing)]), 2)


if __name__ == "__main__":
    unittest.main()
