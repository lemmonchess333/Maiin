import { Lock } from "lucide-react";

/**
 * A range pill's label, with a lock when the range is Pro for this account
 * (whole-app grill Q84). The lock is drawn; "Pro" is said, so a screen
 * reader hears "6M, Pro".
 */
export default function RangeLabel({
  range,
  locked,
}: {
  range: string;
  locked: boolean;
}) {
  if (!locked) return <>{range}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {range}
      <Lock className="size-3" strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">, Pro</span>
    </span>
  );
}
