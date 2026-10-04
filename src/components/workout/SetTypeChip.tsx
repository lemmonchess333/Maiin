import { cn } from "@/lib/utils";
import type { SetType } from "@/features/program/setLabels";

/* What each set type's badge looks like: tokens, at the tint their text
   steps are measured on (tokenContrast.test.ts). The workout's set
   table, its set type menu and the saved session's page draw the same
   chip, so a drop set reads as "D" in the same colour on all three. */
const SET_TYPE_CHIP: Record<SetType, string> = {
  working: "bg-muted text-foreground",
  warmup: "bg-warning/10 text-warning-strong",
  dropset: "bg-primary/10 text-primary-strong",
  failure: "bg-destructive/10 text-destructive-strong",
};

/**
 * A set's badge: its number, or its type's letter (`setBadge`).
 * Decorative: the row it sits in says the set's name in words, so the
 * chip is hidden from screen readers.
 */
export default function SetTypeChip({
  type,
  label,
  className,
}: {
  type: SetType;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-set-type={type}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold font-mono tabular-nums",
        SET_TYPE_CHIP[type],
        className
      )}
    >
      {label}
    </span>
  );
}
