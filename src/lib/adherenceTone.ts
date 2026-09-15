import { THEME } from "@/lib/theme";

export interface AdherenceTone {
  /** A CSS colour. Always an `hsl(var(--…))` wrapper, never the raw
   *  token: `--muted-foreground` and the `-strong` steps are stored as
   *  HSL TRIPLETS (`240 3.8% 43%`), so `color: var(--muted-foreground)`
   *  is not a colour at all — the declaration is invalid, the browser
   *  drops it, and the text silently inherits instead of going muted. */
  color: string;
  /** The row's wash. An identity hex with an alpha suffix concatenated
   *  onto it — the one place the bare identity is right, because this is
   *  a fill. The concat must stay on a HEX: `var(--x)14` is invalid CSS. */
  bg: string;
}

/**
 * Tone for the Analytics adherence row, which says how many days of the
 * selected window carry a food log.
 *
 * The row is a first-class signal rather than a footnote: for a sparse
 * logger it IS the headline, because the averages beneath it cannot be
 * trusted until logging is more consistent; for a consistent logger it is
 * quiet reassurance. So the tone scales with the number:
 *
 *   >= 80  green  — the data below is reliable
 *   >= 50  muted  — the data below is decent
 *    < 50  amber  — the averages below are under-sampled
 *
 * Every band takes an AA TEXT step, never a bare identity. `THEME.success`
 * (#4DB872) reads 2.29:1 as 12px text on its own 10% tint in light;
 * `--success-strong` reads 5.52:1 on the same wash. Same shape as the
 * amber band, which has always done this.
 */
export function adherenceTone(adherence: number): AdherenceTone {
  if (adherence >= 80)
    return {
      color: "hsl(var(--success-strong))",
      bg: `${THEME.success}1A`,
    };
  if (adherence >= 50)
    return { color: "hsl(var(--muted-foreground))", bg: "transparent" };
  return {
    color: "hsl(var(--warning-strong))",
    bg: `${THEME.amberLight}1A`,
  };
}
