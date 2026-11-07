import { Fragment, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Dumbbell,
  Equal,
  Footprints,
} from "lucide-react";
import InlineNumerals from "@/components/ui/InlineNumerals";
import MetaLine from "@/components/ui/MetaLine";
import { cardClasses } from "@/components/ui/cardClasses";
import { cn } from "@/lib/utils";
import type { HeroLine } from "@/lib/homeHero";

export type HeroSport = "lift" | "run" | "rest";

/** The hero's picture: Tropos's own art, never a stand-in. */
export interface HeroPicture {
  src: string;
  /** The art's own class (the form drawings' light-theme edge). */
  className?: string;
}

/** A soft glow of the sport's own colour behind the picture, fading into
 *  the page (§14m rule 13: one hue, into its surface). Its strength is per
 *  theme, so light and dark carry the same colour (rule 15): `.hero-glow`
 *  in components.css. A rest day shares the lift's purple; a run's coral
 *  stays quiet, under the runner's purple muscles. */
const GLOW: Record<HeroSport, string> = {
  lift: "hero-glow",
  run: "hero-glow-run",
  rest: "hero-glow",
};

const STRONG: Record<HeroSport, string> = {
  lift: "text-lifting-strong",
  run: "text-running-strong",
  rest: "text-lifting-strong",
};

/* The mark's ring at full strength on light and half on dark, so it
   reads as the same colour in both (§14m rule 15): at half strength on a
   light page it fell below what counts as colour, and only dark had it. */
const EDGE: Record<HeroSport, string> = {
  lift: "border-lifting dark:border-lifting/50",
  run: "border-running dark:border-running/50",
  rest: "border-lifting dark:border-lifting/50",
};

/** The mark beside the line: which way the number moved, or the sport. */
function LineMark({ line, sport }: { line: HeroLine; sport: HeroSport }) {
  const Icon =
    line.mark === "up"
      ? ArrowUp
      : line.mark === "down"
        ? ArrowDown
        : line.mark === "same"
          ? Equal
          : line.mark === "run"
            ? Footprints
            : sport === "rest"
              ? CalendarDays
              : Dumbbell;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-[36px] shrink-0 items-center justify-center rounded-full border-2",
        EDGE[sport],
        line.mark === "up" ? STRONG[sport] : "text-muted-foreground"
      )}
    >
      <Icon className="size-[18px]" strokeWidth={2.4} />
    </span>
  );
}

/**
 * Today's session as Home's hero (DS4, DESIGN_GUIDE §14m), or, for the
 * second session of a day with two, as a compact card under it.
 *
 * The hero is the screen's largest thing and its largest words: the
 * session's name as the headline (the page's h1 is for screen readers;
 * the hero names the screen), its focus and minutes, the session's own
 * picture (at least a tenth of the screen), one line with a number and
 * what it is compared with, and the screen's one full-width filled
 * button, which is neutral. It stands open on the page rather than in a
 * card, so it is dressed differently from the cards under it.
 *
 * `preview` is the area behind the content: a tap anywhere that is not
 * the action opens the session in Train to look it over. It is a sibling
 * of the content, not its parent, because a button cannot hold a button;
 * the content lets taps through, and only the action takes its own.
 */
export default function SessionHero({
  sport,
  variant = "hero",
  category,
  title,
  meta = [],
  description,
  picture,
  line,
  action,
  preview,
}: {
  sport: HeroSport;
  /** `compact`: the second session of a day with two. */
  variant?: "hero" | "compact";
  /** The first half of a name the person gave the day ("Arms" of "Arms —
   *  Pump"), above the title. */
  category?: string | null;
  title: string;
  /** Facts, joined by " · " ("Back and biceps", "about 26 min"). */
  meta?: string[];
  /** A sentence under the title, where the day has no facts to list. */
  description?: string;
  picture?: HeroPicture | null;
  line?: HeroLine | null;
  /** The action row: Start, Resume, or the day's status. */
  action?: ReactNode;
  preview?: { label: string; onOpen: () => void } | null;
}) {
  const previewButton = preview && (
    <button
      type="button"
      onClick={preview.onOpen}
      aria-label={preview.label}
      className={cn(
        "absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        sport === "run"
          ? "motion-safe:active:bg-running/5"
          : "motion-safe:active:bg-lifting/5"
      )}
    />
  );

  if (variant === "compact") {
    return (
      <div
        className={cardClasses({
          size: "compact",
          padded: false,
          className: "relative",
        })}
      >
        {previewButton}
        <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
          <div className="min-w-[min(9em,100%)] flex-1">
            <p className={cn("text-xs font-semibold", STRONG[sport])}>
              Also today
            </p>
            <p className="text-base font-bold leading-snug text-foreground text-balance">
              <InlineNumerals>{title}</InlineNumerals>
            </p>
            <MetaLine size="xs" items={meta} />
          </div>
          {action}
        </div>
      </div>
    );
  }

  return (
    <div className="@container relative rounded-2xl">
      {previewButton}
      <div className="pointer-events-none relative z-10">
        {category && (
          <p className={cn("text-sm font-bold", STRONG[sport])}>
            <InlineNumerals>{category}</InlineNumerals>
          </p>
        )}
        <h2 className="text-hero font-extrabold leading-[1.05] tracking-tight text-foreground text-balance">
          <InlineNumerals>{title}</InlineNumerals>
        </h2>
        {meta.length > 0 && (
          /* Not a MetaLine: that keeps every fact whole, and "Chest, back
             and shoulders" is words that must wrap at large text. A fact
             with a number in it ("about 26 min", "5 km") stays whole. */
          <p className="mt-2 text-base font-medium text-muted-foreground">
            {meta.map((item, i) => (
              <Fragment key={item}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <span
                  className={/\d/.test(item) ? "whitespace-nowrap" : undefined}
                >
                  <InlineNumerals>{item}</InlineNumerals>
                </span>
              </Fragment>
            ))}
          </p>
        )}
        {description && (
          <p className="mt-2 text-base font-medium text-muted-foreground">
            {description}
          </p>
        )}
        {picture && (
          /* A runner and the rest day's walker are tall, narrow drawings,
             so their box is taller: at the lift's height the easy stride
             covered under a tenth of the screen (§14m rule 24). */
          <div
            className={cn(
              "relative mt-3 flex items-center justify-center",
              sport === "lift" ? "h-[240px]" : "h-[280px]"
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute left-1/2 top-1/2 aspect-square w-full max-w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full",
                GLOW[sport]
              )}
            />
            <img
              src={picture.src}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              className={cn(
                "relative size-full object-contain",
                picture.className
              )}
            />
          </div>
        )}
        {line && (
          <div className="mt-3 flex items-center gap-3">
            <LineMark line={line} sport={sport} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold leading-snug text-foreground">
                <InlineNumerals>{line.title}</InlineNumerals>
              </p>
              <p className="text-sm text-muted-foreground">
                <InlineNumerals>{line.detail}</InlineNumerals>
              </p>
            </div>
          </div>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
