/**
 * PROTOTYPE, throwaway (claude/prototype-three-features).
 *
 * Question: how should the welcome screen show an example day before
 * sign-up (spec feature 2, call 5)? Each variant replaces the welcome
 * screen's three rows; the mark, the heading and the buttons stay real.
 * Fixed sample data, no account, no network.
 *
 *   A  One session: the rows become one example session.
 *   B  Swipe a week: three pages, a lift, a week, a day's food.
 *   C  Rows that open: the three rows stay, each opens to its example.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ChoiceArt from "@/components/onboarding/ChoiceArt";
import { FoodTabIcon } from "@/components/icons/TabIcons";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import { cn } from "@/lib/utils";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { Button } from "@/components/ui/Button";
import PrototypeSwitcher from "@/components/dev/PrototypeSwitcher";

const WELCOME_VARIANTS = [
  ["A", "One session"],
  ["B", "Swipe a week"],
  ["C", "Rows that open"],
] as const;

const LIFTS = [
  { id: "bench-press", name: "Bench press", sets: "3 × 8–12", load: "40 kg" },
  { id: "barbell-row", name: "Barbell row", sets: "3 × 8–12", load: "35 kg" },
  {
    id: "db-shoulder-press",
    name: "Shoulder press",
    sets: "3 × 10",
    load: "12 kg",
  },
];

const WEEK = [
  ["Mon", "Upper A", "lift"],
  ["Tue", "Easy run", "run"],
  ["Wed", "Lower A", "lift"],
  ["Thu", "Rest", "rest"],
  ["Fri", "Upper B", "lift"],
  ["Sat", "Long run", "run"],
  ["Sun", "Rest", "rest"],
] as const;

const EXAMPLE_NOTE = "An example day. Yours is built from your answers.";

function SetRows({ compact = false }: { compact?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {LIFTS.map((lift) => (
        <li
          key={lift.id}
          className={cn("flex items-center gap-3", compact ? "py-1.5" : "py-2")}
        >
          {!compact && (
            <span className="shrink-0 @max-[16em]:hidden">
              <ChoiceArt art={{ kind: "exercise", id: lift.id }} />
            </span>
          )}
          <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {lift.name}
          </span>
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
            {lift.sets} · {lift.load}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OneSession() {
  const cutout = getFormArtCutout("bench-press");
  return (
    <section
      aria-label="An example day"
      className="@container rounded-2xl bg-muted/60 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-lifting-strong">
            An example day
          </p>
          <p className="text-h3 font-bold leading-tight text-foreground">
            Upper A
          </p>
          <p className="text-sm text-muted-foreground">
            Chest, back and shoulders · about 45 min
          </p>
        </div>
        {cutout && (
          <img
            src={formArtCutoutUrl(cutout)}
            alt=""
            aria-hidden="true"
            className="h-24 w-auto shrink-0 object-contain @max-[16em]:hidden"
          />
        )}
      </div>
      <div className="mt-2">
        <SetRows />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Yours is built from your answers: your days, your gym, your experience.
        Runs and a daily calorie target come with it.
      </p>
    </section>
  );
}

function SwipeAWeek() {
  const [page, setPage] = useState(0);
  const pages = [
    {
      label: "A lift",
      body: (
        <>
          <p className="text-xs font-semibold text-lifting-strong">
            Monday · Upper A
          </p>
          <p className="text-sm text-muted-foreground">about 45 min</p>
          <div className="mt-1">
            <SetRows compact />
          </div>
        </>
      ),
    },
    {
      label: "Your week",
      body: (
        <>
          <p className="text-xs font-semibold text-foreground">
            Lifts and runs, planned together
          </p>
          <ul className="mt-2 grid grid-cols-7 gap-1 text-center">
            {WEEK.map(([day, name, kind]) => (
              <li key={day} className="min-w-0">
                <p className="text-xs text-muted-foreground">{day}</p>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-auto mt-1 block h-10 rounded-md",
                    kind === "lift"
                      ? "bg-lifting/70"
                      : kind === "run"
                        ? "bg-running/70"
                        : "bg-muted"
                  )}
                />
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            3 lifts, 2 runs, 2 rest days
          </p>
        </>
      ),
    },
    {
      label: "Your food",
      body: (
        <>
          <p className="text-xs font-semibold text-nutrition-strong">
            A training day
          </p>
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">
            2,450 {CALORIE_UNIT}
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {(
              [
                ["Protein", "160g", "w-[70%]"],
                ["Carbs", "280g", "w-[85%]"],
                ["Fat", "75g", "w-[45%]"],
              ] as const
            ).map(([name, grams, width]) => (
              <li key={name} className="flex items-center gap-2">
                <span className="w-16 text-muted-foreground">{name}</span>
                <span className="h-2 flex-1 rounded-full bg-muted">
                  <span
                    className={cn("block h-2 rounded-full bg-nutrition", width)}
                  />
                </span>
                <span className="w-12 text-right font-mono tabular-nums">
                  {grams}
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    },
  ];
  return (
    <section
      aria-label="An example week"
      className="w-full min-w-0 space-y-2 [contain:inline-size]"
    >
      <div
        className="flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none]"
        onScroll={(event) => {
          const el = event.currentTarget;
          setPage(Math.round(el.scrollLeft / (el.clientWidth + 12)));
        }}
      >
        {pages.map((p) => (
          <div
            key={p.label}
            className="relative w-full shrink-0 snap-center rounded-2xl bg-muted/60 p-4"
          >
            {p.body}
          </div>
        ))}
      </div>
      <div
        className="flex items-center justify-center gap-1.5"
        aria-hidden="true"
      >
        {pages.map((p, i) => (
          <span
            key={p.label}
            className={cn(
              "size-1.5 rounded-full",
              i === page ? "bg-foreground" : "bg-border"
            )}
          />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        An example. Yours is built from your answers.
      </p>
    </section>
  );
}

function RowsThatOpen() {
  const [open, setOpen] = useState<string | null>("lift");
  const rows = [
    {
      id: "lift",
      title: "Lifting",
      line: "Sessions for your days, gym and experience",
      art: <ChoiceArt art={{ kind: "exercise", id: "db-curl" }} />,
      example: (
        <>
          <p className="text-xs font-semibold text-lifting-strong">
            An example: Upper A, about 45 min
          </p>
          <SetRows compact />
        </>
      ),
    },
    {
      id: "run",
      title: "Running",
      line: "Run when you like, or train for a race",
      art: (
        <span className="text-running-strong">
          <ChoiceArt art={{ kind: "route", distance: 3 }} />
        </span>
      ),
      example: (
        <ul className="space-y-1 text-sm">
          <li className="flex justify-between gap-3">
            <span>Tuesday · Easy run</span>
            <span className="font-mono tabular-nums">30 min</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>Thursday · Intervals</span>
            <span className="font-mono tabular-nums">6 × 3 min</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>Saturday · Long run</span>
            <span className="font-mono tabular-nums">10 km</span>
          </li>
        </ul>
      ),
    },
    {
      id: "food",
      title: "Food",
      line: "A calorie target worked out from your numbers",
      art: (
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-xl bg-muted text-nutrition-strong"
        >
          <FoodTabIcon active={false} className="size-7" />
        </span>
      ),
      example: (
        <p className="text-sm">
          <span className="font-mono font-bold tabular-nums">
            2,450 {CALORIE_UNIT}
          </span>{" "}
          on a training day, with{" "}
          <span className="font-mono tabular-nums">160g</span> of protein
        </p>
      ),
    },
  ];
  return (
    <ul className="@container space-y-2" aria-label="What Tropos plans">
      {rows.map((row) => {
        const isOpen = open === row.id;
        return (
          <li key={row.id} className="rounded-xl bg-muted/60">
            <Button
              variant="ghost"
              fullWidth
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : row.id)}
              className="h-auto justify-start gap-3 p-3 text-left font-normal"
            >
              <span className="shrink-0 @max-[9em]:hidden">{row.art}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {row.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {row.line}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </Button>
            {isOpen && <div className="px-3 pb-3">{row.example}</div>}
          </li>
        );
      })}
      <li className="px-1 text-xs text-muted-foreground">{EXAMPLE_NOTE}</li>
    </ul>
  );
}

export default function WelcomeExamplePrototype({
  variant,
}: {
  variant: string;
}) {
  return (
    <>
      {variant === "A" && <OneSession />}
      {variant === "B" && <SwipeAWeek />}
      {variant === "C" && <RowsThatOpen />}
      <PrototypeSwitcher variants={WELCOME_VARIANTS} />
    </>
  );
}
