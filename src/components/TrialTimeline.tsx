import { Unlock, Bell, Crown } from "lucide-react";

/**
 * Trial-timeline transparency strip (Runna-teardown paywall pattern —
 * the Blinkist-proven "what actually happens" ladder that reduces trial
 * anxiety). Shown only when the trial CTA is live (Sub1a P1 eligibility).
 *
 * Copy is deliberately HONEST about today's mechanics. This ladder
 * describes the card trial at checkout — the App Store introductory
 * offer, or Stripe `trialing` — which is the only trial (Sub1a pin 3).
 * The Day-5 step is real: the server records when the trial ends
 * (`subscriptionTrialEndsAt`, via the RevenueCat webhook and the Stripe
 * webhook) and `useTrialReminder` schedules the notification two days
 * before it; Home's strip counts the days down. Neither Apple nor
 * Stripe tells the user anything before a trial converts, which is
 * why the promise has to be ours.
 */
const STEPS: {
  icon: typeof Unlock;
  when: string;
  what: string;
}[] = [
  {
    icon: Unlock,
    when: "Today",
    what: "Full Pro access. Every feature, no payment due.",
  },
  {
    icon: Bell,
    when: "Day 5",
    what: "A reminder that the trial is ending — on Home, and as a notification if you have them on.",
  },
  {
    icon: Crown,
    when: "Day 7",
    what: "Your subscription starts unless you've cancelled. You can cancel any time before then.",
  },
];

export default function TrialTimeline() {
  return (
    <ol className="space-y-1.5" aria-label="How your free trial works">
      {STEPS.map(({ icon: Icon, when, what }) => (
        <li key={when} className="flex items-start gap-2.5">
          <span
            className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-px"
            aria-hidden="true"
          >
            <Icon className="size-3 text-primary" />
          </span>
          <p className="text-xs text-muted-foreground leading-snug">
            <span className="font-semibold text-foreground">{when}</span> —{" "}
            {what}
          </p>
        </li>
      ))}
    </ol>
  );
}
