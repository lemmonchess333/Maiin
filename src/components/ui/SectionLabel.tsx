import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionLabelTier = "section" | "caption";

interface SectionLabelProps {
  children: ReactNode;
  /**
   * The label's ROLE, which decides its treatment:
   *   "caption" — lives inside one card: a stat's name above its number,
   *               an eyebrow, a pill, a form-field label. Default.
   *   "section" — heads a GROUP of sibling cards or rows on a page, tab
   *               or sheet ("Today" above the CTA cards, "Running" above
   *               the run charts, "Macros" in the drill-down sheet).
   *
   * The two used to differ by one pixel and nothing else — and the pixel
   * ran the wrong way: the page-level tier was the SMALLER one, so a
   * stat caption inside a tile outranked the header above the tile. Most
   * "section" call sites had picked it for the size, not the role. Both
   * are 12px now; the section tier is bold, tracked wider and in the
   * foreground colour, so the eye can find where a group starts.
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
  caption: "text-xs font-semibold tracking-wider text-muted-foreground",
  section: "text-xs font-bold tracking-widest text-foreground",
};

/**
 * Canonical uppercase, letter-spaced label, at one of two ROLE tiers.
 *
 * Consolidates the ~60 hand-rolled variants that had drifted across
 * size (10/11/12px), tracking (wide/wider/widest/[0.14em]), weight
 * (medium/semibold/bold) and colour (muted / muted/70 / muted/90).
 * Caption: semibold · tracking-wider · muted. Section: bold ·
 * tracking-widest · foreground. Both uppercase, both 12px — the type
 * scale's micro step, so nothing sits below the 12px floor any more.
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
    <Tag
      className={cn("uppercase", TIER_CLASSES[tier], className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
