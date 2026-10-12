import { Check, ChevronRight, X } from "lucide-react";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatWeekdayDayMonth } from "@/utils/formatters";
import {
  FIRST_WEEK_DAYS,
  type FirstWeek,
  type FirstWeekItem,
  type FirstWeekItemKey,
} from "@/lib/firstWeek";

function ItemRow({ item }: { item: FirstWeekItem }) {
  return (
    <>
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
    </>
  );
}

/**
 * Home's card for a new account's first seven days (firstWeek.ts): what
 * to do first, ticked as it happens, and when the first recap comes.
 *
 * An item still to do opens its step (FV1): the first workout or run is
 * pointed out on its card, the first meal opens Food with the composer
 * pointed out, and the weigh-ins open the weigh-in sheet. A ticked item is
 * plain text. Without `onOpen` every row is plain, as the card was in FW1.
 */
export default function FirstWeekCard({
  week,
  onDismiss,
  onOpen,
}: {
  week: FirstWeek;
  onDismiss: () => void;
  onOpen?: (key: FirstWeekItemKey) => void;
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
      <ul>
        {week.items.map((item) => (
          <li key={item.key}>
            {item.done || !onOpen ? (
              <div className="flex min-h-11 items-center gap-3">
                <ItemRow item={item} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  haptic();
                  onOpen(item.key);
                }}
                className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ItemRow item={item} />
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </button>
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
