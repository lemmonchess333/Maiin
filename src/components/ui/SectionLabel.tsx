import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionLabelTier = "section" | "caption";

interface SectionLabelProps {
  children: ReactNode;
  /**
   * Typographic tier, per the two documented Tropos label sizes:
   *   "caption" — 12px, card-internal section captions (default)
   *   "section" — 11px (text-caption), page-section labels. Historically
   *               the deliberate 10px tier; floored up to the official
   *               11px scale step when it became the app-wide minimum
   *               text size (accessibility floor).
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

const TIER_SIZE: Record<SectionLabelTier, string> = {
  caption: "text-xs", // 12px
  section: "text-caption", // 11px — page-section size (a11y-floored from 10px)
};

/**
 * Canonical uppercase, letter-spaced, muted section label.
 *
 * Consolidates the ~60 hand-rolled variants that had drifted across
 * size (10/11/12px), tracking (wide/wider/widest/[0.14em]), weight
 * (medium/semibold/bold) and colour (muted / muted/70 / muted/90).
 * One treatment — semibold · tracking-wider · uppercase · muted — at
 * one of the two documented tiers. Spacing and token colour overrides
 * (e.g. sport tints) ride in via `className`; JS theme colours via
 * `style`.
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
      className={cn(
        TIER_SIZE[tier],
        "font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
      style={style}
    >
      {children}
    </Tag>
  );
}
