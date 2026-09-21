import { Trophy, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { THEME } from "@/lib/theme";

interface PR {
  label: string;
  value: string;
  date: string;
  isNew?: boolean;
  /** The run holding this record. A row that has one opens it, the way a
   *  lift row has always opened its exercise history — every running
   *  record IS a specific saved run, and the rows were the only inert
   *  ones on the tab. Absent on a placeholder row, which stays inert. */
  runId?: string;
}

interface PRCardProps {
  title: string;
  /* Optional muted subtitle rendered under the title. Used by the
     Running PRs card to disclose "Outdoor GPS only" so treadmill /
     manual users understand why their PRs may be empty without
     having to re-label every PR row. */
  subtitle?: string;
  prs: PR[];
  accentColor?: string;
  icon?: string;
}

export default function PRCard({
  title,
  subtitle,
  prs,
  accentColor = THEME.tier.gold,
}: PRCardProps) {
  if (prs.length === 0) return null;

  return (
    <div
      className="rounded-xl bg-card overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)`,
      }}
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
        <Trophy className="size-4 text-achievement" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-caption text-muted-foreground mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/20">
        {prs.map((pr) => {
          const content = (
            <>
              <div className="flex items-center gap-2 min-w-0">
                {pr.isNew && (
                  /* `nutrition-fill`, not the bare orange. White on
                     `--ds-orange-500` measures 3.05:1 at this size, on the
                     one element on the tab whose whole job is to catch the
                     eye; the fill step exists for white-on-orange and reads
                     5.02:1. */
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold tracking-wider flex-shrink-0 bg-nutrition-fill text-white">
                    NEW
                  </span>
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {pr.label}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div className="text-right">
                  <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                    {pr.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pr.date}
                  </p>
                </div>
                {pr.runId && (
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
            </>
          );
          const rowClass = "flex items-center justify-between px-4 py-3";
          /* Two explicit branches rather than one polymorphic element: a
             `Link` requires `to`, so a component variable that is
             sometimes a plain div cannot be typed without widening
             `LinkProps`, and widening it would let a row ship without a
             destination. */
          return pr.runId ? (
            <Link
              key={pr.label}
              to={`/run/${pr.runId}`}
              aria-label={`${pr.label}, ${pr.value}, ${pr.date}. View this run.`}
              className={`${rowClass} active:bg-muted/40 transition-colors`}
            >
              {content}
            </Link>
          ) : (
            <div key={pr.label} className={rowClass}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
