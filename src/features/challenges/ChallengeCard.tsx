import { motion } from "framer-motion";
import { Users, Check } from "lucide-react";
import type { Challenge, ChallengeProgress } from "./useChallenges";
import { THEME } from "@/lib/theme";

const TYPE_COLORS: Record<string, string> = {
  lifting: THEME.lifting,
  running: THEME.running,
  hybrid: THEME.brand,
  nutrition: THEME.success,
};

const TYPE_ICONS: Record<string, string> = {
  lifting: "🏋️",
  running: "🏃",
  hybrid: "🦾",
  nutrition: "🥗",
};

interface ChallengeCardProps {
  challenge: Challenge;
  progress?: ChallengeProgress;
  joined: boolean;
  onJoin: () => void;
}

export function ChallengeCard({ challenge, progress, joined, onJoin }: ChallengeCardProps) {
  const color = TYPE_COLORS[challenge.type] || THEME.brand;
  const pct = progress ? Math.min((progress.current / challenge.target.value) * 100, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-2xl bg-card border border-border/50 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: color + "20" }}
        >
          {TYPE_ICONS[challenge.type] || "🏆"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{challenge.name}</p>
          <p className="text-[11px] text-muted-foreground">{challenge.description}</p>
        </div>
        {progress?.completed && (
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>

      {joined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {progress?.current || 0} / {challenge.target.value} {challenge.target.unit}
            </span>
            <span className="font-medium" style={{ color }}>
              {Math.round(pct)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5 }}
              className="h-full rounded-full"
              style={{ backgroundColor: color }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="w-3 h-3" />
          {challenge.participants?.length || 0} participants
        </div>

        {!joined && (
          <button
            onClick={onJoin}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: color }}
          >
            Join
          </button>
        )}
      </div>
    </motion.div>
  );
}
