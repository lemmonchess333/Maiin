import { collection, addDoc, Firestore } from "firebase/firestore";

interface QueuedWrite {
  id: string;
  collectionPath: string;
  data: Record<string, any>;
  timestamp: number;
}

const QUEUE_KEY = "tropos_offline_queue";

function getQueue(): QueuedWrite[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedWrite[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function queueWrite(collectionPath: string, data: Record<string, any>) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    collectionPath,
    data,
    timestamp: Date.now(),
  });
  saveQueue(queue);
}

export function getQueueLength(): number {
  return getQueue().length;
}

export async function flushQueue(db: Firestore): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedWrite[] = [];

  for (const item of queue) {
    try {
      await addDoc(collection(db, item.collectionPath), {
        ...item.data,
        _offlineCreatedAt: item.timestamp,
      });
      flushed++;
    } catch {
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  return flushed;
}

export async function safeSave(
  db: Firestore,
  collectionPath: string,
  data: Record<string, any>,
): Promise<void> {
  if (navigator.onLine) {
    try {
      await addDoc(collection(db, collectionPath), data);
      return;
    } catch {
      // Fall through to offline queue
    }
  }
  queueWrite(collectionPath, data);
}

// Auto-flush when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    const { db } = await import("@/lib/firebase");
    const count = await flushQueue(db);
    if (count > 0) {
      console.log(`[OfflineQueue] Flushed ${count} queued writes`);
    }
  });
}
