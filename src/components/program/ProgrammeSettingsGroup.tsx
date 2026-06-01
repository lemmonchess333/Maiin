/**
 * Pgm4 / P1 — presentational grouping primitive for Programme Settings.
 *
 * Re-hierarchizes the previously-flat editor into iOS-style grouped
 * sections (Goal / Weekly plan / Constraints / Advanced / Danger zone)
 * WITHOUT touching the save model — it is pure layout. Each group gets a
 * bold header + an optional one-line purpose subtitle so the user can tell
 * goal-level decisions from weekly-structure, constraints, engine behaviour,
 * and destructive maintenance at a glance.
 *
 * `tone="danger"` tints the header for the destructive Reset block.
 */
import { cn } from "@/lib/utils";

interface ProgrammeSettingsGroupProps {
  title: string;
  subtitle?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
  className?: string;
}

export default function ProgrammeSettingsGroup({
  title,
  subtitle,
  tone = "default",
  children,
  className,
}: ProgrammeSettingsGroupProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <header className="space-y-0.5">
        <h2
          className={cn(
            "text-[15px] font-bold leading-tight",
            tone === "danger" ? "text-destructive" : "text-foreground"
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
