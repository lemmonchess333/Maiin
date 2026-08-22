/**
 * The run HUD's small-text treatments, as two named roles.
 *
 * D18. Before this, the active-run sheet carried FOUR arbitrary treatments
 * across eighteen sites — 8px at 25% white, 9px at 28%, 9px at 30%, 9px at
 * 40%, 10px at 35% — none of them a token, none of them agreeing, and all
 * of them failing two documented rules at once. Measured off the first
 * capture frame the run HUD has ever had:
 *
 *   TIME / KM / pace unit   9px   2.50:1
 *   CAL / ELEV / SPLITS     8px   2.15:1
 *   LOCK / PAUSE / HOLD     9px   2.22:1
 *
 * Against a documented 11px floor (`SectionLabel`'s own docstring calls
 * 11px "the app-wide minimum text size (accessibility floor)") and WCAG
 * AA's 4.5:1 for body text. Roughly half of each — on the one screen in
 * the app people read while moving, outdoors, at arm's length, in daylight.
 *
 * 50% white is where 4.5:1 actually lands on this surface, and it is
 * derived rather than picked: the sheet's near-black ground is about
 * rgb(22,22,26), 50% white composites to rgb(139,139,141), and that gives
 * ~5.3:1 — AA with margin rather than exactly on the line.
 *
 * Kept as plain style fragments rather than Tailwind classes because this
 * sheet styles inline throughout (it animates `top` through a motion value
 * and reads THEME colours in JS); introducing a second styling mechanism
 * for these eighteen sites would be the bigger inconsistency.
 *
 * Only `fontSize` and `color` live here — the two properties that were the
 * defect. Per-site `letterSpacing`, `marginTop` and width stay at their
 * call sites, because those are layout and differ legitimately.
 */

/** Uppercase caption under a figure — TIME, KM, CAL, ELEV, SPLITS. */
export const HUD_CAPTION = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
} as const;

/**
 * Secondary DATA, not a caption — the km-progress rail's end labels and
 * the "AVG 5:42" line. A shade stronger than a caption because it carries
 * a value the athlete reads, rather than naming one.
 */
export const HUD_SECONDARY = {
  fontSize: 11,
  color: "rgba(255,255,255,0.55)",
} as const;

/** The floor these exist to respect, so a test can assert against it. */
export const HUD_MIN_FONT_PX = 11;
