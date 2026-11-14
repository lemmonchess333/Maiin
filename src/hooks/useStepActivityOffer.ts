import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/lib/auth";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { settleWrite } from "@/lib/settleWrite";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { readDailyStepTotals } from "@/lib/healthKit";
import { buildActivityLevelPersistPayload } from "@/lib/goalWeightPlan";
import {
  ACTIVITY_SHORT_NAMES,
  lastFullStepWeek,
  stepActivityOffer,
  type StepActivityOffer,
} from "@/lib/stepActivity";
import type { DailyValue } from "@/lib/bodySignals";
import type { ActivityLevel } from "@/lib/tdee";
import { useSteps } from "./useSteps";
import { useLocalDateKey } from "./useLocalDateKey";
import { useTrainingFuelData } from "./useTrainingFuelData";

/** `users/{uid}/settings/{this}` = `{ dismissedAt }`, the time "Keep" was
 *  tapped, in ms. On the account, so a phone that was told "keep" does not
 *  ask again from another. No step count is stored. */
export const STEP_OFFER_SETTINGS_DOC = "stepActivityOffer";

export interface UseStepActivityOffer {
  offer: StepActivityOffer | null;
  /** The calorie target the change saves; null without an offer. */
  nextTarget: number | null;
  /** Save the new level, in the same patch Settings → Nutrition's save
   *  writes, with an Undo on the toast. */
  accept: () => Promise<void>;
  /** Keep the level, and hide the offer for 30 days. */
  keep: () => Promise<void>;
}

/** What the change overwrote, for Undo: the fields as they were stored,
 *  rather than worked out again, so Undo puts back exactly what was. */
function restorePatch(
  before: UserProfile,
  from: ActivityLevel
): Partial<UserProfile> {
  return {
    activityLevel: before.activityLevel ?? from,
    goalWeightKg: before.goalWeightKg,
    weeklyRateKg: before.weeklyRateKg,
    program: before.program,
    tdeeBase: before.tdeeBase,
    targetCalories: before.targetCalories,
    targetProtein: before.targetProtein,
    targetCarbs: before.targetCarbs,
    targetFat: before.targetFat,
  };
}

/**
 * The activity level offer (whole-app grill Q31): last week's steps from
 * Apple Health against the stored activity level, and the save when the
 * person takes it. The rules are `stepActivity.ts`'s; this reads what they
 * need (the week's daily totals, the account's last "Keep", and the lifts
 * logged that week) and says nothing until all three are in.
 *
 * The caller mounts it only where steps can change the target
 * (`stepsFeedTheTarget`); off the phone, or with Health not connected,
 * nothing is read and there is no offer.
 */
export function useStepActivityOffer(): UseStepActivityOffer {
  const { user, profile, updateProfile } = useAuth();
  const uid = user?.uid ?? null;
  const steps = useSteps();
  const connected =
    steps.status === "connected" || steps.status === "ambiguous";
  const today = useLocalDateKey();
  const week = useMemo(() => lastFullStepWeek(today), [today]);
  const reading = connected && uid !== null;

  const { workouts, workoutsLoaded } = useTrainingFuelData(
    reading ? uid : null,
    today
  );

  const [stepRead, setStepRead] = useState<{
    uid: string;
    weekKey: string;
    days: DailyValue[];
  } | null>(null);
  useEffect(() => {
    if (!reading || !uid) return;
    let alive = true;
    void readDailyStepTotals(week.start, week.end).then((days) => {
      if (alive && days) setStepRead({ uid, weekKey: week.weekKey, days });
    });
    return () => {
      alive = false;
    };
  }, [reading, uid, week]);

  const [dismissal, setDismissal] = useState<{
    uid: string;
    at: number | null;
    readAt: number;
  } | null>(null);
  useEffect(() => {
    if (!reading || !uid) return;
    let alive = true;
    getDoc(doc(db, "users", uid, "settings", STEP_OFFER_SETTINGS_DOC))
      .then((snap) => {
        if (!alive) return;
        const at = snap.exists()
          ? (snap.data() as { dismissedAt?: unknown }).dismissedAt
          : undefined;
        setDismissal({
          uid,
          at: typeof at === "number" ? at : null,
          readAt: Date.now(),
        });
      })
      .catch((err) => {
        // Unknown whether "Keep" was tapped: say nothing rather than ask
        // someone who already answered.
        logger.error("[stepActivityOffer] settings read failed", err);
      });
    return () => {
      alive = false;
    };
  }, [reading, uid]);

  /** The week answered on this screen, so the card goes at once. */
  const [answered, setAnswered] = useState<string | null>(null);

  const found = useMemo(() => {
    if (!reading || !uid || !profile) return null;
    if (stepRead?.uid !== uid || stepRead.weekKey !== week.weekKey) return null;
    if (dismissal?.uid !== uid || !workoutsLoaded) return null;
    if (answered === `${uid}:${week.weekKey}`) return null;
    const offer = stepActivityOffer({
      storedLevel: profile.activityLevel,
      dailySteps: stepRead.days,
      todayKey: today,
      liftDays: workouts.map((w) => w.date),
      dismissedAtMs: dismissal.at,
      nowMs: dismissal.readAt,
    });
    if (!offer) return null;
    const next = buildActivityLevelPersistPayload(profile, offer.to);
    const now = buildActivityLevelPersistPayload(profile, offer.from);
    // A change that would also move the goal phase is not this offer's,
    // and one the calorie floor swallows changes nothing.
    if (!next.keepsPhase || next.targetCalories === now.targetCalories)
      return null;
    return { offer, next, before: profile };
  }, [
    reading,
    uid,
    profile,
    stepRead,
    week.weekKey,
    dismissal,
    workoutsLoaded,
    answered,
    today,
    workouts,
  ]);

  const saveKeep = useCallback(async (forUid: string): Promise<boolean> => {
    try {
      await settleWrite(
        setDocGuarded(
          doc(db, "users", forUid, "settings", STEP_OFFER_SETTINGS_DOC),
          { dismissedAt: Date.now() },
          { merge: true }
        ),
        { label: "stepActivityOffer.keep" }
      );
      return true;
    } catch (err) {
      logger.error("[stepActivityOffer] keep save failed", err);
      return false;
    }
  }, []);

  const keep = useCallback(async () => {
    if (!found || !uid) return;
    const key = `${uid}:${found.offer.weekKey}`;
    setAnswered(key);
    if (!(await saveKeep(uid))) {
      setAnswered((current) => (current === key ? null : current));
      toast.error("Couldn’t save your choice. Try again.");
    }
  }, [found, uid, saveKeep]);

  const accept = useCallback(async () => {
    if (!found || !uid) return;
    const { offer, next, before } = found;
    const key = `${uid}:${offer.weekKey}`;
    setAnswered(key);
    // updateProfile says so itself when the save fails.
    const saved = await updateProfile(next.payload);
    if (!saved.ok) {
      setAnswered((current) => (current === key ? null : current));
      return;
    }
    const undo = async () => {
      const back = await updateProfile(restorePatch(before, offer.from));
      if (!back.ok) return;
      // Undo is a "Keep": the offer stays away for its 30 days.
      await saveKeep(uid);
      toast.success(
        `Activity level back to ${ACTIVITY_SHORT_NAMES[offer.from]}`
      );
    };
    toast.success(`Activity level set to ${ACTIVITY_SHORT_NAMES[offer.to]}`, {
      action: { label: "Undo", onClick: () => void undo() },
    });
  }, [found, uid, updateProfile, saveKeep]);

  return {
    offer: found?.offer ?? null,
    nextTarget: found?.next.targetCalories ?? null,
    accept,
    keep,
  };
}
