import { Check, X } from "lucide-react";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatWeekdayDayMonth } from "@/utils/formatters";
import { FIRST_WEEK_DAYS, type FirstWeek } from "@/lib/firstWeek";

/**
 * Home's card for a new account's first seven days (firstWeek.ts): what
 * to do first, ticked as it happens, and when the first recap comes.
 * The actions themselves are on the cards around it, so the rows are not
 * buttons.
 */
export default function FirstWeekCard({
  week,
  onDismiss,
}: {
  week: FirstWeek;
  onDismiss: () => void;
}) {
  return (
    <Card as="section" aria-labelledby="first-week-title" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            id="first-week-title"
            className="text-base font-bold text-foreground"
          >
            Your first week
          </h2>
          <p className="text-xs text-muted-foreground">
            Day <span className="font-mono tabular-nums">{week.day}</span> of{" "}
            <span className="font-mono tabular-nums">{FIRST_WEEK_DAYS}</span>
          </p>
        </div>
        <IconButton
          aria-label="Hide your first week"
          icon={<X className="size-4 text-muted-foreground" />}
          onClick={onDismiss}
          className="-m-2"
        />
      </div>
      <ul className="space-y-2">
        {week.items.map((item) => (
          <li key={item.key} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "size-5 shrink-0 rounded-full flex items-center justify-center",
                item.done
                  ? "bg-primary text-primary-foreground"
                  : "border-2 border-border"
              )}
            >
              {item.done && <Check className="size-3" strokeWidth={3} />}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.done ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {item.label}
                <span className="sr-only">{item.done ? ", done" : ""}</span>
              </p>
              {item.hint && !item.done && (
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              )}
            </div>
            {item.progress && !item.done && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {item.progress}
              </span>
            )}
          </li>
        ))}
      </ul>
      {week.recapKey && (
        <p className="text-xs text-muted-foreground">
          Your first weekly recap comes on{" "}
          {formatWeekdayDayMonth(parseLocalDate(week.recapKey))}.
        </p>
      )}
    </Card>
  );
}
