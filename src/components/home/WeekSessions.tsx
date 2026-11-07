import InlineNumerals from "@/components/ui/InlineNumerals";

/**
 * The line above Home's week segments (DS4): the week's sessions done,
 * out of the plan's, and the next session ("4 of 6 sessions this week",
 * "Long run tomorrow"). The count is a figure on its own and the words
 * are its caption; a week that plans nothing (a free runner's) says how
 * many were done. `weekSessions` and `nextSessionLine` (homeHero.ts)
 * decide both.
 */
export default function WeekSessions({
  done,
  of,
  next,
}: {
  done: number;
  /** The sessions the week plans, or null when it plans none. */
  of: number | null;
  /** The next session, or null. */
  next: string | null;
}) {
  const noun = (of ?? done) === 1 ? "session" : "sessions";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="text-sm text-muted-foreground">
        <span className="text-2xl font-extrabold leading-none font-figure tabular-nums text-foreground">
          {done}
        </span>{" "}
        {of !== null ? (
          <>
            of <span className="font-mono tabular-nums">{of}</span> {noun} this
            week
          </>
        ) : (
          `${noun} this week`
        )}
      </p>
      {next && (
        <p className="text-sm text-muted-foreground">
          <InlineNumerals>{next}</InlineNumerals>
        </p>
      )}
    </div>
  );
}
