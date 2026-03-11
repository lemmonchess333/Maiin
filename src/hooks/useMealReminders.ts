import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface MealReminders {
  enabled: boolean;
  breakfast: { enabled: boolean; time: string };
  lunch: { enabled: boolean; time: string };
  dinner: { enabled: boolean; time: string };
  timezone: string;
}

const DEFAULT_REMINDERS: MealReminders = {
  enabled: false,
  breakfast: { enabled: true, time: '08:00' },
  lunch: { enabled: true, time: '12:30' },
  dinner: { enabled: true, time: '18:30' },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function useMealReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<MealReminders>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastNotifiedRef = useRef<Record<string, string>>({});

  // Load from Firestore
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const ref = doc(db, 'users', user.uid, 'settings', 'mealReminders');
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        setReminders({ ...DEFAULT_REMINDERS, ...snap.data() as MealReminders });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  // Save to Firestore
  const updateReminders = useCallback(async (updates: Partial<MealReminders>) => {
    if (!user) return;
    const updated = { ...reminders, ...updates };
    setReminders(updated);
    const ref = doc(db, 'users', user.uid, 'settings', 'mealReminders');
    await setDoc(ref, updated);
  }, [user, reminders]);

  // Check reminders every minute
  useEffect(() => {
    if (!reminders.enabled) return;

    const checkReminders = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const today = now.toDateString();

      const meals = [
        { key: 'breakfast', ...reminders.breakfast },
        { key: 'lunch', ...reminders.lunch },
        { key: 'dinner', ...reminders.dinner },
      ];

      for (const meal of meals) {
        if (!meal.enabled) continue;
        if (meal.time !== currentTime) continue;
        if (lastNotifiedRef.current[meal.key] === today) continue;

        lastNotifiedRef.current[meal.key] = today;

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`Time for ${meal.key}!`, {
            body: `Don't forget to log your ${meal.key} in Tropos`,
            icon: '/Maiin/icons/icon-192.png',
          });
        }
      }
    };

    checkIntervalRef.current = setInterval(checkReminders, 60000);
    return () => clearInterval(checkIntervalRef.current);
  }, [reminders]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  return { reminders, loading, updateReminders, requestPermission };
}
