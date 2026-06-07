/**
 * Pgm4 / P1 — "Current setup" anchor card.
 *
 * A read-only, compact summary of what the programme is CURRENTLY built
 * around (derived from the saved profile snapshot — the same baseline the
 * dirty-check uses), shown above the editable controls so the user has an
 * anchor before they start scrolling into pickers. Purely presentational:
 * the parent composes the lines from the saved snapshot + the engine's
 * generated split, so this component never reads draft state (which would
 * also duplicate option-label text into the DOM).
 */
import { cn } from "@/lib/utils";
import SectionLabel from "@/components/ui/SectionLabel";

interface CurrentProgrammeSummaryProps {
  /** Pre-composed summary lines, e.g. "Build muscle · Recomp". */
  lines: string[];
  className?: string;
}

export default function CurrentProgrammeSummary({
  lines,
  className,
}: CurrentProgrammeSummaryProps) {
  return (
    <div className={cn("rounded-2xl bg-muted px-4 py-3.5", className)}>
      <SectionLabel tier="section" className="mb-1.5">
        Current setup
      </SectionLabel>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm leading-snug text-foreground">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
