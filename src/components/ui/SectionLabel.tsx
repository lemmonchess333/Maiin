import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionLabelTier = "section" | "caption";

interface SectionLabelProps {
  children: ReactNode;
  /**
   * The label's ROLE, which decides its treatment:
   *   "caption" — lives inside one card: a stat's name above its number,
   *               an eyebrow, a pill, a form-field label. Default.
   *   "section" — a small group label inside a sheet or list ("Your
   *               pantry" in the food suggestions, "Macros" in the Food
   *               details sheet): 12px bold in the foreground colour.
   *               A group of cards or rows on a page takes a
   *               `SectionHeading` instead.
   */
  tier?: SectionLabelTier;
  /** Rendered element. Defaults to <p>; pass "h2"/"h3" for a heading,
   *  or "legend" for a fieldset caption. */
  as?: "p" | "span" | "h2" | "h3" | "legend";
  /** Extra classes — spacing (e.g. mb-2) or a token colour override
   *  (e.g. text-running) which twMerge resolves over the muted default. */
  className?: string;
  /** Inline style passthrough — for JS theme colours (e.g. THEME.brand)
   *  that aren't expressible as a Tailwind token class. */
  style?: CSSProperties;
}

const TIER_CLASSES: Record<SectionLabelTier, string> = {
  caption: "text-xs font-semibold text-muted-foreground",
  section: "text-xs font-bold text-foreground",
};

/**
 * The small label inside a card, at one of two ROLE tiers.
 *
 * Consolidates the ~60 hand-rolled variants that had drifted across
 * size (10/11/12px), tracking (wide/wider/widest/[0.14em]), weight
 * (medium/semibold/bold) and colour (muted / muted/70 / muted/90).
 *
 * Caption: 12px semibold muted, in SENTENCE case. DS3 (2026-09-27) took
 * the capitals and letter-spacing off: with every stat name, eyebrow and
 * field label in tracked capitals, a screen read as a wall of small
 * shouting labels, and capitals are now kept for table column headers.
 * Write the label the way it is said ("Total volume", not "TOTAL
 * VOLUME") — the text renders as written.
 *
 * Section: the small group label (see `tier`), sentence case like the
 * caption since the Food pass took its capitals off too. Both 12px —
 * the type scale's micro step, so nothing sits below the 12px floor.
 * Spacing and token colour overrides (e.g. sport tints) ride in via
 * `className`; JS theme colours via `style`.
 */
export default function SectionLabel({
  children,
  tier = "caption",
  as: Tag = "p",
  className,
  style,
}: SectionLabelProps) {
  return (
    <Tag className={cn(TIER_CLASSES[tier], className)} style={style}>
      {children}
    </Tag>
  );
}
