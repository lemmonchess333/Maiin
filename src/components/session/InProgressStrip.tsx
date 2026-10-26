import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import MetaLine from "@/components/ui/MetaLine";
import { haptic } from "@/lib/haptic";
import { unlockSpeech } from "@/lib/speechUnlock";
import { cn } from "@/lib/utils";
import { formatClock } from "@/utils/formatters";
import type { SessionInProgress } from "@/lib/sessionsInFlight";

/**
 * A session under way, said where the day's session is: "In progress ·
 * Pull B · 5 sets · 18:40" and Resume, as Hevy and Strong show a workout
 * left open. Home's session card and Train's day card draw it in place of
 * Start when the session under way is theirs, and on its own above them
 * when it is another.
 *
 * On its own card the strip leaves the name out: the card's title already
 * says it. The figures are what was done, and stand still: time away from
 * the session is not counted when it resumes.
 */
export default function InProgressStrip({
  session,
  onCard = false,
  onResume,
  className,
}: {
  session: SessionInProgress;
  /** Drawn on the session's own card, in Start's place. */
  onCard?: boolean;
  onResume: () => void;
  className?: string;
}) {
  const isRun = session.sport === "run";
  const items = [
    ...(onCard ? [] : [session.name]),
    ...(session.sets
      ? [`${session.sets} ${session.sets === 1 ? "set" : "sets"}`]
      : []),
    formatClock(session.elapsedSeconds),
  ];
  return (
    <div
      role="group"
      aria-label={`${session.name} in progress`}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card p-3",
        !onCard && "card-shadow",
        className
      )}
    >
      {/* Resume sits beside the words while they have 9em, and below them
          when they do not. The floor stops at the strip's own width, which
          9em passes at large text on a small phone. */}
      <div className="min-w-[min(9em,100%)] flex-1">
        <p
          className={cn(
            "text-sm font-bold",
            isRun ? "text-running-strong" : "text-lifting-strong"
          )}
        >
          In progress
        </p>
        <MetaLine items={items} />
      </div>
      <Button
        variant={isRun ? "sport" : "primary"}
        aria-label={`Resume ${session.name}`}
        leftIcon={<Play className="size-4 fill-current" />}
        className="pointer-events-auto shrink-0"
        onClick={() => {
          // A run carries on as its page opens, so its voice cues are
          // unlocked inside this tap, as Start's are.
          if (isRun) unlockSpeech();
          haptic();
          onResume();
        }}
      >
        Resume
      </Button>
    </div>
  );
}
