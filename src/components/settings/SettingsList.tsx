/**
 * SettingsGroup / SettingsRow — the grouped list Settings draws its rows in.
 *
 * Set1 locked iOS-style nested pages: a group is one card with hairline
 * dividers under a sentence-case heading, and a row is a label with an
 * optional line under it. A row that opens another page carries a chevron;
 * a row that changes something in place carries its control (`trailing`:
 * a Toggle, a SegmentedControl) and no chevron, so the two never look
 * alike. A destructive row is red text alone, no icon and no chevron (Set1:
 * "Delete account" at the foot of the Account page).
 *
 * Before this, each Settings page drew its rows its own way: bordered
 * boxes, chip rows, value text in capitals that silently flipped on tap.
 */
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import SectionHeading from "@/components/ui/SectionHeading";

export function SettingsGroup({
  title,
  footer,
  children,
  className,
}: {
  /** Sentence-case heading above the card. */
  title?: string;
  /** A short note under the card. */
  footer?: ReactNode;
  /** `SettingsRow`s (each renders an `<li>`). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {title && (
        <SectionHeading size="compact" className="px-1">
          {title}
        </SectionHeading>
      )}
      <ul className="@container rounded-xl bg-card overflow-hidden divide-y divide-border/40">
        {children}
      </ul>
      {footer && <p className="px-1 text-xs text-muted-foreground">{footer}</p>}
    </section>
  );
}

interface SettingsRowProps {
  label: ReactNode;
  /** One short line under the label. */
  description?: ReactNode;
  icon?: LucideIcon;
  /** Icon colour class, for a row that belongs to a sport or to food. */
  iconClassName?: string;
  /** The current value, right-aligned before the chevron. */
  value?: ReactNode;
  /** An in-place control (Toggle, SegmentedControl). A row with one is
   *  not itself a button. */
  trailing?: ReactNode;
  onClick?: () => void;
  /** Defaults to on for a row that opens something and has no control. */
  chevron?: boolean;
  tone?: "default" | "destructive";
  disabled?: boolean;
}

export function SettingsRow({
  label,
  description,
  icon: Icon,
  iconClassName,
  value,
  trailing,
  onClick,
  chevron,
  tone = "default",
  disabled,
}: SettingsRowProps) {
  const destructive = tone === "destructive";
  const showChevron = chevron ?? (!!onClick && !trailing && !destructive);
  const body = (
    <>
      {/* The icon gives its room to the label once the row is under 14em
          (larger text on the phone): beside it "Programme" and
          "Subscription" broke mid-word. */}
      {Icon && !destructive && (
        <span className="size-8 rounded-lg bg-muted flex @max-[14em]:hidden items-center justify-center shrink-0">
          <Icon
            className={cn("size-4 text-muted-foreground", iconClassName)}
            aria-hidden="true"
          />
        </span>
      )}
      <span className="flex-1 min-w-0">
        {/* Hyphenates a word wider than the room left (only "Subscription"
            beside its plan, on a 320px phone at larger text) rather than
            running under the value. */}
        <span
          className={cn(
            "block text-sm font-medium break-words hyphens-auto",
            destructive ? "text-destructive-strong" : "text-foreground"
          )}
        >
          {label}
        </span>
        {description && (
          <span
            className={cn(
              "block text-xs text-muted-foreground",
              // A row with a control beside it wraps rather than clipping
              // its line; a navigation row keeps to two, which at the
              // designed size is one.
              !trailing && "line-clamp-2"
            )}
          >
            {description}
          </span>
        )}
      </span>
      {value !== undefined && (
        /* Shrinks to its longest word and wraps, rather than taking the
           label's room: at larger text "Trial · 12 days left" left
           "Subscription" wider than what remained. */
        <span className="min-w-min text-right text-sm text-muted-foreground">
          {value}
        </span>
      )}
      {trailing}
      {showChevron && (
        <ChevronRight
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
      )}
    </>
  );

  const rowClass =
    "w-full px-4 py-3 min-h-[52px] flex items-center gap-3 text-left";

  if (onClick && !trailing) {
    return (
      <li>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            haptic();
            onClick();
          }}
          className={cn(
            rowClass,
            "hover:bg-muted/30 motion-safe:transition-colors motion-safe:active:scale-[0.99] disabled:opacity-50"
          )}
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li>
      <div className={rowClass}>{body}</div>
    </li>
  );
}
