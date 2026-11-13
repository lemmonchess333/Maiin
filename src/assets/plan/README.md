# Run plan's card photographs

The photographs on Settings → Run plan's goal and distance cards
(`PhotoChoiceCards`, named in `src/lib/planPhotos.ts`). The owner chose
photograph cards over drawn ones on 2026-11-13. Each card is about 176 px
wide, so each photograph is cut to a 1.8:1 band and encoded as a 640 × 356
WebP. Its people sit in the upper middle, so the card's words at its foot
sit on legs or road under the scrim.

| File                 | Card                                      | Source                                       |
| -------------------- | ----------------------------------------- | -------------------------------------------- |
| `plan-no-race.webp`  | No race                                   | Lucas Canino (Unsplash), Trail Running cover |
| `plan-starter.webp`  | 30 minutes                                | Leire Cavia (Unsplash+), New to Tropos cover |
| `plan-race.webp`     | Training for a race, before one is chosen | Getty Images (Unsplash+), new                |
| `plan-5k.webp`       | 5K                                        | Getty Images (Unsplash+), Runners cover      |
| `plan-10k.webp`      | 10K                                       | A. C. (Unsplash+), welcome photograph 3      |
| `plan-half.webp`     | Half                                      | Getty Images (Unsplash+), new                |
| `plan-marathon.webp` | Marathon                                  | Getty Images (Unsplash+), new                |

Once a race is chosen, "Training for a race" shows that race's own Space
cover (`spaceEditorialImage`) rather than `plan-race.webp`.

`sources-2026-11-13.json` records each one: its page, id, photographer,
licence, crop and hashes. Four are second cuts of photographs the app
already licenses, and each names the manifest of its first use. The three
new ones were downloaded through the Unsplash API on 2026-11-13, while the
owner's Unsplash+ subscription was active. People in them are licensed
photographs, not Tropos members.
