# Pro offer demo photo

`rigatoni.webp` is the plate in the Pro offer's scan demo
(`src/components/paywall/ScanDemo.tsx`), shown in the Pro popup and on
the Upgrade page.

- **Source:** the owner's own photo of a restaurant meal, supplied on
  2026-09-30 for this use. Not stock and not generated.
- **Crop:** the front bowl only. The second dish, the table candle and
  the menu with the restaurant's name are out of frame, so no real
  business is named in our marketing. 720 × 720 WebP at quality 82.
- **The numbers:** `SCAN_DEMO_RESULT` in `ScanDemo.tsx` has to be what
  Tropos's own scanner returns for this file, so the demo shows the
  product's real answer. Until the owner's scan of it is in, the values
  there are placeholders.

Replace the photo and the numbers together, never one without the
other. Meal photos a user takes stay on their device (Food9); this file
is an app asset, not a user's photo.
