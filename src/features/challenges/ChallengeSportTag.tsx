import { cn } from "@/lib/utils";
import { challengeSport, SPORT_TAG } from "./challengeSport";

/**
 * Which sport a challenge counts, as a small tag on the card: "Running",
 * "Lifting" or "Run or lift", with its icon, in the sport's tint.
 */
export default function ChallengeSportTag({
  metric,
  className,
}: {
  metric: string;
  className?: string;
}) {
  const { label, Icon, tint } = SPORT_TAG[challengeSport(metric)];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        tint,
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
