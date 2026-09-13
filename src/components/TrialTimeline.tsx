import { Unlock, Crown } from "lucide-react";

/**
 * Trial-timeline transparency strip (Runna-teardown paywall pattern —
 * the Blinkist-proven "what actually happens" ladder that reduces trial
 * anxiety). Shown only when the trial CTA is live (Sub1a P1 eligibility).
 *
 * Copy is deliberately HONEST about today's mechanics. This ladder
 * describes the BILLED checkout trial (`hasUsedTrial` — Stripe
 * `trialing`, or the App Store intro offer), whose end the client cannot
 * see, so no reminder is promised for it. The reminder that does exist
 * (`useTrialReminder`) is for the app-granted onboarding trial, a
 * different thing with nothing to bill. Add a "Day 5 — we'll remind you"
 * step here only when a server-side reminder keyed on the billed trial's
 * end ships — here and nowhere else.
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
