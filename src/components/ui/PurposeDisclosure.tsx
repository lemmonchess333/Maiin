import type { ReactNode } from "react";

/**
 * Context on demand, beside what it explains: "Why this run" on a run,
 * and a race plan's weeks ahead on its card. (A lift's "Why this session"
 * opens the rules sheet instead, Lift4 (3).) It opens closed, so a day's
 * details lead with the session and its dose and the reason is one tap
 * away (the owner's daily-logging direction in DESIGN_GUIDE.md). Renders
 * nothing when there is nothing to say. `onToggle` tells its owner when it
 * opens or closes, for content worked out only once someone asks.
 */
export default function PurposeDisclosure({
  label,
  children,
  onToggle,
}: {
  label: string;
  children?: ReactNode;
  onToggle?: (open: boolean) => void;
}) {
  if (!children) return null;
  return (
    <details
      className="group text-xs text-muted-foreground"
      onToggle={
        onToggle ? (event) => onToggle(event.currentTarget.open) : undefined
      }
    >
      <summary className="min-h-11 flex items-center gap-2 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 list-none before:content-['+'] group-open:before:content-['−']">
        {label}
      </summary>
      <div className="pb-2 leading-relaxed">{children}</div>
    </details>
  );
}
