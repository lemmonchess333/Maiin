import { SegmentedControl } from "@/components/ui/SegmentedControl";

interface TimeRangePillsProps {
  options?: string[];
  selected: string;
  onChange: (value: string) => void;
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
}: TimeRangePillsProps) {
  return (
    <SegmentedControl
      ariaLabel="Time range"
      value={selected}
      onChange={onChange}
      options={options.map((opt) => ({ value: opt, label: opt }))}
    />
  );
}
