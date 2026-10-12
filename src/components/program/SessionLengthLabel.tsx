/**
 * A session length as a segment's label: "45 min", or "75+ min" for the
 * longest (`sessionLengthLabel`). Four of them share a row, and under 17em
 * of it (larger text on the phone) "min" goes under the number, where on
 * one line each ran out of its segment ("75+ m…"). Wide-first, so it needs
 * an `@container` around it: the SegmentedControl's className.
 */
import { sessionLengthLabel } from "@/lib/programmeChanges";

export default function SessionLengthLabel({ minutes }: { minutes: number }) {
  const [amount, unit] = sessionLengthLabel(minutes).split(" ");
  return (
    <span className="font-mono tabular-nums">
      {amount} <span className="@max-[17em]:block">{unit}</span>
    </span>
  );
}
