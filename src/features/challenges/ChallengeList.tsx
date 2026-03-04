import { useChallenges } from "./useChallenges";
import { ChallengeCard } from "./ChallengeCard";
import { Trophy } from "lucide-react";

export function ChallengeList() {
  const { myChallenges, availableChallenges, progress, loading, joinChallenge } = useChallenges();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {myChallenges.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Challenges
          </p>
          {myChallenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              progress={progress[ch.id]}
              joined
              onJoin={() => {}}
            />
          ))}
        </div>
      )}

      {availableChallenges.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available Challenges
          </p>
          {availableChallenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              joined={false}
              onJoin={() => joinChallenge(ch.id)}
            />
          ))}
        </div>
      )}

      {myChallenges.length === 0 && availableChallenges.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6 text-purple-500" />
          </div>
          <p className="text-sm font-semibold text-foreground">No active challenges</p>
          <p className="text-xs text-muted-foreground max-w-[220px] mx-auto leading-relaxed">Challenges help you push your limits. Check back soon!</p>
        </div>
      )}
    </div>
  );
}
