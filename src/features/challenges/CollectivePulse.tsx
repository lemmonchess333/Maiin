import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import {
  distanceIn,
  distanceUnitLabel,
  spokenDistanceUnit,
} from "@/lib/distanceUnits";
import { Footprints } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { Challenge, ChallengeParticipant } from "./useChallenges";

/**
 * SOC-P1e — the collective-kilometres pulse strip.
 *
 * The one ambient "people are here" signal that stays HONEST at any
 * user count: per-person numbers read dead pre-launch (every count is
 * 0), but the community's accumulating km total moves whenever ANYONE
 * runs. Promotes the existing collective challenge (group_goal /
 * collectiveTarget) from a card buried in "Available" into a compact
 * strip at the top of the challenges section.
 *
 * The line under the name is the figure and nothing else, from the first
 * kilometre: "0 of 1,000 km", then "412.5 of 1,000 km". Counting up, never
 * a shortfall or a percentage. Static bar; no animation (WKWebView rule).
 */
export default function CollectivePulse({
  challenge,
  leaderboard = [],
}: {
  challenge: Challenge;
  leaderboard?: ChallengeParticipant[];
}) {
  // The reader's distance unit; the board stores kilometres.
  const unit = useDistanceUnit();
  const target = challenge.collectiveTarget ?? 0;
  if (target <= 0) return null;
  // Same source the collective ChallengeCard uses: the loaded board
  // (top 20) — an approximation that matches the card's own maths.
  const total = leaderboard.reduce((s, p) => s + (p.currentValue || 0), 0);
  const pct = Math.min((total / target) * 100, 100);
  const shown = (km: number) => distanceIn(km * 1000, unit);
  const label = distanceUnitLabel(unit);
  // To a tenth, a whole number without its ".0", grouped as the reader's
  // locale groups.
  const totalText = shown(total).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  const targetText = Math.round(shown(target)).toLocaleString();

  return (
    <div className="p-3.5 rounded-xl bg-card border border-border/40">
      <div className="flex items-center gap-3">
        <div
          className="size-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${THEME.running}14` }}
        >
          <Footprints size={16} style={{ color: THEME.running }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {challenge.name}
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {totalText}
            </span>{" "}
            of <span className="font-mono tabular-nums">{targetText}</span>{" "}
            {label}
          </p>
        </div>
      </div>
      <div
        className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(total)}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`Community total: ${totalText} of ${targetText} ${spokenDistanceUnit(unit, 2)}`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: THEME.running }}
        />
      </div>
    </div>
  );
}
