import { ChevronLeft, ChevronRight } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { haptic } from "@/lib/haptic";

/** Analytics' four deeper pages (DS3). The overview answers "how is it
 *  going"; each page holds one discipline's charts, which used to stack
 *  into one scroll about 4,700 px tall on a phone. */
export type AnalyticsPage = "lifting" | "running" | "body" | "food";

const ANALYTICS_PAGES: Record<
  AnalyticsPage,
  { title: string; detail: string }
> = {
  lifting: { title: "Lifting", detail: "Volume, sessions, muscles" },
  running: { title: "Running", detail: "Distance, pace, races" },
  body: { title: "Body", detail: "Weight trend" },
  food: { title: "Food", detail: "Calories, macros, balance" },
};

const ORDER: AnalyticsPage[] = ["lifting", "running", "body", "food"];

/** The overview's way into the four pages: ruled rows on the page, each
 *  the page's name, one line beside it and a chevron. The line is what
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
    <section aria-label="Go deeper" className="@container space-y-1">
      <SectionHeading>Go deeper</SectionHeading>
      <ul className="divide-y divide-border">
        {ORDER.map((page) => {
          const { title, detail } = ANALYTICS_PAGES[page];
          return (
            <li key={page}>
              {/* The line drops under the name when the two no longer fit
                  side by side (larger text on a small phone). */}
              <button
                type="button"
                onClick={() => {
                  haptic();
                  onOpen(page);
                }}
                className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-3 text-left transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className="min-w-min flex-1 text-base font-semibold text-foreground">
                  {title}
                </span>
                <span className="ml-auto flex min-w-min items-center gap-3">
                  <span className="text-right text-sm text-muted-foreground text-pretty">
                    {lines[page] ?? detail}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
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
