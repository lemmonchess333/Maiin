# Pro offer demo photo

`rigatoni.webp` is the table in the Pro offer's scan demo
(`src/components/paywall/ScanDemo.tsx`), shown in the Pro popup and on
the Upgrade page. The demo's camera moves across it to the plate, and
the same photo is the captured still, the result sheet's thumbnail and
the new row in the food log.

- **Source:** the owner's own photo of a restaurant meal, supplied on
  2026-09-30 for this use. Not stock and not generated.
- **Edits:** the whole photo, scaled to 900 × 1200 WebP at quality 78.
  The restaurant's name on the menu card and the text on the standing
  menu are painted out, so no real business is named in our marketing.
  Nothing on the plates is changed.
- **The numbers:** `SCAN_DEMO_RESULT` in `ScanDemo.tsx` (the dish, its
  calories and macros, and its items) has to be what Tropos's own
  scanner returns for this photo, so the demo shows the product's real
  answer. Until the owner's scan of it is in, the values there are
  placeholders. The scanner reads the whole frame, so the second dish
  behind the rigatoni is part of what it sees: if its answer includes
  that dish, crop it out of both the photo and the scan rather than
  editing the answer.

Replace the photo and the numbers together, never one without the
other. Meal photos a user takes stay on their device (Food9); this file
is an app asset, not a user's photo.
