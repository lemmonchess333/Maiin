import type { ReactNode } from "react";
import { Link2 } from "lucide-react";

/**
 * A pair of lifts the plan wrote as a superset (Lift22), on Train's day
 * list: the two rows in a block of the sport's colour, under one line that
 * says what a superset is. The owner chose it over a rail beside the rows
 * and a link between them (B, 12 November 2026), which squeezed or covered
 * the rows' own words.
 */
export default function SupersetBlock({ children }: { children: ReactNode }) {
  return (
    <div role="group" aria-label="Superset" className="bg-lifting/6">
      <div className="flex flex-wrap items-baseline gap-x-2 px-4 pt-3 pb-1">
        <span className="inline-flex items-center gap-1.5 self-center text-sm font-semibold text-lifting-strong">
          <Link2 className="size-4" aria-hidden="true" />
          Superset
        </span>
        <span className="text-sm text-muted-foreground">
          One set of each, then rest
        </span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}
