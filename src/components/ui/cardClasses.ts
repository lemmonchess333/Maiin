/**
 * Card class logic — the `.ts` sibling of `Card.tsx`, for the same reason
 * `buttonClasses.ts` sits beside `Button.tsx`: a component file may export
 * only components (react-refresh rule), and pressable cards are `<button>`
 * or `<Link>` elements that need to wear the card look without being a
 * `Card`. They import this directly.
 *
 * Two sizes, because the measurements found two pairings that already
 * carried the app and a long tail that did not: `rounded-2xl p-4` on 96
 * surfaces and `rounded-xl p-3` on 64, then twenty-odd other radius and
 * padding combinations on a handful of surfaces each. A card that is
 * neither reads as belonging to a different app; the size names the
 * intent so the pairing cannot be half-copied.
 *
 *   hero     rounded-2xl p-4   the section-leading card (Health Score,
 *                              Water, Today's energy)
 *   compact  rounded-xl  p-3   tiles and rows inside a grid or stack
 *                              (Weight, Steps, stat tiles)
 *
 * `card-shadow` is the elevation utility. NOT `shadow-card`: Tailwind reads
 * that as a shadow COLOUR with no size, so it renders nothing, and three
 * cards meant to float were flat because of it.
 */
import { cn } from "@/lib/utils";

export type CardSize = "hero" | "compact";

/** `card` floats on the page; `muted` sits flush, one step darker than the
 *  page, for tiles that group beneath a floating card (the Weight/Steps
 *  pair under Water); `tinted` supplies no surface at all, for the
 *  sport-coloured CTA cards whose 8% wash the caller paints (the colour is
 *  the card's meaning, so it stays at the call site). */
export type CardTone = "card" | "muted" | "tinted";

const SIZE_CLASSES: Record<CardSize, { radius: string; padding: string }> = {
  hero: { radius: "rounded-2xl", padding: "p-4" },
  compact: { radius: "rounded-xl", padding: "p-3" },
};

const TONE_CLASSES: Record<CardTone, string> = {
  card: "bg-card card-shadow",
  muted: "bg-muted",
  tinted: "",
};

export interface CardClassOptions {
  size?: CardSize;
  tone?: CardTone;
  /** `false` for a card whose children own the padding (a media card with
   *  a full-bleed header, a list card whose rows pad themselves). The
   *  radius and surface still come from the size. */
  padded?: boolean;
  className?: string;
}

export function cardClasses({
  size = "hero",
  tone = "card",
  padded = true,
  className,
}: CardClassOptions = {}): string {
  const { radius, padding } = SIZE_CLASSES[size];
  return cn(radius, padded && padding, TONE_CLASSES[tone], className);
}

/**
 * One card radius for a whole screen (§14m rule 20: 16pt cards, 10-12pt
 * inside them). The primitive's hero card is `rounded-2xl`, 22pt; Home,
 * Food and Train moved their cards to 16pt one by one (#3084, #3089).
 * History draws about twenty kinds of card from as many components, some
 * of them loaded late, so the screen sets it once on its root instead:
 * every `rounded-2xl` inside takes `rounded-xl`. Sheets open in a portal,
 * outside the root, and keep theirs.
 */
export const ONE_CARD_RADIUS = "[&_.rounded-2xl]:rounded-xl";
