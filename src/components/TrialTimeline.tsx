import { Unlock, CalendarX, Crown } from "lucide-react";
import { TRIAL_DAYS, type ProPlan } from "@/lib/proPlans";

/**
 * Trial-timeline transparency strip (Runna-teardown paywall pattern —
 * the Blinkist-proven "what actually happens" ladder that reduces trial
 * anxiety). Shown only when the trial CTA is live (Sub1a P1 eligibility).
 *
 * Copy is deliberately HONEST about today's mechanics. This ladder
 * describes the BILLED checkout trial (`hasUsedTrial` — Stripe
 * `trialing`, or the App Store intro offer). The App Store needs a trial
 * cancelled at least 24 hours before it ends, so the last day to cancel
 * is the day before the subscription starts, at the time of day the
 * trial began (Sub1). Sub1 also plans a "Day 4 — we'll email you a
 * reminder" step: it goes in here, and only once a live reminder has
 * reached a Hide My Email address in production. The reminder that
 * `useTrialReminder` sends is for the app-granted onboarding trial, a
 * different thing with nothing to bill.
 *
 * The last step names what is then charged, for the plan the person has
 * selected (App Store Guideline 3.1.2: the billed amount stated where the
 * trial is). `plan` is the selected plan from `useProPlanPrices`, so on the
 * App Store build the amount is in the storefront's currency.
 */
interface Props {
  plan: ProPlan;
}

export default function TrialTimeline({ plan }: Props) {
  const steps: { icon: typeof Unlock; when: string; what: string }[] = [
    {
      icon: Unlock,
      when: "Today",
      what: "Full Pro access. Every feature, no payment due.",
    },
    {
      icon: CalendarX,
      when: `Day ${TRIAL_DAYS - 1}`,
      what: "Last day to cancel, by the time of day you started the trial.",
    },
    {
      icon: Crown,
      when: `Day ${TRIAL_DAYS}`,
      what: `Your subscription starts at ${plan.price} ${plan.periodPhrase} unless you've cancelled.`,
    },
  ];

  return (
    <ol className="space-y-1.5" aria-label="How your free trial works">
      {steps.map(({ icon: Icon, when, what }) => (
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
