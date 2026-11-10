/**
 * PROTOTYPE, throwaway (claude/prototype-three-features).
 *
 * Question: how should a partner's week sit beside yours (spec feature 3,
 * call 7)? Shown on Together above the league card, with a stub partner
 * ("Sam") and a stub week whose today is Friday. The data this needs does
 * not exist yet (a bond keeps each member's last active day only), so
 * nothing here is read or written.
 *
 *   A  Two rows: your week and theirs, a column a day, shared days joined.
 *   B  Against your own plans: each of you against your own plan, as the
 *      league scores, so a 3-day week and a 5-day week meet as equals.
 *   C  Last 30 days: Hevy's comparison, sessions, time, distance.
 */
import { Dumbbell, Flame, Footprints } from "lucide-react";
import { cardClasses } from "@/components/ui/cardClasses";
import { cn } from "@/lib/utils";
import PrototypeSwitcher from "@/components/dev/PrototypeSwitcher";

const PARTNER_VARIANTS = [
  ["A", "Two rows"],
  ["B", "Against your own plans"],
  ["C", "Last 30 days"],
] as const;

type Day = "lift" | "run" | null;
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const TODAY = 4; // Friday, in this stub week
const YOU: Day[] = ["lift", "run", null, "lift", "run", null, null];
const SAM: Day[] = ["lift", null, "run", "lift", "lift", null, null];
const STREAK_DAYS = 6;

function Mark({ day, future }: { day: Day; future: boolean }) {
  if (day === "lift")
    return (
      <span className="mx-auto flex size-8 items-center justify-center rounded-full bg-lifting text-white">
        <Dumbbell className="size-4" aria-hidden="true" />
      </span>
    );
  if (day === "run")
    return (
      <span className="mx-auto flex size-8 items-center justify-center rounded-full bg-running text-white">
        <Footprints className="size-4" aria-hidden="true" />
      </span>
    );
  return (
    <span
      className={cn(
        "mx-auto block size-8 rounded-full border-2",
        future ? "border-dashed border-border" : "border-border bg-muted"
      )}
    />
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground"
      >
        S
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-foreground">You and Sam</p>
        <p className="text-sm text-muted-foreground">This week</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-foreground">
        <Flame className="size-4 text-running-strong" aria-hidden="true" />
        <span className="font-mono tabular-nums">{STREAK_DAYS}</span> days
      </span>
    </div>
  );
}

function TwoRows() {
  const shared = YOU.map((d, i) => d !== null && SAM[i] !== null);
  const sharedCount = shared.filter(Boolean).length;
  return (
    <>
      <Header />
      <div
        className="mt-3 grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-y-1.5 text-center"
        role="table"
        aria-label="Your week and Sam's"
      >
        <span />
        {DAYS.map((d, i) => (
          <span
            key={i}
            className={cn(
              "text-xs",
              i === TODAY
                ? "font-bold text-foreground"
                : "text-muted-foreground"
            )}
          >
            {d}
          </span>
        ))}
        {(
          [
            ["You", YOU],
            ["Sam", SAM],
          ] as const
        ).map(([who, week]) => (
          <div key={who} className="contents" role="row">
            <span className="pr-2 text-left text-sm font-semibold text-foreground">
              {who}
            </span>
            {week.map((day, i) => (
              <span
                key={i}
                role="cell"
                aria-label={`${who}, ${DAY_NAMES[i]}: ${day ?? "nothing"}`}
                className={cn(
                  "py-1",
                  shared[i] &&
                    (who === "You"
                      ? "rounded-t-full bg-lifting/10"
                      : "rounded-b-full bg-lifting/10")
                )}
              >
                <Mark day={day} future={i > TODAY} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        You both trained on{" "}
        <span className="font-mono tabular-nums">{sharedCount}</span> days this
        week. Each one keeps the streak going.
      </p>
    </>
  );
}

function AgainstOwnPlans() {
  const rows = [
    { who: "You", done: 4, planned: 5 },
    { who: "Sam", done: 4, planned: 4 },
  ];
  return (
    <>
      <Header />
      <ul className="mt-3 space-y-3">
        {rows.map((row) => {
          const share = Math.min(row.done, row.planned) / row.planned;
          const complete = row.done >= row.planned;
          return (
            <li key={row.who}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {row.who}
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="font-mono font-bold tabular-nums text-foreground">
                    {Math.min(row.done, row.planned)}
                  </span>{" "}
                  of{" "}
                  <span className="font-mono tabular-nums">{row.planned}</span>{" "}
                  planned{complete ? " · week done" : ""}
                </span>
              </div>
              <div className="mt-1 h-3 rounded-full bg-muted">
                <div
                  className={cn(
                    "h-3 rounded-full",
                    complete ? "bg-success" : "bg-lifting"
                  )}
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        Each of you against your own plan, so a 4-day week counts the same as a
        5-day one.
      </p>
    </>
  );
}

function LastThirtyDays() {
  const rows: [string, string, string][] = [
    ["Sessions", "14", "11"],
    ["Time", "9 h 20 min", "7 h 5 min"],
    ["Runs", "6 · 42 km", "3 · 18 km"],
    ["Lifts", "8", "9"],
    ["Most trained", "Legs", "Back"],
  ];
  return (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground"
        >
          S
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-foreground">You and Sam</p>
          <p className="text-sm text-muted-foreground">Last 30 days</p>
        </div>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 text-left font-medium" />
            <th className="py-1 text-right font-semibold">You</th>
            <th className="py-1 text-right font-semibold">Sam</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([label, you, sam]) => (
            <tr key={label}>
              <td className="py-2 text-muted-foreground">{label}</td>
              <td className="py-2 text-right font-mono font-semibold tabular-nums text-foreground">
                {you}
              </td>
              <td className="py-2 text-right font-mono font-semibold tabular-nums text-foreground">
                {sam}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function PartnerWeekPrototype({ variant }: { variant: string }) {
  return (
    <>
      <section
        aria-label="You and Sam"
        className={cardClasses({ className: "mb-3" })}
      >
        {variant === "A" && <TwoRows />}
        {variant === "B" && <AgainstOwnPlans />}
        {variant === "C" && <LastThirtyDays />}
      </section>
      <PrototypeSwitcher variants={PARTNER_VARIANTS} />
    </>
  );
}
