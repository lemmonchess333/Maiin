import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import {
  scheduleNotification,
  cancelNotification,
  requestNotificationPermission,
} from '@/lib/notifications';

export interface WorkoutReminders {
  enabled: boolean;
  time: string;
}

const DEFAULT_REMINDERS: WorkoutReminders = {
  enabled: false,
  time: '07:00',
};

const WORKOUT_NOTIFICATION_ID = 2001;

/**
 * Given a "HH:MM" time string, return a Date for the next occurrence —
 * today if the time is still in the future, otherwise tomorrow.
 * Returns null if the input is malformed.
 */
function computeNextOccurrence(timeHHMM: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/**
 * Mirrors the original fire-time check: a day counts as a workout day
 * unless weekSchedule is a 7-entry array with an explicit 'rest' entry
 * for that day-of-week.
 */
function isWorkoutDay(
  dayOfWeek: number,
  schedule: ReadonlyArray<{ day: number; type: string }> | undefined,
): boolean {
  if (!schedule || schedule.length !== 7) return true;
  const todaySchedule = schedule.find((s) => s.day === dayOfWeek);
  if (!todaySchedule) return false;
  return todaySchedule.type !== 'rest';
}

export function useWorkoutReminders() {
  const { user, profile } = useAuth();
  const [reminders, setReminders] = useState<WorkoutReminders>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);

  // Load from Firestore
  useEffect(() => {
    if (!user) { const reset = () => { setLoading(false); }; reset(); return; }
    const ref = doc(db, 'users', user.uid, 'settings', 'workoutReminders');
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        setReminders({ ...DEFAULT_REMINDERS, ...snap.data() as WorkoutReminders });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  // Save to Firestore
  const updateReminders = useCallback(async (updates: Partial<WorkoutReminders>) => {
    if (!user) return;
    const updated = { ...reminders, ...updates };
    setReminders(updated);
    const ref = doc(db, 'users', user.uid, 'settings', 'workoutReminders');
    await setDoc(ref, updated);
  }, [user, reminders]);

  // Schedule / reschedule the next workout reminder, skipping rest days
  useEffect(() => {
    let cancelled = false;

    const rescheduleWorkout = async () => {
      await cancelNotification(WORKOUT_NOTIFICATION_ID);

      if (cancelled || !reminders.enabled) return;

      const nextAt = computeNextOccurrence(reminders.time);
      if (!nextAt) return;

      const schedule = profile?.weekSchedule as
        | ReadonlyArray<{ day: number; type: string }>
        | undefined;

      if (!isWorkoutDay(nextAt.getDay(), schedule)) {
        let found = false;
        for (let i = 1; i <= 7; i++) {
          nextAt.setDate(nextAt.getDate() + 1);
          if (isWorkoutDay(nextAt.getDay(), schedule)) {
            found = true;
            break;
          }
        }
        if (!found) return;
      }

      await scheduleNotification({
        id: WORKOUT_NOTIFICATION_ID,
        title: 'Time to train',
        body: 'Your session is ready when you are.',
        scheduleAt: nextAt,
      });
    };

    rescheduleWorkout();

    return () => {
      cancelled = true;
    };
  }, [reminders, profile]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    return requestNotificationPermission();
  }, []);

  return { reminders, loading, updateReminders, requestPermission };
}
