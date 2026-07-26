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
 * Framing is counting-up momentum, never percent-complete shortfall —
 * a nearly-empty bar on day one must read as "the board just opened",
 * not "the community failed". Static bar; no animation (WKWebView
 * rule).
 */
export default function CollectivePulse({
  challenge,
  leaderboard = [],
}: {
  challenge: Challenge;
  leaderboard?: ChallengeParticipant[];
}) {
  const target = challenge.collectiveTarget ?? 0;
  if (target <= 0) return null;
  // Same source the collective ChallengeCard uses: the loaded board
  // (top 20) — an approximation that matches the card's own maths.
  const total = leaderboard.reduce((s, p) => s + (p.currentValue || 0), 0);
  const pct = Math.min((total / target) * 100, 100);

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
            {total > 0 ? (
              <>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {total.toFixed(1)}
                </span>{" "}
                of{" "}
                <span className="font-mono tabular-nums">
                  {target.toLocaleString()}
                </span>{" "}
                km · every run counts
              </>
            ) : (
              "Every run counts — the first km starts the board"
            )}
          </p>
        </div>
      </div>
      <div
        className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(total)}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`Community total: ${total.toFixed(1)} of ${target} kilometres`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: THEME.running }}
        />
      </div>
    </div>
  );
}
