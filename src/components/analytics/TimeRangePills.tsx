import { SegmentedControl } from "@/components/ui/SegmentedControl";
import RangeLabel from "./RangeLabel";

interface TimeRangePillsProps {
  options?: string[];
  selected: string;
  onChange: (value: string) => void;
  /** Ranges that are Pro for this account (Q84): drawn with a lock, and
   *  still passed to `onChange`, which decides what a tap on one does. */
  locked?: readonly string[];
}

/**
 * Analytics time-range selector. Thin wrapper over the canonical
 * SegmentedControl so the range row shares the one iOS "track" look +
 * radiogroup a11y with every other switcher in the app. Was a
 * hand-rolled track that already matched the look but had no roving
 * tabindex / arrow-key nav; the Social-uniformity pass folded it onto
 * the primitive. Keeps the original string-array API its call-sites use.
 */
export default function TimeRangePills({
  options = ["1W", "1M", "3M", "6M", "1Y"],
  selected,
  onChange,
  locked = [],
}: TimeRangePillsProps) {
  return (
    <SegmentedControl
      ariaLabel="Time range"
      value={selected}
      onChange={onChange}
      /* The 36pt track every History control row takes (§14m rule 18),
         each option still 44pt to tap. */
      size="sm"
      options={options.map((opt) => ({
        value: opt,
        label: <RangeLabel range={opt} locked={locked.includes(opt)} />,
      }))}
    />
  );
}
