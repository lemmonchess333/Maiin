import { describe, it, expect, beforeEach, vi } from 'vitest';
import { queueWrite, getQueueLength, flushQueue } from '../offlineQueue';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((_db, path, id) => ({ path: `${path}/${id}` })),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

// Mock errorReporting to avoid transitive Firebase dependency
vi.mock('@/lib/errorReporting', () => ({
  captureError: vi.fn(),
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-' + Math.random() });

describe('offlineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty queue', () => {
    expect(getQueueLength()).toBe(0);
  });

  it('queues a write and increments length', () => {
    queueWrite('users/abc/meals', { name: 'chicken' });
    expect(getQueueLength()).toBe(1);
  });

  it('queues multiple writes', () => {
    queueWrite('users/abc/meals', { name: 'chicken' });
    queueWrite('users/abc/meals', { name: 'rice' });
    queueWrite('users/abc/workouts', { type: 'push' });
    expect(getQueueLength()).toBe(3);
  });

  it('queues write with docId and merge flag', () => {
    queueWrite('users/abc', { name: 'updated' }, 'profile', true);
    expect(getQueueLength()).toBe(1);
    const stored = JSON.parse(localStorage.getItem('tropos_offline_queue') || '[]');
    expect(stored[0].docId).toBe('profile');
    expect(stored[0].merge).toBe(true);
  });

  it('flushes all items on success', async () => {
    queueWrite('users/abc/meals', { name: 'chicken' });
    queueWrite('users/abc/meals', { name: 'rice' });

    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb);

    expect(count).toBe(2);
    expect(getQueueLength()).toBe(0);
  });

  it('returns 0 when flushing empty queue', async () => {
    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb);
    expect(count).toBe(0);
  });

  it('keeps failed items in queue after flush', async () => {
    const { addDoc } = await import('firebase/firestore');
    const mockAddDoc = vi.mocked(addDoc);

    queueWrite('users/abc/meals', { name: 'chicken' });
    queueWrite('users/abc/meals', { name: 'will-fail' });

    // First call succeeds, second fails
    mockAddDoc
      .mockResolvedValueOnce({ id: 'ok' } as never)
      .mockRejectedValueOnce(new Error('network error'));

    const mockDb = {} as Parameters<typeof flushQueue>[0];
    const count = await flushQueue(mockDb);

    expect(count).toBe(1);
    expect(getQueueLength()).toBe(1);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('tropos_offline_queue', 'not-json{{{');
    expect(getQueueLength()).toBe(0);
  });
});
