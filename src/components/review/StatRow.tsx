import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One of the recap's numbers, big, over the words that say what it is,
 *  with a rule in the colour of its job (DS3's recap card). The weekly
 *  review's cards and the year recap draw their figures with it. */
export default function StatRow({
  rule,
  value,
  caption,
  numeral = true,
  children,
}: {
  /** A background utility for the rule: `bg-lifting`, `bg-running`… */
  rule: string;
  /** The figure, or its count-up (`AnimatedNumber`). */
  value: ReactNode;
  caption: string;
  /** False for a word ("Steady"), which does not take the numeral face. */
  numeral?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn("w-1 shrink-0 rounded-full", rule)}
      />
      <div className="min-w-0 py-0.5">
        <p
          className={cn(
            "text-display font-extrabold leading-none text-foreground",
            numeral && "font-figure tabular-nums"
          )}
        >
          {value}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">{caption}</p>
        {children}
      </div>
    </div>
  );
}
