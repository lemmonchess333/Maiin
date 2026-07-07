import { Unlock, Crown } from "lucide-react";

/**
 * Trial-timeline transparency strip (Runna-teardown paywall pattern —
 * the Blinkist-proven "what actually happens" ladder that reduces trial
 * anxiety). Shown only when the trial CTA is live (Sub1a P1 eligibility).
 *
 * Copy is deliberately HONEST about today's mechanics: there is no
 * trial-ending reminder yet (that's Sub1a P3 — "Day 5 email, Day 6
 * banner"), so this strip promises none. When P3 ships, add the middle
 * "Day 5 — we'll remind you" step here and nowhere else.
 */
const STEPS: {
  icon: typeof Unlock;
  when: string;
  what: string;
}[] = [
  {
    icon: Unlock,
    when: "Today",
    what: "Full Pro access unlocks — every feature, no payment due.",
  },
  {
    icon: Crown,
    when: "Day 7",
    what: "Your subscription starts unless you've cancelled — cancel anytime before.",
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
