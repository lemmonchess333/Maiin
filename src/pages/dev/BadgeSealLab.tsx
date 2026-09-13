import { useState } from "react";
import { BadgeEarnedContent } from "@/features/streaks/BadgeEarnedModal";
import {
  BADGE_DEFINITIONS,
  type BadgeTier,
  type EarnedBadge,
} from "@/features/streaks/badges";

/*
 * DEV/TEST-ONLY Badge seal lab. Not in production builds; see the route
 * gating in App.tsx (same pattern as BrandBakeoff).
 *
 * The badge-earned ceremony is otherwise reachable only by earning a badge,
 * so its seal — the sealed hexagon tapped open to reveal the medal — had
 * never been filmed. This page renders the real ceremony inline for one
 * badge of each tier: tap a seal to crack it, break it, and see the badge;
 * "Nice" resets that card. The capture spec films the sealed row in both
 * themes and one seal at each stage of the break.
 */
const SAMPLE_BY_TIER: Record<BadgeTier, string> = {
  bronze: "first_step",
  silver: "week_warrior",
  gold: "month_master",
  platinum: "century_club",
};

function sample(tier: BadgeTier): EarnedBadge {
  const def = BADGE_DEFINITIONS.find((b) => b.id === SAMPLE_BY_TIER[tier]);
  if (!def) throw new Error(`no sample badge for ${tier}`);
  return { ...def, earnedAt: "2026-09-13T12:00:00.000Z" };
}

const TIERS: BadgeTier[] = ["bronze", "silver", "gold", "platinum"];

function SealCard({ tier }: { tier: BadgeTier }) {
  // Remount on dismiss so the ceremony can be run again.
  const [run, setRun] = useState(0);
  return (
    <section
      aria-label={`${tier} seal`}
      data-seal-tier={tier}
      className="rounded-2xl bg-card card-shadow p-3 space-y-2"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {tier}
      </h2>
      <BadgeEarnedContent
        key={run}
        badge={sample(tier)}
        onDismiss={() => setRun((n) => n + 1)}
        inline
      />
    </section>
  );
}

export default function BadgeSealLab() {
  return (
    <main className="max-w-lg w-full min-w-0 mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Badge seal lab</h1>
      <p className="text-sm text-muted-foreground">
        The badge-earned ceremony, one badge per tier. Tap a seal to break it.
        Nothing on this page earns anything.
      </p>
      <div className="grid grid-cols-1 gap-4">
        {TIERS.map((tier) => (
          <SealCard key={tier} tier={tier} />
        ))}
      </div>
    </main>
  );
}
