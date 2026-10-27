import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  normalizeProgramState,
  type ProgramState,
} from "@/features/program/programTypes";
import { nextLiftName } from "@/lib/workoutReminderCopy";

/**
 * The programme's next workout, as Home's session card names it ("Upper
 * A"), for the training-day reminder to say. It follows the programme
 * document, so logging a workout or choosing "Make this next" renames the
 * reminders on the next pass. Null while it loads, with no programme, and
 * for any account but the one signed in.
 */
export function useNextLiftName(): string | null {
  const uid = useUid();
  const [state, setState] = useState<{
    uid: string;
    name: string | null;
  } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid, "programState", "current"),
      (snap) => {
        const raw = snap.exists() ? (snap.data() as ProgramState) : null;
        setState({
          uid,
          name: raw ? nextLiftName(normalizeProgramState(raw)) : null,
        });
      },
      (err) => {
        logger.warn("[useNextLiftName] programme read failed", err);
        setState({ uid, name: null });
      }
    );
  }, [uid]);
  return state && state.uid === uid ? state.name : null;
}
