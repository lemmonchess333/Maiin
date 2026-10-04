import { cn } from "@/lib/utils";
import {
  getBilledPriceLine,
  getRenewalDisclosure,
  getRenewalTerms,
  type PaywallPlatform,
  type ProPlan,
} from "@/lib/proPlans";

/**
 * RenewalDisclosure — what the checkout button above it will charge, and
 * that it renews. Shared by the Upgrade page and ProModal so the two cannot
 * drift, as `PlanPicker` is.
 *
 * App Store Guideline 3.1.2: the billed amount has to be clear, and with a
 * free trial at least as prominent as the trial. The trial's button reads
 * "Start your 7-day free trial" and names no price, so the price line sits
 * directly beneath it at the size and weight of that label ("7 days free,
 * then £34.99 a year."), not in the small print. Without a trial the price
 * is already on the button ("Start Pro — £34.99/yr"), and the whole block
 * is small print.
 *
 * Either way the text reads, whole, as `getRenewalDisclosure`: the price
 * line, then that it renews and where to cancel. With the trial it is
 * drawn in its two parts, so the price line can carry the weight.
 */
interface Props {
  plan: ProPlan;
  platform: PaywallPlatform;
  withTrial: boolean;
  className?: string;
}

export default function RenewalDisclosure({
  plan,
  platform,
  withTrial,
  className,
}: Props) {
  if (withTrial) {
    return (
      <p className={cn("text-center leading-snug", className)}>
        {/* The size and weight of the large button's own label, so the
            price reads as loud as "Start your 7-day free trial" above it. */}
        <span className="block text-base font-semibold text-foreground">
          {`${getBilledPriceLine(plan, true)}.`}
        </span>{" "}
        <span className="block mt-0.5 text-xs text-muted-foreground">
          {getRenewalTerms(platform)}
        </span>
      </p>
    );
  }

  return (
    <p
      className={cn(
        "text-xs text-muted-foreground text-center leading-snug",
        className
      )}
    >
      {getRenewalDisclosure(plan, { platform })}
    </p>
  );
}
