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
      // The pill drops under the words when they need the room: at the
      // largest text on a small phone it ran off the strip's edge. Under
      // 16em the icon gives way, as Banner's does. Wide-first, so iOS 15
      // keeps the designed row.
      className="@container flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2 min-h-[44px] rounded-xl w-full text-left bg-primary/8 hover:bg-primary/12 transition-colors"
    >
      <Sparkles
        aria-hidden="true"
        className="size-4 text-primary shrink-0 @max-[16em]:hidden"
      />
      <span className="text-xs font-medium text-foreground flex-1 basis-[9em] min-w-0 text-pretty">
        {text}
      </span>
      <span className="ml-auto text-caption font-semibold text-primary-foreground bg-primary-strong rounded-full px-2.5 py-1 shrink-0">
        Manage
      </span>
    </a>
  );
}
