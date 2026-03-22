import { useState } from "react";
import { useChallenges } from "./useChallenges";
import { ChallengeCard } from "./ChallengeCard";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { THEME } from "@/lib/theme";
import { toast } from "sonner";

export function ChallengeList() {
  const { myChallenges, availableChallenges, myProgress, leaderboards, loading, joinChallenge, leaveChallenge } = useChallenges();
  const [notifyRequested, setNotifyRequested] = useState(
    () => !!localStorage.getItem('tropos_challenge_notify')
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {myChallenges.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your Challenges
          </p>
          {myChallenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              myProgress={myProgress[ch.id]}
              leaderboard={leaderboards[ch.id]}
              joined
              onJoin={() => {}}
              onLeave={() => leaveChallenge(ch.id)}
            />
          ))}
        </div>
      )}

      {availableChallenges.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Available
          </p>
          {availableChallenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              leaderboard={leaderboards[ch.id]}
              joined={false}
              onJoin={() => joinChallenge(ch.id)}
              onLeave={() => {}}
            />
          ))}
        </div>
      )}

      {myChallenges.length === 0 && availableChallenges.length === 0 && (
        <>
          <EmptyState
            icon={<Trophy size={28} />}
            title="Challenges coming soon"
            description="Compete on weekly distance, volume, and hybrid score with the people you follow."
            accentColor={THEME.brand}
            action={notifyRequested ? undefined : {
              label: 'Notify me when challenges launch',
              onClick: () => {
                localStorage.setItem('tropos_challenge_notify', '1');
                setNotifyRequested(true);
                toast.success("You'll be notified when challenges launch!");
              },
            }}
          />
          {notifyRequested && (
            <p className="text-xs text-center text-muted-foreground -mt-6">
              You&apos;ll be notified!
            </p>
          )}
        </>
      )}
    </div>
  );
}
