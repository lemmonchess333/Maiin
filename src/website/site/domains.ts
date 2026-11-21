/** A section of the website and its colour (DESIGN_GUIDE §0 rule 2). */
export type SiteDomain = "lifting" | "running" | "food" | "brand";

/** The kicker's colour: the domain's text step, which keeps AA on the
 *  dark page (DESIGN_GUIDE §3). The brand is lifting's purple. */
export const KICKER_CLASS: Record<SiteDomain, string> = {
  lifting: "text-lifting-strong",
  running: "text-running-strong",
  food: "text-nutrition-strong",
  brand: "text-lifting-strong",
};
