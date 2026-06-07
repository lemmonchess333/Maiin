import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionLabelTier = "section" | "caption";

interface SectionLabelProps {
  children: ReactNode;
  /**
   * Typographic tier, per the two documented Tropos label sizes:
   *   "caption" — 12px, card-internal section captions (default)
   *   "section" — 10px, page-section labels (the deliberate 10px tier
   *               called out in the design system as intentional)
   */
  tier?: SectionLabelTier;
  /** Rendered element. Defaults to <p>; pass "h2"/"h3" for a heading. */
  as?: "p" | "span" | "h2" | "h3";
  /** Extra classes — spacing (e.g. mb-2) or a token colour override
   *  (e.g. text-running) which twMerge resolves over the muted default. */
  className?: string;
  /** Inline style passthrough — for JS theme colours (e.g. THEME.brand)
   *  that aren't expressible as a Tailwind token class. */
  style?: CSSProperties;
}

const TIER_SIZE: Record<SectionLabelTier, string> = {
  caption: "text-xs", // 12px
  section: "text-[10px]", // 10px — deliberate page-section size
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
