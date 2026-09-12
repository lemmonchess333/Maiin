/**
 * Card — the one card surface.
 *
 * Pages and sections stopped agreeing on what a card is: the measurements
 * found 96 surfaces on `rounded-2xl p-4`, 64 on `rounded-xl p-3`, and
 * thirty-seven `bg-card` surfaces on some other pairing — `p-3.5`,
 * `rounded-lg p-4`, `rounded-2xl p-3`, `p-5`, `p-6` — each a decision made
 * alone. Like `Button` for controls and `PageShell` for the page, this is
 * CODE the surfaces render through, so the pairing is decided once.
 *
 * Two sizes (`hero`, `compact`), two tones (`card`, `muted`), and an
 * opt-out of padding for cards whose children pad themselves. Anything a
 * card needs beyond that is layout, and goes on `className`.
 *
 * Pressable cards stay `<button>` / `<Link>` elements and take the same
 * look from `cardClasses` in the `.ts` sibling — the element is the
 * semantics, the classes are the surface.
 */
import type { HTMLAttributes, Ref } from "react";
import { cardClasses, type CardSize, type CardTone } from "./cardClasses";

export type { CardSize, CardTone };

interface CardProps extends HTMLAttributes<HTMLElement> {
  size?: CardSize;
  tone?: CardTone;
  padded?: boolean;
  /** The landmark the card is: a `section` when it has its own heading,
   *  an `article` when it is one item of a feed. Defaults to a plain
   *  `div`. */
  as?: "div" | "section" | "article";
  ref?: Ref<HTMLElement>;
}

function Card({
  size = "hero",
  tone = "card",
  padded = true,
  as: Tag = "div",
  className,
  ref,
  ...rest
}: CardProps) {
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement>}
      className={cardClasses({ size, tone, padded, className })}
      {...rest}
    />
  );
}

export { Card };
export default Card;
