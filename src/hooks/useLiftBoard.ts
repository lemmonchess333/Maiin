import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { fetchLiftBoard, type LiftBoardEntry } from "@/lib/liftBoard";

export type LiftBoardStatus = "loading" | "ready" | "failed";

export interface LiftBoard {
  status: LiftBoardStatus;
  /** The people the signed-in person follows who have done the lift,
   *  heaviest first, as the server allows them to be seen. */
  entries: LiftBoardEntry[];
  retry: () => void;
}

/** A barbell lift's board of the people the signed-in person follows, from
 *  the server (`getLiftBoard`, Run30 call 3), read once and again on
 *  `retry`. Not read until `enabled`, so a page that never opens the board
 *  never asks. */
export function useLiftBoard(
  exerciseId: string | null | undefined,
  enabled = true
): LiftBoard {
  const [attempt, setAttempt] = useState(0);
  const key = exerciseId && enabled ? `${exerciseId}/${attempt}` : null;
  const [read, setRead] = useState<{
    key: string;
    status: LiftBoardStatus;
    entries: LiftBoardEntry[];
  } | null>(null);

  useEffect(() => {
    if (!exerciseId || !enabled) return;
    const at = `${exerciseId}/${attempt}`;
    let live = true;
    fetchLiftBoard(exerciseId)
      .then((entries) => {
        if (live) setRead({ key: at, status: "ready", entries });
      })
      .catch((err) => {
        logger.warn("[liftBoard] a board could not be read", err);
        if (live) setRead({ key: at, status: "failed", entries: [] });
      });
    return () => {
      live = false;
    };
  }, [exerciseId, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = key && read?.key === key ? read : null;
  return {
    status: current?.status ?? "loading",
    entries: current?.entries ?? [],
    retry,
  };
}
