# The mark, 11 November 2026 (DS7)

The Tropos mark became a T whose stem rises into its bar. The decision and
what it was chosen from are in `docs/visual-audit/bakeoff/DECISION.md`,
decision 5.

| File                           | What it shows                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `icons-and-launch-image.webp`  | The regenerated files: the app icon, its dark and tinted versions, a web icon, and the launch image as a phone crops it  |
| `welcome-before-393-dark.webp` | The welcome screen with the hexagon icon                                                                                 |
| `welcome-after-393-dark.webp`  | The same screen with the new icon                                                                                        |
| `signin-before-393-dark.webp`  | Sign-in with the hexagon icon                                                                                            |
| `signin-after-393-dark.webp`   | Sign-in with the new icon                                                                                                |
| `launch-frames.webp`           | The launch animation: the stem rising into the bar, the whole mark, and the overlay lifting away over the welcome screen |

The screens are the real pages from a local dev server with placeholder
Firebase config, in Chromium at 393 by 852. The launch frames come from a
browser that does not report `navigator.webdriver`, since the overlay
never shows under automation. A phone decides the rest: the rows in
`docs/qa/pre-launch-backlog.md`.
