import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CompletedSessionData } from "@/features/program/useProgram";
import { completeLift } from "@/lib/liftCompletion";
import { resolveLiftUnit } from "@/lib/liftLoad";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import {
  EMPTY_WORKOUT_DAY_INDEX,
  EMPTY_WORKOUT_DRAFT_EPOCH,
  EMPTY_WORKOUT_SESSION_PARAM,
  emptyWorkoutDraftScope,
  isEmptyWorkoutSessionId,
  emptyWorkoutDay,
  emptyWorkoutName,
} from "@/features/program/emptyWorkout";
import { RESUME_PARAM } from "@/lib/resumeParam";
import { createWorkoutCompletionId } from "@/hooks/useWorkoutDraft";

import WorkoutSession from "@/components/WorkoutSession";

/**
 * An empty workout (Mob1 call 1): the lifting peer of Free run, started
 * from Train. The session opens with no exercises, ready for Add exercise,
 * and saves through the same `completeLift` as a programme day and a
 * routine, with `source: "free"` and no plan to move: no day is marked
 * done and no lift steps. It counts in the week as any saved lift does.
 */
export default function EmptyWorkout() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  /* Resume on Home's or Train's In progress strip (`?resume=1`) carries on
     without asking "Resume workout?" again. Read as the page opens; the
     flag then comes off the address, so a reload or a Back here asks. */
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeInAddress = searchParams.get(RESUME_PARAM) === "1";
  const [resumeOnOpen] = useState(resumeInAddress);
  /* The session, named in the address: a Resume carries its id, and a
     new empty workout mints one, written into the address so a reload
     opens this session again rather than a new one. */
  const addressed = searchParams.get(EMPTY_WORKOUT_SESSION_PARAM);
  const [minted] = useState(createWorkoutCompletionId);
  const sessionId = isEmptyWorkoutSessionId(addressed) ? addressed : minted;
  useEffect(() => {
    if (!resumeInAddress && addressed === sessionId) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete(RESUME_PARAM);
        next.set(EMPTY_WORKOUT_SESSION_PARAM, sessionId);
        return next;
      },
      { replace: true }
    );
  }, [resumeInAddress, addressed, sessionId, setSearchParams]);

  const day = useMemo(() => emptyWorkoutDay(), []);

  const handleComplete = useCallback(
    async (_dayIndex: number, sessionData: CompletedSessionData) => {
      // Fail closed: returning quietly would let the session clear its
      // draft as if the workout were saved.
      if (!user || auth.currentUser?.uid !== user.uid)
        throw new Error("Sign in again to save your workout.");
      // The name it was given on the finish screen, or "Workout".
      const name = emptyWorkoutName(sessionData.prescription?.dayName);
      const { committed: _noPlan, ...receipt } = await completeLift({
        uid: user.uid,
        author: {
          displayName: profile?.displayName,
          photoURL: profile?.photoURL,
        },
        liftUnit: resolveLiftUnit(profile?.liftingWeightUnit),
        source: "free",
        completionId: sessionData.completionId,
        startedAt: sessionData.startedAt,
        ran: sessionData.prescription?.exercises ?? [],
        setLogs: sessionData.setLogs,
        exerciseNotes: sessionData.exerciseNotes,
        supersets: sessionData.prescription?.supersets,
        durationMinutes: sessionData.durationMinutes,
        bodyweightKg: profile?.weightKg ?? 0,
        title: name,
        notes: name,
      });
      return receipt;
    },
    [user, profile]
  );

  return (
    <WorkoutSession
      day={day}
      dayIndex={EMPTY_WORKOUT_DAY_INDEX}
      key={sessionId}
      draftScope={emptyWorkoutDraftScope(sessionId)}
      draftEpoch={EMPTY_WORKOUT_DRAFT_EPOCH}
      onCompleteDay={handleComplete}
      onClose={() => navigate("/program")}
      resumeDraft={resumeOnOpen}
    />
  );
}
