import { describe, it, expect } from 'vitest';
import {
  isNotificationSupported,
  getNotificationPermission,
  NOTIFICATIONS,
} from '../notifications';

describe('notifications', () => {
  it('detects notification support', () => {
    expect(typeof isNotificationSupported()).toBe('boolean');
  });

  it('returns permission state', () => {
    const result = getNotificationPermission();
    expect(['granted', 'denied', 'default', 'unsupported']).toContain(result);
  });

  describe('NOTIFICATIONS', () => {
    it('creates streak reminder', () => {
      const n = NOTIFICATIONS.streakReminder(7);
      expect(n.title).toContain('streak');
      expect(n.body).toContain('7');
      expect(n.category).toBe('streak');
    });

    it('creates workout complete notification', () => {
      const n = NOTIFICATIONS.workoutComplete('Push Day');
      expect(n.body).toContain('Push Day');
      expect(n.category).toBe('workout');
    });

    it('creates protein target notification', () => {
      const n = NOTIFICATIONS.proteinTarget(50);
      expect(n.body).toContain('50');
      expect(n.category).toBe('nutrition');
    });

    it('creates new follower notification', () => {
      const n = NOTIFICATIONS.newFollower('John');
      expect(n.body).toContain('John');
      expect(n.category).toBe('social');
    });

    it('creates weekly report', () => {
      const n = NOTIFICATIONS.weeklyReport(5, 15.3);
      expect(n.body).toContain('5 workouts');
      expect(n.body).toContain('15.3km');
      expect(n.category).toBe('system');
    });

    it('creates weekly report without distance', () => {
      const n = NOTIFICATIONS.weeklyReport(3, 0);
      expect(n.body).toContain('3 workouts');
      expect(n.body).not.toContain('km');
    });
  });
});
