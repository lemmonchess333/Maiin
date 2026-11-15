import StatRow from "@/components/review/StatRow";
import { Button } from "@/components/ui/Button";
import { proLineWords, proNothingLine, type ProLine } from "@/lib/proReport";

/** Each line's rule takes the colour of what it changed: food or running. */
const RULE: Record<ProLine["kind"], string> = {
  calories: "bg-nutrition",
  photo_scans: "bg-nutrition",
  typed_scans: "bg-nutrition",
  paces: "bg-running",
  race_plan: "bg-running",
};

/**
 * What Pro did for this person in a period, in their own numbers (App1
 * Q56): the review's card on the first Monday of a month, and the year
 * recap's second card. Only what the app kept is counted
 * (`proReportLines`); a period with nothing says so in one line rather
 * than the card going missing, so a Pro account learns that too.
 */
export function ProLines({
  lines,
  when,
}: {
  lines: readonly ProLine[];
  /** "in October", or "this year": what the nothing line names. */
  when: string;
}) {
  if (lines.length === 0) {
    return (
      <p className="text-base text-muted-foreground">{proNothingLine(when)}</p>
    );
  }
  return (
    <div className="space-y-6">
      {lines.map((line) => {
        const words = proLineWords(line);
        return (
          <StatRow
            key={line.kind}
            rule={RULE[line.kind]}
            value={words.value}
            caption={words.caption}
          />
        );
      })}
    </div>
  );
}

/** The review's month card. */
export default function ProMonthCard({
  monthName,
  lines,
  next,
}: {
  monthName: string;
  lines: readonly ProLine[];
  next: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-h1 font-extrabold leading-tight tracking-tight text-foreground">
        Pro in {monthName}
      </h2>
      <div className="mt-6">
        <ProLines lines={lines} when={`in ${monthName}`} />
      </div>
      <div className="mt-auto pt-8">
        <Button variant="secondary" fullWidth onClick={next}>
          The week ahead
        </Button>
      </div>
    </div>
  );
}
