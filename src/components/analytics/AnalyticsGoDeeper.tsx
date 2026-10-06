import { Apple, ChevronLeft, Dumbbell, Footprints, Scale } from "lucide-react";
import type { ComponentType } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import { cardClasses } from "@/components/ui/cardClasses";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";

/** Analytics' four deeper pages (DS3). The overview answers "how is it
 *  going"; each page holds one discipline's charts, which used to stack
 *  into one scroll about 4,700 px tall on a phone. */
export type AnalyticsPage = "lifting" | "running" | "body" | "food";

const ANALYTICS_PAGES: Record<
  AnalyticsPage,
  {
    title: string;
    detail: string;
    icon: ComponentType<{ className?: string }>;
    /** The identity colour of the page's icon, as a text utility. */
    tint: string;
  }
> = {
  lifting: {
    title: "Lifting",
    detail: "Volume, sessions, muscles",
    icon: Dumbbell,
    tint: "text-lifting",
  },
  running: {
    title: "Running",
    detail: "Distance, pace, races",
    icon: Footprints,
    tint: "text-running",
  },
  body: {
    title: "Body",
    detail: "Weight trend",
    icon: Scale,
    tint: "text-foreground",
  },
  food: {
    title: "Food",
    detail: "Calories, macros, balance",
    icon: Apple,
    tint: "text-nutrition",
  },
};

const ORDER: AnalyticsPage[] = ["lifting", "running", "body", "food"];

/** The overview's way into the four pages: a two-by-two of plain cards,
 *  each an icon in its discipline's colour over a name and one line: what
 *  the page holds for this user when there is something (`goDeeperLines`),
 *  otherwise what it holds at all. */
export default function AnalyticsGoDeeper({
  onOpen,
  lines = {},
}: {
  onOpen: (page: AnalyticsPage) => void;
  lines?: Partial<Record<AnalyticsPage, string>>;
}) {
  return (
    <section aria-label="Go deeper" className="@container space-y-2">
      <SectionHeading>Go deeper</SectionHeading>
      {/* One column under 11em (larger text on a small phone), where two
          ran "Running" into the card's edge. */}
      <div className="grid grid-cols-1 @min-[11em]:grid-cols-2 gap-2">
        {ORDER.map((page) => {
          const { title, detail, icon: Icon, tint } = ANALYTICS_PAGES[page];
          return (
            <button
              key={page}
              type="button"
              onClick={() => {
                haptic();
                onOpen(page);
              }}
              className={cardClasses({
                size: "compact",
                className:
                  "flex min-h-[112px] flex-col items-start gap-1 text-left transition-transform motion-safe:active:scale-[0.97]",
              })}
            >
              <Icon className={cn("mb-2 size-6", tint)} aria-hidden="true" />
              <span className="text-base font-bold text-foreground">
                {title}
              </span>
              <span className="text-sm text-muted-foreground">
                {lines[page] ?? detail}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A deeper page's way back to the overview. */
export function AnalyticsBackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic();
        onBack();
      }}
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      Overview
    </button>
  );
}
