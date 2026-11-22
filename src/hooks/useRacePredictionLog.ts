import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import {
  nextRacePredictionLog,
  parseRacePredictionLog,
  RACE_PREDICTION_LOG_DOC,
  type RacePredictionLog,
} from "@/lib/racePrediction";
import type { ProgramState } from "@/features/program/programTypes";
import { useLocalDateKey } from "./useLocalDateKey";

/**
 * The goal race's prediction log (`users/{uid}/programState/racePrediction`,
 * `racePrediction.ts`): kept while the plan runs, and read on the run
 * summary when the race is saved.
 *
 * The log sits beside the programme's document rather than in it: the plan
 * is rebuilt by many writers, each carrying the fields it knows, and a log
 * inside it would have to be carried by every one. Under `programState` it
 * takes that collection's rule (the owner reads and writes) and goes with
 * the account when it is deleted.
 */
function logRef(uid: string) {
  return doc(db, "users", uid, "programState", RACE_PREDICTION_LOG_DOC);
}

async function readLog(uid: string): Promise<RacePredictionLog | null> {
  const snap = await getDoc(logRef(uid));
  return snap.exists() ? parseRacePredictionLog(snap.data()) : null;
}

/** Per account, the inputs this session last settled the log for, so a
 *  page opened again reads nothing until something that moves the
 *  prediction changes: the race, the day, the benchmark, the plan's
 *  length. */
const settled = new Map<string, string>();

/** Test hook: forget what this session settled. */
export function __forgetRacePredictionCaptures(): void {
  settled.clear();
}

/**
 * Records the goal race's prediction at the moments that matter: the first
 * one (when the plan is made, or when a runner with no benchmark first gets
 * paces), each change to it, and the one in force going into race week.
 * Mounted where the plan is open, Home and Train, which every runner passes
 * through in race week; a prediction is a pure function of the profile, so
 * reading it on the next visit loses nothing but the minutes between.
 */
export function useRacePredictionCapture(
  programState: ProgramState | null | undefined
): void {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const todayKey = useLocalDateKey();

  useEffect(() => {
    if (!uid || !profile || !programState) return;
    const goal = resolveRunPlan(profile, programState, todayKey).raceGoal;
    if (!goal) return;
    const runFitness = profile.runFitness;
    const planWeeks = programState.runPlan?.totalWeeks;
    const inputs = JSON.stringify([
      goal.distance,
      goal.targetDate,
      todayKey,
      runFitness?.benchmark ?? null,
      runFitness?.vdot ?? null,
      runFitness?.pendingConfirmation ?? null,
      planWeeks ?? null,
    ]);
    if (settled.get(uid) === inputs) return;
    // Nothing to record whatever the log holds (no confirmed benchmark, or
    // race day reached): no read.
    if (
      !nextRacePredictionLog({
        log: null,
        goal,
        runFitness,
        planWeeks,
        todayKey,
        now: new Date(),
      })
    ) {
      settled.set(uid, inputs);
      return;
    }
    let current = true;
    void (async () => {
      try {
        const log = await readLog(uid);
        if (!current) return;
        const next = nextRacePredictionLog({
          log,
          goal,
          runFitness,
          planWeeks,
          todayKey,
          now: new Date(),
        });
        if (next) await setDocGuarded(logRef(uid), next);
        settled.set(uid, inputs);
      } catch (error) {
        logger.warn("[useRacePredictionCapture] not recorded", error);
      }
    })();
    return () => {
      current = false;
    };
  }, [uid, profile, programState, todayKey]);
}

/**
 * The prediction log for the run summary, read once while `enabled`, for
 * the account `uid`. `loaded` is false until the read settles, and stays
 * false when it fails, so a race saved then keeps no record rather than
 * an empty one that would claim Tropos had no prediction.
 */
export function useRacePredictionLog(
  uid: string | undefined,
  enabled: boolean
): { log: RacePredictionLog | null; loaded: boolean } {
  const [read, setRead] = useState<{
    uid: string;
    log: RacePredictionLog | null;
  } | null>(null);

  useEffect(() => {
    if (!uid || !enabled) return;
    let current = true;
    readLog(uid)
      .then((log) => {
        if (current) setRead({ uid, log });
      })
      .catch((error) => logger.warn("[useRacePredictionLog] not read", error));
    return () => {
      current = false;
    };
  }, [uid, enabled]);

  return read && read.uid === uid && enabled
    ? { log: read.log, loaded: true }
    : { log: null, loaded: false };
}
