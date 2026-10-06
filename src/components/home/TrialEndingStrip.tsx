import { Sparkles } from "lucide-react";
import type { SubscriptionTrial } from "@/lib/auth";
import { storeSubscriptionsUrl, trialStripText } from "@/lib/subscriptionTrial";

/**
 * Home's strip in a renewing store trial's last two days (Sub1 pin 12's
 * Day 6 banner, STATUS 2026-10-06): "Free trial ends tomorrow, then £3.99
 * a month", opening the store's own subscription list, where it is managed.
 * The onboarding free week has its own strip, which asks them to subscribe;
 * this one has nothing to sell, since they already have.
 */
export default function TrialEndingStrip({
  trial,
}: {
  trial: SubscriptionTrial | null | undefined;
}) {
  const text = trialStripText(trial, new Date());
  if (!text || !trial) return null;
  return (
    <a
      href={storeSubscriptionsUrl(trial.store)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-3 py-2 min-h-[44px] rounded-xl w-full text-left bg-primary/8 hover:bg-primary/12 transition-colors"
    >
      <Sparkles aria-hidden="true" className="size-4 text-primary shrink-0" />
      <span className="text-xs font-medium text-foreground flex-1 text-pretty">
        {text}
      </span>
      <span className="text-caption font-semibold text-primary-foreground bg-primary-strong rounded-full px-2.5 py-1 shrink-0">
        Manage
      </span>
    </a>
  );
}
