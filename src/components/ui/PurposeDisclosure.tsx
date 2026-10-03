import type { ReactNode } from "react";

/**
 * Coaching context on demand, beside the prescription: "Why this run" on
 * a run, "Why this session" on a lift. It opens closed, so a day's details
 * lead with the session and its dose and the reason is one tap away (the
 * owner's daily-logging direction in DESIGN_GUIDE.md). Renders nothing
 * when there is nothing to say.
 */
export default function PurposeDisclosure({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  if (!children) return null;
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="min-h-11 flex items-center gap-2 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 list-none before:content-['+'] group-open:before:content-['−']">
        {label}
      </summary>
      <div className="pb-2 leading-relaxed">{children}</div>
    </details>
  );
}
