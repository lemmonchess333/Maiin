import { cn } from "@/lib/utils";
import { supersetLabel } from "@/features/program/superset";

/**
 * "Superset A" beside an exercise done in a superset (Mob1 call 2), on the
 * saved workout and its post, as Hevy tags one. Lifting purple, the
 * sport's colour; one letter a group, so two supersets in a workout read
 * apart.
 */
export default function SupersetTag({
  group,
  className,
}: {
  group: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-lifting/12 px-2 py-0.5 text-xs font-semibold text-lifting-strong whitespace-nowrap",
        className
      )}
    >
      {supersetLabel(group)}
    </span>
  );
}
