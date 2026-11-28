import { Trophy, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { THEME } from "@/lib/theme";
import PlaceDisc from "@/components/run/PlaceDisc";
import { placeLabel } from "@/lib/runPlacings";

/**
 * "New" beside a record set in the last week. Gold, the colour DS3 keeps
 * for new bests and nothing else: it was a white-on-orange "NEW", the
 * food colour, in capitals the rest of the app retired.
 */
export function NewRecordChip({ label = "New" }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-achievement/15 px-1.5 py-0.5 text-xs font-semibold text-achievement-strong">
      {label}
    </span>
  );
}

/** One of your 2nd and 3rd fastest at a Fastest row's distance (Run29). */
export interface RunnerUp {
  place: 2 | 3;
  /** "5K". */
  label: string;
  value: string;
  date: string;
  runId: string;
}

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
  /** Your top three (Run29): the 2nd and 3rd under a Fastest row, each a
   *  row of its own that opens its run, with its numbered disc. */
  runnersUp?: readonly RunnerUp[];
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
      className="rounded-2xl bg-card overflow-hidden card-shadow"
      style={{
        /* The tint over the card's own fill: `background` would reset
           the colour `bg-card` sets, and the card drew as the page with
           the lit edge round nothing (DS6). Radius and shadow are the
           personal-records table's beside it (PRsTab). */
        backgroundImage: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)`,
      }}
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
        <Trophy className="size-4 text-achievement" />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-micro text-muted-foreground mt-0.5">
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
                {pr.isNew && <NewRecordChip />}
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
          const row = pr.runId ? (
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
          if (!pr.runnersUp?.length) return row;
          return (
            <div key={pr.label}>
              {row}
              {pr.runnersUp.map((up) => (
                <Link
                  key={up.place}
                  to={`/run/${up.runId}`}
                  aria-label={`${up.label}, ${placeLabel(up.place)}, ${up.value}, ${up.date}. View this run.`}
                  className="flex min-h-[44px] items-center justify-between py-2 pl-6 pr-4 active:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PlaceDisc place={up.place} decorative />
                    <span className="text-xs text-muted-foreground truncate">
                      {up.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                        {up.value}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {up.date}
                      </p>
                    </div>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
