import { motion } from "framer-motion";
import { Trophy, X } from "lucide-react";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { THEME } from "@/lib/theme";
import {
  TIER_COLORS,
  type Challenge,
  type ChallengeParticipant,
  type ChallengeTier,
} from "./useChallenges";

const TIER_LABELS: Record<ChallengeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

function formatValue(metric: string, value: number): string {
  if (metric === "fastest_effort") {
    if (value <= 0) return "—";
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  if (metric === "total_km") return `${value.toFixed(1)}km`;
  if (metric === "total_volume")
    return `${Math.round(value).toLocaleString()}kg`;
  return Math.round(value).toLocaleString();
}

/**
 * Challenge finale (social features pass, 2026-07). Challenges used to
 * simply VANISH at their end date — the active list drops them, so a
 * month of effort ended with no result, no closure. For 7 days after the
 * end, participants see their final standing: tier earned (tier-tinted),
 * final value, and rank when they made the board. Dismiss-once per
 * challenge id. Calm by design — the celebration register belongs to the
 * badge seal; this is the results sheet.
 */
export function ChallengeFinaleCard({
  challenge,
  myProgress,
  leaderboard = [],
  selfUid,
}: {
  challenge: Challenge;
  myProgress: ChallengeParticipant;
  leaderboard?: ChallengeParticipant[];
  selfUid?: string;
}) {
  const { dismissed, dismiss } = useDismissOnce(
    `challenge-finale-${challenge.id}`
  );
  if (dismissed) return null;

  const tier = myProgress.tierAchieved;
  const accent = tier ? TIER_COLORS[tier] : THEME.brand;
  const rankIdx = selfUid
    ? leaderboard.findIndex((p) => p.uid === selfUid)
    : -1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl bg-card border overflow-hidden p-4"
      style={{
        borderColor: `${accent}40`,
        backgroundImage: `radial-gradient(circle at 14% 25%, ${accent}14, transparent 60%)`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="size-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          <Trophy size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-caption font-semibold uppercase tracking-wider"
            style={{ color: accent }}
          >
            Challenge ended
          </p>
          <p className="text-sm font-semibold text-foreground">
            {challenge.name}
          </p>
          <p className="text-small text-muted-foreground mt-1">
            {tier ? (
              <>
                You finished with{" "}
                <span className="font-semibold" style={{ color: accent }}>
                  {TIER_LABELS[tier]}
                </span>{" "}
                —{" "}
                <span className="font-mono tabular-nums">
                  {formatValue(challenge.metric, myProgress.currentValue)}
                </span>
              </>
            ) : (
              <>
                You logged{" "}
                <span className="font-mono tabular-nums">
                  {formatValue(challenge.metric, myProgress.currentValue)}
                </span>
              </>
            )}
            {rankIdx >= 0 && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">
                  #{rankIdx + 1}
                </span>{" "}
                of {challenge.participantCount}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss challenge result"
          className="size-11 -m-2 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:scale-[0.97] transition-transform shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}
