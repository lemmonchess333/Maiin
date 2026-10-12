import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionHeadingSize = "page" | "compact";

interface SectionHeadingProps {
  children: ReactNode;
  /**
   * Where the group it heads sits:
   *   "page"  — a section of a page or tab ("This week" above the week's
   *             cards, "Running" above the run charts). Default.
   *   "compact" — a section inside a sheet, a modal, a card or a dense
   *               settings form, one step down so it sits under that
   *               surface's own title.
   */
  size?: SectionHeadingSize;
  /** Heading level. `h2` under a page's `h1`; `h3` for a section nested
   *  inside another one (a card's title inside a page section). */
  as?: "h2" | "h3";
  /** A trailing action on the same line — a text link such as "Weekly
   *  review" or "See all". The heading and the action share one row,
   *  baseline-aligned. */
  action?: ReactNode;
  /** Layout (e.g. `px-1` to line up with card content) or a token colour
   *  override (e.g. `text-running-strong`), which twMerge resolves over
   *  the foreground default. */
  className?: string;
  /** Inline style passthrough — for JS theme colours. */
  style?: CSSProperties;
  id?: string;
}

const SIZE_CLASSES: Record<SectionHeadingSize, string> = {
  page: "text-h3 font-bold tracking-tight leading-tight",
  compact: "text-base font-bold leading-snug",
};

/**
 * The heading above a group of cards or rows, in sentence case.
 *
 * DS3 (2026-09-27) retired the capital-letter group label. Every group on
 * a page used to open with a 12px uppercase, letter-spaced label — the
 * same register as a stat's caption inside a card, one weight heavier —
 * so a page read as one flat list of small shouting labels, and a card's
 * own title outranked the heading of the section it sat in. A section
 * heading is a heading now: 20px bold on a page (the type scale's H3),
 * 16px bold in a sheet, card or form, written the way the words are said.
 *
 * `SectionLabel` stays for what sits INSIDE a card (a stat's name above
 * its number, an eyebrow, a field label). Pick by role: if it heads a
 * group of cards or rows, it is this.
 */
export default function SectionHeading({
  children,
  size = "page",
  as: Tag = "h2",
  action,
  className,
  style,
  id,
}: SectionHeadingProps) {
  // The colour sits on the outermost element either way, so a colour
  // override in `className` reaches the heading through inheritance when
  // an action row wraps it. The action carries its own colour.
  if (!action) {
    return (
      <Tag
        id={id}
        className={cn(SIZE_CLASSES[size], "text-foreground", className)}
        style={style}
      >
        {children}
      </Tag>
    );
  }
  // The action drops under the heading when the two no longer fit on one
  // line (larger text on the phone), rather than running off the card.
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 min-w-0 text-foreground",
        className
      )}
      style={style}
    >
      <Tag id={id} className={cn(SIZE_CLASSES[size], "min-w-min flex-1")}>
        {children}
      </Tag>
      <div className="ml-auto flex-shrink-0">{action}</div>
    </div>
  );
}
