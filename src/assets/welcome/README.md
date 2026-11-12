# Welcome photographs

The five photographs behind the signed-out welcome screen
(`src/components/auth/WelcomePhotos.tsx`, ordered in `src/lib/welcomePhotos.ts`). They fill the screen and fade
from one to the next behind the name, the headline and Get started, as
Strava's, Nike's and Tonal's welcomes do. Chosen by the owner on 2026-11-12
from about a hundred candidates, set against those welcomes on Mobbin.

These are the one place outside places and communities (Soc16) where the
app shows a photograph of people: the owner asked for the welcome to carry
"photos of the athletes or people in athletic wear" (DS8 STATUS
2026-11-11), and this replaces DS8 call 1's example week. The decision is
DS9 in the plan file.

## The rules for a file here

- **Unsplash+ only.** Free Unsplash and Pexels photographs carry no model
  release, and these are faces on the screen that introduces the app.
  Unsplash+ photographs come with releases. Register the download through
  the Unsplash API (`download_asset`), never from a preview URL: previews
  wider than about 900 px are watermarked.
- **The full source height, cut to 9:19.5** (a full-screen iPhone) around
  the subject, encoded as 1080 × 2340 WebP at quality 68. A busy street is
  near 200 KB; a studio frame near 50 KB.
- **A lift has to read as lifting above the words.** The lower 40 % of the
  screen sits under the headline and buttons, so the weight has to be up
  high: overhead, a pull-up bar, a curl. A deadlift or a kettlebell at the
  feet reads as a portrait.
- **No marks.** Check every file at 3× brightness and at native size on the
  shoes, plates, straps and background. A weight printed on a plate is a
  number, not a mark. Record what was found in the manifest, even when
  nothing was.
- **Record it** in a `sources-*.json` beside the files: the page, the
  photographer, the licence, the crop, both hashes and the mark check.
- **The order and each photo's focus point live in `src/lib/welcomePhotos.ts`.**
  The focus point is the CSS `object-position` that keeps the face between
  the name and the headline on a short screen (an iPhone SE is 9:16, so it
  shows less of the height than these files hold).

## Files

[`sources-2026-11-12.json`](./sources-2026-11-12.json) records all five.

| Asset                    | Photographer    | Subject                                   |
| ------------------------ | --------------- | ----------------------------------------- |
| `welcome-1-sprint.webp`  | ohlamour studio | A woman sprinting in a grey studio        |
| `welcome-2-squat.webp`   | Getty Images    | A man at the bottom of an overhead squat  |
| `welcome-3-crew.webp`    | A. C.           | Three women running together, laughing    |
| `welcome-4-pull-up.webp` | Getty Images    | A woman holding the top of a pull-up      |
| `welcome-5-runner.webp`  | Natalia Blauth  | A runner in an orange tee against the sky |
