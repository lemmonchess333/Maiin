# Ambient emission bake-off — contact sheet

Generated 2026-06-10. **DEV-HARNESS-ONLY experiment — nothing here ships.** Candidates rendered behind the real seeded pages via the `src/dev/AmbientEmission.tsx` harness (mounted only under `import.meta.env.MODE !== "production"`, like `/dev/brand-bakeoff`). Captured on the emulator rig at 393×852, isMobile/hasTouch; matrix frames at DSF 2, banding crops at DSF 3.

This sheet is **evidence only — no recommendation.** The pick is a human decision.

## What each candidate is

**Dark** (single hue, eased multi-stop falloff complete by ~45vh, ~2.5% noise overlay; the dark auth shell's 0.10 is the in-codebase reference):

- **A — global brand:** purple emission on every page, at 0.08 and 0.12 peak alpha.
- **B — domain hue:** purple (Home/Train/Social/Analytics), coral (Run setup), nutrition-orange (Food), at 0.08 / 0.12. Hues derived from `--primary` / `--running` / `--nutrition`.
- **C — control:** current uniform neutral canvas.

**Light** (NOT the #511 accent-over-grey method — that is the documented failure; this BRIGHTENS tinted-white → background, falloff complete ≤~22vh so the tint never sits behind a card; Analytics constrained to a header-only band; ~1.5% noise):

- **L-A — global lavender-white** wash, 6% / 8% mix.
- **L-B — domain tint:** lavender (Home/Train/Social), cream (Food), blush (Run setup), 6% / 8%.
- **L-C — control:** current plain canvas.

## How this is built to beat the PR #511 post-mortem

| #511 failure mode                             | This system's answer                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Two hues mixed → muddy haze                   | **Single hue per page**, never mixed.                                                                                           |
| Tint behind every card/chart killed sharpness | **Falloff complete high up** (dark ≤45vh, light ≤~22vh); lower half is pure neutral canvas. Compare C/LC vs A/B per page below. |
| Banding looked cheap on OLED                  | Eased multi-stop falloff **+ faint noise overlay**; judge on the @3× crops.                                                     |
| Fixed-layer seam at the status bar            | Occluder bg alpha dropped to ~0.47 on the harness so the status zone blurs through; judge top vs mid-scroll.                    |

Exclusions honoured by the harness: `/run-summary` and RunDetail (`/run/:id`) map areas render no layer. `prefers-reduced-transparency: reduce` renders nothing. Shipped auth-shell ambience untouched.

## Quality-bar notes (captor's factual read — decision is the human's)

- **Banding — PASS (no rings seen).** On the @3× crops the falloff reads as a smooth gradient with no visible concentric rings/steps; the faint noise overlay is doing its job. Caveat: the crop window (x30 y70, 220²) clips the top-left where week-strip/header content overlaps, so the cleanest pure-gradient band to zoom is the very top corner of each crop. Re-judge on a real OLED panel — emulator screenshots can hide sub-LSB banding.
- **Occluder seam — PASS (no hard colour line).** With the harness occluder alpha at 0.47, the status-bar zone blurs through to the glow in both `top` and `mid-scroll` states across all six pages; no abrupt colour seam at the ~59px safe-top line. Being a fixed layer, the glow stays put while content scrolls over it (compare each page's top vs mid columns).
- **Falloff / chart sharpness — PASS (data sits on neutral canvas).** On every page the emission resolves to the plain neutral canvas above the first card/chart: dark falloff is complete by ~the first card; light brighten is complete above the first card (verified on Home — the white Performance card's top edge sits on plain canvas, not on tint). Compare the **C / L-C control** rows against A/B / L-A/L-B per page — they differ only in the top band; rings, macro tiles, and charts (incl. Analytics `THIS MONTH` rings) render on identical neutral canvas. Light Analytics is the header-only band variant; the excluded variant is L-C.

---

# DARK candidates

### Home — `/` (dark)

| Variant                     | Top of page                                        | Mid-scroll                                         |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **C · control (no layer)**  | ![home C top](screens/dark/home__C__top.png)       | ![home C mid](screens/dark/home__C__mid.png)       |
| **A · global brand · 0.08** | ![home A-lo top](screens/dark/home__A-lo__top.png) | ![home A-lo mid](screens/dark/home__A-lo__mid.png) |
| **A · global brand · 0.12** | ![home A-hi top](screens/dark/home__A-hi__top.png) | ![home A-hi mid](screens/dark/home__A-hi__mid.png) |
| **B · domain hue · 0.08**   | ![home B-lo top](screens/dark/home__B-lo__top.png) | ![home B-lo mid](screens/dark/home__B-lo__mid.png) |
| **B · domain hue · 0.12**   | ![home B-hi top](screens/dark/home__B-hi__top.png) | ![home B-hi mid](screens/dark/home__B-hi__mid.png) |

### Food — `/food` (dark)

| Variant                     | Top of page                                        | Mid-scroll                                         |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **C · control (no layer)**  | ![food C top](screens/dark/food__C__top.png)       | ![food C mid](screens/dark/food__C__mid.png)       |
| **A · global brand · 0.08** | ![food A-lo top](screens/dark/food__A-lo__top.png) | ![food A-lo mid](screens/dark/food__A-lo__mid.png) |
| **A · global brand · 0.12** | ![food A-hi top](screens/dark/food__A-hi__top.png) | ![food A-hi mid](screens/dark/food__A-hi__mid.png) |
| **B · domain hue · 0.08**   | ![food B-lo top](screens/dark/food__B-lo__top.png) | ![food B-lo mid](screens/dark/food__B-lo__mid.png) |
| **B · domain hue · 0.12**   | ![food B-hi top](screens/dark/food__B-hi__top.png) | ![food B-hi mid](screens/dark/food__B-hi__mid.png) |

### Train — `/program` (dark)

| Variant                     | Top of page                                          | Mid-scroll                                           |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| **C · control (no layer)**  | ![train C top](screens/dark/train__C__top.png)       | ![train C mid](screens/dark/train__C__mid.png)       |
| **A · global brand · 0.08** | ![train A-lo top](screens/dark/train__A-lo__top.png) | ![train A-lo mid](screens/dark/train__A-lo__mid.png) |
| **A · global brand · 0.12** | ![train A-hi top](screens/dark/train__A-hi__top.png) | ![train A-hi mid](screens/dark/train__A-hi__mid.png) |
| **B · domain hue · 0.08**   | ![train B-lo top](screens/dark/train__B-lo__top.png) | ![train B-lo mid](screens/dark/train__B-lo__mid.png) |
| **B · domain hue · 0.12**   | ![train B-hi top](screens/dark/train__B-hi__top.png) | ![train B-hi mid](screens/dark/train__B-hi__mid.png) |

### Run setup — `/run` (dark)

| Variant                     | Top of page                                      | Mid-scroll                                       |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| **C · control (no layer)**  | ![run C top](screens/dark/run__C__top.png)       | ![run C mid](screens/dark/run__C__mid.png)       |
| **A · global brand · 0.08** | ![run A-lo top](screens/dark/run__A-lo__top.png) | ![run A-lo mid](screens/dark/run__A-lo__mid.png) |
| **A · global brand · 0.12** | ![run A-hi top](screens/dark/run__A-hi__top.png) | ![run A-hi mid](screens/dark/run__A-hi__mid.png) |
| **B · domain hue · 0.08**   | ![run B-lo top](screens/dark/run__B-lo__top.png) | ![run B-lo mid](screens/dark/run__B-lo__mid.png) |
| **B · domain hue · 0.12**   | ![run B-hi top](screens/dark/run__B-hi__top.png) | ![run B-hi mid](screens/dark/run__B-hi__mid.png) |

### Social — `/social` (dark)

| Variant                     | Top of page                                            | Mid-scroll                                             |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **C · control (no layer)**  | ![social C top](screens/dark/social__C__top.png)       | ![social C mid](screens/dark/social__C__mid.png)       |
| **A · global brand · 0.08** | ![social A-lo top](screens/dark/social__A-lo__top.png) | ![social A-lo mid](screens/dark/social__A-lo__mid.png) |
| **A · global brand · 0.12** | ![social A-hi top](screens/dark/social__A-hi__top.png) | ![social A-hi mid](screens/dark/social__A-hi__mid.png) |
| **B · domain hue · 0.08**   | ![social B-lo top](screens/dark/social__B-lo__top.png) | ![social B-lo mid](screens/dark/social__B-lo__mid.png) |
| **B · domain hue · 0.12**   | ![social B-hi top](screens/dark/social__B-hi__top.png) | ![social B-hi mid](screens/dark/social__B-hi__mid.png) |

### Analytics — `/history` (dark)

| Variant                     | Top of page                                                  | Mid-scroll                                                   |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **C · control (no layer)**  | ![analytics C top](screens/dark/analytics__C__top.png)       | ![analytics C mid](screens/dark/analytics__C__mid.png)       |
| **A · global brand · 0.08** | ![analytics A-lo top](screens/dark/analytics__A-lo__top.png) | ![analytics A-lo mid](screens/dark/analytics__A-lo__mid.png) |
| **A · global brand · 0.12** | ![analytics A-hi top](screens/dark/analytics__A-hi__top.png) | ![analytics A-hi mid](screens/dark/analytics__A-hi__mid.png) |
| **B · domain hue · 0.08**   | ![analytics B-lo top](screens/dark/analytics__B-lo__top.png) | ![analytics B-lo mid](screens/dark/analytics__B-lo__mid.png) |
| **B · domain hue · 0.12**   | ![analytics B-hi top](screens/dark/analytics__B-hi__top.png) | ![analytics B-hi mid](screens/dark/analytics__B-hi__mid.png) |

---

# LIGHT candidates

Light Analytics is captured as the **header-only band** variant (L-A/L-B) plus the **excluded** variant (L-C).

### Home — `/` (light)

| Variant                       | Top of page                                           | Mid-scroll                                            |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **L-C · control (no layer)**  | ![home LC top](screens/light/home__LC__top.png)       | ![home LC mid](screens/light/home__LC__mid.png)       |
| **L-A · lavender-white · 6%** | ![home LA-lo top](screens/light/home__LA-lo__top.png) | ![home LA-lo mid](screens/light/home__LA-lo__mid.png) |
| **L-A · lavender-white · 8%** | ![home LA-hi top](screens/light/home__LA-hi__top.png) | ![home LA-hi mid](screens/light/home__LA-hi__mid.png) |
| **L-B · domain tint · 6%**    | ![home LB-lo top](screens/light/home__LB-lo__top.png) | ![home LB-lo mid](screens/light/home__LB-lo__mid.png) |
| **L-B · domain tint · 8%**    | ![home LB-hi top](screens/light/home__LB-hi__top.png) | ![home LB-hi mid](screens/light/home__LB-hi__mid.png) |

### Food — `/food` (light)

| Variant                       | Top of page                                           | Mid-scroll                                            |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **L-C · control (no layer)**  | ![food LC top](screens/light/food__LC__top.png)       | ![food LC mid](screens/light/food__LC__mid.png)       |
| **L-A · lavender-white · 6%** | ![food LA-lo top](screens/light/food__LA-lo__top.png) | ![food LA-lo mid](screens/light/food__LA-lo__mid.png) |
| **L-A · lavender-white · 8%** | ![food LA-hi top](screens/light/food__LA-hi__top.png) | ![food LA-hi mid](screens/light/food__LA-hi__mid.png) |
| **L-B · domain tint · 6%**    | ![food LB-lo top](screens/light/food__LB-lo__top.png) | ![food LB-lo mid](screens/light/food__LB-lo__mid.png) |
| **L-B · domain tint · 8%**    | ![food LB-hi top](screens/light/food__LB-hi__top.png) | ![food LB-hi mid](screens/light/food__LB-hi__mid.png) |

### Train — `/program` (light)

| Variant                       | Top of page                                             | Mid-scroll                                              |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| **L-C · control (no layer)**  | ![train LC top](screens/light/train__LC__top.png)       | ![train LC mid](screens/light/train__LC__mid.png)       |
| **L-A · lavender-white · 6%** | ![train LA-lo top](screens/light/train__LA-lo__top.png) | ![train LA-lo mid](screens/light/train__LA-lo__mid.png) |
| **L-A · lavender-white · 8%** | ![train LA-hi top](screens/light/train__LA-hi__top.png) | ![train LA-hi mid](screens/light/train__LA-hi__mid.png) |
| **L-B · domain tint · 6%**    | ![train LB-lo top](screens/light/train__LB-lo__top.png) | ![train LB-lo mid](screens/light/train__LB-lo__mid.png) |
| **L-B · domain tint · 8%**    | ![train LB-hi top](screens/light/train__LB-hi__top.png) | ![train LB-hi mid](screens/light/train__LB-hi__mid.png) |

### Run setup — `/run` (light)

| Variant                       | Top of page                                         | Mid-scroll                                          |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| **L-C · control (no layer)**  | ![run LC top](screens/light/run__LC__top.png)       | ![run LC mid](screens/light/run__LC__mid.png)       |
| **L-A · lavender-white · 6%** | ![run LA-lo top](screens/light/run__LA-lo__top.png) | ![run LA-lo mid](screens/light/run__LA-lo__mid.png) |
| **L-A · lavender-white · 8%** | ![run LA-hi top](screens/light/run__LA-hi__top.png) | ![run LA-hi mid](screens/light/run__LA-hi__mid.png) |
| **L-B · domain tint · 6%**    | ![run LB-lo top](screens/light/run__LB-lo__top.png) | ![run LB-lo mid](screens/light/run__LB-lo__mid.png) |
| **L-B · domain tint · 8%**    | ![run LB-hi top](screens/light/run__LB-hi__top.png) | ![run LB-hi mid](screens/light/run__LB-hi__mid.png) |

### Social — `/social` (light)

| Variant                       | Top of page                                               | Mid-scroll                                                |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| **L-C · control (no layer)**  | ![social LC top](screens/light/social__LC__top.png)       | ![social LC mid](screens/light/social__LC__mid.png)       |
| **L-A · lavender-white · 6%** | ![social LA-lo top](screens/light/social__LA-lo__top.png) | ![social LA-lo mid](screens/light/social__LA-lo__mid.png) |
| **L-A · lavender-white · 8%** | ![social LA-hi top](screens/light/social__LA-hi__top.png) | ![social LA-hi mid](screens/light/social__LA-hi__mid.png) |
| **L-B · domain tint · 6%**    | ![social LB-lo top](screens/light/social__LB-lo__top.png) | ![social LB-lo mid](screens/light/social__LB-lo__mid.png) |
| **L-B · domain tint · 8%**    | ![social LB-hi top](screens/light/social__LB-hi__top.png) | ![social LB-hi mid](screens/light/social__LB-hi__mid.png) |

### Analytics — `/history` (light)

| Variant                       | Top of page                                                     | Mid-scroll                                                      |
| ----------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| **L-C · control (no layer)**  | ![analytics LC top](screens/light/analytics__LC__top.png)       | ![analytics LC mid](screens/light/analytics__LC__mid.png)       |
| **L-A · lavender-white · 6%** | ![analytics LA-lo top](screens/light/analytics__LA-lo__top.png) | ![analytics LA-lo mid](screens/light/analytics__LA-lo__mid.png) |
| **L-A · lavender-white · 8%** | ![analytics LA-hi top](screens/light/analytics__LA-hi__top.png) | ![analytics LA-hi mid](screens/light/analytics__LA-hi__mid.png) |
| **L-B · domain tint · 6%**    | ![analytics LB-lo top](screens/light/analytics__LB-lo__top.png) | ![analytics LB-lo mid](screens/light/analytics__LB-lo__mid.png) |
| **L-B · domain tint · 8%**    | ![analytics LB-hi top](screens/light/analytics__LB-hi__top.png) | ![analytics LB-hi mid](screens/light/analytics__LB-hi__mid.png) |

## Banding zoom crops (@3×, 220×220 css-px over the glow core)

Zoom each crop to OLED-judge ring/step artefacts. Pass = smooth gradient; fail = visible concentric rings.

| Crop                      | Image                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `food__A-hi__crop3x.png`  | ![food__A-hi__crop3x.png](screens/banding/food__A-hi__crop3x.png)   |
| `food__B-hi__crop3x.png`  | ![food__B-hi__crop3x.png](screens/banding/food__B-hi__crop3x.png)   |
| `food__LA-hi__crop3x.png` | ![food__LA-hi__crop3x.png](screens/banding/food__LA-hi__crop3x.png) |
| `food__LB-hi__crop3x.png` | ![food__LB-hi__crop3x.png](screens/banding/food__LB-hi__crop3x.png) |
| `home__A-hi__crop3x.png`  | ![home__A-hi__crop3x.png](screens/banding/home__A-hi__crop3x.png)   |
| `home__B-hi__crop3x.png`  | ![home__B-hi__crop3x.png](screens/banding/home__B-hi__crop3x.png)   |
| `home__LA-hi__crop3x.png` | ![home__LA-hi__crop3x.png](screens/banding/home__LA-hi__crop3x.png) |
| `home__LB-hi__crop3x.png` | ![home__LB-hi__crop3x.png](screens/banding/home__LB-hi__crop3x.png) |
