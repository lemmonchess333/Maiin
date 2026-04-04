import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface WorkoutReminders {
  enabled: boolean;
  time: string;
  timezone: string;
}

const DEFAULT_REMINDERS: WorkoutReminders = {
  enabled: false,
  time: '07:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function useWorkoutReminders() {
  const { user, profile } = useAuth();
  const [reminders, setReminders] = useState<WorkoutReminders>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastNotifiedRef = useRef<string>('');

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

  // Check reminders every minute — only fire on scheduled workout days
  useEffect(() => {
    if (!reminders.enabled) return;

    const checkReminder = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const today = now.toDateString();

      if (reminders.time !== currentTime) return;
      if (lastNotifiedRef.current === today) return;

      // Check if today is a workout day based on weekly schedule
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      const schedule = profile?.weekSchedule;
      if (schedule && schedule.length === 7) {
        const todaySchedule = schedule.find((s: { day: number }) => s.day === dayOfWeek);
        if (!todaySchedule || todaySchedule.type === 'rest') return;
      }

      lastNotifiedRef.current = today;

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Time to train!', {
          body: 'You have a workout scheduled today. Let\'s go!',
          icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
        });
      }
    };

    checkIntervalRef.current = setInterval(checkReminder, 60000);
    return () => clearInterval(checkIntervalRef.current);
  }, [reminders, profile?.weekSchedule]);

  return { reminders, loading, updateReminders };
}
