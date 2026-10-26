/**
 * Pgm4 / P1 — presentational grouping primitive for Programme Settings.
 *
 * Groups the editor into iOS-style sections WITHOUT touching the save
 * model — it is pure layout. A group of named controls (Training focus,
 * Lift days per week, Equipment access) needs no title over them: their
 * own headings say what they are, and a second heading above read as two
 * tiers of one thing. A group of rows with no headings of their own
 * (Advanced) takes a bold title and an optional one-line subtitle.
 *
 * `tone="danger"` tints the header for the destructive Reset block.
 */
import { cn } from "@/lib/utils";

interface ProgrammeSettingsGroupProps {
  title?: string;
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
      {title ? (
        <header className="space-y-0.5">
          <h2
            className={cn(
              "text-body font-bold leading-tight",
              tone === "danger" ? "text-destructive-strong" : "text-foreground"
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
      ) : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
