import { collection, addDoc, doc, setDoc, Firestore } from "firebase/firestore";

interface QueuedWrite {
  id: string;
  collectionPath: string;
  docId?: string;
  merge?: boolean;
  data: Record<string, unknown>;
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

export function queueWrite(
  collectionPath: string,
  data: Record<string, unknown>,
  docId?: string,
  merge?: boolean,
) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    collectionPath,
    docId,
    merge,
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
      const payload = { ...item.data, _offlineCreatedAt: item.timestamp };
      if (item.docId) {
        const docRef = doc(db, item.collectionPath, item.docId);
        await setDoc(docRef, payload, item.merge ? { merge: true } : {});
      } else {
        await addDoc(collection(db, item.collectionPath), payload);
      }
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
  data: Record<string, unknown>,
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

export async function safeMerge(
  db: Firestore,
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (navigator.onLine) {
    try {
      await setDoc(doc(db, collectionPath, docId), data, { merge: true });
      return;
    } catch {
      // Fall through to offline queue
    }
  }
  queueWrite(collectionPath, data, docId, true);
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
