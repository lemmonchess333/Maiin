/**
 * Notification utilities for Tropos PWA.
 * Wraps the Web Notifications API with permission handling and scheduling.
 */

export type NotificationCategory = 'workout' | 'nutrition' | 'streak' | 'social' | 'system';

interface TroposNotification {
  title: string;
  body: string;
  category: NotificationCategory;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

const DEFAULT_ICON = '/Maiin/icons/icon-192x192.png';

export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendNotification(notification: TroposNotification): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return null;

  return new Notification(notification.title, {
    body: notification.body,
    icon: notification.icon || DEFAULT_ICON,
    tag: notification.tag || `tropos-${notification.category}-${Date.now()}`,
    data: { ...notification.data, category: notification.category },
  });
}

// Predefined notifications
export const NOTIFICATIONS = {
  streakReminder: (days: number): TroposNotification => ({
    title: "Don't break your streak!",
    body: `You're on a ${days}-day streak. Log something today to keep it going!`,
    category: 'streak',
    tag: 'streak-reminder',
  }),
  workoutComplete: (name: string): TroposNotification => ({
    title: 'Workout complete!',
    body: `Great job finishing ${name}. Recovery starts now.`,
    category: 'workout',
  }),
  proteinTarget: (grams: number): TroposNotification => ({
    title: 'Protein check-in',
    body: `You still need ${grams}g protein today. Time for a snack?`,
    category: 'nutrition',
    tag: 'protein-reminder',
  }),
  newFollower: (name: string): TroposNotification => ({
    title: 'New follower',
    body: `${name} started following you!`,
    category: 'social',
  }),
  weeklyReport: (workouts: number, distance: number): TroposNotification => ({
    title: 'Weekly summary',
    body: `This week: ${workouts} workouts${distance > 0 ? `, ${distance.toFixed(1)}km run` : ''}. Keep it up!`,
    category: 'system',
    tag: 'weekly-report',
  }),
} as const;
