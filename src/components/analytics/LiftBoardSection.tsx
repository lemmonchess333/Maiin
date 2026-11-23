import { useId, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth, useUid } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/LoadingSkeleton";
import BoardRowItem from "@/components/social/BoardRowItem";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useLiftBoard } from "@/hooks/useLiftBoard";
import { liftBoardRows, ownLiftBest } from "@/lib/liftBoard";
import { formatKitLoad } from "@/features/program/loadSteps";
import type { LiftUnit } from "@/lib/liftLoad";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";
import { haptic } from "@/lib/haptic";

/** "3 reps · 12 Nov 2026", or the reps alone for a day that can't be read. */
function detailOf(reps: number, day: string | null): string {
  const count = `${reps} rep${reps === 1 ? "" : "s"}`;
  return day ? `${count} · ${formatDayMonthYear(parseLocalDate(day))}` : count;
}

/**
 * A barbell lift's board (Run30 call 3), copied from Hevy's per-exercise
 * leaderboard: the heaviest set of each person you follow who has shared a
 * workout with it, and yours among them, heaviest first. The places are
 * plain numbers, with no crown, and there is no board of everyone. With
 * nobody you follow on it yet, it shows your own best and says when the
 * others will show, with a way to invite someone, as Hevy's does ("Want to
 * compete with more friends?", Invite a Friend).
 */
export default function LiftBoardSection({
  exerciseId,
  exerciseName,
  sessions,
  liftUnit,
}: {
  exerciseId: string;
  exerciseName: string;
  /** Your sessions of the lift, warm-ups out: your row is your heaviest
   *  set among them, whoever saw the workout. */
  sessions: Parameters<typeof ownLiftBest>[0];
  liftUnit: LiftUnit;
}) {
  const uid = useUid();
  const { profile } = useAuth();
  const { blocked } = useBlockedUsers();
  const navigate = useNavigate();
  const board = useLiftBoard(exerciseId);
  const headingId = useId();
  const own = useMemo(() => ownLiftBest(sessions), [sessions]);
  const rows = liftBoardRows(board.entries, own, uid ?? null, blocked);

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div>
        <SectionHeading id={headingId} size="compact">
          Heaviest weight
        </SectionHeading>
        <p className="text-xs text-muted-foreground mt-0.5">
          You and the people you follow, from workouts they share
        </p>
      </div>
      {board.status === "loading" ? (
        <ul aria-label="Loading the board" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl bg-card p-3 dark:card-shadow"
            >
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-32 rounded" />
            </li>
          ))}
        </ul>
      ) : board.status === "failed" ? (
        <ErrorState
          title="Couldn’t load the board"
          description="Check your connection and try again."
          retry={{ onClick: board.retry }}
        />
      ) : (
        <>
          {rows.length > 0 && (
            <ol aria-label={`${exerciseName} board`} className="space-y-2">
              {rows.map((row, i) => (
                <BoardRowItem
                  key={row.uid}
                  row={row}
                  place={i + 1}
                  detail={detailOf(row.reps, row.day)}
                  figure={formatKitLoad(row.weightKg, liftUnit, exerciseId)}
                  selfPhoto={profile?.photoURL ?? undefined}
                  selfInitial={profile?.displayName?.charAt(0)}
                />
              ))}
            </ol>
          )}
          {rows.every((r) => r.self) && (
            <div className="space-y-3 pt-1">
              <p className="text-sm text-muted-foreground text-pretty">
                When people you follow share a workout with {exerciseName},
                their heaviest set shows here.
              </p>
              <Button
                variant="secondary"
                leftIcon={<UserPlus className="size-4" aria-hidden="true" />}
                onClick={() => {
                  haptic("light");
                  navigate("/social?tab=find");
                }}
              >
                Invite a friend
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
